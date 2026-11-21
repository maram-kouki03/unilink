import { z } from 'zod';
import { Db, one, pool, query } from './db';
import { signedDocumentUrl, type ResourceType } from './files';
import { forbidden, HttpError, notFound } from './http';
import { notify } from './notify';
import * as sql from './sql/documents';

/* ───────────── Roles ───────────── */

export type Role = 'student' | 'moderator' | 'admin';
export type Staff = { userId: string; role: Role; trusted: boolean; levelIds: number[] };

export async function getStaff(userId: string, db: Db = pool): Promise<Staff> {
  const row = await one<{ role: Role; trusted: boolean; level_ids: number[] }>(sql.STAFF_OF, [userId], db);
  if (!row) throw notFound('Profile not found');
  return { userId, role: row.role, trusted: row.trusted, levelIds: row.level_ids ?? [] };
}

export const isStaff = (s: Staff) => s.role === 'admin' || s.role === 'moderator';

/** Admin: every level. Moderator: only the levels assigned to them. */
export const canModerate = (s: Staff, levelId: number) =>
  s.role === 'admin' || (s.role === 'moderator' && s.levelIds.includes(Number(levelId)));

/** Levels a staff member may act on (null = all). */
export const scopeOf = (s: Staff): number[] | null => (s.role === 'admin' ? null : s.levelIds);

export function assertCanModerate(s: Staff, levelId: number) {
  if (!canModerate(s, levelId)) throw forbidden('You do not moderate this level');
}

/** New contributions of trusted students, moderators and admins are published right away. */
export const autoApproves = (s: Staff) => s.trusted || isStaff(s);

/* ───────────── Fields shared by every contribution ───────────── */

export const TYPE_LABEL: Record<sql.DocType, string> = {
  course: 'Cours',
  td: 'TD',
  tp: 'TP',
  exam: 'Examen',
  correction: 'Corrigé',
  other: 'Document',
};

export const REJECT_LABEL: Record<(typeof sql.REJECT_REASONS)[number], string> = {
  duplicate: 'already in the library (duplicate)',
  unreadable: 'unreadable file',
  wrong_subject: 'wrong subject',
  copyrighted: 'copyrighted content',
  other: 'does not follow the rules',
};

/** 'YYYY/YY' where YY is the next year, e.g. 2025/26. */
export const academicYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}\/\d{2}$/, 'use the format 2025/26')
  .refine((v) => {
    const start = Number(v.slice(0, 4));
    return (start + 1) % 100 === Number(v.slice(5)) && start >= 1990 && start <= 2100;
  }, 'the second year must follow the first (e.g. 2025/26)');

/** Current academic year: it starts in September. */
export function currentAcademicYear(now = new Date()): string {
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Multipart fields arrive as strings: '' → undefined. */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const contributionFields = z.object({
  subject_id: z.guid('choose a subject'),
  type: z.enum(sql.DOC_TYPES, 'choose a type: course, td, tp, exam, correction or other'),
  number: z.preprocess(blank, z.coerce.number().int().min(0).max(999).nullable().optional()),
  academic_year: z.preprocess(blank, academicYearSchema.nullable().optional()),
  correction_of_id: z.preprocess(blank, z.guid('invalid id').nullable().optional()),
});
export type ContributionFields = z.infer<typeof contributionFields>;

const clampTitle = (t: string) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > 140 ? `${s.slice(0, 139)}…` : s.padEnd(3, '.');
};

/** "TD3 – Réseaux – 2025/26", "Examen – Réseaux – 2024/25", "Cours 2 – Réseaux". */
export function buildTitle(type: sql.DocType, number: number | null | undefined, subjectName: string, year: string | null | undefined) {
  const label = TYPE_LABEL[type];
  const head = number == null ? label : type === 'td' || type === 'tp' ? `${label}${number}` : `${label} ${number}`;
  return clampTitle([head, subjectName, year].filter(Boolean).join(' – '));
}

