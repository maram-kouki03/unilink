import { Router, type Response } from 'express';
import { z } from 'zod';
import { uid } from '../auth';
import { deleteContent } from '../content';
import { one, query, transaction } from '../db';
import {
  assertCanModerate,
  autoTrust,
  buildTitle,
  getStaff,
  isStaff,
  loadDoc,
  logModeration,
  openLink,
  REJECT_LABEL,
  academicYearSchema,
  scopeOf,
  updateDocument,
  type DocInternal,
  type Staff,
} from '../docs';
import { importFolderInBackground, syncSubject, syncSubjectsInBackground } from '../docsync';
import { forbidden, HttpError, likeParam, notFound, parse, uuidParam, bodyOf } from '../http';
import { notify } from '../notify';
import { UNBAN_USER } from '../sql/auth';
import * as sql from '../sql/documents';
import { banUser } from './moderation';

/**
 * Moderation of documents: moderators act on their levels, admins on everything.
 * Every action is written to moderation_log and the uploader is notified.
 */
export const docModRouter = Router();

docModRouter.use('/mod', async (req, res, next) => {
  const staff = await getStaff(uid(req));
  if (!isStaff(staff)) throw forbidden('Only moderators can do this');
  res.locals.staff = staff;
  next();
});

const staffOf = (res: Response) => res.locals.staff as Staff;

const requireAdminStaff = (res: Response) => {
  const s = staffOf(res);
  if (s.role !== 'admin') throw forbidden('Only admins can do this');
  return s;
};

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** The document, if this moderator may act on it. */
async function moderatedDoc(id: unknown, staff: Staff) {
  const doc = await loadDoc(uuidParam(id, 'Document not found'));
  assertCanModerate(staff, doc.level_id);
  return doc;
}

const docLink = (id: string) => `/documents/file/${id}`;

/** Status change + folder children + log + notification to the uploader. */
async function changeStatus(
  doc: DocInternal,
  staff: Staff,
  change: {
    status: sql.DocStatus;
    action: string;
    rejectReason?: string | null;
    rejectNote?: string | null;
    hiddenReason?: string | null;
    notifyTitle: string;
    notifyBody?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await transaction(async (db) => {
    await query(
      sql.SET_STATUS,
      [doc.id, change.status, staff.userId, change.rejectReason ?? null, change.rejectNote ?? null, change.hiddenReason ?? null],
      db,
    );
    if (doc.source === 'drive_folder') {
      if (change.status === 'approved') await query(sql.RESTORE_FOLDER_CHILDREN, [doc.id], db);
      else await query(sql.HIDE_FOLDER_CHILDREN, [doc.id], db);
    }
    await logModeration(
      { actor: staff.userId, action: change.action, documentId: doc.id, title: doc.title, targetUser: doc.uploader_id, details: change.details },
      db,
    );
  });
  await notify({ target: doc.uploader_id, actor: staff.userId, title: change.notifyTitle, body: change.notifyBody ?? doc.title, link: docLink(doc.id) });
}

/* ───────────── Queue ───────────── */

docModRouter.get('/mod/queue', async (req, res) => {
  const staff = staffOf(res);
  const q = parse(
    z.object({
      level: z.preprocess(blank, z.coerce.number().int().min(0).max(32767).optional()),
      subject: z.preprocess(blank, z.guid('invalid id').optional()),
    }),
    req.query,
  );
  const rows = await query<Record<string, any>>(sql.MOD_QUEUE, [scopeOf(staff), q.level ?? null, q.subject?.toLowerCase() ?? null]);
  res.json(
    rows.map(({ cloudinary_public_id, storage_resource_type, storage_format, ...row }) => {
      let preview: { url: string; expiresIn: number | null } | null = null;
      try {
        preview = openLink({ source: row.source, cloudinary_public_id, storage_resource_type, storage_format, drive_url: row.drive_url, drive_file_id: row.drive_file_id });
      } catch {
        preview = null;
      }
      return { ...row, preview_url: preview?.url ?? null, preview_expires_in: preview?.expiresIn ?? null };
    }),
  );
});

/* ───────────── Decisions ───────────── */

const approveBody = z.object({
  title: z.preprocess(blank, z.string().trim().min(3, 'must be at least 3 characters').max(140).optional()),
  subject_id: z.preprocess(blank, z.guid('invalid id').optional()),
  type: z.preprocess(blank, z.enum(sql.DOC_TYPES).optional()),
  number: z.preprocess(blank, z.coerce.number().int().min(0).max(999).nullable().optional()),
  academic_year: z.preprocess(blank, academicYearSchema.nullable().optional()),
});

docModRouter.post('/mod/documents/:id/approve', async (req, res) => {
  const staff = staffOf(res);
  const doc = await moderatedDoc(req.params.id, staff);
  const b = parse(approveBody, bodyOf(req.body));
  if (doc.status === 'approved') throw new HttpError(400, 'This document is already approved');

  let subjectName = doc.subject_name;
  if (b.subject_id && b.subject_id.toLowerCase() !== doc.subject_id) {
    const target = await one<{ id: string; name: string; level_id: number }>(sql.SUBJECT_LEVEL, [b.subject_id.toLowerCase()]);
    if (!target) throw notFound('Subject not found');
    assertCanModerate(staff, target.level_id);
    subjectName = target.name;
  }
  const type = b.type ?? doc.type;
  const number = b.number !== undefined ? b.number : doc.number;
  const year = b.academic_year !== undefined ? b.academic_year : doc.academic_year;
  const metaChanged = b.subject_id !== undefined || b.type !== undefined || b.number !== undefined || b.academic_year !== undefined;
  // Children of a folder keep their own file name as title.
  const title = b.title ?? (metaChanged && !doc.parent_folder_doc_id ? buildTitle(type, number, subjectName, year) : undefined);
  if (b.type && b.type !== 'correction' && doc.correction_of_id) {
    await query(`update public.documents set correction_of_id = null where id = $1`, [doc.id]);
  }

  await updateDocument(doc.id, {
    title,
    subject_id: b.subject_id?.toLowerCase(),
    type: b.type,
    number: b.number,
    academic_year: b.academic_year,
  });
  try {
    await changeStatus(doc, staff, {
      status: 'approved',
      action: 'approve',
      notifyTitle: '✅ Your document was approved',
      notifyBody: title ?? doc.title,
      details: { edits: b },
    });
  } catch (err) {
    // A rejected document whose identical file was published meanwhile.
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'The same file is already published');
    throw err;
  }
  await autoTrust(doc.uploader_id);
  if (doc.source === 'drive_folder') importFolderInBackground(doc.id);
  res.json({ ok: true, id: doc.id, status: 'approved' });
});

