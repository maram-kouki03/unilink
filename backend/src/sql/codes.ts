// E-mail codes (verify e-mail, reset password). Only an HMAC of the code is stored.

/** $1 user: how many codes were created in the last minute / hour, and seconds until the next one is allowed. */
export const CODE_RATE = `
  select count(*) filter (where created_at > now() - interval '60 seconds')::int as last_minute,
         count(*)::int as last_hour,
         coalesce(ceil(extract(epoch from (max(created_at) + interval '60 seconds' - now())))::int, 0) as wait_seconds
    from public.email_codes
   where user_id = $1 and created_at > now() - interval '1 hour'`;

/** $1 user, $2 purpose, $3 code_hash, $4 validity in seconds */
export const INSERT_CODE = `
  insert into public.email_codes (user_id, purpose, code_hash, expires_at)
  values ($1, $2, $3, now() + $4::int * interval '1 second')
  returning id`;

/** After a code was sent: older codes of the same purpose stop working. $1 user, $2 purpose, $3 new code id */
export const INVALIDATE_OTHER_CODES = `
  update public.email_codes set used_at = now()
   where user_id = $1 and purpose = $2 and id <> $3 and used_at is null`;

export const DELETE_CODE = `delete from public.email_codes where id = $1`;

/** Old rows are useless: keep the table small. $1 user */
export const DELETE_OLD_CODES = `delete from public.email_codes where user_id = $1 and created_at < now() - interval '1 day'`;

/** The latest code of a purpose, locked for the check. $1 user, $2 purpose */
export const LATEST_CODE_FOR_UPDATE = `
  select id, code_hash, attempts, used_at, expires_at < now() as expired
    from public.email_codes
   where user_id = $1 and purpose = $2
   order by created_at desc
   limit 1
   for update`;

export const ADD_ATTEMPT = `update public.email_codes set attempts = attempts + 1 where id = $1`;

export const USE_CODE = `update public.email_codes set used_at = now() where id = $1`;

/** A used reset / verify code also ends every other pending code of that purpose. $1 user, $2 purpose */
export const USE_ALL_CODES = `
  update public.email_codes set used_at = now()
   where user_id = $1 and purpose = $2 and used_at is null`;
