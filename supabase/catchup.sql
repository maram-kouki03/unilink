-- ════════════════════════════════════════════════════════════════════════════
-- Unilink · CATCH-UP script for the Supabase SQL Editor
--
-- Brings a database that is behind up to date. It contains, in date order, every migration from
-- supabase/migrations starting at 20261118000001:
--   1. 20261118000001_cloudinary_storage        Cloudinary columns on documents
--   2. 20261119000001_account_security          users.email_verified, email_codes
--   3. 20261119000002_pending_signups           pending_signups (sign-up codes)
--   4. 20261119000003_sessions_moderation_push  users.token_version, bans, reports, push_tokens,
--                                               event reminders (reminded_at), message read state…
--   5. 20261121000001_documents_rebuild         documents, contributions, moderation, Google Drive
--
-- IDEMPOTENT and ROBUST: every statement that touches a table or column that might not exist checks it
-- first (to_regclass / information_schema) and runs through EXECUTE, so it works whatever state the
-- database is in, and running it again changes nothing.
-- One-time data fixes (marking existing accounts verified, deleting unfinished sign-ups, copying old
-- reports) only run the first time the matching column or table is created.
--
-- Paste the whole file in the SQL Editor and run it. Do not wrap it in begin/commit.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Helpers for this session only (pg_temp disappears when the connection closes).
create or replace function pg_temp.has_table(t text) returns boolean
  language sql as $$ select to_regclass(t) is not null $$;

create or replace function pg_temp.has_col(t text, c text) returns boolean
  language sql as $$
    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = c)
  $$;

create or replace function pg_temp.exec_if(cond boolean, q text) returns void
  language plpgsql as $$
begin
  if cond then
    execute q;
  end if;
end $$;

-- The backend's own tables must exist (from 20261114000001_own_backend).
do $$
begin
  if to_regclass('public.users') is null or to_regclass('public.profiles') is null then
    raise exception 'public.users / public.profiles are missing: run the older migrations first (schema + own_backend).';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. 20261118000001_cloudinary_storage
-- Files move from the server disk to Cloudinary.
-- documents.file_path (later renamed cloudinary_public_id) holds the Cloudinary public_id;
-- these columns say how to build its signed link.
-- ════════════════════════════════════════════════════════════════════════════

select pg_temp.exec_if(pg_temp.has_table('public.documents'),
  'alter table public.documents add column if not exists storage_resource_type text');  -- 'raw' or 'image' (null = old local file)
select pg_temp.exec_if(pg_temp.has_table('public.documents'),
  'alter table public.documents add column if not exists storage_format text');         -- e.g. 'jpg' for images, null for raw files

do $$
begin
  if to_regclass('public.documents') is not null
     and not exists (select 1 from pg_constraint where conname = 'documents_storage_resource_type_check') then
    execute 'alter table public.documents add constraint documents_storage_resource_type_check
               check (storage_resource_type is null or storage_resource_type in (''raw'', ''image''))';
  end if;
end $$;

select pg_temp.exec_if(pg_temp.has_col('documents', 'file_path'),
  $q$comment on column public.documents.file_path is 'Cloudinary public_id (private, type "authenticated")'$q$);
select pg_temp.exec_if(pg_temp.has_col('items', 'photo_path'),
  $q$comment on column public.items.photo_path is 'Full https URL of the photo on Cloudinary'$q$);
select pg_temp.exec_if(pg_temp.has_col('lost_found', 'photo_path'),
  $q$comment on column public.lost_found.photo_path is 'Full https URL of the photo on Cloudinary'$q$);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. 20261119000001_account_security
-- E-mail verification and password reset with 6-digit codes.
-- ════════════════════════════════════════════════════════════════════════════

-- users.email_verified. Existing accounts are marked verified ONLY when the column is created,
-- so running this again never verifies new, unconfirmed accounts.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'users' and column_name = 'email_verified') then
    alter table public.users add column email_verified boolean not null default false;
    execute 'update public.users set email_verified = true';
  end if;
