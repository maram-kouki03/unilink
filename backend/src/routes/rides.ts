import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth';
import { one, query, transaction } from '../db';
import { forbidden, HttpError, likeParam, notFound, parse, uuidParam } from '../http';
import { notify } from '../notify';
import { PROFILE_NAME } from '../sql/auth';
import * as sql from '../sql/rides';

export const ridesRouter = Router();

const SCOPES = ['between_cities', 'within_city'] as const;

ridesRouter.get('/rides', async (req, res) => {
  const { scope } = parse(z.object({ scope: z.enum(SCOPES).default('between_cities') }), req.query);
  res.json(await query(sql.LIST_RIDES, [uid(req), scope, likeParam(req.query.q)]));
});

ridesRouter.get('/rides/mine', async (req, res) => {
  const me = uid(req);
  const [offered, booked] = await Promise.all([query(sql.RIDES_OFFERED, [me]), query(sql.RIDES_BOOKED, [me])]);
  res.json({ offered, booked });
});

ridesRouter.get('/rides/:id', async (req, res) => {
  const ride = await one(sql.RIDE_BY_ID, [uid(req), uuidParam(req.params.id, 'Ride not found')]);
  if (!ride) throw notFound('Ride not found');
  res.json(ride);
});

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
const optionalCoord = z.number().finite().nullable().optional();

const offerSchema = z.object({
  scope: z.enum(SCOPES),
  from_place: z.string().trim().min(2, 'required').max(120),
  to_place: optionalText(120),
  departure_at: z.iso.datetime({ offset: true, message: 'invalid date' }),
  seats_total: z.number().int().min(1).max(8),
  price_tnd: z.number().min(0).max(9999),
  recurring: z.boolean().default(false),
  note: optionalText(500),
  car: optionalText(80),
  from_lat: optionalCoord,
  from_lng: optionalCoord,
  to_lat: optionalCoord,
  to_lng: optionalCoord,
});

ridesRouter.post('/rides', async (req, res) => {
  const r = parse(offerSchema, req.body);
  if (new Date(r.departure_at).getTime() < Date.now() - 5 * 60 * 1000) throw new HttpError(400, 'Departure time is in the past');
  const row = await one(sql.INSERT_RIDE, [
    uid(req),
    r.scope,
    r.from_place,
    r.to_place,
    r.departure_at,
    r.seats_total,
    r.price_tnd,
    r.recurring,
    r.note,
    r.car,
    r.from_lat ?? null,
    r.from_lng ?? null,
    r.to_lat ?? null,
    r.to_lng ?? null,
  ]);
  res.status(201).json(row);
});

ridesRouter.post('/rides/:id/book', async (req, res) => {
  const rideId = uuidParam(req.params.id, 'Ride not found');
  const { seats } = parse(z.object({ seats: z.number().int().min(1).max(8).default(1) }), req.body ?? {});
  const me = uid(req);

  const result = await transaction(async (db) => {
    const ride = await one<{ id: string; driver_id: string; from_place: string; departure_at: Date; seats_total: number }>(
      sql.LOCK_RIDE,
      [rideId],
      db,
    );
    if (!ride) throw notFound('Ride not found');
    if (ride.driver_id === me) throw new HttpError(400, 'You cannot book your own ride');
    if (new Date(ride.departure_at).getTime() < Date.now()) throw new HttpError(400, 'This ride already left');
    const taken = (await one<{ taken: number }>(sql.SEATS_TAKEN_BY_OTHERS, [rideId, me], db))?.taken ?? 0;
    if (taken + seats > ride.seats_total) throw new HttpError(409, 'Not enough seats left');
    const booking = await one<{ id: string }>(sql.UPSERT_BOOKING, [rideId, me, seats], db);
    return { ride, bookingId: booking!.id };
  });

  const me_ = await one<{ full_name: string }>(PROFILE_NAME, [me]);
  await notify({
    target: result.ride.driver_id,
    actor: me,
    title: 'New seat booked',
    body: `${me_?.full_name || 'A student'} booked ${seats} seat(s) from ${result.ride.from_place}`,
    link: `/rides/${rideId}`,
  });
  res.status(201).json({ id: result.bookingId });
});

ridesRouter.post('/rides/:id/cancel-booking', async (req, res) => {
  const rideId = uuidParam(req.params.id, 'Ride not found');
  const me = uid(req);
  const row = await one<{ driver_id: string; from_place: string }>(sql.CANCEL_BOOKING, [rideId, me]);
  if (row) {
    await notify({
      target: row.driver_id,
      actor: me,
      title: 'Booking cancelled',
      body: `A passenger cancelled their seat from ${row.from_place}`,
      link: `/rides/${rideId}`,
    });
  }
  res.json({ ok: true });
});

ridesRouter.post('/rides/:id/cancel', async (req, res) => {
  const rideId = uuidParam(req.params.id, 'Ride not found');
  const me = uid(req);
  const owner = await one<{ driver_id: string; cancelled: boolean }>(sql.RIDE_OWNER, [rideId]);
  if (!owner) throw notFound('Ride not found');
  if (owner.driver_id !== me) throw forbidden('Only the driver can cancel this ride');
  const row = await one<{ from_place: string }>(sql.CANCEL_RIDE, [rideId, me]);
  if (row) {
    const passengers = await query<{ passenger_id: string }>(sql.CONFIRMED_PASSENGERS, [rideId]);
    await Promise.all(
      passengers.map((p) =>
        notify({
          target: p.passenger_id,
          actor: me,
          title: 'Ride cancelled',
          body: `The driver cancelled the ride from ${row.from_place}`,
          link: '/rides/mine',
        }),
      ),
    );
  }
  res.json({ ok: true });
});
