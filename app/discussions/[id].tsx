import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { PostCard } from '@/components/cards';
import { Avatar, ErrorNote, Header, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useAddComment, useComments, useMarkBest, usePost, useToggleLike } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { timeAgo } from '@/lib/format';
import { colors, fonts, gradients } from '@/theme';
import { CommentRow } from '@/types/db';

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = usePost(id);
  const comments = useComments(id);
  const like = useToggleLike();
  const add = useAddComment(id);
  const best = useMarkBest(id);
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const isAuthor = post.data?.author_id === session?.user.id;

  const send = () => {
    const body = text.trim();
    if (!body) return;
    add.mutate({ body, parent_id: replyTo?.parent_id ?? replyTo?.id ?? null }, { onSuccess: () => { setText(''); setReplyTo(null); } });
  };

  const roots = (comments.data ?? []).filter((c) => !c.parent_id);
  const childrenOf = (cid: string) => (comments.data ?? []).filter((c) => c.parent_id === cid);

  const bubble = (c: CommentRow, nested = false) => {
    const mine = c.author_id === session?.user.id;
    return (
      <View key={c.id} style={{ flexDirection: 'row', gap: 10, paddingLeft: nested ? 44 : 0 }}>
        <Avatar name={c.author?.full_name} size={nested ? 30 : 34} dark={!mine} />
        <Pressable
          onLongPress={() =>
            isAuthor && !nested
              ? Alert.alert('Best answer', 'Mark this reply as the best answer?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Mark best', onPress: () => best.mutate(c.id) },
                ])
              : undefined
          }
          style={[styles.bubble, c.is_best && { borderWidth: 1.5, borderColor: '#BFE6CF' }]}
        >
          <Row gap={8}>
            <Txt size={13} weight={700}>
              {c.author?.full_name ?? 'Student'}
            </Txt>
            {c.is_best ? (
              <Row gap={3} style={{ backgroundColor: colors.successBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Icon name="check" size={10} color={colors.success} />
                <Txt size={10} weight={800} color={colors.success}>
                  Best answer
                </Txt>
              </Row>
            ) : null}
            <Txt size={11} color={colors.muted} style={{ marginLeft: 'auto' }}>
              {timeAgo(c.created_at)}
            </Txt>
          </Row>
          <Txt size={13} style={{ lineHeight: 20 }}>
            {c.body}
          </Txt>
          <Pressable onPress={() => setReplyTo(c)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
            <Txt size={12} weight={700} color={colors.royal}>
              Reply
            </Txt>
          </Pressable>
        </Pressable>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <Screen
        footer={
          <View style={{ gap: 8 }}>
            {replyTo ? (
              <Row gap={6}>
                <Txt size={12} color={colors.muted} style={{ flex: 1 }} numberOfLines={1}>
                  Replying to {replyTo.author?.full_name}
                </Txt>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Icon name="close" size={14} color={colors.muted} />
                </Pressable>
              </Row>
            ) : null}
            <Row gap={10}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Write a reply…"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel="Write a reply"
                multiline
                style={styles.input}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Send reply" onPress={send} disabled={add.isPending} style={styles.send}>
                <LinearGradient colors={gradients.violet} style={StyleSheet.absoluteFill} />
                <Icon name="send" size={20} color={colors.white} />
              </Pressable>
            </Row>
          </View>
        }
      >
        <Header title="Discussion" />
        {post.isLoading ? <Loading /> : post.data ? <PostCard post={post.data} onLike={() => like.mutate(post.data!)} /> : <ErrorNote error={post.error} />}
        <SectionTitle title={`Replies${comments.data ? ` · ${comments.data.length}` : ''}`} />
        {isAuthor && roots.length ? (
          <Txt size={12} color={colors.muted}>
            Tip: long-press a reply to mark it as the best answer.
          </Txt>
        ) : null}
        {comments.isLoading ? <Loading /> : null}
        <View style={{ gap: 10 }}>
          {roots.map((c) => (
            <View key={c.id} style={{ gap: 10 }}>
              {bubble(c)}
              {childrenOf(c.id).map((ch) => bubble(ch, true))}
            </View>
          ))}
        </View>
        {!comments.isLoading && !roots.length ? (
          <Txt size={13} color={colors.muted} style={{ textAlign: 'center', paddingVertical: 20 }}>
            No replies yet — be the first to help.
          </Txt>
        ) : null}
        <ErrorNote error={add.error ?? best.error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { flex: 1, backgroundColor: colors.card, borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, padding: 12, gap: 6 },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    fontFamily: fonts[500],
    fontSize: 14,
    color: colors.text,
  },
  send: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
