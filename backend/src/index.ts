import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { requireAuth } from './auth';
import { config } from './config';
import { pool } from './db';
import { errorMiddleware, notFoundHandler } from './http';
import { initRealtime } from './realtime';
import { authRouter } from './routes/auth';
import { documentsRouter, filesRouter } from './routes/documents';
import { eventsRouter } from './routes/events';
import { itemsRouter } from './routes/items';
import { messagesRouter } from './routes/messages';
import { postsRouter } from './routes/posts';
import { ridesRouter } from './routes/rides';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Public: item / lost & found photos
app.use('/uploads/images', express.static(config.imagesDir, { maxAge: '7d', index: false, dotfiles: 'deny' }));

app.get('/health', async (_req, res) => {
  await pool.query('select 1');
  res.json({ ok: true });
});

// Public routes (login / sign-up, signed document links)
app.use(authRouter);
app.use(filesRouter);

// Everything below needs a valid Bearer token
app.use(requireAuth);
app.use(documentsRouter);
app.use(ridesRouter);
app.use(itemsRouter);
app.use(eventsRouter);
app.use(postsRouter);
app.use(messagesRouter);

app.use(notFoundHandler);
app.use(errorMiddleware);

const server = http.createServer(app);
initRealtime(server);

server.listen(config.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Unilink API listening on http://0.0.0.0:${config.port}`);
});
