-- ════════════════════════════════════════════════════════════════
-- Own backend: Supabase is now used ONLY as the PostgreSQL database.
-- Auth, files, realtime and business rules live in backend/ (Express).
--
-- IDEMPOTENT: every statement can run twice without failing.
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────── 1. Own users table ─────────────
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email)),
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

-- Copy existing Supabase Auth accounts. Supabase stores bcrypt hashes ($2a$…),
-- so the same passwords keep working with bcryptjs. Accounts without a password
-- (e.g. Google sign-in) get '!' which never matches any password.
do $$
begin
  if to_regclass('auth.users') is not null then
    insert into public.users (id, email, password_hash, created_at)
    select u.id, lower(u.email), coalesce(nullif(u.encrypted_password, ''), '!'), coalesce(u.created_at, now())
      from auth.users u
     where u.email is not null
    on conflict do nothing;
  end if;
end $$;

-- Safety net: every profile must have a users row before the new foreign key is added.
insert into public.users (id, email, password_hash, created_at)
select p.id, lower(p.email), '!', p.created_at
  from public.profiles p
 where not exists (select 1 from public.users u where u.id = p.id)
on conflict do nothing;

-- ───────────── 2. profiles.id → public.users(id) ─────────────
do $$
declare c record;
begin
  -- drop any FK from profiles to auth.users
  if to_regclass('auth.users') is not null then
    for c in
      select conname from pg_constraint
       where conrelid = 'public.profiles'::regclass
         and contype = 'f'
         and confrelid = 'auth.users'::regclass
    loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'f'
       and confrelid = 'public.users'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_users_fkey foreign key (id) references public.users(id) on delete cascade;
  end if;
end $$;

-- ───────────── 3. Remove Supabase-Auth-dependent triggers, views and functions ─────────────
do $$
begin
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists enforce_supcom_domain on auth.users';
    execute 'drop trigger if exists on_auth_user_created on auth.users';
  end if;
end $$;

drop trigger if exists comment_created on public.comments;
drop trigger if exists message_created on public.messages;

drop view if exists public.rides_feed;
drop view if exists public.events_feed;
drop view if exists public.posts_feed;
drop view if exists public.my_conversations;
-- level_stats / period_stats / subject_stats are kept (used by the backend).

drop function if exists public.book_ride(uuid, int);
drop function if exists public.cancel_booking(uuid);
drop function if exists public.start_conversation(uuid, text);
drop function if exists public.mark_best_answer(uuid);
drop function if exists public.on_comment_created();
drop function if exists public.on_message_created();
drop function if exists public.notify(uuid, text, text, text);
drop function if exists public.increment_download(uuid);
drop function if exists public.enforce_supcom_domain();
drop function if exists public.handle_new_user();

-- ───────────── 4. Drop every column default that uses auth.uid() ─────────────
do $$
declare c record;
begin
  for c in
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'public'
       and column_default ilike '%auth.uid()%'
  loop
    execute format('alter table public.%I alter column %I drop default', c.table_name, c.column_name);
  end loop;
end $$;

-- ───────────── 5. RLS: drop all policies, keep RLS enabled, lock out the public API ─────────────
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- RLS stays ON everywhere: with no policy, Supabase's REST/Realtime API (anon/authenticated) reads nothing.
alter table public.users enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables    in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'revoke all on all functions in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables    from anon';
    execute 'alter default privileges in schema public revoke all on sequences from anon';
    execute 'alter default privileges in schema public revoke all on functions from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables    in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'revoke all on all functions in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables    from authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from authenticated';
    execute 'alter default privileges in schema public revoke all on functions from authenticated';
  end if;
end $$;

-- ───────────── 6. Storage policies + is_admin() (never fail on Storage permissions) ─────────────
do $$
begin
  begin
    drop policy if exists "docs read"     on storage.objects;
    drop policy if exists "docs upload"   on storage.objects;
    drop policy if exists "docs delete"   on storage.objects;
    drop policy if exists "images upload" on storage.objects;
    drop policy if exists "images delete" on storage.objects;
  exception when others then
    raise notice 'Skipped storage.objects policies: %', sqlerrm;
  end;

  begin
    drop function if exists public.is_admin();
  exception when others then
    raise notice 'Skipped is_admin(): %', sqlerrm;
  end;
end $$;

-- ───────────── 7. Realtime: Socket.io replaces Supabase Realtime ─────────────
do $$
begin
  begin
    alter publication supabase_realtime drop table public.comments;
  exception when others then raise notice 'realtime comments: %', sqlerrm;
  end;
  begin
    alter publication supabase_realtime drop table public.messages;
  exception when others then raise notice 'realtime messages: %', sqlerrm;
  end;
  begin
    alter publication supabase_realtime drop table public.notifications;
  exception when others then raise notice 'realtime notifications: %', sqlerrm;
  end;
end $$;
