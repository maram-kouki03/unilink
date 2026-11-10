-- ════════════════════════════════════════════════════════════════
-- Unilink · SUP'COM student app — database schema
-- Run with `supabase db push` or paste into Supabase SQL editor (in order).
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────── Profiles ─────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  full_name     text not null default '',
  username      text unique,
  level         text check (level in ('1A','2A','3A','MASTERE','DOCTORAT')),
  period        text,
  avatar_url    text,
  role          text not null default 'student' check (role in ('student','admin')),
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ───────────── Documents tree: levels → periods → subjects → documents ─────────────
create table public.levels (
  id          smallint primary key,
  code        text not null unique check (code in ('1A','2A','3A','MASTERE','DOCTORAT')),
  name        text not null,
  short_name  text not null,
  sort        smallint not null default 0
);

create table public.periods (
  id        uuid primary key default gen_random_uuid(),
  level_id  smallint not null references public.levels(id) on delete cascade,
  name      text not null,              -- 'P1', 'M1', 'Année 1'
  label     text not null,              -- 'Période 1'
  months    text,                       -- 'Sept – Oct'
  sort      smallint not null default 0,
  unique (level_id, name)
);

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  period_id  uuid not null references public.periods(id) on delete cascade,
  name       text not null,
  color      text,
  unique (period_id, name)
);

create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  title          text not null check (char_length(title) between 3 and 140),
  doc_type       text not null check (doc_type in ('exam','course','summary','td_tp')),
  academic_year  text check (academic_year ~ '^\d{4}-\d{4}$'),
  file_path      text not null,         -- object path in storage bucket "documents"
  file_name      text not null,
  file_ext       text not null default 'pdf',
  size_bytes     bigint,
  drive_url      text,                  -- optional mirror in the shared Google Drive
  uploader_id    uuid default auth.uid() references public.profiles(id) on delete set null,
  downloads      integer not null default 0,
  created_at     timestamptz not null default now()
);
create index documents_subject_idx on public.documents(subject_id, created_at desc);
create index documents_search_idx on public.documents using gin (to_tsvector('simple', title));

create table public.document_stars (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  document_id  uuid not null references public.documents(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, document_id)
);

create table public.document_opens (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  document_id  uuid not null references public.documents(id) on delete cascade,
  opened_at    timestamptz not null default now(),
  primary key (user_id, document_id)
);

create table public.document_reports (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  reporter_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason       text not null,
  created_at   timestamptz not null default now(),
  unique (document_id, reporter_id)
);

-- ───────────── Rides ─────────────
create table public.rides (
  id            uuid primary key default gen_random_uuid(),
  driver_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  scope         text not null check (scope in ('between_cities','within_city')),
  from_place    text not null,
  to_place      text not null default 'SUP''COM · El Ghazala',
  departure_at  timestamptz not null,
  seats_total   smallint not null check (seats_total between 1 and 8),
  price_tnd     numeric(6,2) not null check (price_tnd >= 0),
  recurring     boolean not null default false,
  note          text,
  car           text,
  from_lat      double precision,
  from_lng      double precision,
  to_lat        double precision default 36.8925,
  to_lng        double precision default 10.1875,
  cancelled     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index rides_departure_idx on public.rides(scope, departure_at);

create table public.ride_bookings (
  id            uuid primary key default gen_random_uuid(),
  ride_id       uuid not null references public.rides(id) on delete cascade,
  passenger_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  seats         smallint not null default 1 check (seats between 1 and 8),
  status        text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at    timestamptz not null default now(),
  unique (ride_id, passenger_id)
);

create table public.ride_reviews (
  ride_id      uuid not null references public.rides(id) on delete cascade,
  reviewer_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  stars        smallint not null check (stars between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now(),
  primary key (ride_id, reviewer_id)
);

-- ───────────── Rents & Borrow ─────────────
create table public.items (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  mode          text not null check (mode in ('rent','borrow')),
  title         text not null check (char_length(title) between 2 and 80),
  description   text,
  category      text not null default 'Other',
  price_tnd     numeric(7,2) check (price_tnd is null or price_tnd >= 0),
  price_unit    text not null default 'day' check (price_unit in ('day','week','month')),
  max_duration  text,
  condition     text,
  location      text,
  photo_path    text,                   -- object path in bucket "images"
  available     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index items_mode_idx on public.items(mode, available, created_at desc);

-- ───────────── Lost & Found ─────────────
create table public.lost_found (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('lost','found')),
  title        text not null,
  category     text not null default 'Other',
  location     text not null,
  happened_at  timestamptz,
  description  text,
  photo_path   text,
  status       text not null default 'open' check (status in ('open','returned')),
  created_at   timestamptz not null default now()
);

-- ───────────── Events ─────────────
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  category     text not null check (category in ('conference','workshop','hackathon','club')),
  organizer    text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location     text not null,
  description  text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.event_registrations (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ───────────── Discussions ─────────────
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  scope       text not null default 'general' check (scope in ('general','level')),
  level_code  text check (level_code in ('1A','2A','3A','MASTERE','DOCTORAT')),
  topic       text,
  body        text not null check (char_length(body) between 3 and 2000),
  created_at  timestamptz not null default now(),
  check (scope = 'general' or level_code is not null)
);
create index posts_feed_idx on public.posts(scope, level_code, created_at desc);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1500),
  is_best     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index comments_post_idx on public.comments(post_id, created_at);

create table public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ───────────── Direct messages (contact owner / driver) ─────────────
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references public.profiles(id) on delete cascade,
  user_b      uuid not null references public.profiles(id) on delete cascade,
  context     text,                     -- e.g. 'Study desk' or 'Ride Ariana → SUP''COM'
  created_at  timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index messages_conv_idx on public.messages(conversation_id, created_at);

-- ───────────── Notifications ─────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,                     -- in-app route, e.g. /discussions/<id>
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
