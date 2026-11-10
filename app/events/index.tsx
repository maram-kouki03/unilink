import React, { useState } from 'react';
import { router } from 'expo-router';
import { EventCard } from '@/components/cards';
import { ChipRow, EmptyState, ErrorNote, Header, Loading, Screen } from '@/components/ui';
import { useEvents } from '@/api/social';
import { EventCategory } from '@/types/db';

const FILTERS: { value: EventCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'conference', label: 'Conferences' },
  { value: 'workshop', label: 'Workshops' },
  { value: 'hackathon', label: 'Hackathons' },
  { value: 'club', label: 'Clubs' },
];

export default function Events() {
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  const events = useEvents(cat);
  return (
    <Screen refreshing={events.isRefetching} onRefresh={() => events.refetch()}>
      <Header title="Events & Programs" />
      <ChipRow options={FILTERS} value={cat} onChange={setCat} />
      <ErrorNote error={events.error} />
      {events.isLoading ? (
        <Loading />
      ) : events.data?.length ? (
        events.data.map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/events/${e.id}`)} />)
      ) : (
        <EmptyState icon="calendar" title="No events" body="Nothing planned in this category yet." />
      )}
    </Screen>
  );
}
