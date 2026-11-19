import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formFile } from '@/lib/api';
import { DocType, DocumentRow, LevelWithStats, Period, Subject } from '@/types/db';

export const docKeys = {
  levels: ['levels'] as const,
  level: (id: number) => ['level', id] as const,
  periods: (levelId: number) => ['periods', levelId] as const,
  period: (id: string) => ['period', id] as const,
  subjects: (periodId: string) => ['subjects', periodId] as const,
  subject: (id: string) => ['subject', id] as const,
  docs: (subjectId: string, type: string, q: string) => ['docs', subjectId, type, q] as const,
  doc: (id: string) => ['doc', id] as const,
  search: (q: string, type: string) => ['docSearch', q, type] as const,
  recent: ['docsRecent'] as const,
  starred: ['docsStarred'] as const,
};

export function useLevels() {
  return useQuery({
    queryKey: docKeys.levels,
    queryFn: () => api<LevelWithStats[]>('/levels'),
  });
}

export function useLevel(id: number) {
  return useQuery({
    queryKey: docKeys.level(id),
    queryFn: () => api<LevelWithStats>(`/levels/${id}`),
  });
}

export function usePeriods(levelId: number) {
  return useQuery({
    queryKey: docKeys.periods(levelId),
    queryFn: () => api<Period[]>(`/levels/${levelId}/periods`),
  });
}

export function usePeriod(id: string) {
  return useQuery({
    queryKey: docKeys.period(id),
    queryFn: () => api<Period & { level: { id: number; name: string; short_name: string } }>(`/periods/${id}`),
  });
}

export function useSubjects(periodId: string) {
  return useQuery({
    queryKey: docKeys.subjects(periodId),
    enabled: !!periodId,
    queryFn: () => api<Subject[]>(`/periods/${periodId}/subjects`),
  });
}

export function useSubject(id: string) {
  return useQuery({
    queryKey: docKeys.subject(id),
    queryFn: () =>
      api<Subject & { period: { id: string; name: string; level: { id: number; name: string; short_name: string } } }>(`/subjects/${id}`),
  });
}

export function useDocuments(subjectId: string, type: DocType | 'all', q: string) {
  return useQuery({
    queryKey: docKeys.docs(subjectId, type, q),
    queryFn: () =>
      api<DocumentRow[]>(`/subjects/${subjectId}/documents`, { query: { type: type === 'all' ? undefined : type, q: q.trim() } }),
  });
}

/** Global search across every folder (Documents root search bar). */
export function useDocumentSearch(q: string, type: DocType | 'all') {
  return useQuery({
    queryKey: docKeys.search(q, type),
    enabled: q.trim().length >= 2 || type !== 'all',
    queryFn: () => api<DocumentRow[]>('/documents/search', { query: { q: q.trim(), type: type === 'all' ? undefined : type } }),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: docKeys.doc(id),
    queryFn: () => api<DocumentRow & { starred: boolean }>(`/documents/${id}`),
  });
}

export function useRecentDocuments() {
  return useQuery({
    queryKey: docKeys.recent,
    queryFn: () => api<(DocumentRow & { opened_at: string })[]>('/documents/recent'),
  });
}

export function useStarredDocuments() {
  return useQuery({
    queryKey: docKeys.starred,
    queryFn: () => api<DocumentRow[]>('/documents/starred'),
  });
}

export async function recordOpen(documentId: string) {
  await api(`/documents/${documentId}/open`, { method: 'POST' });
}

export async function countDownload(documentId: string) {
  await api(`/documents/${documentId}/download`, { method: 'POST' });
}

export function useToggleStar() {
  const qc = useQueryClient();
  return useMutation({
    // The server toggles; `starred` is kept so the screens don't change.
    mutationFn: async ({ id }: { id: string; starred: boolean }) => api<{ starred: boolean }>(`/documents/${id}/star`, { method: 'POST' }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: docKeys.doc(v.id) });
      qc.invalidateQueries({ queryKey: docKeys.starred });
    },
  });
}

/** Signed Cloudinary link valid 1 hour. download=true → the file is saved instead of opened. */
export async function documentLink(id: string, download = false) {
  return api<{ url: string; expiresIn: number }>(`/documents/${id}/link`, { query: { download: download ? 1 : undefined } });
}

export function useMyDocuments() {
  return useQuery({
    queryKey: ['docsMine'],
    queryFn: () => api<DocumentRow[]>('/documents/mine'),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs'] });
      qc.invalidateQueries({ queryKey: ['docsMine'] });
      qc.invalidateQueries({ queryKey: docKeys.levels });
      qc.invalidateQueries({ queryKey: ['profileStats'] });
    },
  });
}

export async function reportDocument(id: string, reason: string) {
  await api(`/documents/${id}/report`, { body: { reason } });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      subjectId: string;
      title: string;
      docType: DocType;
      academicYear: string;
      file: { uri: string; name: string; size?: number | null; mimeType?: string | null };
      driveUrl?: string;
    }) => {
      const form = new FormData();
      form.append('file', formFile(p.file.uri, p.file.name, p.file.mimeType));
      form.append('subjectId', p.subjectId);
      form.append('title', p.title.trim());
      form.append('docType', p.docType);
      form.append('academicYear', p.academicYear || '');
      form.append('driveUrl', p.driveUrl?.trim() || '');
      return api<{ id: string }>('/documents', { body: form });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs'] });
      qc.invalidateQueries({ queryKey: docKeys.levels });
      qc.invalidateQueries({ queryKey: ['periods'] });
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['profileStats'] });
    },
  });
}

/** Levels → periods → subjects – used by the upload form pickers. */
export function useFolderTree() {
  return useQuery({
    queryKey: ['folderTree'],
    staleTime: 1000 * 60 * 30,
    queryFn: () =>
      api<
        {
          id: number;
          code: string;
          name: string;
          short_name: string;
          periods: { id: string; name: string; sort: number; subjects: { id: string; name: string }[] }[];
        }[]
      >('/folder-tree'),
  });
}
