import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Icon, IconName } from '@/components/Icon';
import { HeroBuilding } from '@/components/Illustrations';
import { EventCard } from '@/components/cards';
import { Avatar, Badge, Button, EmptyState, IconButton, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useEvents, useNotifications } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { greeting } from '@/lib/format';
import { colors, gradients, shadows } from '@/theme';
import { LEVEL_LABEL } from '@/types/db';

const QUICK: { label: string; icon: IconName; href: string }[] = [
  { label: 'Documents', icon: 'doc', href: '/documents' },
  { label: 'Rides', icon: 'car', href: '/rides' },
  { label: 'Rents', icon: 'key', href: '/rents?mode=rent' },
  { label: 'Borrow', icon: 'box', href: '/rents?mode=borrow' },
  { label: 'Lost & Found', icon: 'search', href: '/lost-found' },
  { label: 'Campus Map', icon: 'pin', href: '/map' },
  { label: 'Events', icon: 'calendar', href: '/events' },
  { label: 'Discussions', icon: 'chat', href: '/discussions' },
];

export default function Home() {
  const { profile } = useAuth();
  const events = useEvents('all');
  const notifs = useNotifications();
  const unread = notifs.data?.filter((n) => !n.read_at).length ?? 0;
  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const featured = events.data?.find((e) => e.category === 'conference') ?? events.data?.[0];

  return (
    <Screen withTabBar refreshing={events.isRefetching} onRefresh={() => events.refetch()}>
      <Row>
        <Pressable onPress={() => router.navigate('/profile')} accessibilityLabel="Open profile">
          <Avatar name={profile?.full_name} size={46} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt size={19} weight={800} numberOfLines={1}>
            {greeting()}, {firstName} 👋
          </Txt>
          <Txt size={13} color={colors.muted}>
            {profile?.level ? LEVEL_LABEL[profile.level] : 'SUP’COM'}
            {profile?.period ? ` · ${profile.period}` : ''}
          </Txt>
        </View>
        <IconButton icon="bell" label={`Notifications, ${unread} new`} badge={unread} onPress={() => router.push('/notifications')} size={46} />
      </Row>

      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, shadows.strong]}>
        <View style={{ position: 'absolute', right: -6, bottom: -8 }}>
          <HeroBuilding />
        </View>
        <View style={{ gap: 6, maxWidth: 210 }}>
          <Badge label={featured ? featured.organizer.toUpperCase() : 'SUP’COM FORUM'} tone="white" />
          <Txt size={20} weight={800} color={colors.white}>
            {featured ? featured.title : 'Join the campus forum!'}
          </Txt>
        </View>
        <Button
          title="Join"
          variant="violet"
          arrow
          small
          style={{ alignSelf: 'flex-start' }}
          onPress={() => (featured ? router.push(`/events/${featured.id}`) : router.push('/events'))}
        />
      </LinearGradient>

      <SectionTitle title="Quick Access" />
      <View style={[styles.grid, shadows.card]}>
        {QUICK.map((q) => (
          <Pressable key={q.label} accessibilityRole="button" onPress={() => router.push(q.href as never)} style={styles.quick}>
            <View style={styles.tile}>
              <Icon name={q.icon} size={24} color={colors.navy} />
            </View>
            <Txt size={12} weight={600} numberOfLines={1}>
              {q.label}
            </Txt>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Upcoming Events" action="See all" onAction={() => router.push('/events')} />
      {events.isLoading ? (
        <Loading />
      ) : events.data?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingBottom: 8 }}>
          {events.data.slice(0, 6).map((e) => (
            <EventCard key={e.id} event={e} compact onPress={() => router.push(`/events/${e.id}`)} />
          ))}
        </ScrollView>
      ) : (
        <EmptyState icon="calendar" title="No upcoming events" body="Clubs will publish their next events here." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 160, borderRadius: 22, padding: 20, justifyContent: 'space-between', overflow: 'hidden' },
  grid: { backgroundColor: colors.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 4, flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  quick: { width: '25%', alignItems: 'center', gap: 8 },
  tile: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
});