const rejectBody = z.object({
  reason: z.enum(sql.REJECT_REASONS, 'choose a reason: duplicate, unreadable, wrong_subject, copyrighted or other'),
  note: z.preprocess(blank, z.string().trim().max(500, 'max 500 characters').nullable().optional()),
});

docModRouter.post('/mod/documents/:id/reject', async (req, res) => {
  const staff = staffOf(res);
  const doc = await moderatedDoc(req.params.id, staff);
  const b = parse(rejectBody, bodyOf(req.body));
  if (doc.status === 'rejected') throw new HttpError(400, 'This document is already rejected');
  await changeStatus(doc, staff, {
    status: 'rejected',
    action: 'reject',
    rejectReason: b.reason,
    rejectNote: b.note ?? null,
    notifyTitle: `❌ Rejected: ${REJECT_LABEL[b.reason]}`,
    notifyBody: b.note ? `${doc.title} – ${b.note}` : doc.title,
    details: { reason: b.reason, note: b.note ?? null },
  });
  res.json({ ok: true, id: doc.id, status: 'rejected' });
});

docModRouter.post('/mod/documents/:id/mark-duplicate', async (req, res) => {
  const staff = staffOf(res);
  const doc = await moderatedDoc(req.params.id, staff);
  const { duplicateOf } = parse(z.object({ duplicateOf: z.guid('invalid id') }), bodyOf(req.body));
  const original = await loadDoc(duplicateOf.toLowerCase()).catch(() => null);
  if (!original || original.id === doc.id) throw new HttpError(400, 'duplicateOf: choose another existing document');
  await changeStatus(doc, staff, {
    status: 'rejected',
    action: 'mark_duplicate',
    rejectReason: 'duplicate',
    rejectNote: `Duplicate of "${original.title}"`.slice(0, 500),
    notifyTitle: `❌ Rejected: ${REJECT_LABEL.duplicate}`,
    notifyBody: `${doc.title} – already available as "${original.title}"`,
    details: { duplicateOf: original.id },
  });
  res.json({ ok: true, id: doc.id, status: 'rejected', duplicateOf: original.id });
});

docModRouter.post('/mod/documents/:id/hide', async (req, res) => {
  const staff = staffOf(res);
  const doc = await moderatedDoc(req.params.id, staff);
  const { note } = parse(z.object({ note: z.preprocess(blank, z.string().trim().max(500).optional()) }), bodyOf(req.body));
  if (doc.status === 'hidden') throw new HttpError(400, 'This document is already hidden');
  await changeStatus(doc, staff, {
    status: 'hidden',
    action: 'hide',
    hiddenReason: 'moderator',
    rejectNote: note ?? null,
    notifyTitle: '🙈 Your document was hidden by a moderator',
    notifyBody: note ? `${doc.title} – ${note}` : doc.title,
    details: { note: note ?? null },
  });
  res.json({ ok: true, id: doc.id, status: 'hidden' });
});

