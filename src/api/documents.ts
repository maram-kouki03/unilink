import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_URL, formFile, getToken } from '@/lib/api';
import { DocType, DocumentRow, LevelWithStats, Period, RejectReason, ReportReason, Role, Subject, Track } from '@/types/db';

export const docKeys = {
  levels: ['levels'] as const,
  level: (id: number) => ['level', id] as const,
  periods: (levelId: number) => ['periods', levelId] as const,
  tracks: (levelId: number) => ['tracks', levelId] as const,
  period: (id: string) => ['period', id] as const,
  subjects: (periodId: string) => ['subjects', periodId] as const,
  subject: (id: string) => ['subject', id] as const,
  myClass: ['myClass'] as const,
  docs: (subjectId: string, type: string, year: string, sort: string) => ['docs', subjectId, type, year, sort] as const,
  doc: (id: string) => ['doc', id] as const,
  children: (id: string) => ['docChildren', id] as const,
  search: (q: string, type: string, subject: string, year: string) => ['docSearch', q, type, subject, year] as const,
  recent: ['docsRecent'] as const,
  starred: ['docsStarred'] as const,
  contributions: ['docsMine'] as const,
  topContributors: ['topContributors'] as const,
  modQueue: (level: string, subject: string) => ['modQueue', level, subject] as const,
  modReports: (status: string) => ['modReports', status] as const,
  modUsers: (q: string) => ['modUsers', q] as const,
  modStats: ['modStats'] as const,
};

type LevelRef = { id: number; name: string; short_name: string };
export type SubjectDetail = Subject & { period: { id: string; name: string; level: LevelRef } };
export type DocumentDetail = DocumentRow & { level_id: number; corrections: DocumentRow[] };

/* ───────────── Browse ───────────── */

export function useLevels() {
  return useQuery({ queryKey: docKeys.levels, queryFn: () => api<LevelWithStats[]>('/levels') });
}

export function useLevel(id: number) {
  return useQuery({ queryKey: docKeys.level(id), queryFn: () => api<LevelWithStats>(`/levels/${id}`) });
}

export function usePeriods(levelId: number) {
  return useQuery({ queryKey: docKeys.periods(levelId), queryFn: () => api<Period[]>(`/levels/${levelId}/periods`) });
}

export function useTracks(levelId: number | null | undefined) {
  return useQuery({
    queryKey: docKeys.tracks(levelId ?? -1),
    enabled: levelId != null,
    queryFn: () => api<Track[]>(`/levels/${levelId}/tracks`),
  });
}

export function usePeriod(id: string) {
  return useQuery({ queryKey: docKeys.period(id), queryFn: () => api<Period & { level: LevelRef }>(`/periods/${id}`) });
}

export function useSubjects(periodId: string) {
  return useQuery({
    queryKey: docKeys.subjects(periodId),
    enabled: !!periodId,
    queryFn: () => api<Subject[]>(`/periods/${periodId}/subjects`),
  });
}

export function useSubject(id: string) {
  return useQuery({ queryKey: docKeys.subject(id), queryFn: () => api<SubjectDetail>(`/subjects/${id}`) });
}

/** Subjects of my level for the current semester (+ my track). */
export function useMyClass() {
  return useQuery({
    queryKey: docKeys.myClass,
    queryFn: () =>
      api<{ level: LevelWithStats | null; period: Period | null; periods: Period[]; track: Track | null; subjects: Subject[] }>('/me/class'),
  });
}

export function useSetMyTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string | null) => api('/me/track', { method: 'PUT', body: { track_id: trackId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docKeys.myClass });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export type DocSort = 'useful' | 'recent';

/** Approved documents of a subject + my own pending/rejected ones (status/mine flags). */
export function useDocuments(subjectId: string, type: DocType | 'all' = 'all', year = '', sort: DocSort = 'recent') {
  return useQuery({
    queryKey: docKeys.docs(subjectId, type, year, sort),
    enabled: !!subjectId,
    queryFn: () =>
      api<DocumentRow[]>(`/subjects/${subjectId}/documents`, {
        query: { type: type === 'all' ? undefined : type, year: year || undefined, sort },
      }),
  });
}

/** Global search (title, subject name/code, file name). */
export function useDocumentSearch(q: string, type: DocType | 'all' = 'all', subject = '', year = '') {
  return useQuery({
    queryKey: docKeys.search(q, type, subject, year),
    enabled: q.trim().length >= 2 || type !== 'all' || !!subject || !!year,
    queryFn: () =>
      api<DocumentRow[]>('/documents/search', {
        query: { q: q.trim(), type: type === 'all' ? undefined : type, subject: subject || undefined, year: year || undefined },
      }),
  });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: docKeys.doc(id), queryFn: () => api<DocumentDetail>(`/documents/${id}`) });
}

