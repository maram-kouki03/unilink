import { Readable } from 'node:stream';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { uid } from '../auth';
import { deleteContent } from '../content';
import { one, query } from '../db';
import {
  autoApproves,
  buildTitle,
  canModerate,
  contributionFields,
  createDocumentReport,
  extFromName,
  getStaff,
  insertDocument,
  loadDoc,
  logModeration,
  notifyModerators,
  openLink,
  updateDocument,
  visibleDoc,
  type ContributionFields,
  type DocInternal,
  type Staff,
} from '../docs';
import { importFolderInBackground, maybeSyncSubject } from '../docsync';
import { driveDownload, driveFileUrl, driveFolderUrl, driveMeta, isFolderMime, isGoogleDoc, parseDriveId } from '../drive';
import { extOf, originalName, removeDocument, sha256Of, storeDocument, uploadDocument, type StoredDocument } from '../files';
import { bodyOf, forbidden, HttpError, likeParam, notFound, parse, uuidParam } from '../http';
import * as sql from '../sql/documents';

/** Every route here requires a signed-in user (requireAuth is applied in index.ts). */
export const documentsRouter = Router();

/* ───────────── helpers ───────────── */

const levelIdSchema = z.coerce.number().int().min(0).max(32767);
const levelIdParam = (v: unknown) => {
  const res = levelIdSchema.safeParse(v);
  if (!res.success) throw notFound('Level not found');
  return res.data;
};

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const listQuery = z.object({
  type: z.preprocess((v) => (v === 'all' ? undefined : blank(v)), z.enum(sql.DOC_TYPES).optional()),
  year: z.preprocess(blank, z.string().trim().regex(/^\d{4}\/\d{2}$/, 'use the format 2025/26').optional()),
  sort: z.preprocess(blank, z.enum(['useful', 'recent']).default('recent')),
});

/** 20 contributions per hour and per user (uploads, Drive links, new versions). */
const contributionLimit: RequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `contrib:${req.userId ?? 'anonymous'}`,
  message: { error: 'You can add 20 documents per hour. Please try again later.' },
});

const subjectOf = async (id: string) => {
  const s = await one<{ id: string; name: string; level_id: number }>(sql.SUBJECT_LEVEL, [id]);
  if (!s) throw notFound('Subject not found');
  return s;
};

/** correction_of_id must be an exam of the same subject that I can see. Only for type "correction". */
async function checkCorrectionOf(fields: ContributionFields, staff: Staff) {
  if (!fields.correction_of_id) return null;
  if (fields.type !== 'correction') throw new HttpError(400, 'correction_of_id: only a correction can be linked to an exam');
  const exam = await loadDoc(fields.correction_of_id.toLowerCase()).catch(() => null);
  if (!exam || (exam.status !== 'approved' && exam.uploader_id !== staff.userId)) throw new HttpError(400, 'correction_of_id: exam not found');
  if (exam.type !== 'exam') throw new HttpError(400, 'correction_of_id: this document is not an exam');
  if (exam.subject_id !== fields.subject_id.toLowerCase()) throw new HttpError(400, 'correction_of_id: the exam is from another subject');
  return exam.id;
}

const duplicate = (dup: { id: string; title: string }) =>
  new HttpError(409, `This document is already in the library: "${dup.title}"`, { duplicateOf: dup.id });

/** Status + reviewer for a new contribution. */
const initialStatus = (staff: Staff) =>
  autoApproves(staff)
    ? { status: 'approved' as const, reviewed_by: staff.userId, reviewed_at: new Date() }
    : { status: 'pending' as const };

/** After a contribution: tell the moderators (pending) or log the automatic publication. */
async function afterContribution(doc: { id: string; status: sql.DocStatus }, title: string, levelId: number, staff: Staff, source: sql.DocSource) {
  if (doc.status === 'pending') {
    await notifyModerators(levelId, staff.userId, '📄 New document to review', title, '/mod/queue');
  } else {
    await logModeration({ actor: staff.userId, action: 'auto_approve', documentId: doc.id, title, details: { source } });
    if (source === 'drive_folder') importFolderInBackground(doc.id);
  }
}

const docForViewer = (id: string, me: string) => one(sql.DOC_BY_ID, [id, me]);

/* ───────────── Academic structure ───────────── */

documentsRouter.get('/levels', async (_req, res) => {
  res.json(await query(sql.LIST_LEVELS));
});

documentsRouter.get('/levels/:id', async (req, res) => {
  const level = await one(sql.LEVEL_BY_ID, [levelIdParam(req.params.id)]);
  if (!level) throw notFound('Level not found');
  res.json(level);
});

