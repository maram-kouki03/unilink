import { Router } from 'express';
import { z } from 'zod';
import { isAdmin, uid } from '../auth';
import { deleteContent } from '../content';
import { one, query } from '../db';
import { forbidden, HttpError, notFound, parse, uuidParam } from '../http';
import { notify } from '../notify';
import { emitTo } from '../realtime';
import * as sql from '../sql/posts';

export const postsRouter = Router();

const LEVELS = ['1A', '2A', '3A', 'MASTERE', 'DOCTORAT'] as const;

postsRouter.get('/posts', async (req, res) => {
  const q = parse(
    z.object({
      scope: z.enum(['general', 'level']).default('general'),
      level: z.enum(LEVELS).optional(),
    }),
    req.query,
  );
  const level = q.scope === 'level' ? (q.level ?? null) : null;
  res.json(await query(sql.LIST_POSTS, [uid(req), q.scope, level]));
});

postsRouter.get('/posts/:id', async (req, res) => {
  const post = await one(sql.POST_BY_ID, [uid(req), uuidParam(req.params.id, 'Post not found')]);
  if (!post) throw notFound('Post not found');
  res.json(post);
});

const postSchema = z.object({
  scope: z.enum(['general', 'level']),
  level_code: z.enum(LEVELS).nullable().optional(),
  topic: z.string().trim().max(60).nullable().optional(),
  body: z.string().trim().min(3, 'must be at least 3 characters').max(2000),
});

postsRouter.post('/posts', async (req, res) => {
  const p = parse(postSchema, req.body);
  if (p.scope === 'level' && !p.level_code) throw new HttpError(400, 'level_code: choose a level');
  const row = await one(sql.INSERT_POST, [uid(req), p.scope, p.scope === 'level' ? p.level_code : (p.level_code ?? null), p.topic || null, p.body]);
  res.status(201).json(row);
});

postsRouter.delete('/posts/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Post not found');
  const me = uid(req);
  const post = await one<{ author_id: string }>(sql.POST_AUTHOR, [id]);
  if (!post) throw notFound('Post not found');
  if (post.author_id !== me && !(await isAdmin(me))) throw forbidden('Only the author or an admin can delete this post');
  await deleteContent('post', id, me);
  res.json({ ok: true });
});

postsRouter.post('/posts/:id/like', async (req, res) => {
  const id = uuidParam(req.params.id, 'Post not found');
  const me = uid(req);
  if (await one(sql.UNLIKE, [id, me])) {
    res.json({ liked: false });
    return;
  }
  if (!(await one(sql.POST_AUTHOR, [id]))) throw notFound('Post not found');
  await query(sql.LIKE, [id, me]);
  res.json({ liked: true });
});

/* ───────────── Comments ───────────── */

postsRouter.get('/posts/:id/comments', async (req, res) => {
  const id = uuidParam(req.params.id, 'Post not found');
  if (!(await one(sql.POST_BY_ID, [uid(req), id]))) throw notFound('Post not found');
  res.json(await query(sql.LIST_COMMENTS, [id]));
});

const commentSchema = z.object({
  body: z.string().trim().min(1, 'cannot be empty').max(1500),
  parent_id: z.uuid().nullable().optional(),
});

postsRouter.post('/posts/:id/comments', async (req, res) => {
  const postId = uuidParam(req.params.id, 'Post not found');
  const me = uid(req);
  const c = parse(commentSchema, req.body);
  const post = await one<{ author_id: string }>(sql.POST_AUTHOR, [postId]);
  if (!post) throw notFound('Post not found');
  if (c.parent_id && !(await one(sql.COMMENT_PARENT_OK, [c.parent_id, postId]))) throw new HttpError(400, 'parent_id: reply not found');

  const inserted = await one<{ id: string }>(sql.INSERT_COMMENT, [postId, me, c.parent_id ?? null, c.body]);
  const comment = await one(sql.COMMENT_BY_ID, [inserted!.id]);
  emitTo(`post:${postId}`, 'comment:new', comment);
  await notify({ target: post.author_id, actor: me, title: 'New reply on your post', body: c.body.slice(0, 120), link: `/discussions/${postId}` });
  res.status(201).json(comment);
});

postsRouter.post('/comments/:id/best', async (req, res) => {
  const commentId = uuidParam(req.params.id, 'Reply not found');
  const me = uid(req);
  const row = await one<{ post_id: string; author_id: string; post_author_id: string }>(sql.COMMENT_POST, [commentId]);
  if (!row) throw notFound('Reply not found');
  if (row.post_author_id !== me) throw forbidden('Only the author of the post can choose the best answer');
  await query(sql.MARK_BEST, [commentId, row.post_id]);
  emitTo(`post:${row.post_id}`, 'comment:updated', { post_id: row.post_id, id: commentId });
  await notify({
    target: row.author_id,
    actor: me,
    title: 'Your reply was chosen as the best answer',
    body: null,
    link: `/discussions/${row.post_id}`,
  });
  res.json({ ok: true });
});

postsRouter.delete('/comments/:id', async (req, res) => {
  const commentId = uuidParam(req.params.id, 'Reply not found');
  const me = uid(req);
  const row = await one<{ post_id: string; author_id: string }>(sql.COMMENT_POST, [commentId]);
  if (!row) throw notFound('Reply not found');
  if (row.author_id !== me && !(await isAdmin(me))) throw forbidden('Only the author or an admin can delete this reply');
  await deleteContent('comment', commentId, me);
  emitTo(`post:${row.post_id}`, 'comment:updated', { post_id: row.post_id, id: commentId, deleted: true });
  res.json({ ok: true });
});
