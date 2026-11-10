-- ════════════════════════════════════════════════════════════════
-- Row Level Security + Storage buckets
-- Rule of thumb: every signed-in SUP'COM student can read,
-- you can only create/edit/delete your own rows, admins can moderate.
-- ════════════════════════════════════════════════════════════════

alter table public.profiles            enable row level security;
alter table public.levels              enable row level security;
alter table public.periods             enable row level security;
alter table public.subjects            enable row level security;
alter table public.documents           enable row level security;
alter table public.document_stars      enable row level security;
alter table public.document_opens      enable row level security;
alter table public.document_reports    enable row level security;
alter table public.rides               enable row level security;
alter table public.ride_bookings       enable row level security;
alter table public.ride_reviews        enable row level security;
alter table public.items               enable row level security;
alter table public.lost_found          enable row level security;
alter table public.events              enable row level security;
alter table public.event_registrations enable row level security;
alter table public.posts               enable row level security;
alter table public.comments            enable row level security;
alter table public.post_likes          enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.notifications       enable row level security;

-- Profiles: everyone signed in can see profiles, you edit only yours (and never your role)
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, username, level, period, avatar_url, last_seen_at) on public.profiles to authenticated;

-- Folder tree: read for all, managed by admins
create policy "levels read"    on public.levels   for select to authenticated using (true);
create policy "periods read"   on public.periods  for select to authenticated using (true);
create policy "subjects read"  on public.subjects for select to authenticated using (true);
create policy "levels admin"   on public.levels   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "periods admin"  on public.periods  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "subjects admin" on public.subjects for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Documents
create policy "documents read"   on public.documents for select to authenticated using (true);
create policy "documents insert" on public.documents for insert to authenticated with check (uploader_id = auth.uid());
create policy "documents update" on public.documents for update to authenticated using (uploader_id = auth.uid() or public.is_admin());
create policy "documents delete" on public.documents for delete to authenticated using (uploader_id = auth.uid() or public.is_admin());

create policy "stars own"   on public.document_stars for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "opens own"   on public.document_opens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reports insert" on public.document_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reports admin"  on public.document_reports for select to authenticated using (public.is_admin());

-- Rides (bookings are created through the book_ride() RPC)
create policy "rides read"   on public.rides for select to authenticated using (true);
create policy "rides insert" on public.rides for insert to authenticated with check (driver_id = auth.uid());
create policy "rides update" on public.rides for update to authenticated using (driver_id = auth.uid());
create policy "rides delete" on public.rides for delete to authenticated using (driver_id = auth.uid() or public.is_admin());

-- Readable by all students: rides_feed needs other passengers' bookings to compute seats_left,
-- and the driver needs to see who booked. Writes only go through book_ride()/cancel_booking().
create policy "bookings read" on public.ride_bookings for select to authenticated using (true);

create policy "reviews read"   on public.ride_reviews for select to authenticated using (true);
create policy "reviews insert" on public.ride_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and exists (
    select 1 from public.ride_bookings b where b.ride_id = ride_reviews.ride_id and b.passenger_id = auth.uid() and b.status = 'confirmed'));

-- Items / Lost & found
create policy "items read"   on public.items for select to authenticated using (true);
create policy "items write"  on public.items for insert to authenticated with check (owner_id = auth.uid());
create policy "items update" on public.items for update to authenticated using (owner_id = auth.uid());
create policy "items delete" on public.items for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

create policy "lf read"   on public.lost_found for select to authenticated using (true);
create policy "lf write"  on public.lost_found for insert to authenticated with check (reporter_id = auth.uid());
create policy "lf update" on public.lost_found for update to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "lf delete" on public.lost_found for delete to authenticated using (reporter_id = auth.uid() or public.is_admin());

-- Events: admins (or club accounts promoted to admin) publish, everybody registers
create policy "events read"  on public.events for select to authenticated using (true);
create policy "events admin" on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "registrations read" on public.event_registrations for select to authenticated using (true);
create policy "registrations own"  on public.event_registrations for insert to authenticated with check (user_id = auth.uid());
create policy "registrations del"  on public.event_registrations for delete to authenticated using (user_id = auth.uid());

-- Discussions
create policy "posts read"   on public.posts for select to authenticated using (true);
create policy "posts insert" on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy "posts update" on public.posts for update to authenticated using (author_id = auth.uid());
create policy "posts delete" on public.posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());

create policy "comments read"   on public.comments for select to authenticated using (true);
create policy "comments insert" on public.comments for insert to authenticated with check (author_id = auth.uid());
create policy "comments delete" on public.comments for delete to authenticated using (author_id = auth.uid() or public.is_admin());

create policy "likes read" on public.post_likes for select to authenticated using (true);
create policy "likes own"  on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes del"  on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- Messages: only the two participants
create policy "conv read" on public.conversations for select to authenticated using (auth.uid() in (user_a, user_b));
create policy "msg read"  on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));
create policy "msg send"  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));

-- Notifications: only yours
create policy "notif read"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif update" on public.notifications for update to authenticated using (user_id = auth.uid());

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 52428800, null),                                     -- 50 MB, private
  ('images',    'images',    true,  5242880,  array['image/jpeg','image/png','image/webp']) -- 5 MB, public
on conflict (id) do nothing;

-- Documents bucket: any SUP'COM student reads; you upload into a folder named after your user id
create policy "docs read" on storage.objects for select to authenticated using (bucket_id = 'documents');
create policy "docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Images bucket: public read, you upload into <bucket>/<kind>/<your id>/...
create policy "images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[2] = auth.uid()::text);
