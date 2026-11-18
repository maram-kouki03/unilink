import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth';
import { one, query } from '../db';
import { removeImage, storeImage, uploadImage } from '../files';
import { forbidden, likeParam, notFound, parse, uuidParam } from '../http';
import * as sql from '../sql/items';

export const itemsRouter = Router();

/** Multipart fields arrive as strings: '' / 'null' / missing → null. */
const blank = (v: unknown) => (v === undefined || v === null || (typeof v === 'string' && (v.trim() === '' || v === 'null')) ? null : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable());

/* ───────────── Rents & Borrow ───────────── */

itemsRouter.get('/items', async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(['rent', 'borrow']).default('rent') }), req.query);
  res.json(await query(sql.LIST_ITEMS, [mode, likeParam(req.query.q)]));
});

itemsRouter.get('/items/mine', async (req, res) => {
  res.json(await query(sql.MY_ITEMS, [uid(req)]));
});

itemsRouter.get('/items/:id', async (req, res) => {
  const item = await one(sql.ITEM_BY_ID, [uuidParam(req.params.id, 'Item not found')]);
  if (!item) throw notFound('Item not found');
  res.json(item);
});

const itemSchema = z.object({
  mode: z.enum(['rent', 'borrow']),
  title: z.string().trim().min(2, 'must be at least 2 characters').max(80),
  description: text(1000),
  category: text(40),
  price_tnd: z.preprocess(blank, z.coerce.number().min(0).max(99999).nullable()),
  price_unit: z.preprocess(blank, z.enum(['day', 'week', 'month']).nullable()),
  max_duration: text(60),
  condition: text(60),
  location: text(120),
});

itemsRouter.post('/items', uploadImage.single('photo'), async (req, res) => {
  // Validate before uploading so a bad form never leaves a photo on Cloudinary.
  const b = parse(itemSchema, req.body);
  const photo = req.file ? await storeImage(req.file) : null;
  try {
    const row = await one(sql.INSERT_ITEM, [
      uid(req),
      b.mode,
      b.title,
      b.description,
      b.category,
      b.price_tnd,
      b.price_unit,
      b.max_duration,
      b.condition,
      b.location,
      photo?.url ?? null,
    ]);
    res.status(201).json(row);
  } catch (err) {
    await removeImage(photo);
    throw err;
  }
});

itemsRouter.patch('/items/:id/availability', async (req, res) => {
  const id = uuidParam(req.params.id, 'Item not found');
  const { available } = parse(z.object({ available: z.boolean() }), req.body);
  const item = await one<{ owner_id: string }>(sql.ITEM_OWNER, [id]);
  if (!item) throw notFound('Item not found');
  if (item.owner_id !== uid(req)) throw forbidden('Only the owner can change this item');
  res.json(await one(sql.SET_ITEM_AVAILABLE, [id, available]));
});

/* ───────────── Lost & Found ───────────── */

itemsRouter.get('/lost-found', async (req, res) => {
  const { kind } = parse(z.object({ kind: z.enum(['lost', 'found']).default('lost') }), req.query);
  res.json(await query(sql.LIST_LOST_FOUND, [kind]));
});

itemsRouter.get('/lost-found/returned-count', async (_req, res) => {
  res.json(await one(sql.RETURNED_THIS_MONTH));
});

const lostSchema = z.object({
  kind: z.enum(['lost', 'found']),
  title: z.string().trim().min(2, 'must be at least 2 characters').max(120),
  category: text(40),
  location: z.string().trim().min(1, 'required').max(120),
  happened_at: z.preprocess(blank, z.iso.datetime({ offset: true, message: 'invalid date' }).nullable()),
  description: text(1000),
});

itemsRouter.post('/lost-found', uploadImage.single('photo'), async (req, res) => {
  // Validate before uploading so a bad form never leaves a photo on Cloudinary.
  const b = parse(lostSchema, req.body);
  const photo = req.file ? await storeImage(req.file) : null;
  try {
    const row = await one(sql.INSERT_LOST_FOUND, [
      uid(req),
      b.kind,
      b.title,
      b.category,
      b.location,
      b.happened_at,
      b.description,
      photo?.url ?? null,
    ]);
    res.status(201).json(row);
  } catch (err) {
    await removeImage(photo);
    throw err;
  }
});

itemsRouter.post('/lost-found/:id/returned', async (req, res) => {
  const id = uuidParam(req.params.id, 'Report not found');
  const row = await one<{ reporter_id: string }>(sql.LOST_FOUND_REPORTER, [id]);
  if (!row) throw notFound('Report not found');
  if (row.reporter_id !== uid(req)) throw forbidden('Only the person who reported it can mark it as returned');
  res.json(await one(sql.MARK_RETURNED, [id]));
});
