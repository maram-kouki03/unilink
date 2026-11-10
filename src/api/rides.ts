import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from '@/lib/supabase';
import { RideFeed, RideScope } from '@/types/db';

export function useRides(scope: RideScope, q = '') {
  return useQuery({
    queryKey: ['rides', scope, q],
    queryFn: async () => {
      let query = supabase
        .from('rides_feed')
        .select('*')
        .eq('scope', scope)
        .gte('departure_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('departure_at')
        .limit(50);
      if (q.trim()) query = query.ilike('from_place', `%${q.trim()}%`);
      return unwrap(await query) as RideFeed[];
    },
  });
}

export function useRide(id: string) {
  return useQuery({
    queryKey: ['ride', id],
    queryFn: async () => unwrap(await supabase.from('rides_feed').select('*').eq('id', id).single()) as RideFeed,
  });
}

export function useMyRides() {
  return useQuery({
    queryKey: ['myRides'],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      const offered = unwrap(await supabase.from('rides_feed').select('*').eq('driver_id', uid).order('departure_at', { ascending: false })) as RideFeed[];
      const booked = unwrap(await supabase.from('rides_feed').select('*').eq('booked_by_me', true).order('departure_at', { ascending: false })) as RideFeed[];
      return { offered, booked };
    },
  });
}

export function useBookRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rideId, seats }: { rideId: string; seats: number }) =>
      unwrap(await supabase.rpc('book_ride', { p_ride: rideId, p_seats: seats })),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ride', v.rideId] });
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['myRides'] });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rideId: string) => unwrap(await supabase.rpc('cancel_booking', { p_ride: rideId })),
    onSuccess: (_d, rideId) => {
      qc.invalidateQueries({ queryKey: ['ride', rideId] });
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['myRides'] });
    },
  });
}

export function useOfferRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      scope: RideScope;
      from_place: string;
      to_place: string;
      departure_at: string;
      seats_total: number;
      price_tnd: number;
      recurring: boolean;
      note?: string;
      car?: string;
    }) => unwrap(await supabase.from('rides').insert(r).select('id').single()) as { id: string },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['myRides'] });
    },
  });
}

export function useCancelRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rideId: string) => unwrap(await supabase.from('rides').update({ cancelled: true }).eq('id', rideId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['myRides'] });
    },
  });
}