/** File imported from a Drive folder: its own name (without extension) + the subject. */
export function childTitle(fileName: string, subjectName: string) {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || fileName;
  return clampTitle(`${base} – ${subjectName}`);
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Type from a file name or the sub-folders it is in (the file name wins). */
export function guessType(name: string, path: string[] = []): sql.DocType | null {
  for (const part of [name, ...[...path].reverse()]) {
    const s = strip(part);
    if (/\b(corrige|correction|corr|solution)s?\b/.test(s)) return 'correction';
    if (/\b(exam|examen|ds|devoir|controle|partiel|rattrapage)s?\b/.test(s)) return 'exam';
    if (/\btps?\b|\btp[\s_-]?\d/.test(s)) return 'tp';
    if (/\btds?\b|\btd[\s_-]?\d/.test(s)) return 'td';
    if (/\b(cours|course|chapitre|chap|lecture|slides?)\b/.test(s)) return 'course';
  }
  return null;
}

/** Number in a name: "TD3", "TP 2", "chapitre_4". */
export function guessNumber(name: string): number | null {
  const m = /\b(?:td|tp|ds|chap(?:itre)?|cours|serie|s[eé]rie)[\s_-]*(\d{1,3})\b/i.exec(strip(name));
  return m ? Number(m[1]) : null;
}

export const extFromName = (name: string | null | undefined) => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name ?? '');
  return m ? m[1].toLowerCase() : null;
};

/* ───────────── Insert / update ───────────── */

const INSERTABLE = [
  'subject_id', 'title', 'type', 'number', 'academic_year', 'source', 'status', 'uploader_id',
  'cloudinary_public_id', 'storage_resource_type', 'storage_format', 'file_name', 'file_ext', 'size_bytes', 'mime_type',
  'sha256', 'drive_file_id', 'drive_url', 'drive_modified_at', 'parent_folder_doc_id', 'correction_of_id', 'version',
  'reviewed_by', 'reviewed_at',
] as const;
type DocInsert = Partial<Record<(typeof INSERTABLE)[number], unknown>>;

export async function insertDocument(fields: DocInsert, db: Db = pool): Promise<{ id: string; status: sql.DocStatus }> {
  const cols = INSERTABLE.filter((c) => fields[c] !== undefined);
  const params = cols.map((c) => fields[c]);
  const row = await one<{ id: string; status: sql.DocStatus }>(
    `insert into public.documents (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id, status`,
    params,
    db,
  );
  return row!;
}

const UPDATABLE = ['title', 'subject_id', 'type', 'number', 'academic_year', 'replaced_by_id'] as const;
type DocUpdate = Partial<Record<(typeof UPDATABLE)[number], unknown>>;

export async function updateDocument(id: string, fields: DocUpdate, db: Db = pool) {
  const cols = UPDATABLE.filter((c) => fields[c] !== undefined);
  if (!cols.length) return;
  await query(
    `update public.documents set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1`,
    [id, ...cols.map((c) => fields[c])],
    db,
  );
}

/* ───────────── Documents: loading + visibility ───────────── */

export type DocInternal = {
  id: string;
  subject_id: string;
  title: string;
  type: sql.DocType;
  number: number | null;
  academic_year: string | null;
  source: sql.DocSource;
  status: sql.DocStatus;
  uploader_id: string | null;
  cloudinary_public_id: string | null;
  storage_resource_type: ResourceType | null;
  storage_format: string | null;
  file_name: string | null;
  file_ext: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  drive_file_id: string | null;
  drive_url: string | null;
  parent_folder_doc_id: string | null;
  correction_of_id: string | null;
  version: number;
  replaced_by_id: string | null;
  replaced_by_status: sql.DocStatus | null;
  hidden_reason: string | null;
  sha256: string | null;
  subject_name: string;
  level_id: number;
};

export async function loadDoc(id: string, db: Db = pool): Promise<DocInternal> {
  const doc = await one<DocInternal>(sql.DOC_INTERNAL, [id], db);
  if (!doc) throw notFound('Document not found');
  return doc;
}

/** Approved documents: everyone. Others: the uploader and the moderators of the level. */
export const canSee = (doc: Pick<DocInternal, 'status' | 'uploader_id' | 'level_id'>, staff: Staff) =>
  doc.status === 'approved' || doc.uploader_id === staff.userId || canModerate(staff, doc.level_id);

