// Notifications

export const INSERT_NOTIFICATION = `
  insert into public.notifications (user_id, title, body, link)
  values ($1, $2, $3, $4)
  returning *`;

export const LIST_NOTIFICATIONS = `
  select * from public.notifications
   where user_id = $1
   order by created_at desc
   limit 50`;

export const MARK_ALL_READ = `
  update public.notifications
     set read_at = now()
   where user_id = $1 and read_at is null`;
