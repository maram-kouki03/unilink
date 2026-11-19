// Notifications

export const INSERT_NOTIFICATION = `
  insert into public.notifications (user_id, title, body, link)
  values ($1, $2, $3, $4)
  returning *`;

/** $1 me, $2 limit, $3 before (timestamptz) | null */
export const LIST_NOTIFICATIONS = `
  select * from public.notifications
   where user_id = $1
     and ($3::timestamptz is null or created_at < $3)
   order by created_at desc
   limit $2`;

export const UNREAD_COUNT = `
  select count(*)::int as count from public.notifications
   where user_id = $1 and read_at is null`;

/** $1 me, $2 notification */
export const MARK_ONE_READ = `
  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = $2 and user_id = $1
  returning *`;

export const MARK_ALL_READ = `
  update public.notifications
     set read_at = now()
   where user_id = $1 and read_at is null`;

/* ── event reminders (background job) ── */

/** Claims every registration whose event starts within 24 h and sends one reminder each. */
export const CLAIM_EVENT_REMINDERS = `
  update public.event_registrations er
     set reminded_at = now()
    from public.events e
   where e.id = er.event_id
     and er.reminded_at is null
     and e.starts_at > now()
     and e.starts_at <= now() + interval '24 hours'
  returning er.user_id, e.id as event_id, e.title, e.starts_at, e.location`;