/** Files imported from a Drive folder document. */
export function useFolderChildren(id: string) {
  return useQuery({ queryKey: docKeys.children(id), enabled: !!id, queryFn: () => api<DocumentRow[]>(`/documents/${id}/children`) });
}

export function useRecentDocuments() {
  return useQuery({ queryKey: docKeys.recent, queryFn: () => api<(DocumentRow & { opened_at: string })[]>('/documents/recent') });
}

export function useStarredDocuments() {
  return useQuery({ queryKey: docKeys.starred, queryFn: () => api<DocumentRow[]>('/documents/starred') });
}

/** Everything I contributed, with status and reject_reason. */
export function useMyContributions() {
  return useQuery({ queryKey: docKeys.contributions, queryFn: () => api<DocumentRow[]>('/me/contributions') });
}

/** @deprecated use useMyContributions */
export const useMyDocuments = useMyContributions;

export type TopContributor = {
  id: string;
  full_name: string;
  level: string | null;
  avatar_url: string | null;
  trusted: boolean;
  role: Role;
  approved_count: number;
  useful_total: number;
};

export function useTopContributors() {
  return useQuery({ queryKey: docKeys.topContributors, queryFn: () => api<TopContributor[]>('/contributors/top') });
}

/** Levels → periods → subjects (+ tracks) – used by the contribution form pickers. */
export type TreeSubject = {
  id: string;
  name: string;
  code: string | null;
  track_id: string | null;
  color: string | null;
  drive_folder_id: string | null;
  drive_synced_at: string | null;
};
export type TreePeriod = {
  id: string;
  name: string;
  sort: number;
  label: string;
  months: string | null;
  start_month: number | null;
  end_month: number | null;
  subjects: TreeSubject[];
};

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
          sort: number;
          periods: TreePeriod[];
          tracks: { id: string; name: string; code: string | null; sort: number }[];
        }[]
      >('/folder-tree'),
  });
}

/* ───────────── Open / download ───────────── */

export type DocLink = { url: string; expiresIn: number | null; source: DocumentRow['source'] };

/** Link to open the document (counts an open): signed link valid 1 hour, or the Drive page. */
export async function openDocument(documentId: string) {
  return api<DocLink>(`/documents/${documentId}/open`, { method: 'POST' });
}

/** @deprecated use openDocument (it returns the link and counts the open). */
export async function recordOpen(documentId: string) {
  await openDocument(documentId);
}

/** Same link, without counting. download=true → the file is saved instead of opened. */
export async function documentLink(id: string, download = false) {
  return api<DocLink>(`/documents/${id}/link`, { query: { download: download ? 1 : undefined } });
}

/** URL + headers for FileSystem.downloadAsync (the server counts the download; Drive files are streamed, Google Docs as PDF). */
export function documentDownloadRequest(id: string) {
  const token = getToken();
  return { url: `${API_URL}/documents/${id}/download`, headers: token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>) };
}

/* ───────────── Star / useful / report / delete ───────────── */

const invalidateLists = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['docs'] });
  qc.invalidateQueries({ queryKey: ['docSearch'] });
  qc.invalidateQueries({ queryKey: docKeys.contributions });
  qc.invalidateQueries({ queryKey: docKeys.levels });
  qc.invalidateQueries({ queryKey: ['periods'] });
  qc.invalidateQueries({ queryKey: ['subjects'] });
  qc.invalidateQueries({ queryKey: docKeys.myClass });
  qc.invalidateQueries({ queryKey: ['profileStats'] });
};

export function useToggleStar() {
  const qc = useQueryClient();
  return useMutation({
    // The server toggles; `starred` is kept so the screens don't change.
    mutationFn: async ({ id }: { id: string; starred: boolean }) => api<{ starred: boolean }>(`/documents/${id}/star`, { method: 'POST' }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: docKeys.doc(v.id) });
      qc.invalidateQueries({ queryKey: docKeys.starred });
      qc.invalidateQueries({ queryKey: ['docs'] });
    },
  });
}

