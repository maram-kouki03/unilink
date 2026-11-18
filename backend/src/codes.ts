import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from './config';
import { one, query, transaction } from './db';
import { HttpError } from './http';
import { sendCode, type CodePurpose } from './mail';
import * as sql from './sql/codes';

export type { CodePurpose };

const CODE_TTL_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 10;

/** HMAC-SHA256 with JWT_SECRET, bound to the user and the purpose. */
function hashCode(userId: string, purpose: CodePurpose, code: string): string {
  return createHmac('sha256', config.jwtSecret).update(`${userId}:${purpose}:${code}`).digest('hex');
}

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Throws 429 if a new code is not allowed yet: max 1 per 60 s and 10 per hour for this account. */
export async function assertCanSend(userId: string) {
  const rate = await one<{ last_minute: number; last_hour: number; wait_seconds: number }>(sql.CODE_RATE, [userId]);
  if (rate && rate.last_minute > 0) {
    const wait = Math.max(1, rate.wait_seconds);
    throw new HttpError(429, `Please wait ${wait} s before asking for a new code.`, { retryAfter: wait });
  }
  if (rate && rate.last_hour >= MAX_PER_HOUR) {
    throw new HttpError(429, 'Too many codes were requested. Please try again in an hour.', { retryAfter: 3600 });
  }
}

/**
 * Create a code, e-mail it, then make it the only valid one of its purpose.
 * Throws 429 (rate limit) or 502 (e-mail could not be sent: the code is then discarded).
 */
export async function issueCode(user: { id: string; email: string }, purpose: CodePurpose) {
  await assertCanSend(user.id);
  await query(sql.DELETE_OLD_CODES, [user.id]);
  const code = newCode();
  const row = await one<{ id: string }>(sql.INSERT_CODE, [user.id, purpose, hashCode(user.id, purpose, code), CODE_TTL_SECONDS]);
  if (!row) throw new Error('Code insert failed');
  try {
    await sendCode(user.email, code, purpose);
  } catch (err: any) {
    await query(sql.DELETE_CODE, [row.id]).catch(() => undefined);
    // eslint-disable-next-line no-console
    console.error(`[mail] could not send the ${purpose} code:`, err?.message ?? err);
    throw new HttpError(502, 'We could not send the e-mail. Please try again in a minute.');
  }
  await query(sql.INVALIDATE_OTHER_CODES, [user.id, purpose, row.id]);
}

/** Same as issueCode but never throws (used where the main answer must not change). Returns true if sent. */
export async function tryIssueCode(user: { id: string; email: string }, purpose: CodePurpose): Promise<boolean> {
  try {
    await issueCode(user, purpose);
    return true;
  } catch (err) {
    if (!(err instanceof HttpError)) {
      // eslint-disable-next-line no-console
      console.error('[codes]', err);
    }
    return false;
  }
}

const INVALID = 'This code is wrong or has expired. Check the e-mail or ask for a new code.';

/**
 * Check the latest code of `purpose`. If it is right, run `onSuccess` in the same transaction
 * and mark every pending code of that purpose as used. Wrong attempts are counted (max 5).
 */
export async function consumeCode<T>(
  userId: string | null,
  purpose: CodePurpose,
  code: string,
  onSuccess: (db: PoolClient) => Promise<T>,
): Promise<T> {
  if (!userId) throw new HttpError(400, INVALID);
  const outcome = await transaction(async (db) => {
    const row = await one<{ id: string; code_hash: string; attempts: number; used_at: string | null; expired: boolean }>(
      sql.LATEST_CODE_FOR_UPDATE,
      [userId, purpose],
      db,
    );
    if (!row || row.used_at || row.expired) return { status: 'invalid' as const };
    if (row.attempts >= MAX_ATTEMPTS) return { status: 'locked' as const };

    const expected = Buffer.from(row.code_hash, 'hex');
    const given = Buffer.from(hashCode(userId, purpose, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await db.query(sql.ADD_ATTEMPT, [row.id]);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      return { status: left > 0 ? ('wrong' as const) : ('locked' as const), left };
    }

    await db.query(sql.USE_ALL_CODES, [userId, purpose]);
    return { status: 'ok' as const, value: await onSuccess(db) };
  });

  switch (outcome.status) {
    case 'ok':
      return outcome.value;
    case 'wrong':
      throw new HttpError(400, `Wrong code. ${outcome.left} ${outcome.left === 1 ? 'try' : 'tries'} left.`);
    case 'locked':
      throw new HttpError(429, 'Too many wrong attempts. Ask for a new code.');
    default:
      throw new HttpError(400, INVALID);
  }
}
