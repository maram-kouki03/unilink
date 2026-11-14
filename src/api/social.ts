import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { joinRoom, leaveRoom, onSocket } from '@/lib/socket';
import {
  CommentRow,
  ConversationRow,
  DocumentRow,
  EventCategory,
  EventFeed,
  ItemRow,
  LevelCode,
  MessageRow,
  NotificationRow,
  PostFeed,
  RideFeed,
} from '@/types/db';

/* ───────────── Events ───────────── */

export function useEvents(category: EventCategory | 'all', upcomingOnly = true) {
  return useQuery({
    queryKey: ['events', category, upcomingOnly],
    queryFn: () => api<EventFeed[]>('/events', { query: { category, upcoming: upcomingOnly } }),
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => api<EventFeed>(`/events/${id}`),
  });
}

export function useToggleRegistration() {
  const qc = useQueryClient();
  return useMutation({
    // The server toggles; `registered` is kept so the screens don't change.
    mutationFn: ({ id }: { id: string; registered: boolean }) => api<{ registered: boolean }>(`/events/${id}/register`, { method: 'POST' }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['event', v.id] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

/* ───────────── Discussions ───────────── */

export function usePosts(scope: 'general' | 'level', level?: LevelCode | null) {
  return useQuery({
    queryKey: ['posts', scope, level ?? null],
    queryFn: () => api<PostFeed[]>('/posts', { query: { scope, level: scope === 'level' ? level : undefined } }),
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: () => api<PostFeed>(`/posts/${id}`),
  });
}

export function useComments(postId: string) {
  const qc = useQueryClient();
  // Live replies via Socket.io (room post:<id>)
  useEffect(() => {
    const room = `post:${postId}`;
    joinRoom(room);
    const refresh = (c: { post_id?: string }) => {
      if (c?.post_id !== postId) return;
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      qc.invalidateQueries({ queryKey: ['post', postId] });
    };
    const offNew = onSocket<CommentRow>('comment:new', refresh);
    const offUpdated = onSocket<{ post_id: string }>('comment:updated', refresh);
    return () => {
      offNew();
      offUpdated();
      leaveRoom(room);
    };
  }, [postId, qc]);

  return useQuery({
    queryKey: ['comments', postId],
    queryFn: () => api<CommentRow[]>(`/posts/${postId}/comments`),
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (post: PostFeed) => api<{ liked: boolean }>(`/posts/${post.id}/like`, { method: 'POST' }),
    // optimistic update on every cached feed
    onMutate: async (post) => {
      const flip = (p: PostFeed) =>
        p.id === post.id ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.likes_count + (p.liked_by_me ? -1 : 1) } : p;
      qc.setQueriesData<PostFeed[]>({ queryKey: ['posts'] }, (old) => old?.map(flip));
      qc.setQueryData<PostFeed>(['post', post.id], (old) => (old ? flip(old) : old));
    },
    onSettled: (_d, _e, post) => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['post', post.id] });
    },
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { scope: 'general' | 'level'; level_code: LevelCode | null; topic: string | null; body: string }) =>
      api<{ id: string }>('/posts', { body: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['profileStats'] });
    },
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { body: string; parent_id?: string | null }) =>
      api<CommentRow>(`/posts/${postId}/comments`, { body: { body: p.body, parent_id: p.parent_id ?? null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      qc.invalidateQueries({ queryKey: ['post', postId] });
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useMarkBest(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api(`/comments/${commentId}/best`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', postId] }),
  });
}

/* ───────────── Direct messages ───────────── */

export async function startConversation(otherId: string, context: string) {
  const { id } = await api<{ id: string }>('/conversations', { body: { otherId, context } });
  return id;
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<ConversationRow[]>('/conversations'),
  });
}

const appendMessage = (old: MessageRow[] | undefined, msg: MessageRow) => (old?.some((m) => m.id === msg.id) ? old : [...(old ?? []), msg]);

export function useMessages(conversationId: string) {
  const qc = useQueryClient();
  // Live messages via Socket.io (room conv:<id>, members only)
  useEffect(() => {
    const room = `conv:${conversationId}`;
    joinRoom(room);
    const off = onSocket<MessageRow>('message:new', (msg) => {
      if (msg?.conversation_id !== conversationId) return;
      qc.setQueryData<MessageRow[]>(['messages', conversationId], (old) => appendMessage(old, msg));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    });
    return () => {
      off();
      leaveRoom(room);
    };
  }, [conversationId, qc]);

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api<MessageRow[]>(`/conversations/${conversationId}/messages`),
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api<MessageRow>(`/conversations/${conversationId}/messages`, { body: { body } }),
    onSuccess: (msg) => {
      qc.setQueryData<MessageRow[]>(['messages', conversationId], (old) => appendMessage(old, msg));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/* ───────────── Notifications ───────────── */

export function useNotifications() {
  const qc = useQueryClient();
  // The server puts every signed-in socket in room user:<id> automatically.
  useEffect(
    () =>
      onSocket<NotificationRow>('notification:new', () => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
      }),
    [qc],
  );

  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationRow[]>('/notifications'),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/* ───────────── Profile ───────────── */

export function useProfileStats() {
  return useQuery({
    queryKey: ['profileStats'],
    queryFn: () => api<{ uploads: number; rides: number; posts: number }>('/me/stats'),
  });
}

export type ActivityTab = 'posts' | 'rides' | 'items' | 'uploads';

/** "My Activities" lists: my posts, rides I offer, my items, my uploads. */
export function useActivity(tab: ActivityTab) {
  return useQuery({
    queryKey: ['activity', tab],
    queryFn: () => api<PostFeed[] | RideFeed[] | ItemRow[] | DocumentRow[]>('/me/activity', { query: { tab } }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { full_name?: string; username?: string; level?: LevelCode; period?: string | null }) =>
      api('/me', { method: 'PATCH', body: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profileStats'] }),
  });
}