end $$;

-- One row per code sent. Only a hash of the code is stored.
create table if not exists public.email_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  purpose     text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists email_codes_user_purpose_idx on public.email_codes (user_id, purpose);

-- Only the backend (direct PostgreSQL connection) may touch it, never the Supabase public API.
alter table public.email_codes enable row level security;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. 20261119000002_pending_signups
-- Unverified sign-ups live in pending_signups; public.users only holds verified accounts.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  first_time boolean := to_regclass('public.pending_signups') is null;
begin
  -- One row per e-mail (a new sign-up replaces the old one).
  -- Only a bcrypt hash of the password and an HMAC of the code are stored.
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

  -- Remove the unfinished (unverified) test sign-ups, only the first time.
  -- Their profiles and codes go with them (profiles.id and email_codes.user_id reference users(id) on delete cascade).
  if first_time then
    execute 'delete from public.users where email_verified = false';
  end if;
end $$;

create index if not exists pending_signups_created_idx on public.pending_signups (created_at);
alter table public.pending_signups enable row level security;

-- email_codes now only holds password-reset codes (verify codes live in pending_signups).
delete from public.email_codes where purpose <> 'reset';
alter table public.email_codes drop constraint if exists email_codes_purpose_check;
alter table public.email_codes add constraint email_codes_purpose_check check (purpose = 'reset');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.email_codes, public.pending_signups from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.email_codes, public.pending_signups from authenticated';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. 20261119000003_sessions_moderation_push
-- Sessions (token_version), bans, moderation (reports + auto-hide), push tokens, profile bio,
-- event seats + reminders, message read state, lost & found returned_at, and indexes.
-- ════════════════════════════════════════════════════════════════════════════

-- 4.1 Sessions + bans (public.users)
alter table public.users add column if not exists token_version int not null default 0;
alter table public.users add column if not exists banned_at     timestamptz;
alter table public.users add column if not exists ban_reason    text;

-- 4.2 Profile bio
alter table public.profiles add column if not exists bio text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length_check') then
    alter table public.profiles add constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 500);
  end if;
end $$;

-- 4.3 Auto-hidden content (5+ open reports, or hidden by an admin)
select pg_temp.exec_if(pg_temp.has_table('public.' || t), format('alter table public.%I add column if not exists hidden_at timestamptz', t))
  from unnest(array['documents', 'posts', 'comments', 'items', 'lost_found', 'rides']) as t;

-- 4.4 Generic reports. Old document reports are copied in only when the table is created.
do $$
declare
  first_time boolean := to_regclass('public.reports') is null;
begin
  create table if not exists public.reports (
    id           uuid primary key default gen_random_uuid(),
    reporter_id  uuid not null references public.users (id) on delete cascade,
    target_type  text not null check (target_type in ('document','post','comment','item','lost_found','ride','user')),
    target_id    uuid not null,
    reason       text not null check (char_length(reason) between 1 and 500),
    status       text not null default 'open' check (status in ('open','dismissed','resolved')),
    action       text check (action is null or action in ('dismiss','delete_content','ban_user')),
    resolved_by  uuid references public.users (id) on delete set null,
    resolved_at  timestamptz,
    created_at   timestamptz not null default now()
  );

  -- One OPEN report per person and target (after a dismissal, the person can report again).
  create unique index if not exists reports_one_open_per_reporter_idx
    on public.reports (reporter_id, target_type, target_id) where status = 'open';
  create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
  create index if not exists reports_target_idx         on public.reports (target_type, target_id, status);

  if first_time and to_regclass('public.document_reports') is not null then
    execute $q$
      insert into public.reports (reporter_id, target_type, target_id, reason, created_at)
      select dr.reporter_id, 'document', dr.document_id, left(dr.reason, 500), dr.created_at
        from public.document_reports dr
       where exists (select 1 from public.users u where u.id = dr.reporter_id)
         and char_length(dr.reason) >= 1
         and not exists (select 1 from public.reports r
                          where r.reporter_id = dr.reporter_id and r.target_type = 'document' and r.target_id = dr.document_id)
      on conflict do nothing
    $q$;
  end if;
