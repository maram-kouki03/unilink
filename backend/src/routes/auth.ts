import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { requireAuth, signToken, uid } from '../auth';
import { config } from '../config';
import { one, query, transaction } from '../db';
import { HttpError, notFound, parse } from '../http';
import {
  ENSURE_PROFILE,
  INSERT_PROFILE,
  INSERT_USER,
  PROFILE_BY_ID,
  PROFILE_STATS,
  UPDATE_PROFILE,
  USER_BY_EMAIL,
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

const signupSchema = z.object({
  fullName: z.string().trim().min(3, 'please enter your full name').max(100),
  email,
  password: z.string().min(8, 'must be at least 8 characters').max(200),
  level: z.enum(LEVELS),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'required'),
});

// Used when the e-mail is unknown, so a login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('unilink-dummy-password', 10);
const LOGIN_ERROR = 'Wrong e-mail or password';

authRouter.post('/auth/signup', async (req, res) => {
  const body = parse(signupSchema, req.body);
  if (!body.email.endsWith(`@${config.allowedDomain}`)) {
    throw new HttpError(400, `Only @${config.allowedDomain} e-mail addresses can join Unilink`);
  }
  const passwordHash = await bcrypt.hash(body.password, 10);

  const profile = await transaction(async (db) => {
    if (await one(USER_BY_EMAIL, [body.email], db)) throw new HttpError(409, 'An account with this e-mail already exists');

    const base = body.email.split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'student';
    let username = base;
    for (let i = 0; i < 10 && (await one(USERNAME_TAKEN, [username], db)); i++) {
      username = `${base}${randomInt(1000, 10000)}`;
    }

    const user = await one<{ id: string; email: string }>(INSERT_USER, [body.email, passwordHash], db);
    if (!user) throw new Error('User insert failed');
    return one(INSERT_PROFILE, [user.id, user.email, body.fullName, username, body.level], db);
  });

  res.status(201).json({ token: signToken(profile!.id), profile });
});

authRouter.post('/auth/login', async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await one<{ id: string; email: string; password_hash: string }>(USER_BY_EMAIL, [body.email]);
  const hash = user?.password_hash?.startsWith('$2') ? user.password_hash : DUMMY_HASH;
  const ok = await bcrypt.compare(body.password, hash);
  if (!user || !ok || hash === DUMMY_HASH) throw new HttpError(401, LOGIN_ERROR);

  await one(ENSURE_PROFILE, [user.id, user.email]);
  const profile = await one(PROFILE_BY_ID, [user.id]);
  res.json({ token: signToken(user.id), profile });
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
