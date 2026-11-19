import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './auth';
import { config } from './config';
import { pool } from './db';
import { errorMiddleware, notFoundHandler } from './http';
import { initRealtime } from './realtime';
import { authRouter } from './routes/auth';
import { documentsRouter } from './routes/documents';
import { eventsRouter, startEventReminders } from './routes/events';
import { itemsRouter } from './routes/items';
import { meRouter } from './routes/me';
import { messagesRouter } from './routes/messages';
import { adminRouter, moderationRouter } from './routes/moderation';
import { postsRouter } from './routes/posts';
import { ridesRouter } from './routes/rides';

const app = express();
app.disable('x-powered-by');
// Behind Render's proxy: trust X-Forwarded-* so req.protocol is https and req.ip is the real client.
app.set('trust proxy', 1);
// Security headers (an API: no HTML, so the defaults are fine).
app.use(helmet());
// Mobile app: any origin. Auth is a Bearer token, never a cookie.
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'], maxAge: 86_400 }));

const limitMessage = (what: string) => ({ error: `Too many ${what}. Please try again in a few minutes.` });

// Per IP (req.ip is the real client: trust proxy is on). Health checks are not counted.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    message: limitMessage('requests'),
  }),
);
app.use(
  '/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limitMessage('attempts'),
  }),
);

app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({ name: 'Unilink API', status: 'running' });
});

/** Health check (used by Render): answers within a few seconds and says whether the database responds. */
app.get('/health', async (_req, res) => {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pool.query('select 1'),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('database timeout')), 5_000);
      }),
    ]);
    res.json({ ok: true, db: 'up', ms: Date.now() - started });
  } catch (err: any) {
    res.status(503).json({ ok: false, db: 'down', error: err?.message ?? 'database error' });
  } finally {
    clearTimeout(timer);
  }
});

// Public routes (login / sign-up)
app.use(authRouter);

// Everything below needs a valid Bearer token
app.use(requireAuth);
app.use(meRouter);
app.use(moderationRouter);
app.use(adminRouter);
app.use(documentsRouter);
app.use(ridesRouter);
app.use(itemsRouter);
app.use(eventsRouter);
app.use(postsRouter);
app.use(messagesRouter);

app.use(notFoundHandler);
app.use(errorMiddleware);

const server = http.createServer(app);
// Render's proxy closes idle connections after ~60 s; keep Node's keep-alive above that.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
initRealtime(server);
startEventReminders();

server.listen(config.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Unilink API listening on http://0.0.0.0:${config.port}`);
  // Check the database right away so a wrong DATABASE_URL shows up at startup, not on the first request.
  pool
    .query('select 1')
    // eslint-disable-next-line no-console
    .then(() => console.log('[db] connected'))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[db] cannot connect: ${err.message}${err.code ? ` (code ${err.code})` : ''}. Check DATABASE_URL.`);
    });
});

// Render sends SIGTERM before stopping/redeploying: finish requests and close the pool.
process.on('SIGTERM', () => {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10_000).unref();
});
