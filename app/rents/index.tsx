import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ItemCard } from '@/components/cards';
import { Button, EmptyState, ErrorNote, Header, Loading, Row, Screen, SearchBar, SegmentedTabs, Txt } from '@/components/ui';
import { useItems } from '@/api/marketplace';
import { useDebounced } from '@/lib/useDebounced';
import { ItemMode } from '@/types/db';

export default function Rents() {
  const params = useLocalSearchParams<{ mode?: ItemMode }>();
  const [mode, setMode] = useState<ItemMode>(params.mode ?? 'rent');
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const items = useItems(mode, query);
  const list = items.data ?? [];

  return (
    <Screen refreshing={items.isRefetching} onRefresh={() => items.refetch()}>
      <Header title="Rents & Borrow" />
      <SegmentedTabs
        options={[
          { value: 'rent', label: 'Rent' },
          { value: 'borrow', label: 'Borrow' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search desks, calculators, kits…" />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size={17} weight={800}>
          {mode === 'rent' ? 'Popular rentals' : 'Free to borrow'}
        </Txt>
        <Button title="Post an offer" icon="plus" small onPress={() => router.push({ pathname: '/rents/new', params: { mode } })} />
      </Row>
      <ErrorNote error={items.error} />
      {items.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState icon="box" title="Nothing here yet" body="Post the first offer for your classmates." />
      ) : (
        <View style={{ gap: 12 }}>
          {Array.from({ length: Math.ceil(list.length / 2) }).map((_, row) => (
            <View key={row} style={{ flexDirection: 'row', gap: 12 }}>
              {list.slice(row * 2, row * 2 + 2).map((it) => (
                <ItemCard key={it.id} item={it} onPress={() => router.push(`/rents/${it.id}`)} />
              ))}
              {list.length % 2 === 1 && row === Math.ceil(list.length / 2) - 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
