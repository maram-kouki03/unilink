import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RideFeed, RideScope } from '@/types/db';

export function useRides(scope: RideScope, q = '') {
  return useQuery({
    queryKey: ['rides', scope, q],
    queryFn: () => api<RideFeed[]>('/rides', { query: { scope, q: q.trim() } }),
  });
}

export function useRide(id: string) {
  return useQuery({
    queryKey: ['ride', id],
    queryFn: () => api<RideFeed>(`/rides/${id}`),
  });
}

export function useMyRides() {
  return useQuery({
    queryKey: ['myRides'],
    queryFn: () => api<{ offered: RideFeed[]; booked: RideFeed[] }>('/rides/mine'),
  });
}

export function useBookRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rideId, seats }: { rideId: string; seats: number }) => api<{ id: string }>(`/rides/${rideId}/book`, { body: { seats } }),
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
    mutationFn: (rideId: string) => api(`/rides/${rideId}/cancel-booking`, { method: 'POST' }),
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
    mutationFn: (r: {
      scope: RideScope;
      from_place: string;
      to_place: string;
      departure_at: string;
      seats_total: number;
      price_tnd: number;
      recurring: boolean;
      note?: string;
      car?: string;
    }) => api<{ id: string }>('/rides', { body: r }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['myRides'] });
    },
  });
}

export function useCancelRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rideId: string) => api(`/rides/${rideId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['myRides'] });
    },
  });
}
