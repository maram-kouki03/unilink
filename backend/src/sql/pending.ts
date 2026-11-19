// Pending (not yet verified) sign-ups. A row becomes a public.users account once its code is entered.

/** Unfinished sign-ups are kept for 24 h at most. */
export const DELETE_EXPIRED_PENDING = `delete from public.pending_signups where created_at < now() - interval '24 hours'`;

/** The rate rule shared by signup and resend: 1 code per 60 s, 10 per hour. Uses alias p. */
const CAN_SEND = `
  (p.last_sent_at is null or p.last_sent_at <= now() - interval '60 seconds')
  and (p.window_start <= now() - interval '1 hour' or p.sends_in_window < 10)`;

const NEXT_SEND = `
  attempts        = 0,
  last_sent_at    = now(),
  sends_in_window = case when p.window_start > now() - interval '1 hour' then p.sends_in_window + 1 else 1 end,
  window_start    = case when p.window_start > now() - interval '1 hour' then p.window_start else now() end`;

/**
 * New sign-up, or replace the pending one with the same e-mail (send counters are kept).
 * Returns no row when the rate limit refuses a new code.
 * $1 email, $2 password_hash, $3 full_name, $4 level, $5 code_hash, $6 validity in seconds
 */
export const UPSERT_PENDING = `
  insert into public.pending_signups as p
         (email, password_hash, full_name, level, code_hash, expires_at, attempts, last_sent_at, sends_in_window, window_start)
  values ($1, $2, $3, $4, $5, now() + $6::int * interval '1 second', 0, now(), 1, now())
  on conflict (email) do update set
    password_hash = excluded.password_hash,
    full_name     = excluded.full_name,
    level         = excluded.level,
    code_hash     = excluded.code_hash,
    expires_at    = excluded.expires_at,
    created_at    = now(),
    ${NEXT_SEND}
  where ${CAN_SEND}
  returning id, email`;

/** New code for an existing pending sign-up. No row: unknown e-mail or rate limit. $1 email, $2 code_hash, $3 seconds */
export const RESEND_PENDING = `
  update public.pending_signups as p set
    code_hash  = $2,
    expires_at = now() + $3::int * interval '1 second',
    ${NEXT_SEND}
  where p.email = $1 and ${CAN_SEND}
  returning id, email`;

/** Why a code was refused. $1 email */
export const PENDING_RATE = `
  select (p.last_sent_at is not null and p.last_sent_at > now() - interval '60 seconds') as too_soon,
         coalesce(ceil(extract(epoch from (p.last_sent_at + interval '60 seconds' - now())))::int, 0) as wait_seconds
    from public.pending_signups p
   where p.email = $1`;

/** The e-mail could not be sent: the code is useless and must not count against the rate limit. $1 id */
export const UNSEND_PENDING = `
  update public.pending_signups
     set expires_at = now(), last_sent_at = null, sends_in_window = greatest(sends_in_window - 1, 0)
   where id = $1`;

/** Locked for the code check. $1 email */
export const PENDING_FOR_UPDATE = `
  select id, email, password_hash, full_name, level, code_hash, attempts, expires_at < now() as expired
    from public.pending_signups
   where email = $1
   for update`;

export const ADD_PENDING_ATTEMPT = `update public.pending_signups set attempts = attempts + 1 where id = $1`;

export const DELETE_PENDING = `delete from public.pending_signups where id = $1`;
