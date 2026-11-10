-- ════════════════════════════════════════════════════════════════
-- Functions, triggers, views and RPCs
-- ════════════════════════════════════════════════════════════════

-- ───────────── Sign-up: only @supcom.tn e-mails ─────────────
create or replace function public.enforce_supcom_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or lower(new.email) not like '%@supcom.tn' then
    raise exception 'Only @supcom.tn e-mail addresses can join Unilink';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_supcom_domain on auth.users;
create trigger enforce_supcom_domain
  before insert on auth.users
  for each row execute function public.enforce_supcom_domain();

-- ───────────── Create a profile for every new user ─────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  lvl text := meta->>'level';
begin
  insert into public.profiles (id, email, full_name, username, level)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), split_part(new.email, '@', 1)),
    split_part(lower(new.email), '@', 1),
    case when lvl in ('1A','2A','3A','MASTERE','DOCTORAT') then lvl else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── Helpers ─────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.notify(target uuid, t text, b text, l text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, title, body, link)
  select target, t, b, l where target is not null and target <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
$$;

-- ───────────── Folder statistics (for the Drive-like explorer) ─────────────
create or replace view public.level_stats with (security_invoker = on) as
select l.id, l.code, l.name, l.short_name, l.sort,
       count(d.id)::int as files,
       max(d.created_at) as last_updated
from public.levels l
left join public.periods p on p.level_id = l.id
left join public.subjects s on s.period_id = p.id
left join public.documents d on d.subject_id = s.id
group by l.id;

create or replace view public.period_stats with (security_invoker = on) as
select p.id, p.level_id, p.name, p.label, p.months, p.sort,
       count(distinct s.id)::int as subjects,
       count(d.id)::int as files,
       max(d.created_at) as last_updated
from public.periods p
left join public.subjects s on s.period_id = p.id
left join public.documents d on d.subject_id = s.id
group by p.id;

create or replace view public.subject_stats with (security_invoker = on) as
select s.id, s.period_id, s.name, s.color,
       count(d.id)::int as files,
       max(d.created_at) as last_updated
from public.subjects s
left join public.documents d on d.subject_id = s.id
group by s.id;

