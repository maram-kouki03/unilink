-- Unverified sign-ups live in pending_signups; public.users only holds verified accounts.
-- Safe to run more than once.

-- 1. Pending sign-ups: one row per e-mail (a new sign-up replaces the old one).
--    Only a bcrypt hash of the password and an HMAC of the code are stored.
create table if not exists public.pending_signups (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique check (email = lower(email)),
  password_hash    text not null,
  full_name        text not null,
  level            text not null check (level in ('1A','2A','3A','MASTERE','DOCTORAT')),
  code_hash        text not null,
  expires_at       timestamptz not null,
  attempts         int not null default 0,
  last_sent_at     timestamptz,
  sends_in_window  int not null default 0,   -- codes sent since window_start (max 10 per hour)
  window_start     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists pending_signups_created_idx on public.pending_signups (created_at);

-- Only the backend (direct PostgreSQL connection) may touch it, never the Supabase public API.
alter table public.pending_signups enable row level security;
revoke all on public.pending_signups from anon, authenticated;

-- 2. Remove the unfinished (unverified) test sign-ups. Their profiles and codes go with them
--    (profiles.id and email_codes.user_id reference users(id) on delete cascade).
delete from public.users where email_verified = false;

-- 3. email_codes now only holds password-reset codes (verify codes live in pending_signups).
delete from public.email_codes where purpose <> 'reset';
alter table public.email_codes drop constraint if exists email_codes_purpose_check;
alter table public.email_codes add constraint email_codes_purpose_check check (purpose = 'reset');
