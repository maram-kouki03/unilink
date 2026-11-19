import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from './config';
import { one, query, transaction } from './db';
import { HttpError } from './http';
import { sendCode } from './mail';
import * as sql from './sql/pending';

/**
 * Sign-ups wait in pending_signups until the 6-digit code is entered:
 * 15 min validity, 5 attempts, 1 code per 60 s and 10 per hour per e-mail.
 */

const CODE_TTL_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

export type PendingRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  level: string;
  code_hash: string;
  attempts: number;
  expired: boolean;
};

export type SignupData = { email: string; passwordHash: string; fullName: string; level: string };

/** HMAC-SHA256 with JWT_SECRET, bound to the e-mail. */
const hashCode = (email: string, code: string) =>
  createHmac('sha256', config.jwtSecret).update(`pending:${email}:verify:${code}`).digest('hex');

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export const cleanupPending = () => query(sql.DELETE_EXPIRED_PENDING);

async function rateLimitError(email: string): Promise<HttpError> {
  const rate = await one<{ too_soon: boolean; wait_seconds: number }>(sql.PENDING_RATE, [email]);
  if (rate?.too_soon) {
    const wait = Math.max(1, rate.wait_seconds);
    return new HttpError(429, `Please wait ${wait} s before asking for a new code.`, { retryAfter: wait });
  }
  return new HttpError(429, 'Too many codes were requested. Please try again in an hour.', { retryAfter: 3600 });
}

/** E-mail the code; on failure the stored code is cancelled (and not counted) and 502 is thrown. */
async function deliver(row: { id: string; email: string }, code: string) {
  try {
    await sendCode(row.email, code, 'verify');
  } catch (err: any) {
    await query(sql.UNSEND_PENDING, [row.id]).catch(() => undefined);
    // eslint-disable-next-line no-console
    console.error('[mail] could not send the verify code:', err?.message ?? err);
    throw new HttpError(502, 'We could not send the e-mail. Please try again in a minute.');
  }
}

/**
 * Save (or replace) the pending sign-up and e-mail a code.
 * Throws 429 if rate-limited. Returns false if the e-mail could not be sent (the user can resend).
 */
export async function savePendingSignup(data: SignupData): Promise<boolean> {
  const code = newCode();
  const row = await one<{ id: string; email: string }>(sql.UPSERT_PENDING, [
    data.email,
    data.passwordHash,
    data.fullName,
    data.level,
    hashCode(data.email, code),
    CODE_TTL_SECONDS,
  ]);
  if (!row) throw await rateLimitError(data.email);
  try {
    await deliver(row, code);
    return true;
  } catch {
    return false;
  }
}

/** New code for a pending sign-up. Unknown e-mail: does nothing (the caller answers generically). */
export async function resendPendingCode(email: string): Promise<void> {
  const code = newCode();
  const row = await one<{ id: string; email: string }>(sql.RESEND_PENDING, [email, hashCode(email, code), CODE_TTL_SECONDS]);
  if (!row) {
    if (await one(sql.PENDING_RATE, [email])) throw await rateLimitError(email);
    return;
  }
  await deliver(row, code);
}

const INVALID = 'This code is wrong or has expired. Check the e-mail or ask for a new code.';

/**
 * Check the code of a pending sign-up. If it is right, `onSuccess` runs in the same transaction
 * (create the account) and the pending row is deleted. Wrong attempts are counted (max 5).
 */
export async function consumePendingCode<T>(email: string, code: string, onSuccess: (db: PoolClient, row: PendingRow) => Promise<T>): Promise<T> {
  const outcome = await transaction(async (db) => {
    const row = await one<PendingRow>(sql.PENDING_FOR_UPDATE, [email], db);
    if (!row || row.expired) return { status: 'invalid' as const };
    if (row.attempts >= MAX_ATTEMPTS) return { status: 'locked' as const };

    const expected = Buffer.from(row.code_hash, 'hex');
    const given = Buffer.from(hashCode(email, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await db.query(sql.ADD_PENDING_ATTEMPT, [row.id]);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      return { status: left > 0 ? ('wrong' as const) : ('locked' as const), left };
    }

    const value = await onSuccess(db, row);
    await db.query(sql.DELETE_PENDING, [row.id]);
    return { status: 'ok' as const, value };
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
