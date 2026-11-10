import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentUserId, supabase, unwrap } from '@/lib/supabase';
import { BUCKET_IMAGES, uploadLocalFile } from '@/lib/storage';
import { ItemMode, ItemRow, LostFoundRow, LostKind } from '@/types/db';

const ITEM_SELECT = '*, owner:profiles!items_owner_id_fkey(id, full_name, level)';

/* ───────────── Rents & Borrow ───────────── */

export function useItems(mode: ItemMode, q: string) {
  return useQuery({
    queryKey: ['items', mode, q],
    queryFn: async () => {
      let query = supabase.from('items').select(ITEM_SELECT).eq('mode', mode).eq('available', true).order('created_at', { ascending: false }).limit(60);
      if (q.trim()) query = query.ilike('title', `%${q.trim()}%`);
      return unwrap(await query) as ItemRow[];
    },
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ['item', id],
    queryFn: async () => unwrap(await supabase.from('items').select(ITEM_SELECT).eq('id', id).single()) as ItemRow,
  });
}

export async function uploadImage(kind: 'items' | 'lost' | 'avatars', uri: string) {
  const uid = await currentUserId();
  return uploadLocalFile({ bucket: BUCKET_IMAGES, folder: `${kind}/${uid}`, uri, fileName: 'photo.jpg', contentType: 'image/jpeg' });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      mode: ItemMode;
      title: string;
      description?: string;
      category: string;
      price_tnd: number | null;
      price_unit: 'day' | 'week' | 'month';
      max_duration?: string;
      condition?: string;
      location?: string;
      photoUri?: string | null;
    }) => {
      const { photoUri, ...row } = p;
      const photo_path = photoUri ? await uploadImage('items', photoUri) : null;
      return unwrap(await supabase.from('items').insert({ ...row, photo_path }).select('id').single()) as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

export function useSetItemAvailable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) =>
      unwrap(await supabase.from('items').update({ available }).eq('id', id)),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['item', v.id] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

/* ───────────── Lost & Found ───────────── */

export function useLostFound(kind: LostKind) {
  return useQuery({
    queryKey: ['lostFound', kind],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('lost_found')
          .select('*, reporter:profiles!lost_found_reporter_id_fkey(id, full_name)')
          .eq('kind', kind)
          .order('status')
          .order('created_at', { ascending: false })
          .limit(60),
      ) as LostFoundRow[],
  });
}

export function useReturnedThisMonth() {
  return useQuery({
    queryKey: ['lostFoundReturned'],
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      const { count } = await supabase
        .from('lost_found')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'returned')
        .gte('created_at', start.toISOString());
      return count ?? 0;
    },
  });
}

export function useReportLostFound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      kind: LostKind;
      title: string;
      category: string;
      location: string;
      happened_at?: string | null;
      description?: string;
      photoUri?: string | null;
    }) => {
      const { photoUri, ...row } = p;
      const photo_path = photoUri ? await uploadImage('lost', photoUri) : null;
      return unwrap(await supabase.from('lost_found').insert({ ...row, photo_path }).select('id').single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lostFound'] }),
  });
}

export function useMarkReturned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('lost_found').update({ status: 'returned' }).eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lostFound'] }),
  });
}