docModRouter.post('/mod/documents/:id/restore', async (req, res) => {
  const staff = staffOf(res);
  const doc = await moderatedDoc(req.params.id, staff);
  if (doc.status !== 'hidden' && doc.status !== 'rejected') throw new HttpError(400, 'Only hidden or rejected documents can be restored');
  try {
    await changeStatus(doc, staff, { status: 'approved', action: 'restore', notifyTitle: '✅ Your document is visible again' });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'The same file is already published');
    throw err;
  }
  await query(sql.RESOLVE_DOC_REPORTS, [doc.id, 'dismiss', staff.userId]);
  await query(sql.REFRESH_REPORT_COUNT, [doc.id]);
  await autoTrust(doc.uploader_id);
  res.json({ ok: true, id: doc.id, status: 'approved' });
});

/* ───────────── Reports ───────────── */

docModRouter.get('/mod/reports', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['open', 'resolved', 'all']).default('open') }), req.query);
  res.json(await query(sql.LIST_DOC_REPORTS, [scopeOf(staffOf(res)), status === 'all' ? null : status]));
});

docModRouter.post('/mod/reports/:id/resolve', async (req, res) => {
  const staff = staffOf(res);
  const reportId = uuidParam(req.params.id, 'Report not found');
  const { action } = parse(z.object({ action: z.enum(['dismiss', 'hide_document', 'delete_document']) }), bodyOf(req.body));
  const report = await one<{ id: string; document_id: string; status: string }>(sql.DOC_REPORT_BY_ID, [reportId]);
  if (!report) throw notFound('Report not found');
  const doc = await moderatedDoc(report.document_id, staff);

  if (action === 'delete_document') {
    await logModeration({ actor: staff.userId, action: 'delete', documentId: doc.id, title: doc.title, targetUser: doc.uploader_id, reportId });
    await deleteContent('document', doc.id, staff.userId);
    await notify({ target: doc.uploader_id, actor: staff.userId, title: '🗑️ Your document was removed after reports', body: doc.title, link: '/documents/contributions' });
    res.json({ ok: true, action });
    return;
  }

  const resolved = await query(sql.RESOLVE_DOC_REPORTS, [doc.id, action, staff.userId]);
  await query(sql.REFRESH_REPORT_COUNT, [doc.id]);
  if (action === 'dismiss') {
    // Hidden only because of the reports → visible again.
    if (doc.status === 'hidden' && doc.hidden_reason === 'reports') {
      await changeStatus(doc, staff, { status: 'approved', action: 'restore', notifyTitle: '✅ Your document is visible again', details: { reportId } });
    } else {
      await logModeration({ actor: staff.userId, action: 'dismiss_reports', documentId: doc.id, title: doc.title, reportId, details: { closed: resolved.length } });
    }
  } else if (doc.status !== 'hidden' || doc.hidden_reason !== 'moderator') {
    await changeStatus(doc, staff, {
      status: 'hidden',
      action: 'hide',
      hiddenReason: 'moderator',
      notifyTitle: '🙈 Your document was hidden after reports',
      details: { reportId },
    });
  }
  res.json({ ok: true, action, closedReports: resolved.length });
});

/* ───────────── Users ───────────── */

docModRouter.get('/mod/users', async (req, res) => {
  res.json(await query(sql.MOD_USERS, [likeParam(req.query.q)]));
});

async function targetUser(id: unknown) {
  const userId = uuidParam(id, 'User not found');
  const row = await one<{ role: string; banned_at: Date | null }>(sql.USER_ROLE, [userId]);
  if (!row) throw notFound('User not found');
  return { userId, ...row };
}

for (const trusted of [true, false]) {
  docModRouter.post(`/mod/users/:id/${trusted ? 'trust' : 'untrust'}`, async (req, res) => {
    const staff = staffOf(res);
    const target = await targetUser(req.params.id);
    if (target.role === 'admin' && staff.role !== 'admin') throw forbidden('Only admins can change an admin');
    const row = await one(sql.SET_TRUSTED, [target.userId, trusted]);
    await logModeration({ actor: staff.userId, action: trusted ? 'trust' : 'untrust', targetUser: target.userId });
    if (trusted) {
      await notify({
        target: target.userId,
        actor: staff.userId,
        title: '🎉 You are now a trusted contributor',
        body: 'Your next documents are published right away.',
        link: '/documents/contributions',
      });
    }
    res.json(row);
  });
}