documentsRouter.get('/levels/:id/periods', async (req, res) => {
  res.json(await query(sql.PERIODS_OF_LEVEL, [levelIdParam(req.params.id)]));
});

documentsRouter.get('/levels/:id/tracks', async (req, res) => {
  res.json(await query(sql.TRACKS_OF_LEVEL, [levelIdParam(req.params.id)]));
});

documentsRouter.get('/periods/:id', async (req, res) => {
  const period = await one(sql.PERIOD_BY_ID, [uuidParam(req.params.id, 'Period not found')]);
  if (!period) throw notFound('Period not found');
  res.json(period);
});

documentsRouter.get('/periods/:id/subjects', async (req, res) => {
  res.json(await query(sql.SUBJECTS_OF_PERIOD, [uuidParam(req.params.id, 'Period not found')]));
});

documentsRouter.get('/subjects/:id', async (req, res) => {
  const subject = await one(sql.SUBJECT_BY_ID, [uuidParam(req.params.id, 'Subject not found')]);
  if (!subject) throw notFound('Subject not found');
  res.json(subject);
});

documentsRouter.get('/folder-tree', async (_req, res) => {
  res.json(await query(sql.FOLDER_TREE));
});

type PeriodRow = { id: string; name: string; start_month: number | null; end_month: number | null; sort: number };

const inMonths = (p: PeriodRow, m: number) =>
  p.start_month != null &&
  p.end_month != null &&
  (p.start_month <= p.end_month ? m >= p.start_month && m <= p.end_month : m >= p.start_month || m <= p.end_month);

/** My class: subjects of my level for the current semester (my chosen period first, else by months, else the first). */
documentsRouter.get('/me/class', async (req, res) => {
  const me = uid(req);
  const profile = await one<{ level: string | null; period: string | null; track_id: string | null }>(sql.MY_PROFILE_CLASS, [me]);
  if (!profile) throw notFound('Profile not found');
  if (!profile.level) {
    res.json({ level: null, period: null, periods: [], track: null, subjects: [] });
    return;
  }
  const level = await one<{ id: number }>(sql.LEVEL_BY_CODE, [profile.level]);
  if (!level) {
    res.json({ level: null, period: null, periods: [], track: null, subjects: [] });
    return;
  }
  const periods = await query<PeriodRow>(sql.PERIODS_OF_LEVEL, [level.id]);
  const month = new Date().getMonth() + 1;
  const period =
    periods.find((p) => profile.period && p.name.toLowerCase() === profile.period.toLowerCase()) ??
    periods.find((p) => inMonths(p, month)) ??
    periods[0] ??
    null;
  const track = profile.track_id ? await one(sql.TRACK_BY_ID, [profile.track_id]) : null;
  const subjects = period ? await query(sql.CLASS_SUBJECTS, [period.id, profile.track_id]) : [];
  res.json({ level: await one(sql.LEVEL_BY_ID, [level.id]), period, periods, track, subjects });
});

/** Choose my track/option (null = none). It must belong to my level. */
documentsRouter.put('/me/track', async (req, res) => {
  const me = uid(req);
  const { track_id } = parse(z.object({ track_id: z.guid('invalid id').nullable() }), bodyOf(req.body));
  if (track_id) {
    const track = await one<{ level_id: number }>(sql.TRACK_BY_ID, [track_id.toLowerCase()]);
    if (!track) throw notFound('Track not found');
    const profile = await one<{ level: string | null }>(sql.MY_PROFILE_CLASS, [me]);
    const level = profile?.level ? await one<{ id: number }>(sql.LEVEL_BY_CODE, [profile.level]) : null;
    if (!level || level.id !== track.level_id) throw new HttpError(400, 'track_id: this track is not in your level');
  }
  res.json(await one(sql.SET_MY_TRACK, [me, track_id?.toLowerCase() ?? null]));
});

/* ───────────── Lists ───────────── */

documentsRouter.get('/subjects/:id/documents', async (req, res) => {
  const id = uuidParam(req.params.id, 'Subject not found');
  const q = parse(listQuery, req.query);
  const docs = await query(sql.DOCS_OF_SUBJECT, [id, uid(req), q.type ?? null, q.year ?? null, q.sort]);
  // Drive folders of this subject are re-synced in the background (at most every 6 hours).
  maybeSyncSubject(id);
  res.json(docs);
});

documentsRouter.get('/documents/search', async (req, res) => {
  const q = parse(listQuery.extend({ subject: z.preprocess(blank, z.guid('invalid id').optional()) }), req.query);
  res.json(
    await query(sql.SEARCH_DOCS, [uid(req), likeParam(req.query.q), q.subject?.toLowerCase() ?? null, q.type ?? null, q.year ?? null]),
  );
});