create or replace function public.increment_download(doc uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.documents set downloads = downloads + 1 where id = doc;
$$;

-- ───────────── Rides ─────────────
create or replace view public.rides_feed with (security_invoker = on) as
select r.id, r.driver_id, r.scope, r.from_place, r.to_place, r.departure_at, r.seats_total,
       r.price_tnd, r.recurring, r.note, r.car, r.from_lat, r.from_lng, r.to_lat, r.to_lng, r.created_at,
       p.full_name as driver_name,
       p.level as driver_level,
       (select round(avg(rr.stars)::numeric, 1)::float
          from public.ride_reviews rr join public.rides r2 on r2.id = rr.ride_id
         where r2.driver_id = r.driver_id) as driver_rating,
       (select count(*)::int from public.rides r3 where r3.driver_id = r.driver_id and not r3.cancelled) as driver_rides,
       (r.seats_total - coalesce((select sum(b.seats) from public.ride_bookings b
                                   where b.ride_id = r.id and b.status = 'confirmed'), 0))::int as seats_left,
       exists (select 1 from public.ride_bookings b
                where b.ride_id = r.id and b.passenger_id = auth.uid() and b.status = 'confirmed') as booked_by_me
from public.rides r
join public.profiles p on p.id = r.driver_id
where not r.cancelled;

create or replace function public.book_ride(p_ride uuid, p_seats int default 1)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rides;
  taken int;
  booking_id uuid;
begin
  select * into r from public.rides where id = p_ride and not cancelled for update;
  if not found then raise exception 'Ride not found'; end if;
  if r.driver_id = auth.uid() then raise exception 'You cannot book your own ride'; end if;
  if r.departure_at < now() then raise exception 'This ride already left'; end if;

  select coalesce(sum(seats), 0) into taken
    from public.ride_bookings
   where ride_id = p_ride and status = 'confirmed' and passenger_id <> auth.uid();

  if taken + p_seats > r.seats_total then raise exception 'Not enough seats left'; end if;

  insert into public.ride_bookings (ride_id, passenger_id, seats, status)
  values (p_ride, auth.uid(), p_seats, 'confirmed')
  on conflict (ride_id, passenger_id) do update set seats = excluded.seats, status = 'confirmed'
  returning id into booking_id;

  perform public.notify(r.driver_id, 'New seat booked',
    (select full_name from public.profiles where id = auth.uid()) || ' booked ' || p_seats || ' seat(s) from ' || r.from_place,
    '/rides/' || r.id);
  return booking_id;
end;
$$;

create or replace function public.cancel_booking(p_ride uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare driver uuid;
begin
  update public.ride_bookings set status = 'cancelled'
   where ride_id = p_ride and passenger_id = auth.uid();
  select driver_id into driver from public.rides where id = p_ride;
  perform public.notify(driver, 'Booking cancelled', 'A passenger cancelled their seat', '/rides/' || p_ride);
end;
$$;

-- ───────────── Events ─────────────
create or replace view public.events_feed with (security_invoker = on) as
select e.*,
       (select count(*)::int from public.event_registrations er where er.event_id = e.id) as going,
       exists (select 1 from public.event_registrations er where er.event_id = e.id and er.user_id = auth.uid()) as registered_by_me
from public.events e;

-- ───────────── Discussions ─────────────
create or replace view public.posts_feed with (security_invoker = on) as
select po.id, po.author_id, po.scope, po.level_code, po.topic, po.body, po.created_at,
       pr.full_name as author_name,
       pr.level as author_level,
       (select count(*)::int from public.post_likes l where l.post_id = po.id) as likes_count,
       (select count(*)::int from public.comments c where c.post_id = po.id) as comments_count,
       exists (select 1 from public.post_likes l where l.post_id = po.id and l.user_id = auth.uid()) as liked_by_me
from public.posts po
join public.profiles pr on pr.id = po.author_id;

create or replace function public.on_comment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare author uuid;
begin
  select author_id into author from public.posts where id = new.post_id;
  perform public.notify(author, 'New reply on your post',
    left(new.body, 120), '/discussions/' || new.post_id);
  return new;
end;
$$;

create trigger comment_created
  after insert on public.comments
  for each row execute function public.on_comment_created();

create or replace function public.mark_best_answer(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare pid uuid;
begin
  select c.post_id into pid
    from public.comments c join public.posts p on p.id = c.post_id
   where c.id = p_comment and p.author_id = auth.uid();
  if pid is null then raise exception 'Only the author of the post can choose the best answer'; end if;
  update public.comments set is_best = (id = p_comment) where post_id = pid;
end;
$$;

-- ───────────── Direct messages ─────────────
create or replace function public.start_conversation(p_other uuid, p_context text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid := least(auth.uid(), p_other);
  b uuid := greatest(auth.uid(), p_other);
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_other = auth.uid() then raise exception 'This is your own listing'; end if;
  insert into public.conversations (user_a, user_b, context)
  values (a, b, p_context)
  on conflict (user_a, user_b) do update set context = coalesce(excluded.context, public.conversations.context)
  returning id into cid;
  return cid;
end;
$$;

create or replace view public.my_conversations with (security_invoker = on) as
select c.id,
       case when c.user_a = auth.uid() then c.user_b else c.user_a end as other_id,
       p.full_name as other_name,
       c.context,
       lm.body as last_message,
       coalesce(lm.created_at, c.created_at) as last_at
from public.conversations c
join public.profiles p on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
left join lateral (
  select m.body, m.created_at from public.messages m
   where m.conversation_id = c.id order by m.created_at desc limit 1
) lm on true
where auth.uid() in (c.user_a, c.user_b);

create or replace function public.on_message_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare other uuid;
begin
  select case when user_a = new.sender_id then user_b else user_a end into other
    from public.conversations where id = new.conversation_id;
  perform public.notify(other, 'New message', left(new.body, 120), '/chat/' || new.conversation_id);
  return new;
end;
$$;

create trigger message_created
  after insert on public.messages
  for each row execute function public.on_message_created();

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table public.comments, public.messages, public.notifications;
