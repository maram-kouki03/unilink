import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { PostCard } from '@/components/cards';
import { ChipRow, EmptyState, ErrorNote, IconButton, Loading, Row, Screen, SegmentedTabs, TAB_BAR_SPACE, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { usePosts, useToggleLike } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { colors, gradients, shadows } from '@/theme';
import { LEVEL_CODES, LEVEL_SHORT, LevelCode } from '@/types/db';

export default function Discussions() {
  const { profile } = useAuth();
  const [scope, setScope] = useState<'general' | 'level'>('general');
  const [level, setLevel] = useState<LevelCode>(profile?.level ?? '1A');
  useEffect(() => {
    if (profile?.level) setLevel(profile.level);
  }, [profile?.level]);
  const posts = usePosts(scope, level);
  const like = useToggleLike();

  return (
    <View style={{ flex: 1 }}>
      <Screen withTabBar refreshing={posts.isRefetching} onRefresh={() => posts.refetch()}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt size={26} weight={800} accessibilityRole="header">
            Discussions
          </Txt>
          <IconButton icon="chat" label="Messages" onPress={() => router.push('/chat')} />
        </Row>
        <SegmentedTabs
          options={[
            { value: 'general', label: 'General' },
            { value: 'level', label: 'By Level' },
          ]}
          value={scope}
          onChange={setScope}
        />
        {scope === 'level' ? (
          <ChipRow options={LEVEL_CODES.map((c) => ({ value: c, label: LEVEL_SHORT[c] }))} value={level} onChange={setLevel} activeColor={colors.violet} variant="outline" />
        ) : null}
        <ErrorNote error={posts.error} />
        {posts.isLoading ? (
          <Loading />
        ) : posts.data?.length ? (
          posts.data.map((p) => <PostCard key={p.id} post={p} onPress={() => router.push(`/discussions/${p.id}`)} onLike={() => like.mutate(p)} />)
        ) : (
          <EmptyState icon="chat" title="No posts yet" body="Start the conversation!" action="New post" onAction={() => router.push({ pathname: '/discussions/new', params: { scope, level } })} />
        )}
      </Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New post"
        onPress={() => router.push({ pathname: '/discussions/new', params: { scope, level } })}
        style={[styles.fab, shadows.strong]}
      >
        <LinearGradient colors={gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Icon name="edit" size={24} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 20, bottom: TAB_BAR_SPACE - 4, width: 58, height: 58, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