documentsRouter.get('/documents/recent', async (req, res) => {
  res.json(await query(sql.RECENT_DOCS, [uid(req)]));
});

documentsRouter.get('/documents/starred', async (req, res) => {
  res.json(await query(sql.STARRED_DOCS, [uid(req)]));
});

documentsRouter.get('/me/contributions', async (req, res) => {
  res.json(await query(sql.MY_CONTRIBUTIONS, [uid(req)]));
});

documentsRouter.get('/contributors/top', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
  res.json(await query(sql.TOP_CONTRIBUTORS, [limit]));
});

documentsRouter.get('/documents/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  const staff = await getStaff(me);
  await visibleDoc(id, staff);
  const doc = await docForViewer(id, me);
  if (!doc) throw notFound('Document not found');
  const corrections = doc.type === 'exam' ? await query(sql.CORRECTIONS_OF, [id, me]) : [];
  res.json({ ...doc, corrections });
});

/** Files imported from a Drive folder document. */
documentsRouter.get('/documents/:id/children', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  await visibleDoc(id, await getStaff(me));
  res.json(await query(sql.FOLDER_CHILDREN, [id, me]));
});

/* ───────────── Contribute ───────────── */

/** Multipart: "file" (10 MB max) + subject_id, type, number?, academic_year?, correction_of_id?. */
documentsRouter.post('/documents', contributionLimit, uploadDocument.single('file'), async (req, res) => {
  const me = uid(req);
  const file = req.file;
  if (!file) throw new HttpError(400, 'file: choose a file to upload');
  // Everything is checked before the upload so a bad form never leaves a file on Cloudinary.
  const fields = parse(contributionFields, bodyOf(req.body));
  const staff = await getStaff(me);
  const subject = await subjectOf(fields.subject_id.toLowerCase());
  const correctionOf = await checkCorrectionOf(fields, staff);
  const created = await createUpload(file, fields, subject, staff, { correctionOf, version: 1 });
  res.status(201).json(await docForViewer(created.id, me));
});

async function createUpload(
  file: Express.Multer.File,
  fields: ContributionFields,
  subject: { id: string; name: string; level_id: number },
  staff: Staff,
  extra: { correctionOf: string | null; version: number },
) {
  const sha256 = sha256Of(file.buffer);
  const dup = await one<{ id: string; title: string }>(sql.DUP_BY_SHA, [sha256]);
  if (dup) throw duplicate(dup);

  const name = originalName(file);
  const title = buildTitle(fields.type, fields.number, subject.name, fields.academic_year);
  const stored: StoredDocument = await storeDocument(file);
  let created: { id: string; status: sql.DocStatus };
  try {
    created = await insertDocument({
      subject_id: subject.id,
      title,
      type: fields.type,
      number: fields.number ?? null,
      academic_year: fields.academic_year ?? null,
      source: 'upload',
      uploader_id: staff.userId,
      cloudinary_public_id: stored.publicId,
      storage_resource_type: stored.resourceType,
      storage_format: stored.format,
      file_name: name.slice(0, 255),
      file_ext: extOf(name) || 'pdf',
      size_bytes: file.size,
      mime_type: file.mimetype?.slice(0, 120) || null,
      sha256,
      correction_of_id: extra.correctionOf,
      version: extra.version,
      ...initialStatus(staff),
    });
  } catch (err) {
    await removeDocument(stored);
    // Same file uploaded at the same moment by someone else.
    if ((err as { code?: string }).code === '23505') {
      const again = await one<{ id: string; title: string }>(sql.DUP_BY_SHA, [sha256]);
      if (again) throw duplicate(again);
    }
    throw err;
  }
  await afterContribution(created, title, subject.level_id, staff, 'upload');
  return created;
}

const driveBody = contributionFields.extend({ url: z.string().trim().min(5, 'paste a Google Drive link').max(2000) });

