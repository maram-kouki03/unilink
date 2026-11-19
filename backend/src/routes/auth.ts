import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { ACCOUNT_SUSPENDED, requireAuth, signResetToken, signToken, uid, verifyResetToken } from '../auth';
import { config } from '../config';
import { type Db, one, query } from '../db';
import { consumeCode, issueCode, tryIssueCode } from '../codes';
import { cleanupPending, consumePendingCode, resendPendingCode, savePendingSignup } from '../pending';
import { HttpError, parse } from '../http';
import { disconnectUser } from '../realtime';
import {
  BUMP_TOKEN_VERSION,
  ENSURE_PROFILE,
  INSERT_PROFILE,
  INSERT_USER,
  PROFILE_BY_ID,
  SET_PASSWORD,
  USER_BY_EMAIL,
  USER_BY_ID,
  USERNAME_TAKEN,
} from '../sql/auth';
import { DELETE_ALL_MY_PUSH_TOKENS } from '../sql/push';

export const authRouter = Router();

export const LEVELS = ['1A', '2A', '3A', 'MASTERE', 'DOCTORAT'] as const;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('enter a valid e-mail address'));

/** 8+ characters with an uppercase letter, a lowercase letter, a digit and a special character (same rule as the app). */
export const password = z
  .string()
  .max(200, 'is too long')
  .refine((p) => p.length >= 8, 'must be at least 8 characters')
  .refine((p) => /[A-Z]/.test(p), 'needs an uppercase letter')
  .refine((p) => /[a-z]/.test(p), 'needs a lowercase letter')
  .refine((p) => /\d/.test(p), 'needs a number')
  .refine((p) => /[^A-Za-z0-9]/.test(p), 'needs a special character');

const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'enter the 6-digit code');

const signupSchema = z.object({
  fullName: z.string().trim().min(3, 'please enter your full name').max(100),
  email,
  password,
  level: z.enum(LEVELS),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'required'),
});

// Used when the e-mail is unknown, so a login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('unilink-dummy-password', 10);
const LOGIN_ERROR = 'Wrong e-mail or password';

export type UserRow = { id: string; email: string; password_hash: string; token_version: number; banned_at: Date | null };

/** { token, profile }: the answer of login, verify-email and reset-password. Banned accounts get 403. */
async function sessionFor(user: { id: string; email: string; token_version: number; banned_at: Date | null }) {
  if (user.banned_at) throw new HttpError(403, ACCOUNT_SUSPENDED);
  await one(ENSURE_PROFILE, [user.id, user.email]);
  const profile = await one(PROFILE_BY_ID, [user.id]);
  return { token: signToken(user.id, user.token_version), profile };
}

/** bcrypt check that also refuses accounts without a usable hash ('!' = old Google sign-in). */
export async function passwordMatches(plain: string, hash: string | null | undefined) {
  const usable = hash?.startsWith('$2') ? hash : DUMMY_HASH;
  const ok = await bcrypt.compare(plain, usable);
  return ok && usable !== DUMMY_HASH;
}

/** A free username from the e-mail (name@… → name, or name1234 when taken). */
async function freeUsername(emailAddress: string, db: Db) {
  const base = emailAddress.split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'student';
  let username = base;
  for (let i = 0; i < 10 && (await one(USERNAME_TAKEN, [username], db)); i++) {
    username = `${base}${randomInt(1000, 10000)}`;
  }
  return username;
}

const ACCOUNT_EXISTS = 'An account with this e-mail already exists';

/* ───────────── Sign-up: nothing is written to users until the code is entered ───────────── */

authRouter.post('/auth/signup', async (req, res) => {
  const body = parse(signupSchema, req.body);
  if (!body.email.endsWith(`@${config.allowedDomain}`)) {
    throw new HttpError(400, `Only @${config.allowedDomain} e-mail addresses can join Unilink`);
  }
  await cleanupPending();
  if (await one(USER_BY_EMAIL, [body.email])) throw new HttpError(409, ACCOUNT_EXISTS);

  const passwordHash = await bcrypt.hash(body.password, 10);
  // Replaces any earlier pending sign-up with this e-mail. If the e-mail fails, the user can tap "Resend code".
  const codeSent = await savePendingSignup({ email: body.email, passwordHash, fullName: body.fullName, level: body.level });
  res.status(201).json({ needsVerification: true, email: body.email, codeSent });
});

