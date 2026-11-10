import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { LostBoxArt } from '@/components/Illustrations';
import { LostRow } from '@/components/cards';
import { Button, Card, EmptyState, ErrorNote, Header, Loading, Row, Screen, SectionTitle, SegmentedTabs, Txt } from '@/components/ui';
import { useLostFound, useMarkReturned, useReturnedThisMonth } from '@/api/marketplace';
import { startConversation } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';
import { LostFoundRow, LostKind } from '@/types/db';

export default function LostFound() {
  const [kind, setKind] = useState<LostKind>('lost');
  const list = useLostFound(kind);
  const returned = useReturnedThisMonth();
  const markReturned = useMarkReturned();
  const { session } = useAuth();

  const onItem = (it: LostFoundRow) => {
    const mine = it.reporter_id === session?.user.id;
    if (it.status === 'returned') return;
    if (mine)
      return Alert.alert(it.title, 'Has this item been returned?', [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Mark returned', onPress: () => markReturned.mutate(it.id) },
      ]);
    Alert.alert(it.title, `${it.description ?? ''}\n\n${it.location}`.trim(), [
      { text: 'Close', style: 'cancel' },
      {
        text: it.kind === 'lost' ? 'I found it' : "It's mine",
        onPress: async () => {
          try {
            const cid = await startConversation(it.reporter_id, `${it.kind === 'lost' ? 'Lost' : 'Found'}: ${it.title}`);
            router.push(`/chat/${cid}`);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => list.refetch()}>
      <Header title="Lost & Found" />
      <SegmentedTabs
        options={[
          { value: 'lost', label: 'Lost' },
          { value: 'found', label: 'Found' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Card style={{ gap: 14, padding: 16 }}>
        <Row gap={14}>
          <LostBoxArt />
          <View style={{ flex: 1, gap: 6 }}>
            <Txt size={17} weight={800}>
              Report or find lost items on campus
            </Txt>
            <Txt size={12} color={colors.muted}>
              {returned.data ?? 0} items returned to their owners this month.
            </Txt>
          </View>
        </Row>
        <Row gap={10}>
          <Button title="Report an item" arrow height={50} style={{ flex: 1.2 }} onPress={() => router.push({ pathname: '/lost-found/report', params: { kind } })} />
          <Button title="Browse" variant="outline" height={50} style={{ flex: 1 }} onPress={() => list.refetch()} />
        </Row>
      </Card>
      <SectionTitle title={kind === 'lost' ? 'Recently lost' : 'Recently found'} />
      <ErrorNote error={list.error} />
      {list.isLoading ? (
        <Loading />
      ) : list.data?.length ? (
        <View style={{ gap: 8 }}>
          {list.data.map((it) => (
            <LostRow key={it.id} item={it} onPress={() => onItem(it)} />
          ))}
        </View>
      ) : (
        <EmptyState icon="search" title="Nothing reported" body="Good news — nothing lost right now." />
      )}
    </Screen>
  );
}
