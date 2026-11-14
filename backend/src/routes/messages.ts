import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth';
import { one, query } from '../db';
import { HttpError, notFound, parse, uuidParam } from '../http';
import { notify } from '../notify';
import { emitTo } from '../realtime';
import * as sql from '../sql/messages';
import { LIST_NOTIFICATIONS, MARK_ALL_READ } from '../sql/notifications';

export const messagesRouter = Router();

/* ───────────── Conversations ───────────── */

messagesRouter.get('/conversations', async (req, res) => {
  res.json(await query(sql.MY_CONVERSATIONS, [uid(req)]));
});

const startSchema = z.object({
  otherId: z.uuid('unknown person'),
  context: z.string().trim().max(160).nullable().optional(),
});

messagesRouter.post('/conversations', async (req, res) => {
  const me = uid(req);
  const b = parse(startSchema, req.body);
  const otherId = b.otherId.toLowerCase();
  if (otherId === me) throw new HttpError(400, 'This is your own listing');
  if (!(await one(sql.PROFILE_EXISTS, [otherId]))) throw notFound('This student no longer exists');
  const row = await one<{ id: string }>(sql.START_CONVERSATION, [me, otherId, b.context || null]);
  res.status(201).json({ id: row!.id });
});

async function otherMember(conversationId: string, me: string) {
  const row = await one<{ other_id: string }>(sql.CONVERSATION_OTHER, [conversationId, me]);
  if (!row) throw notFound('Conversation not found');
  return row.other_id;
}

messagesRouter.get('/conversations/:id/messages', async (req, res) => {
  const id = uuidParam(req.params.id, 'Conversation not found');
  await otherMember(id, uid(req));
  res.json(await query(sql.LIST_MESSAGES, [id]));
});

messagesRouter.post('/conversations/:id/messages', async (req, res) => {
  const id = uuidParam(req.params.id, 'Conversation not found');
  const me = uid(req);
  const { body } = parse(z.object({ body: z.string().trim().min(1, 'cannot be empty').max(2000) }), req.body);
  const other = await otherMember(id, me);
  const message = await one(sql.INSERT_MESSAGE, [id, me, body]);
  emitTo(`conv:${id}`, 'message:new', message);
  await notify({ target: other, actor: me, title: 'New message', body: body.slice(0, 120), link: `/chat/${id}` });
  res.status(201).json(message);
});

/* ───────────── Notifications ───────────── */

messagesRouter.get('/notifications', async (req, res) => {
  res.json(await query(LIST_NOTIFICATIONS, [uid(req)]));
});

messagesRouter.post('/notifications/read-all', async (req, res) => {
  await query(MARK_ALL_READ, [uid(req)]);
  res.json({ ok: true });
});
