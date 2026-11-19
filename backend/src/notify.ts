import { Db, one, pool } from './db';
import { sendPush } from './push';
import { emitTo } from './realtime';
import { INSERT_NOTIFICATION } from './sql/notifications';

/**
 * Store a notification for `target` (unless the target is the actor themself),
 * push it live to the room user:<target> and send an Expo push to their phones.
 * Never throws: a failed notification must not break the main action.
 * `actor` is null for notifications sent by the system (event reminders).
 */
export async function notify(
  n: { target: string | null | undefined; actor: string | null; title: string; body?: string | null; link?: string | null },
  db: Db = pool,
) {
  if (!n.target || n.target === n.actor) return;
  try {
    const row = await one<{ id: string }>(INSERT_NOTIFICATION, [n.target, n.title, n.body ?? null, n.link ?? null], db);
    if (!row) return;
    emitTo(`user:${n.target}`, 'notification:new', row);
    // Not awaited: Expo can be slow, the request answers right away.
    void sendPush([n.target], { title: n.title, body: n.body, data: { link: n.link ?? null, notificationId: row.id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify]', err);
  }
}
