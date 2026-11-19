import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, uid } from '../auth';
import { deleteContent } from '../content';
import { one, query } from '../db';
import { HttpError, notFound, parse, uuidParam } from '../http';
import { disconnectUser } from '../realtime';
import { BAN_USER, UNBAN_USER } from '../sql/auth';
import * as sql from '../sql/moderation';
import { DELETE_ALL_MY_PUSH_TOKENS } from '../sql/push';

export const moderationRouter = Router();

const reasonSchema = z.string().trim().min(1, 'required').max(500);

/**
 * Report something. Once AUTO_HIDE_THRESHOLD different people have an open report on it,
 * the content is hidden until an admin decides.
 */
export async function createReport(reporterId: string, type: sql.TargetType, targetId: string, reason: string) {
  const target = await one<{ owner_id: string | null }>(sql.TARGET_OWNER[type], [targetId]);
  if (!target) throw notFound('This content no longer exists');
  if (type === 'user' && targetId === reporterId) throw new HttpError(400, 'You cannot report yourself');

  const inserted = await one<{ id: string }>(sql.INSERT_REPORT, [reporterId, type, targetId, reason]);
  if (type !== 'user') {
    const open = (await one<{ count: number }>(sql.OPEN_REPORT_COUNT, [type, targetId]))?.count ?? 0;
    if (open >= sql.AUTO_HIDE_THRESHOLD) await query(sql.hideSql(type), [targetId]);
  }
  // Already reported by this person: same answer (nothing to tell the client).
  return { ok: true, id: inserted?.id ?? null };
}

const reportSchema = z.object({
  targetType: z.enum(sql.TARGET_TYPES),
  targetId: z.guid('invalid id'),
  reason: reasonSchema,
});

moderationRouter.post('/reports', async (req, res) => {
  const b = parse(reportSchema, req.body);
  res.status(201).json(await createReport(uid(req), b.targetType, b.targetId.toLowerCase(), b.reason));
});

/* ───────────── Admin ───────────── */

export const adminRouter = Router();
adminRouter.use('/admin', requireAdmin);

adminRouter.get('/admin/reports', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(['open', 'dismissed', 'resolved', 'all']).default('open'),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }),
    req.query,
  );
  res.json(await query(sql.LIST_REPORTS, [q.status === 'all' ? null : q.status, q.limit]));
});

async function banUser(targetId: string, adminId: string, reason: string | null) {
  if (targetId === adminId) throw new HttpError(400, 'You cannot ban yourself');
  const role = await one<{ role: string }>(sql.PROFILE_ROLE_OF, [targetId]);
  if (!role) throw notFound('User not found');
  if (role.role === 'admin') throw new HttpError(400, 'Admins cannot be banned');
  const row = await one(BAN_USER, [targetId, reason]);
  if (!row) throw notFound('User not found');
  await query(DELETE_ALL_MY_PUSH_TOKENS, [targetId]);
  disconnectUser(targetId);
  return row;
}

const resolveSchema = z.object({
  action: z.enum(['dismiss', 'delete_content', 'ban_user']),
  reason: z.string().trim().max(500).nullable().optional(),
});

adminRouter.post('/admin/reports/:id/resolve', async (req, res) => {
  const reportId = uuidParam(req.params.id, 'Report not found');
  const { action, reason } = parse(resolveSchema, req.body);
  const admin = uid(req);
  const report = await one<{ id: string; target_type: sql.TargetType; target_id: string; status: string }>(sql.REPORT_BY_ID, [reportId]);
  if (!report) throw notFound('Report not found');
  const type = report.target_type;
  const target = report.target_id;

  if (action === 'dismiss') {
    // Content stays (and is shown again if it was auto-hidden).
    if (type !== 'user') await query(sql.unhideSql(type), [target]);
    await query(sql.CLOSE_REPORTS_ON_TARGET, [type, target, 'dismissed', 'dismiss', admin]);
    await query(sql.CLOSE_REPORT, [reportId, 'dismissed', 'dismiss', admin]);
    res.json({ ok: true, action });
    return;
  }

  if (action === 'delete_content') {
    if (type === 'user') throw new HttpError(400, 'A user cannot be deleted from a report. Use ban_user.');
    const existed = await deleteContent(type, target, admin);
    await query(sql.CLOSE_REPORT, [reportId, 'resolved', 'delete_content', admin]);
    res.json({ ok: true, action, deleted: existed });
    return;
  }

  // ban_user: ban the author of the reported content (or the reported user), and hide the content.
  const owner = await one<{ owner_id: string | null }>(sql.TARGET_OWNER[type], [target]);
  if (!owner?.owner_id) throw notFound('The author of this content no longer exists');
  await banUser(owner.owner_id, admin, reason ?? 'Reported content');
  if (type !== 'user') await query(sql.hideSql(type), [target]);
  await query(sql.CLOSE_REPORTS_ON_TARGET, [type, target, 'resolved', 'ban_user', admin]);
  await query(sql.CLOSE_REPORT, [reportId, 'resolved', 'ban_user', admin]);
  res.json({ ok: true, action, bannedUserId: owner.owner_id });
});

adminRouter.post('/admin/users/:id/ban', async (req, res) => {
  const id = uuidParam(req.params.id, 'User not found');
  const { reason } = parse(z.object({ reason: z.string().trim().max(500).nullable().optional() }), req.body ?? {});
  res.json(await banUser(id, uid(req), reason ?? null));
});

adminRouter.post('/admin/users/:id/unban', async (req, res) => {
  const id = uuidParam(req.params.id, 'User not found');
  const row = await one(UNBAN_USER, [id]);
  if (!row) throw notFound('User not found');
  res.json(row);
});
