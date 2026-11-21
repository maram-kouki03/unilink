// Users & profiles (auth + /me)

/** Checked on every request (requireAuth) and socket connection. */
export const USER_SESSION = `select token_version, banned_at from public.users where id = $1`;

/** Internal only: password_hash never leaves the server. */
export const USER_BY_EMAIL = `select id, email, password_hash, token_version, banned_at from public.users where email = $1`;

export const USER_BY_ID = `select id, email, password_hash, token_version, banned_at from public.users where id = $1`;

/** Accounts are created only once the e-mail code was entered. $1 email, $2 bcrypt hash */
export const INSERT_USER = `
  insert into public.users (email, password_hash, email_verified)
  values ($1, $2, true)
  returning id, email, token_version, banned_at`;

/** $1 user, $2 bcrypt hash. Bumps token_version: every other session is signed out. */
export const SET_PASSWORD = `
  update public.users
     set password_hash = $2, token_version = token_version + 1
   where id = $1
  returning id, email, token_version, banned_at`;

/** Sign out every device. */
export const BUMP_TOKEN_VERSION = `
  update public.users set token_version = token_version + 1 where id = $1
  returning token_version`;

export const DELETE_USER = `delete from public.users where id = $1`;

/** $1 user, $2 reason|null. Their tokens then get 403 "Your account is suspended" (requireAuth). */
export const BAN_USER = `
  update public.users
     set banned_at = coalesce(banned_at, now()), ban_reason = $2
   where id = $1
  returning id, banned_at`;

export const UNBAN_USER = `
  update public.users set banned_at = null, ban_reason = null where id = $1
  returning id, banned_at`;

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

/**
 * $5 = true when "period" was sent (it may be set to null),
 * $7 = true when "bio" was sent, $9 = true when the avatar changes ($10 new url or null).
 */
export const UPDATE_PROFILE = `
  update public.profiles
     set full_name  = coalesce($2, full_name),
         username   = coalesce($3, username),
         level      = coalesce($4, level),
         period     = case when $5::boolean then $6 else period end,
         bio        = case when $7::boolean then $8 else bio end,
         avatar_url = case when $9::boolean then $10 else avatar_url end
   where id = $1
  returning *`;

export const PROFILE_AVATAR = `select avatar_url from public.profiles where id = $1`;

export const PROFILE_STATS = `
  select
    (select count(*)::int from public.documents where uploader_id = $1 and parent_folder_doc_id is null) as uploads,
    (select count(*)::int from public.rides     where driver_id   = $1) as rides,
    (select count(*)::int from public.posts     where author_id   = $1) as posts,
    (select count(*)::int from public.items     where owner_id    = $1) as items,
    (select count(*)::int from public.lost_found where reporter_id = $1) as lost_found,
    (select count(*)::int from public.ride_bookings where passenger_id = $1 and status = 'confirmed') as bookings,
    (select count(*)::int from public.event_registrations where user_id = $1) as events,
    (select count(*)::int from public.comments  where author_id   = $1) as comments`;

/** Cloudinary files of a user, removed after the account is deleted. */
export const USER_FILES = `
  select 'document' as kind, d.cloudinary_public_id as ref, d.storage_resource_type as resource_type
    from public.documents d
   where d.uploader_id = $1 and d.storage_resource_type is not null and d.cloudinary_public_id is not null
  union all
  select 'image', i.photo_path, 'image' from public.items i where i.owner_id = $1 and i.photo_path is not null
  union all
  select 'image', lf.photo_path, 'image' from public.lost_found lf where lf.reporter_id = $1 and lf.photo_path is not null
  union all
  select 'image', p.avatar_url, 'image' from public.profiles p where p.id = $1 and p.avatar_url is not null`;

/** Documents use "on delete set null" for the uploader: delete them explicitly. */
export const DELETE_USER_DOCUMENTS = `delete from public.documents where uploader_id = $1`;

/** Reports about the account itself. */
export const DELETE_REPORTS_ABOUT_USER = `delete from public.reports where target_type = 'user' and target_id = $1`;
