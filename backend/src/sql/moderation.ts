// Reports, auto-hide and admin moderation

export const TARGET_TYPES = ['document', 'post', 'comment', 'item', 'lost_found', 'ride', 'user'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

/** Number of open reports from different people that hides the content automatically. */
export const AUTO_HIDE_THRESHOLD = 5;

/** Owner of each kind of target (null row = target not found). */
export const TARGET_OWNER: Record<TargetType, string> = {
  document: `select uploader_id as owner_id from public.documents where id = $1`,
  post: `select author_id as owner_id from public.posts where id = $1`,
  comment: `select author_id as owner_id from public.comments where id = $1`,
  item: `select owner_id from public.items where id = $1`,
  lost_found: `select reporter_id as owner_id from public.lost_found where id = $1`,
  ride: `select driver_id as owner_id from public.rides where id = $1`,
  user: `select id as owner_id from public.profiles where id = $1`,
};

/** Hide / unhide. The user target has no hidden flag (use a ban). */
const TABLE_OF: Record<Exclude<TargetType, 'user'>, string> = {
  document: 'documents',
  post: 'posts',
  comment: 'comments',
  item: 'items',
  lost_found: 'lost_found',
  ride: 'rides',
};

export const hideSql = (t: Exclude<TargetType, 'user'>) =>
  `update public.${TABLE_OF[t]} set hidden_at = coalesce(hidden_at, now()) where id = $1`;

export const unhideSql = (t: Exclude<TargetType, 'user'>) => `update public.${TABLE_OF[t]} set hidden_at = null where id = $1`;

/** $1 reporter, $2 type, $3 target, $4 reason. Nothing happens if this person already has an open report on it. */
export const INSERT_REPORT = `
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values ($1, $2, $3, $4)
  on conflict do nothing
  returning id`;

export const OPEN_REPORT_COUNT = `
  select count(distinct reporter_id)::int as count
    from public.reports
   where target_type = $1 and target_id = $2 and status = 'open'`;

/** $1 status|null (null = all), $2 limit */
export const LIST_REPORTS = `
  select r.id, r.target_type, r.target_id, r.reason, r.status, r.action, r.created_at, r.resolved_at,
         json_build_object('id', rp.id, 'full_name', rp.full_name, 'email', rp.email) as reporter,
         (select count(*)::int from public.reports r2
           where r2.target_type = r.target_type and r2.target_id = r.target_id and r2.status = 'open') as open_reports,
         t.preview, t.owner_id, t.hidden_at,
         case when t.owner_id is null then null
              else json_build_object('id', op.id, 'full_name', op.full_name, 'email', op.email,
                                     'banned', ou.banned_at is not null) end as owner
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join lateral (
      select d.title as preview, d.uploader_id as owner_id, d.hidden_at
        from public.documents d where r.target_type = 'document' and d.id = r.target_id
      union all
      select left(p.body, 200), p.author_id, p.hidden_at
        from public.posts p where r.target_type = 'post' and p.id = r.target_id
      union all
      select left(c.body, 200), c.author_id, c.hidden_at
        from public.comments c where r.target_type = 'comment' and c.id = r.target_id
      union all
      select i.title, i.owner_id, i.hidden_at
        from public.items i where r.target_type = 'item' and i.id = r.target_id
      union all
      select lf.title, lf.reporter_id, lf.hidden_at
        from public.lost_found lf where r.target_type = 'lost_found' and lf.id = r.target_id
      union all
      select rd.from_place || ' → ' || rd.to_place, rd.driver_id, rd.hidden_at
        from public.rides rd where r.target_type = 'ride' and rd.id = r.target_id
      union all
      select pr.full_name, pr.id, null::timestamptz
        from public.profiles pr where r.target_type = 'user' and pr.id = r.target_id
    ) t on true
    left join public.profiles op on op.id = t.owner_id
    left join public.users    ou on ou.id = t.owner_id
   where ($1::text is null or r.status = $1)
   order by r.created_at desc
   limit $2`;

export const REPORT_BY_ID = `select id, target_type, target_id, status from public.reports where id = $1`;

/** Close every open report on the same target. $1 type, $2 target, $3 new status, $4 action, $5 admin */
export const CLOSE_REPORTS_ON_TARGET = `
  update public.reports
     set status = $3, action = $4, resolved_by = $5, resolved_at = now()
   where target_type = $1 and target_id = $2 and status = 'open'
  returning id`;

/** The report itself, even if it was already closed. $1 report, $2 status, $3 action, $4 admin */
export const CLOSE_REPORT = `
  update public.reports
     set status = $2, action = $3, resolved_by = $4, resolved_at = now()
   where id = $1`;

export const PROFILE_ROLE_OF = `select role from public.profiles where id = $1`;
