import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, uid } from '../auth';
import { one, query, transaction } from '../db';
import { HttpError, notFound, parse, uuidParam } from '../http';
import { notify } from '../notify';
import { CLAIM_EVENT_REMINDERS } from '../sql/notifications';
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
  /** Seat limit; null / missing = unlimited. */
  seats: z.number().int().min(1).max(100000).nullable().optional(),
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
    e.seats ?? null,
  ]);
  res.status(201).json(row);
});

eventsRouter.delete('/events/:id', requireAdmin, async (req, res) => {
  const row = await one(sql.DELETE_EVENT, [uuidParam(req.params.id, 'Event not found')]);
  if (!row) throw notFound('Event not found');
  res.json({ ok: true });
});

/** Register (seat limit checked with the event row locked). Already registered → no change. */
async function register(eventId: string, me: string) {
  await transaction(async (db) => {
    const event = await one<{ id: string; seats: number | null; starts_at: Date }>(sql.LOCK_EVENT, [eventId], db);
    if (!event) throw notFound('Event not found');
    if (await one(sql.IS_REGISTERED, [eventId, me], db)) return;
    if (new Date(event.starts_at).getTime() < Date.now() - 12 * 3600 * 1000) throw new HttpError(400, 'This event is over');
    if (event.seats !== null) {
      const taken = (await one<{ count: number }>(sql.REGISTERED_COUNT, [eventId], db))?.count ?? 0;
      if (taken >= event.seats) throw new HttpError(409, 'This event is full');
    }
    await query(sql.REGISTER, [eventId, me], db);
  });
}

/**
 * Toggle (used by the app): registered → unregister, otherwise register.
 * Send { registered: true|false } to set it explicitly.
 */
eventsRouter.post('/events/:id/register', async (req, res) => {
  const id = uuidParam(req.params.id, 'Event not found');
  const me = uid(req);
  const { registered } = parse(z.object({ registered: z.boolean().optional() }), req.body ?? {});
  const want = registered ?? !(await one(sql.IS_REGISTERED, [id, me]));
  if (!want) {
    await query(sql.UNREGISTER, [id, me]);
    res.json({ registered: false });
    return;
  }
  await register(id, me);
  res.json({ registered: true });
});

eventsRouter.delete('/events/:id/register', async (req, res) => {
  const id = uuidParam(req.params.id, 'Event not found');
  await query(sql.UNREGISTER, [id, uid(req)]);
  res.json({ registered: false });
});

/* ───────────── Event reminders (one per registration, ~24 h before) ───────────── */

let reminderRunning = false;

export async function sendEventReminders() {
  if (reminderRunning) return;
  reminderRunning = true;
  try {
    const rows = await query<{ user_id: string; event_id: string; title: string; starts_at: Date; location: string }>(CLAIM_EVENT_REMINDERS);
    for (const r of rows) {
      const when = new Date(r.starts_at).toLocaleString('fr-TN', {
        timeZone: 'Africa/Tunis',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      await notify({ target: r.user_id, actor: null, title: `Reminder: ${r.title}`, body: `${when} · ${r.location}`, link: `/events/${r.event_id}` });
    }
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[reminders]', err?.message ?? err);
  } finally {
    reminderRunning = false;
  }
}

/** Every 10 minutes while the server is awake (Render free plan sleeps when idle; the next start catches up). */
export function startEventReminders() {
  setTimeout(() => void sendEventReminders(), 30_000).unref();
  setInterval(() => void sendEventReminders(), 10 * 60 * 1000).unref();
}
