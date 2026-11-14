import { Db, one, pool } from './db';
import { emitTo } from './realtime';
import { INSERT_NOTIFICATION } from './sql/notifications';

/**
 * Store a notification for `target` (unless the target is the actor themself)
 * and push it live to the room user:<target>.
 * Never throws: a failed notification must not break the main action.
 */
export async function notify(
  n: { target: string | null | undefined; actor: string; title: string; body?: string | null; link?: string | null },
  db: Db = pool,
) {
  if (!n.target || n.target === n.actor) return;
  try {
    const row = await one(INSERT_NOTIFICATION, [n.target, n.title, n.body ?? null, n.link ?? null], db);
    if (row) emitTo(`user:${n.target}`, 'notification:new', row);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify]', err);
  }
}