async function createDriveDoc(
  kind: 'drive_file' | 'drive_folder',
  body: z.infer<typeof driveBody>,
  staff: Staff,
  extra: { correctionOf: string | null; version: number },
) {
  const driveId = parseDriveId(body.url);
  if (!driveId) throw new HttpError(400, 'url: this is not a Google Drive link');
  const subject = await subjectOf(body.subject_id.toLowerCase());
  const what = kind === 'drive_folder' ? 'folder' : 'file';
  const meta = await driveMeta(driveId, what);
  if (kind === 'drive_file' && isFolderMime(meta.mimeType)) throw new HttpError(400, 'url: this is a folder link. Add it as a Drive folder.');
  if (kind === 'drive_folder' && !isFolderMime(meta.mimeType)) throw new HttpError(400, 'url: this is a file link, not a folder.');

  const dup = await one<{ id: string; title: string }>(sql.DUP_BY_DRIVE_ID, [driveId, null]);
  if (dup) throw duplicate(dup);

  const title = buildTitle(body.type, body.number, subject.name, body.academic_year);
  const created = await insertDocument({
    subject_id: subject.id,
    title,
    type: body.type,
    number: body.number ?? null,
    academic_year: body.academic_year ?? null,
    source: kind,
    uploader_id: staff.userId,
    file_name: meta.name.slice(0, 255),
    file_ext: kind === 'drive_folder' ? 'folder' : isGoogleDoc(meta.mimeType) ? 'pdf' : (extFromName(meta.name) ?? 'file').slice(0, 10),
    size_bytes: meta.size,
    mime_type: meta.mimeType.slice(0, 120),
    drive_file_id: driveId,
    drive_url: kind === 'drive_folder' ? driveFolderUrl(driveId) : driveFileUrl(driveId),
    drive_modified_at: meta.modifiedTime ? new Date(meta.modifiedTime) : null,
    correction_of_id: extra.correctionOf,
    version: extra.version,
    ...initialStatus(staff),
  });
  await afterContribution(created, title, subject.level_id, staff, kind);
  return created;
}

/** JSON { url, subject_id, type, number?, academic_year?, correction_of_id? } */
documentsRouter.post('/documents/drive-file', contributionLimit, async (req, res) => {
  const me = uid(req);
  const body = parse(driveBody, bodyOf(req.body));
  const staff = await getStaff(me);
  const correctionOf = await checkCorrectionOf(body, staff);
  const created = await createDriveDoc('drive_file', body, staff, { correctionOf, version: 1 });
  res.status(201).json(await docForViewer(created.id, me));
});

/** JSON { url, subject_id, type, number?, academic_year? }. The files are imported once the folder is approved. */
documentsRouter.post('/documents/drive-folder', contributionLimit, async (req, res) => {
  const me = uid(req);
  const body = parse(driveBody, bodyOf(req.body));
  if (body.correction_of_id) throw new HttpError(400, 'correction_of_id: a folder cannot be linked to an exam');
  const staff = await getStaff(me);
  const created = await createDriveDoc('drive_folder', body, staff, { correctionOf: null, version: 1 });
  res.status(201).json(await docForViewer(created.id, me));
});

/**
 * New version of my document: multipart "file", or JSON { url } for a Drive file.
 * Subject, type, number and year are kept. The old version disappears once the new one is approved.
 */
documentsRouter.post('/documents/:id/new-version', contributionLimit, uploadDocument.single('file'), async (req, res) => {
  const me = uid(req);
  const id = uuidParam(req.params.id, 'Document not found');
  const staff = await getStaff(me);
  const old = await loadDoc(id);
  if (old.uploader_id !== me && !canModerate(staff, old.level_id)) throw notFound('Document not found');
  if (old.parent_folder_doc_id || old.source === 'drive_folder') {
    throw new HttpError(400, 'Drive folders update themselves: change the files in the folder instead.');
  }
  if (old.status === 'rejected') throw new HttpError(400, 'This document was rejected: add it again as a new document.');
  if (old.replaced_by_status === 'approved') throw new HttpError(400, 'A newer version already exists: update the latest version.');

  const fields: ContributionFields = {
    subject_id: old.subject_id,
    type: old.type,
    number: old.number,
    academic_year: old.academic_year,
    correction_of_id: old.correction_of_id,
  };
  const extra = { correctionOf: old.correction_of_id, version: old.version + 1 };
  let created: { id: string; status: sql.DocStatus };
  if (req.file) {
    created = await createUpload(req.file, fields, { id: old.subject_id, name: old.subject_name, level_id: old.level_id }, staff, extra);
  } else {
    const { url } = parse(z.object({ url: z.string().trim().min(5, 'send a file or a Google Drive link').max(2000) }), bodyOf(req.body));
    created = await createDriveDoc('drive_file', { ...fields, url }, staff, extra);
  }
  await updateDocument(old.id, { replaced_by_id: created.id });
  res.status(201).json(await docForViewer(created.id, me));
});

/* ───────────── Star / useful / report ───────────── */

const approvedDoc = async (id: string, staff: Staff) => {
  const doc = await visibleDoc(id, staff);
  if (doc.status !== 'approved') throw new HttpError(400, 'This document is not published');
  return doc;
};

