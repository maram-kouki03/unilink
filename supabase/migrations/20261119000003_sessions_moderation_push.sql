-- ════════════════════════════════════════════════════════════════
-- Sessions (token_version), bans, moderation (reports + auto-hide),
-- push tokens, profile bio, event seats + reminders, message read state,
-- lost & found returned_at, and indexes.
--
-- IDEMPOTENT: safe to run more than once. Never edits older migrations.
-- ════════════════════════════════════════════════════════════════

-- ───────────── 1. Sessions + bans (public.users) ─────────────
alter table public.users add column if not exists token_version int not null default 0;
alter table public.users add column if not exists banned_at     timestamptz;
alter table public.users add column if not exists ban_reason    text;

-- ───────────── 2. Profile bio ─────────────
alter table public.profiles add column if not exists bio text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length_check') then
    alter table public.profiles add constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 500);
  end if;
end $$;

-- ───────────── 3. Auto-hidden content (5+ open reports, or hidden by an admin) ─────────────
alter table public.documents  add column if not exists hidden_at timestamptz;
alter table public.posts      add column if not exists hidden_at timestamptz;
alter table public.comments   add column if not exists hidden_at timestamptz;
alter table public.items      add column if not exists hidden_at timestamptz;
alter table public.lost_found add column if not exists hidden_at timestamptz;
alter table public.rides      add column if not exists hidden_at timestamptz;

-- ───────────── 4. Generic reports ─────────────
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

-- Copy the old document reports (kept, no longer written to).
insert into public.reports (reporter_id, target_type, target_id, reason, created_at)
select dr.reporter_id, 'document', dr.document_id, left(dr.reason, 500), dr.created_at
  from public.document_reports dr
 where exists (select 1 from public.users u where u.id = dr.reporter_id)
   and char_length(dr.reason) >= 1
   and not exists (select 1 from public.reports r
                    where r.reporter_id = dr.reporter_id and r.target_type = 'document' and r.target_id = dr.document_id)
on conflict do nothing;

-- ───────────── 5. Push tokens (Expo) ─────────────
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios','android','web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- ───────────── 6. Events: seat limit + reminders ─────────────
alter table public.events add column if not exists seats int;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_seats_check') then
    alter table public.events add constraint events_seats_check check (seats is null or seats between 1 and 100000);
  end if;
end $$;
alter table public.event_registrations add column if not exists reminded_at timestamptz;

-- ───────────── 7. Messages: read state ─────────────
alter table public.messages add column if not exists read_at timestamptz;
-- Old messages count as read (no flood of "unread" after the update).
-- Only runs while no message has read_at yet, so a second run changes nothing.
do $$
begin
  if not exists (select 1 from public.messages where read_at is not null) then
    update public.messages set read_at = created_at where read_at is null and created_at < now();
  end if;
end $$;

-- ───────────── 8. Lost & found: when it was returned ─────────────
alter table public.lost_found add column if not exists returned_at timestamptz;
update public.lost_found set returned_at = created_at where status = 'returned' and returned_at is null;

-- ───────────── 9. Indexes for the backend queries ─────────────
create index if not exists documents_uploader_idx        on public.documents (uploader_id, created_at desc);
create index if not exists document_opens_user_idx       on public.document_opens (user_id, opened_at desc);
create index if not exists document_stars_user_idx       on public.document_stars (user_id, created_at desc);
create index if not exists rides_driver_idx              on public.rides (driver_id, departure_at desc);
create index if not exists ride_bookings_passenger_idx   on public.ride_bookings (passenger_id, status);
create index if not exists items_owner_idx               on public.items (owner_id, created_at desc);
create index if not exists lost_found_kind_idx           on public.lost_found (kind, status, created_at desc);
create index if not exists lost_found_reporter_idx       on public.lost_found (reporter_id);
create index if not exists lost_found_returned_idx       on public.lost_found (returned_at) where status = 'returned';
create index if not exists events_starts_idx             on public.events (starts_at);
create index if not exists event_registrations_user_idx  on public.event_registrations (user_id);
create index if not exists event_reg_reminder_idx        on public.event_registrations (event_id) where reminded_at is null;
create index if not exists posts_author_idx              on public.posts (author_id, created_at desc);
create index if not exists comments_author_idx           on public.comments (author_id);
create index if not exists post_likes_user_idx           on public.post_likes (user_id);
create index if not exists conversations_user_b_idx      on public.conversations (user_b);
create index if not exists messages_unread_idx           on public.messages (conversation_id, sender_id) where read_at is null;
create index if not exists notifications_unread_idx      on public.notifications (user_id) where read_at is null;

-- ───────────── 10. Lock the new tables away from the Supabase public API ─────────────
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
