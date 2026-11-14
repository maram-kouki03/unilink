import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formFile } from '@/lib/api';
import { ItemMode, ItemRow, LostFoundRow, LostKind } from '@/types/db';

/** Append text fields to a FormData, skipping empty values. */
function appendFields(form: FormData, fields: Record<string, string | number | boolean | null | undefined>) {
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  });
}

/** Attach a picked photo (file:// uri) to the FormData under "photo". */
function appendPhoto(form: FormData, uri?: string | null) {
  if (!uri) return;
  const ext = (uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
  const kind = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg';
  form.append('photo', formFile(uri, `photo.${kind}`, kind === 'jpg' ? 'image/jpeg' : `image/${kind}`));
}

/* ───────────── Rents & Borrow ───────────── */

export function useItems(mode: ItemMode, q: string) {
  return useQuery({
    queryKey: ['items', mode, q],
    queryFn: () => api<ItemRow[]>('/items', { query: { mode, q: q.trim() } }),
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ['item', id],
    queryFn: () => api<ItemRow>(`/items/${id}`),
  });
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
      const form = new FormData();
      appendFields(form, row);
      appendPhoto(form, photoUri);
      return api<{ id: string }>('/items', { body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

export function useSetItemAvailable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      api(`/items/${id}/availability`, { method: 'PATCH', body: { available } }),
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
    queryFn: () => api<LostFoundRow[]>('/lost-found', { query: { kind } }),
  });
}

export function useReturnedThisMonth() {
  return useQuery({
    queryKey: ['lostFoundReturned'],
    queryFn: async () => (await api<{ count: number }>('/lost-found/returned-count')).count,
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
      const form = new FormData();
      appendFields(form, row);
      appendPhoto(form, photoUri);
      return api<{ id: string }>('/lost-found', { body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lostFound'] }),
  });
}

export function useMarkReturned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/lost-found/${id}/returned`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lostFound'] });
      qc.invalidateQueries({ queryKey: ['lostFoundReturned'] });
    },
  });
}