documentsRouter.post('/documents/:id/star', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  if (await one(sql.UNSTAR, [me, id])) {
    res.json({ starred: false });
    return;
  }
  await approvedDoc(id, await getStaff(me));
  await query(sql.STAR, [me, id]);
  res.json({ starred: true });
});

documentsRouter.delete('/documents/:id/star', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  await query(sql.UNSTAR, [uid(req), id]);
  res.json({ starred: false });
});

/** Toggle my "useful" vote (one per user). */
documentsRouter.post('/documents/:id/useful', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  let voted: boolean;
  if (await one(sql.UNVOTE_USEFUL, [me, id])) {
    voted = false;
  } else {
    const doc = await approvedDoc(id, await getStaff(me));
    if (doc.uploader_id === me) throw new HttpError(400, 'You cannot vote for your own document');
    await query(sql.VOTE_USEFUL, [me, id]);
    voted = true;
  }
  const row = await one<{ useful_count: number }>(sql.REFRESH_USEFUL_COUNT, [id]);
  res.json({ voted, useful_count: row?.useful_count ?? 0 });
});

const reportBody = z.object({
  reason: z.enum(sql.REPORT_REASONS, 'choose a reason: wrong_file, unreadable, wrong_subject, copyrighted, duplicate or other'),
  comment: z.preprocess(blank, z.string().trim().max(500, 'max 500 characters').nullable().optional()),
});

documentsRouter.post('/documents/:id/report', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const b = parse(reportBody, bodyOf(req.body));
  res.status(201).json(await createDocumentReport(uid(req), id, b.reason, b.comment ?? null));
});

/* ───────────── Open / download ───────────── */

async function countOpen(doc: DocInternal, me: string) {
  await query(sql.RECORD_OPEN, [me, doc.id]);
  await query(sql.INCREMENT_OPEN, [doc.id]);
}

/** Link to open the document (signed Cloudinary link valid 1 hour, or the Drive page). Counts an open. */
documentsRouter.post('/documents/:id/open', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  const doc = await visibleDoc(id, await getStaff(me));
  const link = openLink(doc);
  await countOpen(doc, me);
  res.json({ ...link, source: doc.source });
});

/** Same link without counting (share sheet, offline copy). ?download=1 → saved as a file. */
documentsRouter.get('/documents/:id/link', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const { download } = parse(z.object({ download: z.enum(['1', '0', 'true', 'false']).optional() }), req.query);
  const doc = await visibleDoc(id, await getStaff(uid(req)));
  res.json({ ...openLink(doc, download === '1' || download === 'true'), source: doc.source });
});

const contentDisposition = (name: string) => {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/**
 * Download the file (counts a download).
 * Uploads: redirect to a signed Cloudinary link. Drive files: streamed through the server
 * (Google Docs/Sheets/Slides exported to PDF).
 */
documentsRouter.get('/documents/:id/download', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const doc = await visibleDoc(id, await getStaff(uid(req)));
  if (doc.source === 'drive_folder') throw new HttpError(400, 'A folder cannot be downloaded: open it in Google Drive.');

  if (doc.source === 'upload') {
    const { url } = openLink(doc, true);
    await query(sql.INCREMENT_DOWNLOAD, [doc.id]);
    res.redirect(302, url);
    return;
  }

  const { res: drive, exported } = await driveDownload(doc.drive_file_id!, doc.mime_type);
  if (!drive.body) throw new HttpError(502, 'Google Drive did not send the file. Please try again.');
  await query(sql.INCREMENT_DOWNLOAD, [doc.id]);
  const baseName = doc.file_name || doc.title;
  const name = exported && !/\.pdf$/i.test(baseName) ? `${baseName}.pdf` : baseName;
  res.setHeader('Content-Type', exported ? 'application/pdf' : (drive.headers.get('content-type') ?? 'application/octet-stream'));
  const length = drive.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);
  res.setHeader('Content-Disposition', contentDisposition(name));
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = Readable.fromWeb(drive.body as import('node:stream/web').ReadableStream);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

/* ───────────── Delete ───────────── */

/** The uploader, a moderator of the level or an admin. The Cloudinary file is deleted too. */
documentsRouter.delete('/documents/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  const staff = await getStaff(me);
  const doc = await loadDoc(id);
  const asModerator = doc.uploader_id !== me;
  if (asModerator && !canModerate(staff, doc.level_id)) {
    if (doc.status !== 'approved') throw notFound('Document not found');
    throw forbidden('Only the uploader or a moderator can delete this document');
  }
  await deleteContent('document', id, me);
  if (asModerator) {
    await logModeration({ actor: me, action: 'delete', documentId: id, title: doc.title, targetUser: doc.uploader_id });
  }
  res.json({ ok: true });
});
