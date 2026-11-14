import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what);
export const forbidden = (why = 'You are not allowed to do this') => new HttpError(403, why);

/** Validate `data` with a zod schema, or throw a 400 with the first problem. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const res = schema.safeParse(data);
  if (!res.success) {
    const issue = res.error.issues[0];
    const field = issue?.path.join('.');
    throw new HttpError(400, field ? `${field}: ${issue.message}` : (issue?.message ?? 'Invalid request'));
  }
  return res.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route parameter that must be a uuid (otherwise 404, like an unknown id). */
export function uuidParam(value: unknown, what = 'Not found'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw notFound(what);
  return value.toLowerCase();
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** Optional search text from the query string, escaped for ILIKE. Empty → null. */
export function likeParam(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Optional string from the query string. Empty → null. */
export function strParam(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    res.status(status).json({ error: message });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large' });
    return;
  }
  // PostgreSQL errors
  switch (err?.code) {
    case '23505':
      res.status(409).json({ error: 'This already exists' });
      return;
    case '23503':
      res.status(404).json({ error: 'Related record not found' });
      return;
    case '23514':
    case '23502':
    case '22P02':
    case '22007':
    case '22008':
    case '22001':
      res.status(400).json({ error: 'Invalid data' });
      return;
  }
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
};
