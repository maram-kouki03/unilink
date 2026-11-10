import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Card, EmptyState, Header, Loading, Row, Screen, Txt } from '@/components/ui';
import { useConversations } from '@/api/social';
import { timeAgo } from '@/lib/format';
import { colors } from '@/theme';

export default function Inbox() {
  const conv = useConversations();
  return (
    <Screen refreshing={conv.isRefetching} onRefresh={() => conv.refetch()}>
      <Header title="Messages" />
      {conv.isLoading ? (
        <Loading />
      ) : !conv.data?.length ? (
        <EmptyState icon="chat" title="No messages yet" body="Contact a driver or an item owner to start a conversation." />
      ) : (
        conv.data.map((c) => (
          <Card key={c.id} onPress={() => router.push(`/chat/${c.id}`)}>
            <Row>
              <Avatar name={c.other_name} />
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt size={15} weight={700}>
                    {c.other_name}
                  </Txt>
                  {c.last_at ? (
                    <Txt size={11} color={colors.muted}>
                      {timeAgo(c.last_at)}
                    </Txt>
                  ) : null}
                </Row>
                {c.context ? (
                  <Txt size={11} weight={700} color={colors.violetDeep} numberOfLines={1}>
                    {c.context}
                  </Txt>
                ) : null}
                <Txt size={13} color={colors.muted} numberOfLines={1}>
                  {c.last_message ?? 'Say hello 👋'}
                </Txt>
              </View>
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
