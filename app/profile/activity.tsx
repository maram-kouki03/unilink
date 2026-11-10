import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileRow, ItemCard, PostCard, RideCard } from '@/components/cards';
import { Card, ChipRow, EmptyState, Header, Loading, Screen } from '@/components/ui';
import { useToggleLike } from '@/api/social';
import { useFileActions } from '@/components/useFileActions';
import { currentUserId, supabase, unwrap } from '@/lib/supabase';
import { DocumentRow, ItemRow, PostFeed, RideFeed } from '@/types/db';

type Tab = 'posts' | 'rides' | 'items' | 'uploads';

export default function MyActivities() {
  const [tab, setTab] = useState<Tab>('posts');
  const like = useToggleLike();
  const { open, actionsFor, sheet } = useFileActions();
  const q = useQuery({
    queryKey: ['activity', tab],
    queryFn: async () => {
      const uid = await currentUserId();
      if (tab === 'posts') return unwrap(await supabase.from('posts_feed').select('*').eq('author_id', uid).order('created_at', { ascending: false })) as PostFeed[];
      if (tab === 'rides') return unwrap(await supabase.from('rides_feed').select('*').eq('driver_id', uid).order('departure_at', { ascending: false })) as RideFeed[];
      if (tab === 'items') return unwrap(await supabase.from('items').select('*').eq('owner_id', uid).order('created_at', { ascending: false })) as ItemRow[];
      return unwrap(await supabase.from('documents').select('*').eq('uploader_id', uid).order('created_at', { ascending: false })) as DocumentRow[];
    },
  });
  const data = (q.data ?? []) as unknown[];

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="My Activities" />
      <ChipRow
        options={[
          { value: 'posts', label: 'My posts' },
          { value: 'rides', label: 'Rides' },
          { value: 'items', label: 'Items' },
          { value: 'uploads', label: 'Uploads' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {q.isLoading ? <Loading /> : null}
      {!q.isLoading && !data.length ? <EmptyState icon="activity" title="Nothing yet" /> : null}
      {tab === 'posts' && (data as PostFeed[]).map((p) => <PostCard key={p.id} post={p} onPress={() => router.push(`/discussions/${p.id}`)} onLike={() => like.mutate(p)} />)}
      {tab === 'rides' && (data as RideFeed[]).map((r) => <RideCard key={r.id} ride={r} onPress={() => router.push(`/rides/${r.id}`)} />)}
      {tab === 'items' && (
        <View style={{ gap: 12 }}>
          {(data as ItemRow[]).map((it) => (
            <View key={it.id} style={{ flexDirection: 'row' }}>
              <ItemCard item={it} onPress={() => router.push(`/rents/${it.id}`)} />
            </View>
          ))}
        </View>
      )}
      {tab === 'uploads' && data.length ? (
        <Card style={{ padding: 0 }}>
          {(data as DocumentRow[]).map((d, i) => (
            <FileRow key={d.id} doc={d} last={i === data.length - 1} onPress={() => open(d)} onMore={() => actionsFor(d)} />
          ))}
        </Card>
      ) : null}
      {sheet}
    </Screen>
  );
}