export function useToggleUseful() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ voted: boolean; useful_count: number }>(`/documents/${id}/useful`, { method: 'POST' }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: docKeys.doc(id) });
      qc.invalidateQueries({ queryKey: ['docs'] });
    },
  });
}

export async function reportDocument(id: string, reason: ReportReason = 'other', comment?: string) {
  return api<{ ok: boolean; alreadyReported: boolean; reportCount: number }>(`/documents/${id}/report`, {
    body: { reason, comment: comment?.trim() || undefined },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateLists(qc),
  });
}

/* ───────────── Contribute ───────────── */

export type ContributionFields = {
  subjectId: string;
  type: DocType;
  number?: number | null;
  /** 'YYYY/YY' */
  academicYear?: string | null;
  correctionOfId?: string | null;
};

const fieldsBody = (p: ContributionFields) => ({
  subject_id: p.subjectId,
  type: p.type,
  number: p.number ?? undefined,
  academic_year: p.academicYear || undefined,
  correction_of_id: p.correctionOfId || undefined,
});

export type PickedFile = { uri: string; name: string; size?: number | null; mimeType?: string | null };

/** 409 errors carry data.duplicateOf (id of the document already in the library). */
export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: ContributionFields & { file: PickedFile }) => {
      const form = new FormData();
      form.append('file', formFile(p.file.uri, p.file.name, p.file.mimeType));
      for (const [k, v] of Object.entries(fieldsBody(p))) if (v !== undefined && v !== null) form.append(k, String(v));
      return api<DocumentRow>('/documents', { body: form });
    },
    onSuccess: () => invalidateLists(qc),
  });
}

export function useAddDriveFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: ContributionFields & { url: string }) => api<DocumentRow>('/documents/drive-file', { body: { url: p.url.trim(), ...fieldsBody(p) } }),
    onSuccess: () => invalidateLists(qc),
  });
}

/** The folder must be shared as "Anyone with the link". Its files are imported once approved. */
export function useAddDriveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Omit<ContributionFields, 'correctionOfId'> & { url: string }) =>
      api<DocumentRow>('/documents/drive-folder', { body: { url: p.url.trim(), ...fieldsBody(p) } }),
    onSuccess: () => invalidateLists(qc),
  });
}

/** New version of my document: a file, or a Drive file link. */
export function useNewVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; file?: PickedFile; url?: string }) => {
      if (p.file) {
        const form = new FormData();
        form.append('file', formFile(p.file.uri, p.file.name, p.file.mimeType));
        return api<DocumentRow>(`/documents/${p.id}/new-version`, { body: form });
      }
      return api<DocumentRow>(`/documents/${p.id}/new-version`, { body: { url: p.url?.trim() ?? '' } });
    },
    onSuccess: (_d, v) => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: docKeys.doc(v.id) });
    },
  });
}

/* ───────────── Moderation (moderators: their levels, admin: all) ───────────── */

export type QueueItem = Omit<DocumentRow, 'mine' | 'starred' | 'voted_useful' | 'uploader'> & {
  previous_version_id: string | null;
  preview_url: string | null;
  preview_expires_in: number | null;
  uploader: { id: string; full_name: string; email: string; level: string | null; trusted: boolean; approved_count: number; rejected_count: number } | null;
};

export function useModQueue(level = '', subject = '') {
  return useQuery({
    queryKey: docKeys.modQueue(level, subject),
    queryFn: () => api<QueueItem[]>('/mod/queue', { query: { level: level || undefined, subject: subject || undefined } }),
  });
}

export type ModReport = {
  id: string;
  reason: ReportReason;
  comment: string | null;
  status: 'open' | 'resolved';
  action: 'dismiss' | 'hide_document' | 'delete_document' | null;
  created_at: string;
  resolved_at: string | null;
  reporter: { id: string; full_name: string; email: string };
  document: {
    id: string;
    title: string;
    status: DocumentRow['status'];
    source: DocumentRow['source'];
    type: DocType;
    report_count: number;
    hidden_reason: string | null;
    subject: { id: string; name: string };
    level: { id: number; short_name: string };
    uploader: { id: string; full_name: string; email: string } | null;
  };
};

export function useModReports(status: 'open' | 'resolved' | 'all' = 'open') {
  return useQuery({ queryKey: docKeys.modReports(status), queryFn: () => api<ModReport[]>('/mod/reports', { query: { status } }) });
}

export type ModUser = {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  level: string | null;
  role: Role;
  trusted: boolean;
  trusted_locked: boolean;
  avatar_url: string | null;
  suspended: boolean;
  banned_at: string | null;
  moderated_level_ids: number[];
  approved_count: number;
  pending_count: number;
  rejected_count: number;
};

