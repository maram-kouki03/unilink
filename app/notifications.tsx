import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, Header, IconTile, Loading, Row, Screen, Txt } from '@/components/ui';
import { useMarkAllRead, useNotifications } from '@/api/social';
import { timeAgo } from '@/lib/format';
import { colors, shadows } from '@/theme';

export default function Notifications() {
  const n = useNotifications();
  const markAll = useMarkAllRead();
  const unread = n.data?.filter((x) => !x.read_at).length ?? 0;

  return (
    <Screen refreshing={n.isRefetching} onRefresh={() => n.refetch()}>
      <Header title="Notifications" right={unread ? <Button title="Mark all read" variant="ghost" small onPress={() => markAll.mutate()} /> : undefined} />
      {n.isLoading ? (
        <Loading />
      ) : !n.data?.length ? (
        <EmptyState icon="bell" title="You're all caught up" body="Replies, bookings and messages will show up here." />
      ) : (
        n.data.map((x) => (
          <Pressable
            key={x.id}
            accessibilityRole="button"
            onPress={() => x.link && router.push(x.link as never)}
            style={[{ backgroundColor: x.read_at ? colors.card : '#F6F3FF', borderRadius: 18, padding: 14 }, shadows.soft]}
          >
            <Row>
              <IconTile icon={x.link?.startsWith('/rides') ? 'car' : x.link?.startsWith('/chat') ? 'chat' : 'bell'} size={42} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={14} weight={x.read_at ? 600 : 800}>
                  {x.title}
                </Txt>
                {x.body ? (
                  <Txt size={12} color={colors.muted} numberOfLines={2}>
                    {x.body}
                  </Txt>
                ) : null}
              </View>
              <Txt size={11} color={colors.muted}>
                {timeAgo(x.created_at)}
              </Txt>
            </Row>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