end $$;

-- 4.5 Push tokens (Expo)
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios','android','web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- 4.6 Events: seat limit + reminders
select pg_temp.exec_if(pg_temp.has_table('public.events'),
  'alter table public.events add column if not exists seats int');
do $$
begin
  if to_regclass('public.events') is not null
     and not exists (select 1 from pg_constraint where conname = 'events_seats_check') then
    execute 'alter table public.events add constraint events_seats_check check (seats is null or seats between 1 and 100000)';
  end if;
end $$;
select pg_temp.exec_if(pg_temp.has_table('public.event_registrations'),
  'alter table public.event_registrations add column if not exists reminded_at timestamptz');

-- 4.7 Messages: read state. Old messages count as read (no flood of "unread" after the update).
-- Only when read_at is created, so a second run changes nothing.
do $$
begin
  if to_regclass('public.messages') is not null
     and not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'messages' and column_name = 'read_at') then
    alter table public.messages add column read_at timestamptz;
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'messages' and column_name = 'created_at') then
      execute 'update public.messages set read_at = created_at where read_at is null and created_at < now()';
    end if;
  end if;
end $$;

-- 4.8 Lost & found: when it was returned
select pg_temp.exec_if(pg_temp.has_table('public.lost_found'),
  'alter table public.lost_found add column if not exists returned_at timestamptz');
select pg_temp.exec_if(pg_temp.has_col('lost_found', 'status') and pg_temp.has_col('lost_found', 'created_at'),
  $q$update public.lost_found set returned_at = created_at where status = 'returned' and returned_at is null$q$);

-- 4.9 Indexes for the backend queries (each one only if its table and columns exist)
select pg_temp.exec_if(
         (select bool_and(pg_temp.has_col(i.tbl, c)) from unnest(i.cols) as c),
         format('create index if not exists %I on public.%I %s', i.name, i.tbl, i.def))
  from (values
    ('documents_uploader_idx',       'documents',           array['uploader_id', 'created_at'],          '(uploader_id, created_at desc)'),
    ('document_opens_user_idx',      'document_opens',      array['user_id', 'opened_at'],               '(user_id, opened_at desc)'),
    ('document_stars_user_idx',      'document_stars',      array['user_id', 'created_at'],              '(user_id, created_at desc)'),
    ('rides_driver_idx',             'rides',               array['driver_id', 'departure_at'],          '(driver_id, departure_at desc)'),
    ('ride_bookings_passenger_idx',  'ride_bookings',       array['passenger_id', 'status'],             '(passenger_id, status)'),
    ('items_owner_idx',              'items',               array['owner_id', 'created_at'],             '(owner_id, created_at desc)'),
    ('lost_found_kind_idx',          'lost_found',          array['kind', 'status', 'created_at'],       '(kind, status, created_at desc)'),
    ('lost_found_reporter_idx',      'lost_found',          array['reporter_id'],                        '(reporter_id)'),
    ('lost_found_returned_idx',      'lost_found',          array['returned_at', 'status'],              $$(returned_at) where status = 'returned'$$),
    ('events_starts_idx',            'events',              array['starts_at'],                          '(starts_at)'),
    ('event_registrations_user_idx', 'event_registrations', array['user_id'],                            '(user_id)'),
    ('event_reg_reminder_idx',       'event_registrations', array['event_id', 'reminded_at'],            '(event_id) where reminded_at is null'),
    ('posts_author_idx',             'posts',               array['author_id', 'created_at'],            '(author_id, created_at desc)'),
    ('comments_author_idx',          'comments',            array['author_id'],                          '(author_id)'),
    ('post_likes_user_idx',          'post_likes',          array['user_id'],                            '(user_id)'),
    ('conversations_user_b_idx',     'conversations',       array['user_b'],                             '(user_b)'),
    ('messages_unread_idx',          'messages',            array['conversation_id', 'sender_id', 'read_at'], '(conversation_id, sender_id) where read_at is null'),
    ('notifications_unread_idx',     'notifications',       array['user_id', 'read_at'],                 '(user_id) where read_at is null')
  ) as i(name, tbl, cols, def);

