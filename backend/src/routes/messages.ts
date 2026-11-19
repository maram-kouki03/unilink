import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth';
import { one, query } from '../db';
import { HttpError, notFound, parse, uuidParam } from '../http';
import { notify } from '../notify';
import { emitTo } from '../realtime';
import * as sql from '../sql/messages';
import { LIST_NOTIFICATIONS, MARK_ALL_READ, MARK_ONE_READ, UNREAD_COUNT } from '../sql/notifications';

export const messagesRouter = Router();

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** ISO date: only items older than this (pass the created_at of the oldest item you have). */
  before: z.iso.datetime({ offset: true, message: 'invalid date' }).optional(),
});

/* ───────────── Conversations ───────────── */

messagesRouter.get('/conversations', async (req, res) => {
  res.json(await query(sql.MY_CONVERSATIONS, [uid(req)]));
});

messagesRouter.get('/conversations/unread-count', async (req, res) => {
  res.json(await one(sql.UNREAD_MESSAGES_TOTAL, [uid(req)]));
});

const startSchema = z.object({
  otherId: z.guid('unknown person'),
  context: z.string().trim().max(160).nullable().optional(),
});

messagesRouter.post('/conversations', async (req, res) => {
  const me = uid(req);
  const b = parse(startSchema, req.body);
  const otherId = b.otherId.toLowerCase();
  if (otherId === me) throw new HttpError(400, 'This is your own listing');
  if (!(await one(sql.PROFILE_EXISTS, [otherId]))) throw notFound('This student no longer exists');
  // One conversation per pair of students: an existing one is returned.
  const row = await one<{ id: string; created: boolean }>(sql.START_CONVERSATION, [me, otherId, b.context || null]);
  res.status(row!.created ? 201 : 200).json({ id: row!.id, created: row!.created });
});

async function otherMember(conversationId: string, me: string) {
  const row = await one<{ other_id: string }>(sql.CONVERSATION_OTHER, [conversationId, me]);
  if (!row) throw notFound('Conversation not found');
  return row.other_id;
}

/** ?limit=50&before=<created_at of the oldest message you have> → older page. Always oldest first. */
messagesRouter.get('/conversations/:id/messages', async (req, res) => {
  const id = uuidParam(req.params.id, 'Conversation not found');
  const page = parse(pageSchema, req.query);
  await otherMember(id, uid(req));
  res.json(await query(sql.LIST_MESSAGES, [id, page.limit, page.before ?? null]));
});

messagesRouter.post('/conversations/:id/messages', async (req, res) => {
  const id = uuidParam(req.params.id, 'Conversation not found');
  const me = uid(req);
  const { body } = parse(z.object({ body: z.string().trim().min(1, 'cannot be empty').max(2000) }), req.body);
  const other = await otherMember(id, me);
  const message = await one(sql.INSERT_MESSAGE, [id, me, body]);
  emitTo(`conv:${id}`, 'message:new', message);
  // The other person's conversation list (unread badge) updates even when the chat is not open.
  emitTo(`user:${other}`, 'conversation:updated', { conversation_id: id });
  await notify({ target: other, actor: me, title: 'New message', body: body.slice(0, 120), link: `/chat/${id}` });
  res.status(201).json(message);
});

messagesRouter.post('/conversations/:id/read', async (req, res) => {
  const id = uuidParam(req.params.id, 'Conversation not found');
  const me = uid(req);
  const other = await otherMember(id, me);
  const rows = await query(sql.MARK_CONVERSATION_READ, [id, me]);
  if (rows.length) {
    const event = { conversation_id: id, reader_id: me, read_at: new Date().toISOString() };
    emitTo(`conv:${id}`, 'conversation:read', event);
    emitTo(`user:${other}`, 'conversation:read', event);
  }
  res.json({ ok: true, marked: rows.length });
});

/* ───────────── Notifications ───────────── */

messagesRouter.get('/notifications', async (req, res) => {
  const page = parse(pageSchema, req.query);
  res.json(await query(LIST_NOTIFICATIONS, [uid(req), page.limit, page.before ?? null]));
});

messagesRouter.get('/notifications/unread-count', async (req, res) => {
  res.json(await one(UNREAD_COUNT, [uid(req)]));
});

messagesRouter.post('/notifications/read-all', async (req, res) => {
  await query(MARK_ALL_READ, [uid(req)]);
  res.json({ ok: true });
});

messagesRouter.post('/notifications/:id/read', async (req, res) => {
  const row = await one(MARK_ONE_READ, [uid(req), uuidParam(req.params.id, 'Notification not found')]);
  if (!row) throw notFound('Notification not found');
  res.json(row);
});
