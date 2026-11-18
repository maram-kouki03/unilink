import { Router } from 'express';
import { z } from 'zod';
import { isAdmin, uid } from '../auth';
import { one, query } from '../db';
import { extOf, originalName, removeDocument, removeStored, signedDocumentUrl, storeDocument, uploadDocument, type ResourceType, type StoredDocument } from '../files';
import { forbidden, HttpError, likeParam, notFound, parse, strParam, uuidParam } from '../http';
import * as sql from '../sql/documents';

type DocFile = { file_path: string; storage_resource_type: ResourceType | null; storage_format: string | null; uploader_id: string | null };

/** Every route here requires a signed-in user (requireAuth is applied in index.ts). */
export const documentsRouter = Router();

const DOC_TYPES = ['exam', 'course', 'summary', 'td_tp'] as const;

const docTypeParam = (v: unknown) => {
  const s = strParam(v);
  if (!s || s === 'all') return null;
  if (!(DOC_TYPES as readonly string[]).includes(s)) throw new HttpError(400, 'type: unknown document type');
  return s;
};

const levelIdParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 32767) throw notFound('Level not found');
  return n;
};

/* ───────────── Folders ───────────── */

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

documentsRouter.get('/subjects/:id/documents', async (req, res) => {
  const id = uuidParam(req.params.id, 'Subject not found');
  res.json(await query(sql.DOCS_OF_SUBJECT, [id, docTypeParam(req.query.type), likeParam(req.query.q)]));
});

documentsRouter.get('/folder-tree', async (_req, res) => {
  res.json(await query(sql.FOLDER_TREE));
});

/* ───────────── Document lists ───────────── */

documentsRouter.get('/documents/search', async (req, res) => {
  res.json(await query(sql.SEARCH_DOCS, [likeParam(req.query.q), docTypeParam(req.query.type)]));
});

documentsRouter.get('/documents/recent', async (req, res) => {
  res.json(await query(sql.RECENT_DOCS, [uid(req)]));
});

documentsRouter.get('/documents/starred', async (req, res) => {
  res.json(await query(sql.STARRED_DOCS, [uid(req)]));
});

documentsRouter.get('/documents/mine', async (req, res) => {
  res.json(await query(sql.MY_DOCS, [uid(req)]));
});

documentsRouter.get('/documents/:id', async (req, res) => {
  const doc = await one(sql.DOC_BY_ID, [uuidParam(req.params.id, 'Document not found'), uid(req)]);
  if (!doc) throw notFound('Document not found');
  res.json(doc);
});

documentsRouter.get('/documents/:id/link', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const doc = await one<DocFile>(sql.DOC_FILE, [id]);
  if (!doc) throw notFound('Document not found');
  // Files uploaded before Cloudinary were on the old server disk and are gone.
  if (!doc.storage_resource_type) throw notFound('File not found on the server. Please upload it again.');
  // Signed Cloudinary link, valid 1 hour.
  res.json({ url: signedDocumentUrl(doc.file_path, doc.storage_resource_type, doc.storage_format) });
});

/* ───────────── Upload / delete ───────────── */

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const uploadSchema = z.object({
  subjectId: z.uuid('choose a subject'),
  title: z.string().trim().min(3, 'must be at least 3 characters').max(140),
  docType: z.enum(DOC_TYPES),
  academicYear: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{4}$/, 'use the format 2025-2026').nullable().optional()),
  driveUrl: z.preprocess(emptyToNull, z.url('must be a link').nullable().optional()),
});

documentsRouter.post('/documents', uploadDocument.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'file: choose a file to upload');
  // Validate before uploading so a bad form never leaves a file on Cloudinary.
  const body = parse(uploadSchema, req.body);
  const name = originalName(file);
  const stored: StoredDocument = await storeDocument(file);
  try {
    const row = await one<{ id: string }>(sql.INSERT_DOC, [
      body.subjectId,
      body.title,
      body.docType,
      body.academicYear ?? null,
      stored.publicId,
      name,
      extOf(name) || 'pdf',
      file.size,
      body.driveUrl ?? null,
      uid(req),
      stored.resourceType,
      stored.format,
    ]);
    res.status(201).json(row);
  } catch (err) {
    await removeDocument(stored);
    throw err;
  }
});

documentsRouter.delete('/documents/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  const doc = await one<DocFile>(sql.DOC_FILE, [id]);
  if (!doc) throw notFound('Document not found');
  if (doc.uploader_id !== me && !(await isAdmin(me))) throw forbidden('Only the uploader or an admin can delete this document');
  await query(sql.DELETE_DOC, [id]);
  if (doc.storage_resource_type) await removeStored(doc.file_path, doc.storage_resource_type, 'authenticated');
  res.json({ ok: true });
});

/* ───────────── Star / open / download / report ───────────── */

async function ensureDoc(id: string) {
  if (!(await one(sql.DOC_FILE, [id]))) throw notFound('Document not found');
}

documentsRouter.post('/documents/:id/star', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const me = uid(req);
  if (await one(sql.UNSTAR, [me, id])) {
    res.json({ starred: false });
    return;
  }
  await ensureDoc(id);
  await query(sql.STAR, [me, id]);
  res.json({ starred: true });
});

documentsRouter.post('/documents/:id/open', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  await ensureDoc(id);
  await query(sql.RECORD_OPEN, [uid(req), id]);
  res.json({ ok: true });
});

documentsRouter.post('/documents/:id/download', async (req, res) => {
  const row = await one<{ downloads: number }>(sql.INCREMENT_DOWNLOAD, [uuidParam(req.params.id, 'Document not found')]);
  if (!row) throw notFound('Document not found');
  res.json(row);
});

documentsRouter.post('/documents/:id/report', async (req, res) => {
  const id = uuidParam(req.params.id, 'Document not found');
  const { reason } = parse(z.object({ reason: z.string().trim().min(1, 'required').max(500) }), req.body);
  await ensureDoc(id);
  await query(sql.REPORT_DOC, [id, uid(req), reason]);
  res.status(201).json({ ok: true });
});
