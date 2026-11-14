import type { Request, RequestHandler } from 'express';
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
const FILE_AUDIENCE = 'unilink-file';

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

/** Short-lived signature for opening a private document without an Authorization header. */
export function signFileLink(documentId: string): string {
  return jwt.sign({ doc: documentId }, config.jwtSecret, { audience: FILE_AUDIENCE, expiresIn: '1h' });
}

export function verifyFileLink(documentId: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || !sig) return false;
  try {
    const payload = jwt.verify(sig, config.jwtSecret, { audience: FILE_AUDIENCE });
    return typeof payload === 'object' && payload.doc === documentId;
  } catch {
    return false;
  }
}
