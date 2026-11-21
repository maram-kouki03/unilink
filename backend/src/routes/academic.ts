import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, uid } from '../auth';
import { one, query } from '../db';
import { logModeration } from '../docs';
import { syncSubject } from '../docsync';
import { parseDriveId } from '../drive';
import { bodyOf, HttpError, notFound, parse, uuidParam } from '../http';

/**
 * Admin CRUD of the academic structure: levels, periods (semesters), tracks, subjects.
 * Deleting something that still contains documents is refused (documents are never lost by accident).
 */
export const academicRouter = Router();
academicRouter.use('/admin', requireAdmin);

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const smallint = z.coerce.number().int().min(0).max(32767);
const month = z.coerce.number().int().min(1).max(12);
const text = (max: number) => z.string().trim().min(1, 'cannot be empty').max(max);
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();

/** update <table> set <only the sent fields> where id = $1 returning * */
async function patchRow(table: string, id: string | number, fields: Record<string, unknown>, notFoundMsg: string) {
  const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (!cols.length) throw new HttpError(400, 'Nothing to update');
  const row = await one(
    `update public.${table} set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1 returning *`,
    [id, ...cols.map((c) => fields[c])],
  );
  if (!row) throw notFound(notFoundMsg);
  return row;
}

async function insertRow(table: string, fields: Record<string, unknown>) {
  const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
  return one(
    `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
    cols.map((c) => fields[c]),
  );
}

const conflict = (err: unknown, msg: string) => {
  if ((err as { code?: string }).code === '23505') throw new HttpError(409, msg);
  throw err;
};

const audit = (req: Parameters<typeof uid>[0], action: string, details: Record<string, unknown>) =>
  logModeration({ actor: uid(req), action, details });

/** Refuse to delete a container that still has documents. */
async function assertNoDocuments(countSql: string, id: unknown, what: string) {
  const row = await one<{ n: number }>(countSql, [id]);
  if ((row?.n ?? 0) > 0) throw new HttpError(409, `This ${what} still contains ${row!.n} document(s). Move or delete them first.`);
}

const levelParam = (v: unknown) => {
  const r = smallint.safeParse(v);
  if (!r.success) throw notFound('Level not found');
  return r.data;
};

/* ───────────── Levels ───────────── */

const levelBody = z.object({
  id: smallint.optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,20}$/, 'letters, digits or _ (max 20)'),
  name: text(80),
  short_name: text(40),
  sort: smallint.optional(),
});

academicRouter.post('/admin/levels', async (req, res) => {
  const b = parse(levelBody, bodyOf(req.body));
  const id = b.id ?? (await one<{ id: number }>(`select coalesce(max(id), 0) + 1 as id from public.levels`))!.id;
  const row = await insertRow('levels', { ...b, id, sort: b.sort ?? id }).catch((e) => conflict(e, 'This level id or code already exists'));
  await audit(req, 'level_create', { level: row });
  res.status(201).json(row);
});

academicRouter.patch('/admin/levels/:id', async (req, res) => {
  const b = parse(levelBody.omit({ id: true }).partial(), bodyOf(req.body));
  const row = await patchRow('levels', levelParam(req.params.id), b, 'Level not found').catch((e) => conflict(e, 'This code already exists'));
  await audit(req, 'level_update', { id: req.params.id, changes: b });
  res.json(row);
});

academicRouter.delete('/admin/levels/:id', async (req, res) => {
  const id = levelParam(req.params.id);
  await assertNoDocuments(
    `select count(*)::int as n from public.documents d join public.subjects s on s.id = d.subject_id
       join public.periods p on p.id = s.period_id where p.level_id = $1`,
    id,
    'level',
  );
  const row = await one(`delete from public.levels where id = $1 returning id`, [id]);
  if (!row) throw notFound('Level not found');
  await audit(req, 'level_delete', { id });
  res.json({ ok: true });
});

/* ───────────── Periods (semesters) ───────────── */

const periodBody = z.object({
  level_id: smallint,
  name: text(20),
  label: text(60),
  months: optText(40),
  start_month: z.preprocess(blank, month.nullable()).optional(),
  end_month: z.preprocess(blank, month.nullable()).optional(),
  sort: smallint.optional(),
});

academicRouter.post('/admin/periods', async (req, res) => {
  const b = parse(periodBody, bodyOf(req.body));
  const row = await insertRow('periods', b).catch((e) => conflict(e, 'This period already exists in this level'));
  await audit(req, 'period_create', { period: row });
  res.status(201).json(row);
});

academicRouter.patch('/admin/periods/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Period not found');
  const b = parse(periodBody.partial(), bodyOf(req.body));
  const row = await patchRow('periods', id, b, 'Period not found').catch((e) => conflict(e, 'This period already exists in this level'));
  await audit(req, 'period_update', { id, changes: b });
  res.json(row);
});

academicRouter.delete('/admin/periods/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Period not found');
  await assertNoDocuments(
    `select count(*)::int as n from public.documents d join public.subjects s on s.id = d.subject_id where s.period_id = $1`,
    id,
    'period',
  );
  const row = await one(`delete from public.periods where id = $1 returning id`, [id]);
  if (!row) throw notFound('Period not found');
  await audit(req, 'period_delete', { id });
  res.json({ ok: true });
});

/* ───────────── Tracks / options ───────────── */

const trackBody = z.object({ level_id: smallint, name: text(80), code: optText(20), sort: smallint.optional() });

academicRouter.post('/admin/tracks', async (req, res) => {
  const b = parse(trackBody, bodyOf(req.body));
  const row = await insertRow('tracks', b).catch((e) => conflict(e, 'This track already exists in this level'));
  await audit(req, 'track_create', { track: row });
  res.status(201).json(row);
});

academicRouter.patch('/admin/tracks/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Track not found');
  const b = parse(trackBody.partial(), bodyOf(req.body));
  const row = await patchRow('tracks', id, b, 'Track not found').catch((e) => conflict(e, 'This track already exists in this level'));
  await audit(req, 'track_update', { id, changes: b });
  res.json(row);
});

/** Subjects of the track become common to the level (track_id set to null). */
academicRouter.delete('/admin/tracks/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Track not found');
  const row = await one(`delete from public.tracks where id = $1 returning id`, [id]);
  if (!row) throw notFound('Track not found');
  await audit(req, 'track_delete', { id });
  res.json({ ok: true });
});

/* ───────────── Subjects ───────────── */

const driveFolder = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .max(2000)
    .transform((v, ctx) => {
      const id = parseDriveId(v);
      if (!id) ctx.addIssue({ code: 'custom', message: 'not a Google Drive folder link' });
      return id ?? '';
    })
    .nullable(),
).optional();

const subjectBody = z.object({
  period_id: z.guid('invalid id'),
  name: text(120),
  code: optText(30),
  color: z.preprocess(blank, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'use a color like #3D3FD9').nullable()).optional(),
  track_id: z.preprocess(blank, z.guid('invalid id').nullable()).optional(),
  drive_folder_id: driveFolder,
});

/** The track must belong to the subject's level. */
async function checkTrack(periodId: string, trackId: string | null | undefined) {
  if (!trackId) return;
  const ok = await one(
    `select 1 from public.tracks t join public.periods p on p.level_id = t.level_id where t.id = $1 and p.id = $2`,
    [trackId, periodId],
  );
  if (!ok) throw new HttpError(400, 'track_id: this track is not in the level of this period');
}

academicRouter.post('/admin/subjects', async (req, res) => {
  const b = parse(subjectBody, bodyOf(req.body));
  await checkTrack(b.period_id, b.track_id);
  const row = await insertRow('subjects', b).catch((e) => conflict(e, 'This subject already exists in this period'));
  await audit(req, 'subject_create', { subject: row });
  if (b.drive_folder_id) void syncSubject((row as { id: string }).id).catch(() => undefined);
  res.status(201).json(row);
});

academicRouter.patch('/admin/subjects/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Subject not found');
  const b = parse(subjectBody.partial(), bodyOf(req.body));
  if (b.track_id) {
    const current = await one<{ period_id: string }>(`select period_id from public.subjects where id = $1`, [id]);
    if (!current) throw notFound('Subject not found');
    await checkTrack(b.period_id ?? current.period_id, b.track_id);
  }
  const fields: Record<string, unknown> = { ...b };
  if (b.drive_folder_id !== undefined) fields.drive_synced_at = null;
  const row = await patchRow('subjects', id, fields, 'Subject not found').catch((e) => conflict(e, 'This subject already exists in this period'));
  await audit(req, 'subject_update', { id, changes: b });
  if (b.drive_folder_id) void syncSubject(id).catch(() => undefined);
  res.json(row);
});

academicRouter.delete('/admin/subjects/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Subject not found');
  await assertNoDocuments(`select count(*)::int as n from public.documents where subject_id = $1`, id, 'subject');
  const row = await one(`delete from public.subjects where id = $1 returning id`, [id]);
  if (!row) throw notFound('Subject not found');
  await audit(req, 'subject_delete', { id });
  res.json({ ok: true });
});