authRouter.post('/auth/verify-email', async (req, res) => {
  const body = parse(z.object({ email, code }), req.body);
  await cleanupPending();
  const user = await consumePendingCode(body.email, body.code, async (db, pending) => {
    if (await one(USER_BY_EMAIL, [pending.email], db)) throw new HttpError(409, ACCOUNT_EXISTS);
    const created = await one<{ id: string; email: string; token_version: number; banned_at: Date | null }>(INSERT_USER, [pending.email, pending.password_hash], db);
    if (!created) throw new Error('User insert failed');
    const username = await freeUsername(created.email, db);
    await one(INSERT_PROFILE, [created.id, created.email, pending.full_name, username, pending.level], db);
    return created;
  });
  res.json(await sessionFor(user));
});

const GENERIC_SENT = 'If an account exists for this e-mail, we sent it a 6-digit code.';

authRouter.post('/auth/resend-code', async (req, res) => {
  const body = parse(z.object({ email, purpose: z.enum(['verify', 'reset']) }), req.body);
  if (body.purpose === 'verify') {
    await cleanupPending();
    await resendPendingCode(body.email);
  } else {
    const user = await one<UserRow>(USER_BY_EMAIL, [body.email]);
    if (user) await issueCode(user, 'reset');
  }
  // Unknown e-mail: same answer, nothing sent.
  res.json({ ok: true, message: GENERIC_SENT });
});

authRouter.post('/auth/login', async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await one<UserRow>(USER_BY_EMAIL, [body.email]);
  const ok = await passwordMatches(body.password, user?.password_hash);
  if (!user || !ok) throw new HttpError(401, LOGIN_ERROR);
  // Banned: 403 "Your account is suspended" (only after the right password, so it reveals nothing).
  res.json(await sessionFor(user));
});

/* ───────────── Password reset: e-mail → code → resetToken → new password ───────────── */

authRouter.post('/auth/forgot-password', async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  // Always the same answer, sent right away, so nobody can tell whether the account exists.
  res.json({ ok: true, message: GENERIC_SENT });
  const user = await one<UserRow>(USER_BY_EMAIL, [body.email]).catch(() => null);
  if (user) await tryIssueCode(user, 'reset');
});

/** Checks the reset code (5 attempts, 15 min) and trades it for a 10-minute reset token. */
authRouter.post('/auth/verify-reset-code', async (req, res) => {
  const body = parse(z.object({ email, code }), req.body);
  const user = await one<UserRow>(USER_BY_EMAIL, [body.email]);
  await consumeCode(user?.id ?? null, 'reset', body.code, async () => undefined);
  res.json({ resetToken: signResetToken(user!.id, user!.password_hash) });
});

const INVALID_RESET = 'This reset link has expired. Please ask for a new code.';

authRouter.post('/auth/reset-password', async (req, res) => {
  const body = parse(z.object({ resetToken: z.string().min(1, 'required').max(2000), password }), req.body);
  const userId = await verifyResetToken(body.resetToken, async (id) => (await one<UserRow>(USER_BY_ID, [id]))?.password_hash ?? null);
  if (!userId) throw new HttpError(400, INVALID_RESET);
  const passwordHash = await bcrypt.hash(body.password, 10);
  // Also bumps token_version: every device that was signed in is signed out.
  const user = await one<UserRow>(SET_PASSWORD, [userId, passwordHash]);
  if (!user) throw new HttpError(400, INVALID_RESET);
  await query(DELETE_ALL_MY_PUSH_TOKENS, [userId]);
  disconnectUser(userId);
  res.json(await sessionFor(user));
});

/* ───────────── Sessions ───────────── */

/** Sign out on every device (this one included): old tokens stop working. */
authRouter.post('/auth/logout-all', requireAuth, async (req, res) => {
  const me = uid(req);
  await query(BUMP_TOKEN_VERSION, [me]);
  await query(DELETE_ALL_MY_PUSH_TOKENS, [me]);
  disconnectUser(me);
  res.json({ ok: true });
});