-- 4.10 Lock the new tables away from the Supabase public API
alter table public.reports     enable row level security;
alter table public.push_tokens enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.reports, public.push_tokens from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.reports, public.push_tokens from authenticated';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. 20261121000001_documents_rebuild (full file, unchanged)
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- Documents rebuild: contributions + moderation + Google Drive.
--  · roles student / moderator / admin, moderator_levels, trusted contributors
--  · editable academic structure: levels, periods (months), tracks, subjects (code, Drive folder)
--  · documents: source, status, type, number, versions, duplicates (sha256), counters
--  · document_useful_votes, document_reports (reason enum), moderation_log
--
-- IDEMPOTENT: safe to run more than once. Never edits older migrations.
-- ROBUST: objects that come from older, optional migrations (documents.hidden_at,
-- documents.storage_resource_type, public.document_opens, public.reports, …) are only used
-- when they exist: checked first, then run with EXECUTE so a missing object never breaks parsing.
-- Existing documents are kept: status 'approved' (or 'hidden' if they were hidden), source 'upload'.
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────── 0. Required base tables (clear message instead of a cryptic error) ─────────────
do $$
declare
  t text;
begin
  foreach t in array array['public.users', 'public.profiles', 'public.levels', 'public.periods', 'public.subjects', 'public.documents'] loop
    if to_regclass(t) is null then
      raise exception 'Table % is missing: run the older migrations first (schema + own_backend).', t;
    end if;
  end loop;
end $$;

-- ───────────── 1. Roles, trusted contributors, moderator levels ─────────────
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('student', 'moderator', 'admin'));

alter table public.profiles add column if not exists trusted boolean not null default false;
-- true once a moderator/admin set or unset "trusted" by hand: the automatic rule (5 approved) then stops changing it.
alter table public.profiles add column if not exists trusted_locked boolean not null default false;

create table if not exists public.moderator_levels (
  user_id     uuid not null references public.users (id) on delete cascade,
  level_id    smallint not null references public.levels (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, level_id)
);
create index if not exists moderator_levels_level_idx on public.moderator_levels (level_id);

-- ───────────── 2. Academic structure (editable by the admin) ─────────────
-- Levels: the admin may add levels with new codes.
alter table public.levels drop constraint if exists levels_code_check;
alter table public.levels add column if not exists short_name text;
alter table public.levels add column if not exists sort       smallint not null default 0;
update public.levels set short_name = name where short_name is null;

-- Periods (semesters): label, months text, and the months they cover, to find "the current semester".
alter table public.periods add column if not exists label       text;
alter table public.periods add column if not exists months      text;
alter table public.periods add column if not exists sort        smallint not null default 0;
alter table public.periods add column if not exists start_month smallint;
alter table public.periods add column if not exists end_month   smallint;
update public.periods set label = name where label is null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'periods_months_check') then
    alter table public.periods add constraint periods_months_check
      check ((start_month is null or start_month between 1 and 12) and (end_month is null or end_month between 1 and 12));
  end if;
end $$;

