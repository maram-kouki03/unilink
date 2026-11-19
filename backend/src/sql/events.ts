// Events. $1 is always the signed-in user (for registered_by_me).

const EVENT_FEED = `
  select e.*,
         (select count(*)::int from public.event_registrations er where er.event_id = e.id) as going,
         case when e.seats is null then null
              else greatest(e.seats - (select count(*)::int from public.event_registrations er where er.event_id = e.id), 0)
         end as seats_left,
         exists (select 1 from public.event_registrations er where er.event_id = e.id and er.user_id = $1) as registered_by_me
    from public.events e`;

/** $2 category|null, $3 upcoming only (boolean) */
export const LIST_EVENTS = `
  ${EVENT_FEED}
   where ($2::text is null or e.category = $2)
     and (not $3::boolean or e.starts_at >= now() - interval '12 hours')
   order by e.starts_at`;

/** $2 event id */
export const EVENT_BY_ID = `${EVENT_FEED} where e.id = $2`;

export const INSERT_EVENT = `
  insert into public.events (title, category, organizer, starts_at, ends_at, location, description, created_by, seats)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  returning id`;

/** Locks the event row so two students cannot take the last seat at the same time. */
export const LOCK_EVENT = `select id, seats, starts_at from public.events where id = $1 for update`;

export const REGISTERED_COUNT = `select count(*)::int as count from public.event_registrations where event_id = $1`;

/** $1 event, $2 me */
export const UNREGISTER = `delete from public.event_registrations where event_id = $1 and user_id = $2 returning event_id`;

export const IS_REGISTERED = `select 1 from public.event_registrations where event_id = $1 and user_id = $2`;

export const REGISTER = `
  insert into public.event_registrations (event_id, user_id) values ($1, $2)
  on conflict do nothing`;

export const DELETE_EVENT = `delete from public.events where id = $1 returning id`;