docModRouter.post('/mod/users/:id/promote-moderator', async (req, res) => {
  const staff = requireAdminStaff(res);
  const target = await targetUser(req.params.id);
  const { levelIds } = parse(
    z.object({ levelIds: z.array(z.coerce.number().int().min(0).max(32767)).min(1, 'choose at least one level').max(50) }),
    bodyOf(req.body),
  );
  if (target.role === 'admin') throw new HttpError(400, 'An admin already moderates every level');
  if (target.banned_at) throw new HttpError(400, 'This account is suspended');
  const ids = [...new Set(levelIds)];
  const existing = await query<{ id: number }>(sql.EXISTING_LEVEL_IDS, [ids]);
  if (existing.length !== ids.length) throw new HttpError(400, 'levelIds: unknown level');
  await transaction(async (db) => {
    await query(sql.SET_ROLE, [target.userId, 'moderator'], db);
    await query(sql.CLEAR_MOD_LEVELS, [target.userId], db);
    await query(sql.ADD_MOD_LEVELS, [target.userId, ids], db);
    await logModeration({ actor: staff.userId, action: 'promote_moderator', targetUser: target.userId, details: { levelIds: ids } }, db);
  });
  await notify({ target: target.userId, actor: staff.userId, title: '🛡️ You are now a moderator', body: 'You can review documents of your levels.', link: '/mod/queue' });
  res.json({ ok: true, id: target.userId, role: 'moderator', levelIds: ids });
});

docModRouter.post('/mod/users/:id/demote', async (req, res) => {
  const staff = requireAdminStaff(res);
  const target = await targetUser(req.params.id);
  if (target.role !== 'moderator') throw new HttpError(400, 'This user is not a moderator');
  await transaction(async (db) => {
    await query(sql.SET_ROLE, [target.userId, 'student'], db);
    await query(sql.CLEAR_MOD_LEVELS, [target.userId], db);
    await logModeration({ actor: staff.userId, action: 'demote', targetUser: target.userId }, db);
  });
  res.json({ ok: true, id: target.userId, role: 'student' });
});

docModRouter.post('/mod/users/:id/suspend', async (req, res) => {
  const staff = requireAdminStaff(res);
  const target = await targetUser(req.params.id);
  const { reason } = parse(z.object({ reason: z.preprocess(blank, z.string().trim().max(500).optional()) }), bodyOf(req.body));
  const row = await banUser(target.userId, staff.userId, reason ?? null);
  await logModeration({ actor: staff.userId, action: 'suspend', targetUser: target.userId, details: { reason: reason ?? null } });
  res.json(row);
});

docModRouter.post('/mod/users/:id/unsuspend', async (req, res) => {
  const staff = requireAdminStaff(res);
  const target = await targetUser(req.params.id);
  const row = await one(UNBAN_USER, [target.userId]);
  await logModeration({ actor: staff.userId, action: 'unsuspend', targetUser: target.userId });
  res.json(row);
});

/* ───────────── Stats + Drive sync ───────────── */

docModRouter.get('/mod/stats', async (_req, res) => {
  res.json(await one(sql.MOD_STATS, [scopeOf(staffOf(res))]));
});

docModRouter.get('/mod/log', async (req, res) => {
  requireAdminStaff(res);
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
  res.json(
    await query(
      `select m.*, json_build_object('id', a.id, 'full_name', a.full_name) as actor
         from public.moderation_log m left join public.profiles a on a.id = m.actor_id
        order by m.created_at desc limit $1`,
      [limit],
    ),
  );
});

/** { subjectId } → sync now and return the result. Nothing → every subject of my levels, in the background. */
docModRouter.post('/mod/drive-sync', async (req, res) => {
  const staff = staffOf(res);
  const { subjectId } = parse(z.object({ subjectId: z.preprocess(blank, z.guid('invalid id').optional()) }), bodyOf(req.body));
  if (subjectId) {
    const subject = await one<{ level_id: number }>(sql.SUBJECT_LEVEL, [subjectId.toLowerCase()]);
    if (!subject) throw notFound('Subject not found');
    assertCanModerate(staff, subject.level_id);
    const result = await syncSubject(subjectId.toLowerCase());
    await logModeration({ actor: staff.userId, action: 'drive_sync', details: { subjectId, ...result } });
    res.json(result);
    return;
  }
  const subjects = await query<{ id: string }>(sql.SUBJECTS_TO_SYNC, [scopeOf(staff)]);
  syncSubjectsInBackground(subjects.map((s) => s.id));
  await logModeration({ actor: staff.userId, action: 'drive_sync', details: { subjects: subjects.length } });
  res.status(202).json({ started: subjects.length });
});