-- Fill start/end months from the existing "Sept – Oct" text (English or French month names).
with parts as (
  select id,
         lower(trim(split_part(replace(months, '-', '–'), '–', 1))) as a,
         lower(trim(split_part(replace(months, '-', '–'), '–', 2))) as b
    from public.periods
   where months is not null and start_month is null
), mapped as (
  select id,
         (select m from (values ('jan',1),('feb',2),('fév',2),('fev',2),('mar',3),('apr',4),('avr',4),('may',5),('mai',5),
                                ('juin',6),('jun',6),('juil',7),('jul',7),('aug',8),('aoû',8),('aou',8),('sep',9),('oct',10),
                                ('nov',11),('dec',12),('déc',12)) v(p, m)
           where a like v.p || '%' limit 1) as s,
         (select m from (values ('jan',1),('feb',2),('fév',2),('fev',2),('mar',3),('apr',4),('avr',4),('may',5),('mai',5),
                                ('juin',6),('jun',6),('juil',7),('jul',7),('aug',8),('aoû',8),('aou',8),('sep',9),('oct',10),
                                ('nov',11),('dec',12),('déc',12)) v(p, m)
           where b like v.p || '%' limit 1) as e
    from parts
)
update public.periods p
   set start_month = m.s, end_month = coalesce(m.e, m.s)
  from mapped m
 where p.id = m.id and m.s is not null;

-- Optional tracks / options inside a level (e.g. "Option Réseaux").
create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  level_id    smallint not null references public.levels (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  code        text check (code is null or char_length(code) <= 20),
  sort        smallint not null default 0,
  created_at  timestamptz not null default now(),
  unique (level_id, name)
);

alter table public.profiles add column if not exists track_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_track_id_fkey') then
    alter table public.profiles add constraint profiles_track_id_fkey
      foreign key (track_id) references public.tracks (id) on delete set null;
  end if;
end $$;

-- Subjects: color, code, optional track, optional official Drive folder.
alter table public.subjects add column if not exists color           text;
alter table public.subjects add column if not exists code            text;
alter table public.subjects add column if not exists track_id        uuid;
alter table public.subjects add column if not exists drive_folder_id text;
alter table public.subjects add column if not exists drive_synced_at timestamptz;
alter table public.subjects add column if not exists created_at      timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subjects_track_id_fkey') then
    alter table public.subjects add constraint subjects_track_id_fkey
      foreign key (track_id) references public.tracks (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subjects_code_check') then
    alter table public.subjects add constraint subjects_code_check check (code is null or char_length(code) <= 30);
  end if;
end $$;
create index if not exists subjects_period_idx on public.subjects (period_id);
create index if not exists subjects_track_idx  on public.subjects (track_id) where track_id is not null;

-- ───────────── 3. Documents ─────────────
-- 3a. Renames (only the first time, only when the old column exists and the new one does not).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'documents' and column_name = 'doc_type')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'documents' and column_name = 'type') then
    alter table public.documents drop constraint if exists documents_doc_type_check;
    alter table public.documents rename column doc_type to type;
    execute $q$ update public.documents set type = case type when 'td_tp' then 'td' when 'summary' then 'other' else type end $q$;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'documents' and column_name = 'downloads')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'documents' and column_name = 'download_count') then
    alter table public.documents rename column downloads to download_count;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'documents' and column_name = 'file_path')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'documents' and column_name = 'cloudinary_public_id') then
    alter table public.documents rename column file_path to cloudinary_public_id;
  end if;
end $$;

-- Base columns the backend needs (normally from the first schema; added only if missing).
alter table public.documents add column if not exists type                 text not null default 'other';
alter table public.documents add column if not exists download_count       int  not null default 0;
alter table public.documents add column if not exists cloudinary_public_id text;
alter table public.documents add column if not exists file_name            text;
alter table public.documents add column if not exists file_ext             text not null default 'pdf';
alter table public.documents add column if not exists size_bytes           bigint;
alter table public.documents add column if not exists drive_url            text;
alter table public.documents add column if not exists academic_year        text;
alter table public.documents add column if not exists created_at           timestamptz not null default now();

alter table public.documents alter column cloudinary_public_id drop not null;
alter table public.documents alter column file_name drop not null;

