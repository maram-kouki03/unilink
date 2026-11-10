import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentUserId, supabase, unwrap } from '@/lib/supabase';
import { BUCKET_DOCS, extOf, uploadLocalFile } from '@/lib/storage';
import { DocType, DocumentRow, LevelWithStats, Period, Subject } from '@/types/db';

const DOC_SELECT =
  '*, uploader:profiles!documents_uploader_id_fkey(id, full_name, level), subject:subjects(id, name, period:periods(id, name, level:levels(id, name, short_name)))';

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
    queryFn: async () => unwrap(await supabase.from('level_stats').select('*').order('sort')) as LevelWithStats[],
  });
}

export function useLevel(id: number) {
  return useQuery({
    queryKey: docKeys.level(id),
    queryFn: async () => unwrap(await supabase.from('levels').select('*').eq('id', id).single()) as LevelWithStats,
  });
}

export function usePeriods(levelId: number) {
  return useQuery({
    queryKey: docKeys.periods(levelId),
    queryFn: async () => unwrap(await supabase.from('period_stats').select('*').eq('level_id', levelId).order('sort')) as Period[],
  });
}

export function usePeriod(id: string) {
  return useQuery({
    queryKey: docKeys.period(id),
    queryFn: async () =>
      unwrap(await supabase.from('periods').select('*, level:levels(id, name, short_name)').eq('id', id).single()) as Period & {
        level: { id: number; name: string; short_name: string };
      },
  });
}

export function useSubjects(periodId: string) {
  return useQuery({
    queryKey: docKeys.subjects(periodId),
    enabled: !!periodId,
    queryFn: async () => unwrap(await supabase.from('subject_stats').select('*').eq('period_id', periodId).order('name')) as Subject[],
  });
}

export function useSubject(id: string) {
  return useQuery({
    queryKey: docKeys.subject(id),
    queryFn: async () =>
      unwrap(
        await supabase.from('subjects').select('*, period:periods(id, name, level:levels(id, name, short_name))').eq('id', id).single(),
      ) as Subject & { period: { id: string; name: string; level: { id: number; name: string; short_name: string } } },
  });
}

export function useDocuments(subjectId: string, type: DocType | 'all', q: string) {
  return useQuery({
    queryKey: docKeys.docs(subjectId, type, q),
    queryFn: async () => {
      let query = supabase.from('documents').select(DOC_SELECT).eq('subject_id', subjectId).order('created_at', { ascending: false });
      if (type !== 'all') query = query.eq('doc_type', type);
      if (q.trim()) query = query.ilike('title', `%${q.trim()}%`);
      return unwrap(await query) as DocumentRow[];
    },
  });
}

/** Global search across every folder (Documents root search bar). */
export function useDocumentSearch(q: string, type: DocType | 'all') {
  return useQuery({
    queryKey: docKeys.search(q, type),
    enabled: q.trim().length >= 2 || type !== 'all',
    queryFn: async () => {
      let query = supabase.from('documents').select(DOC_SELECT).order('created_at', { ascending: false }).limit(40);
      if (q.trim()) query = query.ilike('title', `%${q.trim()}%`);
      if (type !== 'all') query = query.eq('doc_type', type);
      return unwrap(await query) as DocumentRow[];
    },
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: docKeys.doc(id),
    queryFn: async () => {
      const doc = unwrap(await supabase.from('documents').select(DOC_SELECT).eq('id', id).single()) as DocumentRow;
      const uid = await currentUserId();
      const { data: star } = await supabase.from('document_stars').select('document_id').eq('document_id', id).eq('user_id', uid).maybeSingle();
      return { ...doc, starred: !!star };
    },
  });
}

export function useRecentDocuments() {
  return useQuery({
    queryKey: docKeys.recent,
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('document_opens').select(`opened_at, document:documents(${DOC_SELECT})`).order('opened_at', { ascending: false }).limit(8),
      ) as unknown as { opened_at: string; document: DocumentRow | null }[];
      return rows.filter((r) => r.document).map((r) => ({ ...(r.document as DocumentRow), opened_at: r.opened_at }));
    },
  });
}

export function useStarredDocuments() {
  return useQuery({
    queryKey: docKeys.starred,
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('document_stars').select(`created_at, document:documents(${DOC_SELECT})`).order('created_at', { ascending: false }),
      ) as unknown as { document: DocumentRow | null }[];
      return rows.map((r) => r.document).filter(Boolean) as DocumentRow[];
    },
  });
}

export async function recordOpen(documentId: string) {
  const uid = await currentUserId();
  await supabase.from('document_opens').upsert({ user_id: uid, document_id: documentId, opened_at: new Date().toISOString() });
}

export async function countDownload(documentId: string) {
  await supabase.rpc('increment_download', { doc: documentId });
}

export function useToggleStar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) => {
      const uid = await currentUserId();
      if (starred) unwrap(await supabase.from('document_stars').delete().eq('document_id', id).eq('user_id', uid));
      else unwrap(await supabase.from('document_stars').insert({ document_id: id }));
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: docKeys.doc(v.id) });
      qc.invalidateQueries({ queryKey: docKeys.starred });
    },
  });
}

export async function reportDocument(id: string, reason: string) {
  unwrap(await supabase.from('document_reports').insert({ document_id: id, reason }));
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
      const uid = await currentUserId();
      const path = await uploadLocalFile({
        bucket: BUCKET_DOCS,
        folder: uid,
        uri: p.file.uri,
        fileName: p.file.name,
        contentType: p.file.mimeType ?? undefined,
      });
      return unwrap(
        await supabase
          .from('documents')
          .insert({
            subject_id: p.subjectId,
            title: p.title.trim(),
            doc_type: p.docType,
            academic_year: p.academicYear || null,
            file_path: path,
            file_name: p.file.name,
            file_ext: extOf(p.file.name) || 'pdf',
            size_bytes: p.file.size ?? null,
            drive_url: p.driveUrl || null,
          })
          .select('id')
          .single(),
      ) as { id: string };
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

/** Flat list of every subject with its full path – used by the upload form pickers. */
export function useFolderTree() {
  return useQuery({
    queryKey: ['folderTree'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () =>
      unwrap(
        await supabase.from('levels').select('id, code, name, short_name, sort, periods(id, name, sort, subjects(id, name))').order('sort'),
      ) as {
        id: number;
        code: string;
        name: string;
        short_name: string;
        periods: { id: string; name: string; sort: number; subjects: { id: string; name: string }[] }[];
      }[],
  });
}
