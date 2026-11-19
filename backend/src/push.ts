import { query } from './db';
import { DELETE_PUSH_TOKENS, PUSH_TOKENS_OF_USERS } from './sql/push';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export type PushMessage = { title: string; body?: string | null; data?: Record<string, unknown> };

type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

/**
 * Send an Expo push notification to every device of these users.
 * Batches of 100, removes tokens Expo reports as DeviceNotRegistered.
 * Never throws: a push failure must not break the request.
 */
export async function sendPush(userIds: string[], msg: PushMessage): Promise<void> {
  try {
    if (!userIds.length) return;
    const rows = await query<{ token: string }>(PUSH_TOKENS_OF_USERS, [userIds]);
    if (!rows.length) return;
    const tokens = rows.map((r) => r.token);
    const dead: string[] = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const messages = batch.map((to) => ({
        to,
        title: msg.title,
        body: msg.body ?? undefined,
        data: msg.data ?? {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }));
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error(`[push] Expo answered ${res.status}`);
          continue;
        }
        const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
        // Tickets come back in the same order as the messages.
        json?.data?.forEach((ticket, idx) => {
          if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && batch[idx]) dead.push(batch[idx]);
        });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[push] send failed:', err?.message ?? err);
      }
    }

    if (dead.length) await query(DELETE_PUSH_TOKENS, [dead]);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[push]', err?.message ?? err);
  }
}
