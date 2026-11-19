import type { Request, RequestHandler } from 'express';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { one } from './db';
import { HttpError } from './http';
import { PROFILE_ROLE, USER_EXISTS } from './sql/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const SESSION_AUDIENCE = 'unilink-session';

export function signToken(userId: string): string {
  return jwt.sign({}, config.jwtSecret, { subject: userId, audience: SESSION_AUDIENCE, expiresIn: '30d' });
}

/** Returns the user id of a valid session token, or null. */
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { audience: SESSION_AUDIENCE });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/* ───────────── Password-reset token (after the reset code was checked) ───────────── */

const RESET_PURPOSE = 'reset';

/**
 * Short fingerprint of the current password hash: once the password changes,
 * every reset token issued before stops working (so a token is single-use).
 */
const passwordStamp = (passwordHash: string) =>
  createHmac('sha256', config.jwtSecret).update(`reset-stamp:${passwordHash}`).digest('hex').slice(0, 24);

export function signResetToken(userId: string, passwordHash: string): string {
  return jwt.sign({ purpose: RESET_PURPOSE, ps: passwordStamp(passwordHash) }, config.jwtSecret, {
    subject: userId,
    expiresIn: '10m',
  });
}

/** Returns the user id if the reset token is valid, not expired and issued for the current password. */
export async function verifyResetToken(
  token: string,
  currentPasswordHash: (userId: string) => Promise<string | null>,
): Promise<string | null> {
  let payload: jwt.JwtPayload | string;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null; // bad signature or expired
  }
  if (typeof payload !== 'object' || payload.purpose !== RESET_PURPOSE || typeof payload.sub !== 'string') return null;
  if (payload.aud !== undefined) return null; // never accept a session token here
  const hash = await currentPasswordHash(payload.sub);
  if (!hash || payload.ps !== passwordStamp(hash)) return null; // password already changed with this token
  return payload.sub;
}

/** The signed-in user's id (only call after requireAuth). */
export function uid(req: Request): string {
  if (!req.userId) throw new HttpError(401, 'Please sign in');
  return req.userId;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const userId = token ? verifyToken(token) : null;
  if (!userId) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  // The account may have been deleted since the token was issued.
  if (!(await one(USER_EXISTS, [userId]))) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  req.userId = userId;
  next();
};

export async function isAdmin(userId: string): Promise<boolean> {
  const row = await one<{ role: string }>(PROFILE_ROLE, [userId]);
  return row?.role === 'admin';
}

/** Use after requireAuth. */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  if (!(await isAdmin(uid(req)))) throw new HttpError(403, 'Only admins can do this');
  next();
};