-- 3b. Academic year '2025-2026' → '2025/26'.
alter table public.documents drop constraint if exists documents_academic_year_check;
update public.documents
   set academic_year = substr(academic_year, 1, 4) || '/' || substr(academic_year, 8, 2)
 where academic_year ~ '^\d{4}-\d{4}$';
update public.documents set academic_year = null where academic_year is not null and academic_year !~ '^\d{4}/\d{2}$';
alter table public.documents add constraint documents_academic_year_check
  check (academic_year is null or academic_year ~ '^\d{4}/\d{2}$');

-- 3c. New columns.
alter table public.documents add column if not exists source               text not null default 'upload';
alter table public.documents add column if not exists number               int;
alter table public.documents add column if not exists drive_file_id        text;
alter table public.documents add column if not exists parent_folder_doc_id uuid;
alter table public.documents add column if not exists mime_type            text;
alter table public.documents add column if not exists sha256               text;
alter table public.documents add column if not exists correction_of_id     uuid;
alter table public.documents add column if not exists version              int not null default 1;
alter table public.documents add column if not exists replaced_by_id       uuid;
alter table public.documents add column if not exists reject_reason        text;
alter table public.documents add column if not exists reject_note          text;
alter table public.documents add column if not exists reviewed_by          uuid;
alter table public.documents add column if not exists reviewed_at          timestamptz;
alter table public.documents add column if not exists hidden_reason        text;
alter table public.documents add column if not exists open_count           int not null default 0;
alter table public.documents add column if not exists useful_count         int not null default 0;
alter table public.documents add column if not exists report_count         int not null default 0;
alter table public.documents add column if not exists drive_modified_at    timestamptz;
alter table public.documents add column if not exists updated_at           timestamptz not null default now();

-- status: added once and filled for the existing rows.
--  · documents.hidden_at exists (moderation migration ran): hidden ones stay hidden, the others are approved.
--  · documents.hidden_at missing: every existing document is approved.
--  · documents.storage_resource_type exists (Cloudinary migration ran): old local files (null) are hidden,
--    they cannot be opened any more. Missing: nothing is hidden for that reason.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'documents' and column_name = 'status') then
    alter table public.documents add column status text not null default 'pending';

    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'documents' and column_name = 'hidden_at') then
      execute $q$
        update public.documents
           set status        = case when hidden_at is not null then 'hidden' else 'approved' end,
               hidden_reason = case when hidden_at is not null then 'reports' end,
               reviewed_at   = created_at
      $q$;
    else
      execute $q$ update public.documents set status = 'approved', reviewed_at = created_at $q$;
    end if;

    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'documents' and column_name = 'storage_resource_type') then
      execute $q$
        update public.documents
           set status = 'hidden', hidden_reason = 'file_missing'
         where source = 'upload' and storage_resource_type is null and status = 'approved'
      $q$;
    end if;
  end if;
end $$;

