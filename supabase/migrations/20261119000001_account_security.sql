-- Account security: e-mail verification and password reset with 6-digit codes.
-- Safe to run more than once.

-- 1. users.email_verified. Existing accounts are marked verified ONLY when the column is created,
--    so running this file again never verifies new, unconfirmed accounts.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'email_verified'
  ) then
    alter table public.users add column email_verified boolean not null default false;
    update public.users set email_verified = true;
  end if;
end $$;

-- 2. One row per code sent. Only a hash of the code is stored.
create table if not exists public.email_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  purpose     text not null check (purpose in ('verify', 'reset')),
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists email_codes_user_purpose_idx on public.email_codes (user_id, purpose);

-- Only the backend (direct PostgreSQL connection) may touch it, never the Supabase public API.
alter table public.email_codes enable row level security;
revoke all on public.email_codes from anon, authenticated;
