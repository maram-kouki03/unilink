// Users & profiles (auth + /me)

export const USER_EXISTS = `select 1 from public.users where id = $1`;

export const USER_BY_EMAIL = `select id, email, password_hash from public.users where email = $1`;

export const INSERT_USER = `
  insert into public.users (email, password_hash)
  values ($1, $2)
  returning id, email`;

export const USERNAME_TAKEN = `select 1 from public.profiles where username = $1`;

export const INSERT_PROFILE = `
  insert into public.profiles (id, email, full_name, username, level)
  values ($1, $2, $3, $4, $5)
  returning *`;

/** Used at login if an old account somehow has no profile row. */
export const ENSURE_PROFILE = `
  insert into public.profiles (id, email, full_name, username)
  values ($1, $2, split_part($2, '@', 1), null)
  on conflict (id) do nothing`;

export const PROFILE_BY_ID = `select * from public.profiles where id = $1`;

export const PROFILE_ROLE = `select role from public.profiles where id = $1`;

export const PROFILE_NAME = `select full_name from public.profiles where id = $1`;

/** $5 = true when "period" was sent (it may be set to null). */
export const UPDATE_PROFILE = `
  update public.profiles
     set full_name = coalesce($2, full_name),
         username  = coalesce($3, username),
         level     = coalesce($4, level),
         period    = case when $5::boolean then $6 else period end
   where id = $1
  returning *`;

export const PROFILE_STATS = `
  select
    (select count(*)::int from public.documents where uploader_id = $1) as uploads,
    (select count(*)::int from public.rides     where driver_id   = $1) as rides,
    (select count(*)::int from public.posts     where author_id   = $1) as posts`;
