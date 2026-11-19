import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { requireAuth, signResetToken, signToken, uid, verifyResetToken } from '../auth';
import { config } from '../config';
import { type Db, one, query } from '../db';
import { consumeCode, issueCode, tryIssueCode } from '../codes';
import { cleanupPending, consumePendingCode, resendPendingCode, savePendingSignup } from '../pending';
import { HttpError, notFound, parse } from '../http';
import {
  ENSURE_PROFILE,
  INSERT_PROFILE,
  INSERT_USER,
  PROFILE_BY_ID,
  PROFILE_STATS,
  SET_PASSWORD,
  UPDATE_PROFILE,
  USER_BY_EMAIL,
  USER_BY_ID,
  USERNAME_TAKEN,
} from '../sql/auth';
import { ACTIVITY_ITEMS } from '../sql/items';
import { ACTIVITY_POSTS } from '../sql/posts';
import { ACTIVITY_RIDES } from '../sql/rides';
import { ACTIVITY_UPLOADS } from '../sql/documents';

export const authRouter = Router();

const LEVELS = ['1A', '2A', '3A', 'MASTERE', 'DOCTORAT'] as const;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('enter a valid e-mail address'));

/** 8+ characters with an uppercase letter, a lowercase letter, a digit and a special character (same rule as the app). */
const password = z
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

type UserRow = { id: string; email: string; password_hash: string };

/** { token, profile }: the answer of login, verify-email and reset-password. */
async function sessionFor(user: { id: string; email: string }) {
  await one(ENSURE_PROFILE, [user.id, user.email]);
  const profile = await one(PROFILE_BY_ID, [user.id]);
  return { token: signToken(user.id), profile };
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
    const created = await one<{ id: string; email: string }>(INSERT_USER, [pending.email, pending.password_hash], db);
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
  const hash = user?.password_hash?.startsWith('$2') ? user.password_hash : DUMMY_HASH;
  const ok = await bcrypt.compare(body.password, hash);
  if (!user || !ok || hash === DUMMY_HASH) throw new HttpError(401, LOGIN_ERROR);
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
  await query(SET_PASSWORD, [userId, passwordHash]);
  const user = await one<UserRow>(USER_BY_ID, [userId]);
  if (!user) throw new HttpError(400, INVALID_RESET);
  res.json(await sessionFor(user));
});


/* ───────────── /me ───────────── */

authRouter.get('/me', requireAuth, async (req, res) => {
  const profile = await one(PROFILE_BY_ID, [uid(req)]);
  if (!profile) throw notFound('Profile not found');
  res.json(profile);
});

const updateSchema = z.object({
  full_name: z.string().trim().min(1, 'cannot be empty').max(100).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, '3–30 letters, digits, dots, dashes or underscores')
    .optional(),
  level: z.enum(LEVELS).optional(),
  period: z.string().trim().max(20).nullable().optional(),
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(updateSchema, req.body);
  try {
    const profile = await one(UPDATE_PROFILE, [
      uid(req),
      body.full_name ?? null,
      body.username ?? null,
      body.level ?? null,
      body.period !== undefined,
      body.period ?? null,
    ]);
    res.json(profile);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'This username is already taken');
    throw err;
  }
});

authRouter.get('/me/stats', requireAuth, async (req, res) => {
  res.json(await one(PROFILE_STATS, [uid(req)]));
});

const ACTIVITY_SQL = { posts: ACTIVITY_POSTS, rides: ACTIVITY_RIDES, items: ACTIVITY_ITEMS, uploads: ACTIVITY_UPLOADS } as const;

authRouter.get('/me/activity', requireAuth, async (req, res) => {
  const { tab } = parse(z.object({ tab: z.enum(['posts', 'rides', 'items', 'uploads']).default('posts') }), req.query);
  res.json(await query(ACTIVITY_SQL[tab], [uid(req)]));
});
