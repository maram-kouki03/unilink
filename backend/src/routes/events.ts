import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, uid } from '../auth';
import { one, query } from '../db';
import { HttpError, notFound, parse, uuidParam } from '../http';
import * as sql from '../sql/events';

export const eventsRouter = Router();

const CATEGORIES = ['conference', 'workshop', 'hackathon', 'club'] as const;

eventsRouter.get('/events', async (req, res) => {
  const q = parse(
    z.object({
      category: z.enum([...CATEGORIES, 'all']).default('all'),
      upcoming: z.enum(['true', 'false', '1', '0']).default('true'),
    }),
    req.query,
  );
  const category = q.category === 'all' ? null : q.category;
  const upcoming = q.upcoming === 'true' || q.upcoming === '1';
  res.json(await query(sql.LIST_EVENTS, [uid(req), category, upcoming]));
});

eventsRouter.get('/events/:id', async (req, res) => {
  const event = await one(sql.EVENT_BY_ID, [uid(req), uuidParam(req.params.id, 'Event not found')]);
  if (!event) throw notFound('Event not found');
  res.json(event);
});

const eventSchema = z.object({
  title: z.string().trim().min(3).max(140),
  category: z.enum(CATEGORIES),
  organizer: z.string().trim().min(2).max(120),
  starts_at: z.iso.datetime({ offset: true, message: 'invalid date' }),
  ends_at: z.iso.datetime({ offset: true, message: 'invalid date' }).nullable().optional(),
  location: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).nullable().optional(),
});

eventsRouter.post('/events', requireAdmin, async (req, res) => {
  const e = parse(eventSchema, req.body);
  if (e.ends_at && new Date(e.ends_at) < new Date(e.starts_at)) throw new HttpError(400, 'ends_at: must be after the start');
  const row = await one(sql.INSERT_EVENT, [
    e.title,
    e.category,
    e.organizer,
    e.starts_at,
    e.ends_at ?? null,
    e.location,
    e.description || null,
    uid(req),
  ]);
  res.status(201).json(row);
});

eventsRouter.post('/events/:id/register', async (req, res) => {
  const id = uuidParam(req.params.id, 'Event not found');
  const me = uid(req);
  if (await one(sql.UNREGISTER, [id, me])) {
    res.json({ registered: false });
    return;
  }
  if (!(await one(sql.EVENT_EXISTS, [id]))) throw notFound('Event not found');
  await query(sql.REGISTER, [id, me]);
  res.json({ registered: true });
});
