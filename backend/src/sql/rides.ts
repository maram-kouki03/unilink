// Carpooling. $1 is always the signed-in user (for booked_by_me).

/** Same columns as the old rides_feed view. */
const RIDE_FEED = `
  select r.id, r.driver_id, r.scope, r.from_place, r.to_place, r.departure_at, r.seats_total,
         r.price_tnd, r.recurring, r.note, r.car, r.from_lat, r.from_lng, r.to_lat, r.to_lng, r.created_at,
         p.full_name as driver_name,
         p.level     as driver_level,
         (select round(avg(rr.stars)::numeric, 1)::float
            from public.ride_reviews rr join public.rides r2 on r2.id = rr.ride_id
           where r2.driver_id = r.driver_id) as driver_rating,
         (select count(*)::int from public.rides r3 where r3.driver_id = r.driver_id and not r3.cancelled) as driver_rides,
         (r.seats_total - coalesce((select sum(b.seats) from public.ride_bookings b
                                     where b.ride_id = r.id and b.status = 'confirmed'), 0))::int as seats_left,
         exists (select 1 from public.ride_bookings b
                  where b.ride_id = r.id and b.passenger_id = $1 and b.status = 'confirmed') as booked_by_me
    from public.rides r
    join public.profiles p on p.id = r.driver_id
   where not r.cancelled`;

/** $2 scope, $3 escaped search|null */
export const LIST_RIDES = `
  ${RIDE_FEED}
     and r.scope = $2
     and r.departure_at >= now() - interval '30 minutes'
     and ($3::text is null or r.from_place ilike '%' || $3 || '%')
   order by r.departure_at
   limit 50`;

export const RIDES_OFFERED = `${RIDE_FEED} and r.driver_id = $1 order by r.departure_at desc`;

export const RIDES_BOOKED = `
  ${RIDE_FEED}
     and exists (select 1 from public.ride_bookings b
                  where b.ride_id = r.id and b.passenger_id = $1 and b.status = 'confirmed')
   order by r.departure_at desc`;

export const ACTIVITY_RIDES = RIDES_OFFERED;

/** $2 ride id */
export const RIDE_BY_ID = `${RIDE_FEED} and r.id = $2`;

export const INSERT_RIDE = `
  insert into public.rides
    (driver_id, scope, from_place, to_place, departure_at, seats_total, price_tnd, recurring, note, car,
     from_lat, from_lng, to_lat, to_lng)
  values ($1, $2, $3, coalesce($4, 'SUP''COM · El Ghazala'), $5, $6, $7, $8, $9, $10,
          $11, $12, coalesce($13, 36.8925), coalesce($14, 10.1875))
  returning id`;

/* ── booking (run inside a transaction) ── */

export const LOCK_RIDE = `
  select id, driver_id, from_place, departure_at, seats_total
    from public.rides
   where id = $1 and not cancelled
   for update`;

/** Seats already taken by OTHER passengers. $1 ride, $2 me */
export const SEATS_TAKEN_BY_OTHERS = `
  select coalesce(sum(seats), 0)::int as taken
    from public.ride_bookings
   where ride_id = $1 and status = 'confirmed' and passenger_id <> $2`;

export const UPSERT_BOOKING = `
  insert into public.ride_bookings (ride_id, passenger_id, seats, status)
  values ($1, $2, $3, 'confirmed')
  on conflict (ride_id, passenger_id) do update set seats = excluded.seats, status = 'confirmed'
  returning id`;

/** $1 ride, $2 me → driver to notify */
export const CANCEL_BOOKING = `
  update public.ride_bookings b
     set status = 'cancelled'
    from public.rides r
   where b.ride_id = $1 and b.passenger_id = $2 and b.status = 'confirmed' and r.id = b.ride_id
  returning r.driver_id, r.from_place`;

export const RIDE_OWNER = `select driver_id, cancelled from public.rides where id = $1`;

export const CANCEL_RIDE = `
  update public.rides set cancelled = true
   where id = $1 and driver_id = $2 and not cancelled
  returning from_place`;

export const CONFIRMED_PASSENGERS = `
  select distinct passenger_id from public.ride_bookings
   where ride_id = $1 and status = 'confirmed'`;