-- Cloudinary columns the backend writes on upload (normally from the Cloudinary migration; added only if missing,
-- and only after the step above so their absence is still detected there).
alter table public.documents add column if not exists storage_resource_type text;
alter table public.documents add column if not exists storage_format        text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_storage_resource_type_check') then
    alter table public.documents add constraint documents_storage_resource_type_check
      check (storage_resource_type is null or storage_resource_type in ('raw', 'image'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_source_check') then
    alter table public.documents add constraint documents_source_check check (source in ('upload', 'drive_file', 'drive_folder'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_status_check') then
    alter table public.documents add constraint documents_status_check check (status in ('pending', 'approved', 'rejected', 'hidden'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_type_check') then
    alter table public.documents add constraint documents_type_check
      check (type in ('course', 'td', 'tp', 'exam', 'correction', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_number_check') then
    alter table public.documents add constraint documents_number_check check (number is null or number between 0 and 999);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_version_check') then
    alter table public.documents add constraint documents_version_check check (version between 1 and 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_sha256_check') then
    alter table public.documents add constraint documents_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_reject_reason_check') then
    alter table public.documents add constraint documents_reject_reason_check
      check (reject_reason is null or reject_reason in ('duplicate', 'unreadable', 'wrong_subject', 'copyrighted', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_source_fields_check') then
    alter table public.documents add constraint documents_source_fields_check
      check ((source = 'upload' and drive_file_id is null) or (source <> 'upload' and drive_file_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_parent_folder_fkey') then
    alter table public.documents add constraint documents_parent_folder_fkey
      foreign key (parent_folder_doc_id) references public.documents (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_correction_of_fkey') then
    alter table public.documents add constraint documents_correction_of_fkey
      foreign key (correction_of_id) references public.documents (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_replaced_by_fkey') then
    alter table public.documents add constraint documents_replaced_by_fkey
      foreign key (replaced_by_id) references public.documents (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_reviewed_by_fkey') then
    alter table public.documents add constraint documents_reviewed_by_fkey
      foreign key (reviewed_by) references public.users (id) on delete set null;
  end if;
end $$;

-- New rows must say their status; existing ones were filled above.
alter table public.documents alter column status set default 'pending';
-- Uploads only (Drive documents have no Cloudinary file).
alter table public.documents alter column file_ext set default 'pdf';

-- 3d. Opens and stars (normally from the first schema; created only if missing), then counters.
create table if not exists public.document_opens (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  document_id  uuid not null references public.documents (id) on delete cascade,
  opened_at    timestamptz not null default now(),
  primary key (user_id, document_id)
);
create table if not exists public.document_stars (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  document_id  uuid not null references public.documents (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, document_id)
);
create index if not exists document_opens_user_idx on public.document_opens (user_id, opened_at desc);

update public.documents d
   set open_count = sub.n
  from (select document_id, count(*)::int as n from public.document_opens group by document_id) sub
 where sub.document_id = d.id and d.open_count = 0;

-- 3e. Indexes.
create index if not exists documents_subject_status_idx on public.documents (subject_id, status, created_at desc);
create index if not exists documents_status_created_idx on public.documents (status, created_at);
create unique index if not exists documents_sha256_uidx
  on public.documents (sha256) where sha256 is not null and status <> 'rejected';
create index if not exists documents_drive_file_idx     on public.documents (drive_file_id) where drive_file_id is not null;
create unique index if not exists documents_folder_child_uidx
  on public.documents (parent_folder_doc_id, drive_file_id) where parent_folder_doc_id is not null;
create index if not exists documents_correction_of_idx  on public.documents (correction_of_id) where correction_of_id is not null;
create index if not exists documents_replaced_by_idx    on public.documents (replaced_by_id) where replaced_by_id is not null;
create index if not exists documents_uploader_status_idx on public.documents (uploader_id, status);

-- ───────────── 4. Useful votes (one per user) ─────────────
create table if not exists public.document_useful_votes (
  user_id      uuid not null references public.users (id) on delete cascade,
  document_id  uuid not null references public.documents (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, document_id)
);
create index if not exists document_useful_votes_doc_idx on public.document_useful_votes (document_id);

-- ───────────── 5. Document reports (existing table, reshaped) ─────────────
create table if not exists public.document_reports (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null,
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'document_reports' and column_name = 'status') then
    alter table public.document_reports add column status      text not null default 'open';
    alter table public.document_reports add column comment     text;
    alter table public.document_reports add column resolved_by uuid references public.users (id) on delete set null;
    alter table public.document_reports add column resolved_at timestamptz;
    alter table public.document_reports add column action      text;

    -- Free-text reasons → 'other' + the text as comment.
    execute $q$
      update public.document_reports
         set comment = left(reason, 500), reason = 'other'
       where reason not in ('wrong_file', 'unreadable', 'wrong_subject', 'copyrighted', 'duplicate', 'other')
    $q$;

    alter table public.document_reports drop constraint if exists document_reports_document_id_reporter_id_key;

    -- Only when the generic public.reports table exists (moderation migration).
    -- Without it the old document reports simply stay open.
    if to_regclass('public.reports') is not null then
      -- These old rows were copied into public.reports: they stay open only if the copy is still open.
      execute $q$
        update public.document_reports dr
           set status = 'resolved', resolved_at = now(), action = 'dismiss'
         where not exists (select 1 from public.reports r
                            where r.target_type = 'document' and r.target_id = dr.document_id
                              and r.reporter_id = dr.reporter_id and r.status = 'open')
      $q$;

      -- Open document reports made through the generic table since then.
      execute $q$
        insert into public.document_reports (document_id, reporter_id, reason, comment, created_at, status)
        select r.target_id, r.reporter_id, 'other', left(r.reason, 500), r.created_at, 'open'
          from public.reports r
         where r.target_type = 'document' and r.status = 'open'
           and exists (select 1 from public.documents d where d.id = r.target_id)
           and exists (select 1 from public.profiles p where p.id = r.reporter_id)
           and not exists (select 1 from public.document_reports dr
                            where dr.document_id = r.target_id and dr.reporter_id = r.reporter_id and dr.status = 'open')
      $q$;

      -- Document reports now live only in document_reports.
      execute $q$
        update public.reports set status = 'resolved', resolved_at = now()
         where target_type = 'document' and status = 'open'
      $q$;
    end if;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_reports_reason_check') then
    alter table public.document_reports add constraint document_reports_reason_check
      check (reason in ('wrong_file', 'unreadable', 'wrong_subject', 'copyrighted', 'duplicate', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_reports_status_check') then
    alter table public.document_reports add constraint document_reports_status_check check (status in ('open', 'resolved'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_reports_action_check') then
    alter table public.document_reports add constraint document_reports_action_check
      check (action is null or action in ('dismiss', 'hide_document', 'delete_document'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_reports_comment_check') then
    alter table public.document_reports add constraint document_reports_comment_check
      check (comment is null or char_length(comment) <= 500);
  end if;
end $$;

-- One OPEN report per person and document.
create unique index if not exists document_reports_one_open_idx
  on public.document_reports (document_id, reporter_id) where status = 'open';
create index if not exists document_reports_status_idx on public.document_reports (status, created_at);

update public.documents d
   set report_count = coalesce((select count(*)::int from public.document_reports r
                                 where r.document_id = d.id and r.status = 'open'), 0);

-- ───────────── 6. Moderation log ─────────────
create table if not exists public.moderation_log (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid references public.users (id) on delete set null,
  action          text not null,
  document_id     uuid,            -- no foreign key: the log outlives deleted documents
  document_title  text,
  target_user_id  uuid references public.users (id) on delete set null,
  report_id       uuid,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists moderation_log_created_idx  on public.moderation_log (created_at desc);
create index if not exists moderation_log_document_idx on public.moderation_log (document_id) where document_id is not null;
create index if not exists moderation_log_actor_idx    on public.moderation_log (actor_id, created_at desc);

-- ───────────── 7. Old statistics views (the backend computes its own counts) ─────────────
drop view if exists public.level_stats;
drop view if exists public.period_stats;
drop view if exists public.subject_stats;

-- ───────────── 8. Lock everything away from the Supabase public API ─────────────
alter table public.moderator_levels      enable row level security;
alter table public.tracks                enable row level security;
alter table public.document_useful_votes enable row level security;
alter table public.document_reports      enable row level security;
alter table public.moderation_log        enable row level security;
alter table public.documents             enable row level security;
alter table public.document_opens        enable row level security;
alter table public.document_stars        enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.moderator_levels, public.tracks, public.document_useful_votes, public.document_reports,
                          public.moderation_log, public.documents, public.document_opens, public.document_stars from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.moderator_levels, public.tracks, public.document_useful_votes, public.document_reports,
                          public.moderation_log, public.documents, public.document_opens, public.document_stars from authenticated';
  end if;
end $$;
