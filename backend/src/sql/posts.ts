// Discussions. $1 is always the signed-in user (for liked_by_me).

/** Same columns as the old posts_feed view. */
const POST_FEED = `
  select po.id, po.author_id, po.scope, po.level_code, po.topic, po.body, po.created_at,
         pr.full_name as author_name,
         pr.level     as author_level,
         (select count(*)::int from public.post_likes l where l.post_id = po.id) as likes_count,
         (select count(*)::int from public.comments  c where c.post_id = po.id) as comments_count,
         exists (select 1 from public.post_likes l where l.post_id = po.id and l.user_id = $1) as liked_by_me
    from public.posts po
    join public.profiles pr on pr.id = po.author_id`;

/** $2 scope, $3 level_code|null */
export const LIST_POSTS = `
  ${POST_FEED}
   where po.scope = $2
     and ($3::text is null or po.level_code = $3)
   order by po.created_at desc
   limit 50`;

export const ACTIVITY_POSTS = `${POST_FEED} where po.author_id = $1 order by po.created_at desc`;

/** $2 post id */
export const POST_BY_ID = `${POST_FEED} where po.id = $2`;

export const POST_AUTHOR = `select author_id from public.posts where id = $1`;

export const INSERT_POST = `
  insert into public.posts (author_id, scope, level_code, topic, body)
  values ($1, $2, $3, $4, $5)
  returning id`;

/** $1 post, $2 me */
export const UNLIKE = `delete from public.post_likes where post_id = $1 and user_id = $2 returning post_id`;

export const LIKE = `
  insert into public.post_likes (post_id, user_id) values ($1, $2)
  on conflict do nothing`;

/* ── comments ── */

const COMMENT_SELECT = `
  select c.*, json_build_object('id', a.id, 'full_name', a.full_name, 'level', a.level) as author
    from public.comments c
    join public.profiles a on a.id = c.author_id`;

/** Best answer first, then oldest first. */
export const LIST_COMMENTS = `${COMMENT_SELECT} where c.post_id = $1 order by c.is_best desc, c.created_at`;

export const COMMENT_BY_ID = `${COMMENT_SELECT} where c.id = $1`;

export const COMMENT_PARENT_OK = `select 1 from public.comments where id = $1 and post_id = $2`;

export const INSERT_COMMENT = `
  insert into public.comments (post_id, author_id, parent_id, body)
  values ($1, $2, $3, $4)
  returning id`;

/** The comment's post and that post's author. */
export const COMMENT_POST = `
  select c.post_id, p.author_id as post_author_id
    from public.comments c
    join public.posts p on p.id = c.post_id
   where c.id = $1`;

/** $1 comment (becomes the only best answer), $2 post */
export const MARK_BEST = `update public.comments set is_best = (id = $1) where post_id = $2`;
