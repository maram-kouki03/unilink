import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { RideHero } from '@/components/Illustrations';
import { RideCard } from '@/components/cards';
import { Button, EmptyState, ErrorNote, Header, IconButton, Loading, Screen, SearchBar, SectionTitle, SegmentedTabs, Txt } from '@/components/ui';
import { useRides } from '@/api/rides';
import { useDebounced } from '@/lib/useDebounced';
import { colors, gradients, shadows } from '@/theme';
import { RideScope } from '@/types/db';

export default function Rides() {
  const [scope, setScope] = useState<RideScope>('within_city');
  const [q, setQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const query = useDebounced(q);
  const rides = useRides(scope, query);

  return (
    <Screen refreshing={rides.isRefetching} onRefresh={() => rides.refetch()}>
      <Header title="Carpool" right={<IconButton icon="search" label="Search departure" onPress={() => setShowSearch(!showSearch)} />} />
      <SegmentedTabs
        options={[
          { value: 'between_cities', label: 'Between Cities' },
          { value: 'within_city', label: 'Within City' },
        ]}
        value={scope}
        onChange={setScope}
      />
      {showSearch ? <SearchBar value={q} onChangeText={setQ} placeholder="From where? (Ariana, Sousse…)" /> : null}

      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, shadows.strong]}>
        <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <RideHero />
        </View>
        <Txt size={19} weight={800} color={colors.white} style={{ maxWidth: 190 }}>
          Share the ride, go further together
        </Txt>
        <Button title="Offer a ride" variant="white" arrow small style={{ alignSelf: 'flex-start' }} onPress={() => router.push({ pathname: '/rides/offer', params: { scope } })} />
      </LinearGradient>

      <SectionTitle title="Available Rides" action="My rides" onAction={() => router.push('/rides/mine')} />
      <ErrorNote error={rides.error} />
      {rides.isLoading ? (
        <Loading />
      ) : !rides.data?.length ? (
        <EmptyState icon="car" title="No rides yet" body="Be the first to offer seats on this route." action="Offer a ride" onAction={() => router.push({ pathname: '/rides/offer', params: { scope } })} />
      ) : (
        rides.data.map((r) => <RideCard key={r.id} ride={r} onPress={() => router.push(`/rides/${r.id}`)} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 150, borderRadius: 22, padding: 20, justifyContent: 'space-between', overflow: 'hidden' },
});
