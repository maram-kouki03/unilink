import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signToken, uid } from '../auth';
import { one, query, transaction } from '../db';
import { removeImage, removeImageUrl, removeStored, storeImage, uploadImage, type ResourceType } from '../files';
import { HttpError, notFound, parse } from '../http';
import { disconnectUser } from '../realtime';
import {
  DELETE_REPORTS_ABOUT_USER,
  DELETE_USER,
  DELETE_USER_DOCUMENTS,
  PROFILE_AVATAR,
  PROFILE_BY_ID,
  PROFILE_STATS,
  SET_PASSWORD,
  UPDATE_PROFILE,
  USER_BY_ID,
  USER_FILES,
} from '../sql/auth';
import { ACTIVITY_UPLOADS } from '../sql/documents';
import { ACTIVITY_ITEMS } from '../sql/items';
import { ACTIVITY_POSTS } from '../sql/posts';
import { DELETE_MY_PUSH_TOKEN, UPSERT_PUSH_TOKEN } from '../sql/push';
import { ACTIVITY_RIDES } from '../sql/rides';
import { LEVELS, password, passwordMatches, type UserRow } from './auth';

/** Every route here requires a signed-in user (requireAuth is applied in index.ts). */
export const meRouter = Router();

meRouter.get('/me', async (req, res) => {
  const profile = await one(PROFILE_BY_ID, [uid(req)]);
  if (!profile) throw notFound('Profile not found');
  res.json(profile);
});

/* ───────────── PATCH /me: JSON or multipart (with an "avatar" image, 5 MB) ───────────── */

/** Multipart fields arrive as strings: '' → null, 'true'/'false' → booleans. */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const bool = (v: unknown) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v);

const updateSchema = z.object({
  full_name: z.string().trim().min(1, 'cannot be empty').max(100).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, '3–30 letters, digits, dots, dashes or underscores')
    .optional(),
  level: z.enum(LEVELS).optional(),
  period: z.preprocess(blank, z.string().trim().max(20).nullable()).optional(),
  bio: z.preprocess(blank, z.string().trim().max(500, 'max 500 characters').nullable()).optional(),
  /** true → delete the current profile picture. */
  removeAvatar: z.preprocess(bool, z.boolean()).optional(),
});

meRouter.patch('/me', uploadImage.single('avatar'), async (req, res) => {
  const me = uid(req);
  // Validate before uploading so a bad form never leaves a picture on Cloudinary.
  const body = parse(updateSchema, req.body ?? {});
  const old = await one<{ avatar_url: string | null }>(PROFILE_AVATAR, [me]);
  if (!old) throw notFound('Profile not found');

  const avatar = req.file ? await storeImage(req.file, 'avatar') : null;
  const avatarChanges = !!avatar || body.removeAvatar === true;
  try {
    const profile = await one(UPDATE_PROFILE, [
      me,
      body.full_name ?? null,
      body.username ?? null,
      body.level ?? null,
      body.period !== undefined,
      body.period ?? null,
      body.bio !== undefined,
      body.bio ?? null,
      avatarChanges,
      avatar?.url ?? null,
    ]);
    if (avatarChanges && old.avatar_url) await removeImageUrl(old.avatar_url);
    res.json(profile);
  } catch (err) {
    await removeImage(avatar);
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'This username is already taken');
    throw err;
  }
});

meRouter.get('/me/stats', async (req, res) => {
  res.json(await one(PROFILE_STATS, [uid(req)]));
});

const ACTIVITY_SQL = { posts: ACTIVITY_POSTS, rides: ACTIVITY_RIDES, items: ACTIVITY_ITEMS, uploads: ACTIVITY_UPLOADS } as const;

meRouter.get('/me/activity', async (req, res) => {
  const { tab } = parse(z.object({ tab: z.enum(['posts', 'rides', 'items', 'uploads']).default('posts') }), req.query);
  res.json(await query(ACTIVITY_SQL[tab], [uid(req)]));
});

/* ───────────── Password ───────────── */

/** Same password rule as sign-up. Other devices are signed out; this one gets a new token. */
meRouter.post('/me/change-password', async (req, res) => {
  const me = uid(req);
  const body = parse(z.object({ currentPassword: z.string().min(1, 'required').max(200), newPassword: password }), req.body);
  const user = await one<UserRow>(USER_BY_ID, [me]);
  if (!user || !(await passwordMatches(body.currentPassword, user.password_hash))) {
    throw new HttpError(400, 'currentPassword: wrong password');
  }
  if (body.currentPassword === body.newPassword) throw new HttpError(400, 'newPassword: must be different from the current password');
  const updated = await one<UserRow>(SET_PASSWORD, [me, await bcrypt.hash(body.newPassword, 10)]);
  disconnectUser(me);
  res.json({ ok: true, token: signToken(me, updated!.token_version) });
});

/* ───────────── Push tokens (Expo) ───────────── */

const pushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .max(200)
    .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, 'not an Expo push token'),
  platform: z.enum(['ios', 'android', 'web']),
});

meRouter.post('/me/push-token', async (req, res) => {
  const b = parse(pushTokenSchema, req.body);
  res.status(201).json(await one(UPSERT_PUSH_TOKEN, [uid(req), b.token, b.platform]));
});

meRouter.delete('/me/push-token', async (req, res) => {
  const b = parse(pushTokenSchema.pick({ token: true }), req.body);
  await query(DELETE_MY_PUSH_TOKEN, [uid(req), b.token]);
  res.json({ ok: true });
});

/* ───────────── Delete the account (Google Play requirement) ───────────── */

meRouter.delete('/me', async (req, res) => {
  const me = uid(req);
  const body = parse(z.object({ password: z.string().min(1, 'required').max(200) }), req.body);
  const user = await one<UserRow>(USER_BY_ID, [me]);
  if (!user || !(await passwordMatches(body.password, user.password_hash))) throw new HttpError(400, 'password: wrong password');

  const files = await transaction(async (db) => {
    const list = await query<{ kind: 'document' | 'image'; ref: string; resource_type: ResourceType }>(USER_FILES, [me], db);
    // documents.uploader_id is "on delete set null": remove them explicitly.
    await query(DELETE_USER_DOCUMENTS, [me], db);
    await query(DELETE_REPORTS_ABOUT_USER, [me], db);
    // Cascades: profile, rides, bookings, items, lost & found, posts, comments, likes,
    // conversations, messages, notifications, stars, opens, reports, push tokens, registrations.
    await query(DELETE_USER, [me], db);
    return list;
  });

  disconnectUser(me);
  // Cloudinary cleanup after the commit (never throws).
  await Promise.all(
    files.map((f) => (f.kind === 'document' ? removeStored(f.ref, f.resource_type, 'authenticated') : removeImageUrl(f.ref))),
  );
  res.json({ ok: true });
});