export function useModUsers(q: string) {
  return useQuery({ queryKey: docKeys.modUsers(q), queryFn: () => api<ModUser[]>('/mod/users', { query: { q: q.trim() } }) });
}

export type ModStats = {
  pending: number;
  approved_this_week: number;
  open_reports: number;
  hidden: number;
  top_contributors: { id: string; full_name: string; level: string | null; trusted: boolean; approved_count: number }[];
  empty_subjects: { id: string; name: string; code: string | null; period: string; level: string }[];
};

export function useModStats(enabled = true) {
  return useQuery({ queryKey: docKeys.modStats, enabled, queryFn: () => api<ModStats>('/mod/stats') });
}

export type ModAction =
  | { kind: 'approve'; id: string; edits?: { title?: string; subject_id?: string; type?: DocType; number?: number | null; academic_year?: string | null } }
  | { kind: 'reject'; id: string; reason: RejectReason; note?: string }
  | { kind: 'mark-duplicate'; id: string; duplicateOf: string }
  | { kind: 'hide'; id: string; note?: string }
  | { kind: 'restore'; id: string };

const actionBody = (a: ModAction): Record<string, unknown> => {
  switch (a.kind) {
    case 'approve':
      return a.edits ?? {};
    case 'reject':
      return { reason: a.reason, note: a.note };
    case 'mark-duplicate':
      return { duplicateOf: a.duplicateOf };
    case 'hide':
      return { note: a.note };
    default:
      return {};
  }
};

const invalidateMod = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['modQueue'] });
  qc.invalidateQueries({ queryKey: ['modReports'] });
  qc.invalidateQueries({ queryKey: ['modUsers'] });
  qc.invalidateQueries({ queryKey: docKeys.modStats });
  invalidateLists(qc);
};

export function useModerateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: ModAction) => api<{ ok: boolean; id: string; status: string }>(`/mod/documents/${a.id}/${a.kind}`, { body: actionBody(a) }),
    onSuccess: (_d, a) => {
      invalidateMod(qc);
      qc.invalidateQueries({ queryKey: docKeys.doc(a.id) });
    },
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; action: 'dismiss' | 'hide_document' | 'delete_document' }) =>
      api(`/mod/reports/${p.id}/resolve`, { body: { action: p.action } }),
    onSuccess: () => invalidateMod(qc),
  });
}

export type UserAction =
  | { kind: 'trust' | 'untrust' | 'demote' | 'unsuspend'; id: string }
  | { kind: 'promote-moderator'; id: string; levelIds: number[] }
  | { kind: 'suspend'; id: string; reason?: string };

export function useModerateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: UserAction) =>
      api(`/mod/users/${a.id}/${a.kind}`, {
        body: a.kind === 'promote-moderator' ? { levelIds: a.levelIds } : a.kind === 'suspend' ? { reason: a.reason } : {},
      }),
    onSuccess: () => invalidateMod(qc),
  });
}

export type DriveSyncResult = { folders: number; added: number; updated: number; hidden: number; restored: number; errors: string[] };

export function useDriveSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subjectId?: string) => api<DriveSyncResult | { started: number }>('/mod/drive-sync', { body: { subjectId } }),
    onSuccess: () => invalidateLists(qc),
  });
}

/* ───────────── Admin: academic structure ───────────── */

export type StructureKind = 'levels' | 'periods' | 'tracks' | 'subjects';

const invalidateStructure = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['folderTree'] });
  qc.invalidateQueries({ queryKey: ['tracks'] });
  qc.invalidateQueries({ queryKey: ['level'] });
  qc.invalidateQueries({ queryKey: ['subject'] });
  qc.invalidateQueries({ queryKey: docKeys.modStats });
  invalidateLists(qc);
};

/** Create (no id) or update (id) a level, period, track or subject. */
export function useSaveStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { kind: StructureKind; id?: string | number; body: Record<string, unknown> }) =>
      p.id != null
        ? api(`/admin/${p.kind}/${p.id}`, { method: 'PATCH', body: p.body })
        : api(`/admin/${p.kind}`, { method: 'POST', body: p.body }),
    onSuccess: () => invalidateStructure(qc),
  });
}

export function useDeleteStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { kind: StructureKind; id: string | number }) => api(`/admin/${p.kind}/${p.id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateStructure(qc),
  });
}
