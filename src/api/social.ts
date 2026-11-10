import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentUserId, supabase, unwrap } from '@/lib/supabase';
import {
  CommentRow,
  ConversationRow,
  EventCategory,
  EventFeed,
  LevelCode,
  MessageRow,
  NotificationRow,
  PostFeed,
} from '@/types/db';

/* ───────────── Events ───────────── */

export function useEvents(category: EventCategory | 'all', upcomingOnly = true) {
  return useQuery({
    queryKey: ['events', category, upcomingOnly],
    queryFn: async () => {
      let q = supabase.from('events_feed').select('*').order('starts_at');
      if (category !== 'all') q = q.eq('category', category);
      if (upcomingOnly) q = q.gte('starts_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString());
      return unwrap(await q) as EventFeed[];
    },
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => unwrap(await supabase.from('events_feed').select('*').eq('id', id).single()) as EventFeed,
  });
}

export function useToggleRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, registered }: { id: string; registered: boolean }) => {
      const uid = await currentUserId();
      if (registered) unwrap(await supabase.from('event_registrations').delete().eq('event_id', id).eq('user_id', uid));
      else unwrap(await supabase.from('event_registrations').insert({ event_id: id }));
    },
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
    queryFn: async () => {
      let q = supabase.from('posts_feed').select('*').eq('scope', scope).order('created_at', { ascending: false }).limit(50);
      if (scope === 'level' && level) q = q.eq('level_code', level);
      return unwrap(await q) as PostFeed[];
    },
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: async () => unwrap(await supabase.from('posts_feed').select('*').eq('id', id).single()) as PostFeed,
  });
}

export function useComments(postId: string) {
  const qc = useQueryClient();
  // Live replies via Supabase Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`comments:${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, () => {
        qc.invalidateQueries({ queryKey: ['comments', postId] });
        qc.invalidateQueries({ queryKey: ['post', postId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [postId, qc]);

  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('comments')
          .select('*, author:profiles!comments_author_id_fkey(id, full_name, level)')
          .eq('post_id', postId)
          .order('is_best', { ascending: false })
          .order('created_at'),
      ) as CommentRow[],
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (post: PostFeed) => {
      const uid = await currentUserId();
      if (post.liked_by_me) unwrap(await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', uid));
      else unwrap(await supabase.from('post_likes').insert({ post_id: post.id }));
    },
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
    mutationFn: async (p: { scope: 'general' | 'level'; level_code: LevelCode | null; topic: string | null; body: string }) =>
      unwrap(await supabase.from('posts').insert(p).select('id').single()) as { id: string },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['profileStats'] });
    },
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { body: string; parent_id?: string | null }) =>
      unwrap(await supabase.from('comments').insert({ post_id: postId, body: p.body, parent_id: p.parent_id ?? null })),
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
    mutationFn: async (commentId: string) => unwrap(await supabase.rpc('mark_best_answer', { p_comment: commentId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', postId] }),
  });
}

/* ───────────── Direct messages ───────────── */

export async function startConversation(otherId: string, context: string) {
  return unwrap(await supabase.rpc('start_conversation', { p_other: otherId, p_context: context })) as string;
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => unwrap(await supabase.from('my_conversations').select('*').order('last_at', { ascending: false })) as ConversationRow[],
  });
}

export function useMessages(conversationId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        qc.setQueryData<MessageRow[]>(['messages', conversationId], (old) =>
          old?.some((m) => m.id === (payload.new as MessageRow).id) ? old : [...(old ?? []), payload.new as MessageRow],
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () =>
      unwrap(await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at')) as MessageRow[],
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      unwrap(await supabase.from('messages').insert({ conversation_id: conversationId, body }).select('*').single()) as MessageRow,
    onSuccess: (msg) => {
      qc.setQueryData<MessageRow[]>(['messages', conversationId], (old) => (old?.some((m) => m.id === msg.id) ? old : [...(old ?? []), msg]));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/* ───────────── Notifications ───────────── */

export function useNotifications() {
  const qc = useQueryClient();
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    currentUserId()
      .then((uid) => {
        ch = supabase
          .channel(`notifications:${uid}:${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () =>
            qc.invalidateQueries({ queryKey: ['notifications'] }),
          )
          .subscribe();
      })
      .catch(() => undefined);
    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)) as NotificationRow[],
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const uid = await currentUserId();
      unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/* ───────────── Profile ───────────── */

export function useProfileStats() {
  return useQuery({
    queryKey: ['profileStats'],
    queryFn: async () => {
      const uid = await currentUserId();
      const head = { count: 'exact' as const, head: true };
      const [u, r, p] = await Promise.all([
        supabase.from('documents').select('id', head).eq('uploader_id', uid),
        supabase.from('rides').select('id', head).eq('driver_id', uid),
        supabase.from('posts').select('id', head).eq('author_id', uid),
      ]);
      return { uploads: u.count ?? 0, rides: r.count ?? 0, posts: p.count ?? 0 };
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { full_name?: string; username?: string; level?: LevelCode; period?: string | null }) => {
      const uid = await currentUserId();
      unwrap(await supabase.from('profiles').update(p).eq('id', uid));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profileStats'] }),
  });
}
