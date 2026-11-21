import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra fields added to the JSON error body, e.g. { needsVerification: true }. */
    public extra?: Record<string, unknown>,
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

const uuidSchema = z.guid();

/** Route parameter that must be a uuid (otherwise 404, like an unknown id). */
export function uuidParam(value: unknown, what = 'Not found'): string {
  const res = uuidSchema.safeParse(value);
  if (!res.success) throw notFound(what);
  return res.data.toLowerCase();
}

export const isUuid = (value: unknown): value is string => uuidSchema.safeParse(value).success;

const optionalQueryText = z
  .union([z.string(), z.undefined()])
  .transform((v) => (typeof v === 'string' && v.trim() ? v.trim() : null))
  .pipe(z.string().max(100, 'is too long').nullable());

/** Optional search text from the query string, escaped for ILIKE. Empty → null. */
export function likeParam(value: unknown): string | null {
  const s = parse(optionalQueryText, value);
  return s ? s.replace(/[\\%_]/g, (c) => `\\${c}`) : null;
}

/** Optional string from the query string. Empty → null. */
export function strParam(value: unknown): string | null {
  return parse(optionalQueryText, value);
}

/** Express 5 leaves req.body undefined when nothing was sent. */
export const bodyOf = (body: unknown) => (body && typeof body === 'object' ? body : {});

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

const isDev = process.env.NODE_ENV !== 'production';

/** Print the full error (message, stack, PostgreSQL details) so server problems are visible. */
function logError(err: any, req: Parameters<ErrorRequestHandler>[1]) {
  const where = `${req.method} ${req.originalUrl}`;
  if (!isDev) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${where}:`, err?.message ?? err);
    return;
  }
  const pg = err?.code
    ? { code: err.code, detail: err.detail, hint: err.hint, table: err.table, column: err.column, constraint: err.constraint }
    : undefined;
  // eslint-disable-next-line no-console
  console.error(`\n[error] ${where}\n${err?.stack ?? err}`, pg ? `\n[pg] ${JSON.stringify(pg)}` : '');
}

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.status >= 500) logError(err, req);
    res.status(err.status).json({ ...err.extra, error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB for documents, 5 MB for images)' : err.message;
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
  // PostgreSQL errors (logged in development, they often reveal a schema problem)
  if (isDev && typeof err?.code === 'string') logError(err, req);
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
  if (!(isDev && typeof err?.code === 'string')) logError(err, req);
  res.status(500).json({ error: 'Something went wrong on the server' });
};