export async function visibleDoc(id: string, staff: Staff) {
  const doc = await loadDoc(id);
  if (!canSee(doc, staff)) throw notFound('Document not found');
  return doc;
}

/** Link to open/preview a document: signed Cloudinary link (1 h) or the Drive page. */
export function openLink(doc: Pick<DocInternal, 'source' | 'cloudinary_public_id' | 'storage_resource_type' | 'storage_format' | 'drive_url' | 'drive_file_id'>, download = false) {
  if (doc.source === 'upload') {
    if (!doc.cloudinary_public_id || !doc.storage_resource_type) throw notFound('File not found on the server. Please upload it again.');
    return { url: signedDocumentUrl(doc.cloudinary_public_id, doc.storage_resource_type, doc.storage_format, download), expiresIn: 3600 };
  }
  return { url: doc.drive_url ?? `https://drive.google.com/open?id=${doc.drive_file_id}`, expiresIn: null };
}

/* ───────────── Moderation log + notifications ───────────── */

export async function logModeration(
  e: {
    actor: string | null;
    action: string;
    documentId?: string | null;
    title?: string | null;
    targetUser?: string | null;
    reportId?: string | null;
    details?: Record<string, unknown>;
  },
  db: Db = pool,
) {
  try {
    await query(
      sql.INSERT_LOG,
      [e.documentId ?? null, e.actor, e.action, e.title ?? null, e.targetUser ?? null, e.reportId ?? null, JSON.stringify(e.details ?? {})],
      db,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[moderation_log]', err);
  }
}

/** In-app + push notification to every moderator of the level (admins when the level has none). */
export async function notifyModerators(levelId: number, actor: string | null, title: string, body: string | null, link: string | null) {
  try {
    const mods = await query<{ user_id: string }>(sql.MODERATORS_OF_LEVEL, [levelId]);
    await Promise.all(mods.map((m) => notify({ target: m.user_id, actor, title, body, link })));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify moderators]', err);
  }
}

/** Checks the automatic "trusted" rule after an approval and tells the student. */
export async function autoTrust(userId: string | null) {
  if (!userId) return;
  const row = await one(sql.AUTO_TRUST, [userId]);
  if (row) {
    await notify({
      target: userId,
      actor: null,
      title: '🎉 You are now a trusted contributor',
      body: 'Your next documents are published right away. Thank you!',
      link: '/documents/contributions',
    });
  }
}

/* ───────────── Reports ───────────── */

export type ReportReason = (typeof sql.REPORT_REASONS)[number];

/** Report a document. At AUTO_HIDE_REPORTS open reports it is hidden and the moderators are told. */
export async function createDocumentReport(reporterId: string, documentId: string, reason: ReportReason, comment: string | null) {
  const staff = await getStaff(reporterId);
  const doc = await visibleDoc(documentId, staff);
  if (doc.uploader_id === reporterId) throw new HttpError(400, 'You cannot report your own document');
  if (doc.status !== 'approved') throw new HttpError(400, 'Only published documents can be reported');

  const inserted = await one<{ id: string }>(sql.INSERT_DOC_REPORT, [documentId, reporterId, reason, comment]);
  const counted = await one<{ report_count: number; status: string }>(sql.REFRESH_REPORT_COUNT, [documentId]);
  const count = counted?.report_count ?? 0;

  if (inserted) {
    await notifyModerators(doc.level_id, reporterId, '🚩 Document reported', `${doc.title} (${reason})`, '/mod/reports');
  }
  if (count >= sql.AUTO_HIDE_REPORTS && (await one(sql.AUTO_HIDE, [documentId]))) {
    await logModeration({ actor: null, action: 'auto_hide', documentId, title: doc.title, details: { reports: count } });
    await notifyModerators(doc.level_id, null, '⚠️ Document hidden automatically', `${doc.title}: ${count} reports`, '/mod/reports');
  }
  return { ok: true, id: inserted?.id ?? null, alreadyReported: !inserted, reportCount: count };
}
