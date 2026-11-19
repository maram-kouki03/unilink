// Expo push tokens

export const PUSH_TOKENS_OF_USERS = `select token from public.push_tokens where user_id = any($1::uuid[])`;

export const DELETE_PUSH_TOKENS = `delete from public.push_tokens where token = any($1::text[])`;

/** A device that changes account moves its token to the new user. $1 user, $2 token, $3 platform */
export const UPSERT_PUSH_TOKEN = `
  insert into public.push_tokens (user_id, token, platform)
  values ($1, $2, $3)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
  returning token, platform, created_at, updated_at`;

/** $1 user, $2 token */
export const DELETE_MY_PUSH_TOKEN = `delete from public.push_tokens where user_id = $1 and token = $2 returning token`;

export const DELETE_ALL_MY_PUSH_TOKENS = `delete from public.push_tokens where user_id = $1`;
