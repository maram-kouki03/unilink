import React from 'react';
import { router } from 'expo-router';
import { RideCard } from '@/components/cards';
import { EmptyState, Header, Loading, Screen, SectionTitle } from '@/components/ui';
import { useMyRides } from '@/api/rides';

export default function MyRides() {
  const rides = useMyRides();
  return (
    <Screen refreshing={rides.isRefetching} onRefresh={() => rides.refetch()}>
      <Header title="My rides" />
      {rides.isLoading ? <Loading /> : null}
      <SectionTitle title="Booked" />
      {rides.data?.booked.length ? (
        rides.data.booked.map((r) => <RideCard key={r.id} ride={r} onPress={() => router.push(`/rides/${r.id}`)} />)
      ) : (
        <EmptyState icon="car" title="No bookings" body="Seats you book will show up here." />
      )}
      <SectionTitle title="Offered by me" action="Offer a ride" onAction={() => router.push('/rides/offer')} />
      {rides.data?.offered.length ? (
        rides.data.offered.map((r) => <RideCard key={r.id} ride={r} onPress={() => router.push(`/rides/${r.id}`)} />)
      ) : (
        <EmptyState icon="car" title="You haven't offered a ride yet" />
      )}
    </Screen>
  );
}
