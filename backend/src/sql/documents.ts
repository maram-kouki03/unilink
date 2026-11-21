// Documents library: levels → periods → (tracks) → subjects → documents, contributions and moderation.

export const DOC_TYPES = ['course', 'td', 'tp', 'exam', 'correction', 'other'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const DOC_SOURCES = ['upload', 'drive_file', 'drive_folder'] as const;
export type DocSource = (typeof DOC_SOURCES)[number];
export const REPORT_REASONS = ['wrong_file', 'unreadable', 'wrong_subject', 'copyrighted', 'duplicate', 'other'] as const;
export const REJECT_REASONS = ['duplicate', 'unreadable', 'wrong_subject', 'copyrighted', 'other'] as const;

/** Open reports that hide a document automatically. */
export const AUTO_HIDE_REPORTS = 5;
/** Approved contributions that make a student "trusted" automatically. */
export const TRUST_THRESHOLD = 5;

/** Not replaced by an approved newer version. Needs alias d. */
const NOT_REPLACED = `not exists (select 1 from public.documents nv where nv.id = d.replaced_by_id and nv.status = 'approved')`;

/** A document students see in lists: approved, a file (not a folder container), latest version. */
export const LIVE = `(d.status = 'approved' and d.source <> 'drive_folder' and ${NOT_REPLACED})`;

/**
 * Public columns of a document (never the Cloudinary id or storage details) with uploader{} and subject{period{level{}}},
 * plus flags for the viewer `me` ($ parameter number given). Needs DOC_JOINS.
 */
export const docColumns = (me: number) => `
  d.id, d.subject_id, d.title, d.type, d.number, d.academic_year, d.source, d.status,
  d.uploader_id, d.file_name, d.file_ext, d.size_bytes, d.mime_type, d.drive_file_id, d.drive_url,
  d.parent_folder_doc_id, d.correction_of_id, d.version, d.replaced_by_id,
  d.reject_reason, d.reject_note, d.reviewed_at, d.hidden_reason,
  d.open_count, d.download_count, d.useful_count, d.report_count, d.created_at, d.updated_at,
  (d.uploader_id = $${me}) as mine,
  exists (select 1 from public.document_stars x where x.document_id = d.id and x.user_id = $${me}) as starred,
  exists (select 1 from public.document_useful_votes v where v.document_id = d.id and v.user_id = $${me}) as voted_useful,
  (select c.id from public.documents c
    where c.correction_of_id = d.id and c.status = 'approved'
    order by c.useful_count desc, c.created_at desc limit 1) as correction_id,
  case when u.id is null then null
       else json_build_object('id', u.id, 'full_name', u.full_name, 'level', u.level, 'avatar_url', u.avatar_url,
                              'trusted', u.trusted, 'role', u.role) end as uploader,
  json_build_object(
    'id', s.id, 'name', s.name, 'code', s.code,
    'period', json_build_object(
      'id', p.id, 'name', p.name,
      'level', json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name))) as subject`;

export const DOC_JOINS = `
  join public.subjects s on s.id = d.subject_id
  join public.periods  p on p.id = s.period_id
  join public.levels   l on l.id = p.level_id
  left join public.profiles u on u.id = d.uploader_id`;

/* ───────────── Academic structure (with counts of live documents) ───────────── */

const LIVE_COUNT_SUBJECT = `
  left join lateral (
    select count(*)::int as files, max(d.created_at) as last_updated
      from public.documents d where d.subject_id = s.id and ${LIVE}
  ) c on true`;

const LEVEL_STATS = `
  select l.id, l.code, l.name, l.short_name, l.sort,
         coalesce(sum(c.files), 0)::int as files,
         max(c.last_updated) as last_updated
    from public.levels l
    left join public.periods  p on p.level_id = l.id
    left join public.subjects s on s.period_id = p.id
    ${LIVE_COUNT_SUBJECT}`;

export const LIST_LEVELS = `${LEVEL_STATS} group by l.id order by l.sort, l.id`;
export const LEVEL_BY_ID = `${LEVEL_STATS} where l.id = $1 group by l.id`;
export const LEVEL_BY_CODE = `select id, code, name, short_name, sort from public.levels where code = $1`;

const PERIOD_STATS = `
  select p.id, p.level_id, p.name, p.label, p.months, p.start_month, p.end_month, p.sort,
         count(s.id)::int as subjects,
         coalesce(sum(c.files), 0)::int as files,
         max(c.last_updated) as last_updated
    from public.periods p
    left join public.subjects s on s.period_id = p.id
    ${LIVE_COUNT_SUBJECT}`;

export const PERIODS_OF_LEVEL = `${PERIOD_STATS} where p.level_id = $1 group by p.id order by p.sort, p.name`;

export const PERIOD_BY_ID = `
  select ps.*, json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name) as level
    from (${PERIOD_STATS} where p.id = $1 group by p.id) ps
    join public.levels l on l.id = ps.level_id`;

export const TRACKS_OF_LEVEL = `select id, level_id, name, code, sort from public.tracks where level_id = $1 order by sort, name`;
export const TRACK_BY_ID = `select id, level_id, name, code, sort from public.tracks where id = $1`;

const SUBJECT_SELECT = `
  select s.id, s.period_id, s.name, s.code, s.color, s.track_id, s.drive_folder_id, s.drive_synced_at,
         c.files, c.last_updated,
         case when t.id is null then null else json_build_object('id', t.id, 'name', t.name, 'code', t.code) end as track
    from public.subjects s
    left join public.tracks t on t.id = s.track_id
    ${LIVE_COUNT_SUBJECT}`;

export const SUBJECTS_OF_PERIOD = `${SUBJECT_SELECT} where s.period_id = $1 order by s.name`;

/** $1 period, $2 track|null: subjects common to everyone + the ones of my track. */
export const CLASS_SUBJECTS = `${SUBJECT_SELECT} where s.period_id = $1 and (s.track_id is null or s.track_id = $2) order by s.name`;

export const SUBJECT_BY_ID = `
  select ss.*,
         json_build_object('id', p.id, 'name', p.name,
           'level', json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name)) as period
    from (${SUBJECT_SELECT} where s.id = $1) ss
    join public.periods p on p.id = ss.period_id
    join public.levels  l on l.id = p.level_id`;

/** Internal: subject name + level (for permissions and titles). */
export const SUBJECT_LEVEL = `
  select s.id, s.name, s.drive_folder_id, p.level_id
    from public.subjects s join public.periods p on p.id = s.period_id
   where s.id = $1`;

export const FOLDER_TREE = `
  select l.id, l.code, l.name, l.short_name, l.sort,
         coalesce((
           select json_agg(json_build_object(
                    'id', p.id, 'name', p.name, 'sort', p.sort, 'label', p.label, 'months', p.months,
                    'start_month', p.start_month, 'end_month', p.end_month,
                    'subjects', coalesce((
                      select json_agg(json_build_object('id', s.id, 'name', s.name, 'code', s.code, 'track_id', s.track_id,
                                                        'color', s.color, 'drive_folder_id', s.drive_folder_id,
                                                        'drive_synced_at', s.drive_synced_at)
                                      order by s.name)
                        from public.subjects s where s.period_id = p.id), '[]'::json))
                  order by p.sort)
             from public.periods p where p.level_id = l.id), '[]'::json) as periods,
         coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'code', t.code, 'sort', t.sort) order by t.sort, t.name)
                     from public.tracks t where t.level_id = l.id), '[]'::json) as tracks
    from public.levels l
   order by l.sort, l.id`;

export const MY_PROFILE_CLASS = `select level, period, track_id from public.profiles where id = $1`;
export const SET_MY_TRACK = `update public.profiles set track_id = $2 where id = $1 returning id, level, period, track_id`;

/* ───────────── Document lists ───────────── */

/**
 * $1 subject, $2 me, $3 type|null, $4 year|null, $5 sort ('useful'|'recent').
 * Live documents + my own pending/rejected ones (flagged by status/mine).
 */
export const DOCS_OF_SUBJECT = `
  select ${docColumns(2)}
    from public.documents d ${DOC_JOINS}
   where d.subject_id = $1
     and (${LIVE}
          or (d.uploader_id = $2 and d.status in ('pending', 'rejected') and d.parent_folder_doc_id is null))
     and ($3::text is null or d.type = $3)
     and ($4::text is null or d.academic_year = $4)
   order by (d.status = 'approved') asc,
            case when $5 = 'useful' then d.useful_count end desc nulls last,
            d.created_at desc
   limit 500`;

/** $1 me, $2 escaped search|null, $3 subject|null, $4 type|null, $5 year|null */
export const SEARCH_DOCS = `
  select ${docColumns(1)}
    from public.documents d ${DOC_JOINS}
   where ${LIVE}
     and ($2::text is null or d.title ilike '%' || $2 || '%' or s.name ilike '%' || $2 || '%'
          or s.code ilike '%' || $2 || '%' or d.file_name ilike '%' || $2 || '%')
     and ($3::uuid is null or d.subject_id = $3)
     and ($4::text is null or d.type = $4)
     and ($5::text is null or d.academic_year = $5)
   order by d.useful_count desc, d.created_at desc
   limit 50`;

export const RECENT_DOCS = `
  select ${docColumns(1)}, o.opened_at
    from public.document_opens o
    join public.documents d on d.id = o.document_id ${DOC_JOINS}
   where o.user_id = $1 and (${LIVE} or d.uploader_id = $1)
   order by o.opened_at desc
   limit 20`;

export const STARRED_DOCS = `
  select ${docColumns(1)}, st.created_at as starred_at
    from public.document_stars st
    join public.documents d on d.id = st.document_id ${DOC_JOINS}
   where st.user_id = $1 and d.status = 'approved'
   order by st.created_at desc`;

/** My contributions (not the files imported from my folders), every status. */
export const MY_CONTRIBUTIONS = `
  select ${docColumns(1)},
         (select count(*)::int from public.documents ch where ch.parent_folder_doc_id = d.id) as children_count
    from public.documents d ${DOC_JOINS}
   where d.uploader_id = $1 and d.parent_folder_doc_id is null
   order by d.created_at desc
   limit 500`;

export const ACTIVITY_UPLOADS = MY_CONTRIBUTIONS;

/** $1 limit */
export const TOP_CONTRIBUTORS = `
  select u.id, u.full_name, u.level, u.avatar_url, u.trusted, u.role,
         count(d.id)::int as approved_count,
         coalesce(sum(d.useful_count), 0)::int as useful_total
    from public.documents d
    join public.profiles u on u.id = d.uploader_id
   where d.status = 'approved' and d.parent_folder_doc_id is null
   group by u.id
   order by approved_count desc, useful_total desc
   limit $1`;

/** $1 document, $2 me. Permission checks are done in code (canSee). */
export const DOC_BY_ID = `
  select ${docColumns(2)},
         (select count(*)::int from public.documents ch where ch.parent_folder_doc_id = d.id) as children_count,
         p.level_id
    from public.documents d ${DOC_JOINS}
   where d.id = $1`;

/** $1 folder document, $2 me */
export const FOLDER_CHILDREN = `
  select ${docColumns(2)}
    from public.documents d ${DOC_JOINS}
   where d.parent_folder_doc_id = $1 and d.status = 'approved'
   order by d.type, d.title`;

/** Corrections linked to an exam. $1 exam, $2 me */
export const CORRECTIONS_OF = `
  select ${docColumns(2)}
    from public.documents d ${DOC_JOINS}
   where d.correction_of_id = $1 and ${LIVE}
   order by d.created_at desc`;

/** Internal: everything needed for permissions, files and moderation. */
export const DOC_INTERNAL = `
  select d.id, d.subject_id, d.title, d.type, d.number, d.academic_year, d.source, d.status, d.uploader_id,
         d.cloudinary_public_id, d.storage_resource_type, d.storage_format, d.file_name, d.file_ext, d.mime_type,
         d.size_bytes, d.drive_file_id, d.drive_url, d.parent_folder_doc_id, d.correction_of_id, d.version,
         d.replaced_by_id, d.hidden_reason, d.sha256,
         s.name as subject_name, p.level_id,
         (select nv.status from public.documents nv where nv.id = d.replaced_by_id) as replaced_by_status
    from public.documents d
    join public.subjects s on s.id = d.subject_id
    join public.periods  p on p.id = s.period_id
   where d.id = $1`;

/* ───────────── Duplicates ───────────── */

export const DUP_BY_SHA = `
  select id, title, status from public.documents
   where sha256 = $1 and status <> 'rejected'
   limit 1`;

/** Same Drive file/folder already in the library (pending, approved or hidden). $1 drive id, $2 source|null */
export const DUP_BY_DRIVE_ID = `
  select id, title, status from public.documents
   where drive_file_id = $1 and status <> 'rejected'
     and ($2::text is null or source = $2)
   order by (status = 'approved') desc
   limit 1`;

/* ───────────── Stars, votes, opens, downloads ───────────── */

export const UNSTAR = `delete from public.document_stars where user_id = $1 and document_id = $2 returning document_id`;
export const STAR = `insert into public.document_stars (user_id, document_id) values ($1, $2) on conflict do nothing`;

export const UNVOTE_USEFUL = `delete from public.document_useful_votes where user_id = $1 and document_id = $2 returning document_id`;
export const VOTE_USEFUL = `insert into public.document_useful_votes (user_id, document_id) values ($1, $2) on conflict do nothing`;
export const REFRESH_USEFUL_COUNT = `
  update public.documents
     set useful_count = (select count(*)::int from public.document_useful_votes v where v.document_id = $1)
   where id = $1
  returning useful_count`;

export const RECORD_OPEN = `
  insert into public.document_opens (user_id, document_id, opened_at) values ($1, $2, now())
  on conflict (user_id, document_id) do update set opened_at = now()`;
export const INCREMENT_OPEN = `update public.documents set open_count = open_count + 1 where id = $1 returning open_count`;
export const INCREMENT_DOWNLOAD = `update public.documents set download_count = download_count + 1 where id = $1 returning download_count`;

/* ───────────── Reports ───────────── */

/** $1 document, $2 reporter, $3 reason, $4 comment|null. Nothing happens if this person already has an open report. */
export const INSERT_DOC_REPORT = `
  insert into public.document_reports (document_id, reporter_id, reason, comment)
  values ($1, $2, $3, $4)
  on conflict (document_id, reporter_id) where status = 'open' do nothing
  returning id`;

export const REFRESH_REPORT_COUNT = `
  update public.documents
     set report_count = (select count(*)::int from public.document_reports r where r.document_id = $1 and r.status = 'open')
   where id = $1
  returning report_count, status`;

/** Auto-hide: only an approved document, only once. */
export const AUTO_HIDE = `
  update public.documents
     set status = 'hidden', hidden_reason = 'reports', updated_at = now()
   where id = $1 and status = 'approved'
  returning id`;

/** $1 level ids|null (null = all), $2 status ('open'|'resolved'|null) */
export const LIST_DOC_REPORTS = `
  select r.id, r.reason, r.comment, r.status, r.action, r.created_at, r.resolved_at,
         json_build_object('id', rp.id, 'full_name', rp.full_name, 'email', rp.email) as reporter,
         json_build_object('id', d.id, 'title', d.title, 'status', d.status, 'source', d.source, 'type', d.type,
                           'report_count', d.report_count, 'hidden_reason', d.hidden_reason,
                           'subject', json_build_object('id', s.id, 'name', s.name),
                           'level', json_build_object('id', l.id, 'short_name', l.short_name),
                           'uploader', case when up.id is null then null
                                            else json_build_object('id', up.id, 'full_name', up.full_name, 'email', up.email) end)
           as document
    from public.document_reports r
    join public.documents d on d.id = r.document_id
    join public.subjects  s on s.id = d.subject_id
    join public.periods   p on p.id = s.period_id
    join public.levels    l on l.id = p.level_id
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles up on up.id = d.uploader_id
   where ($1::smallint[] is null or p.level_id = any($1))
     and ($2::text is null or r.status = $2)
   order by d.report_count desc, r.created_at
   limit 200`;

export const DOC_REPORT_BY_ID = `select id, document_id, status from public.document_reports where id = $1`;

/** Close every open report on a document. $1 document, $2 action, $3 moderator */
export const RESOLVE_DOC_REPORTS = `
  update public.document_reports
     set status = 'resolved', action = $2, resolved_by = $3, resolved_at = now()
   where document_id = $1 and status = 'open'
  returning id`;

/* ───────────── Moderation ───────────── */

/** $1 user → role, trusted, moderated level ids. */
export const STAFF_OF = `
  select p.role, p.trusted,
         coalesce(array_agg(ml.level_id order by ml.level_id) filter (where ml.level_id is not null), '{}') as level_ids
    from public.profiles p
    left join public.moderator_levels ml on ml.user_id = p.id
   where p.id = $1
   group by p.id`;

/** Moderators of a level (or every admin when the level has none). */
export const MODERATORS_OF_LEVEL = `
  with mods as (
    select ml.user_id from public.moderator_levels ml
      join public.profiles p on p.id = ml.user_id
      join public.users us on us.id = p.id
     where ml.level_id = $1 and p.role = 'moderator' and us.banned_at is null
  )
  select user_id from mods
  union
  select p.id from public.profiles p join public.users us on us.id = p.id
   where p.role = 'admin' and us.banned_at is null and not exists (select 1 from mods)`;

/** $1 level ids|null, $2 level|null, $3 subject|null */
export const MOD_QUEUE = `
  select d.id, d.subject_id, d.title, d.type, d.number, d.academic_year, d.source, d.status, d.version,
         d.file_name, d.file_ext, d.size_bytes, d.mime_type, d.drive_file_id, d.drive_url, d.correction_of_id,
         d.replaced_by_id, d.created_at, d.cloudinary_public_id, d.storage_resource_type, d.storage_format,
         (select o.id from public.documents o where o.replaced_by_id = d.id limit 1) as previous_version_id,
         json_build_object('id', s.id, 'name', s.name, 'code', s.code,
           'period', json_build_object('id', p.id, 'name', p.name,
             'level', json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name))) as subject,
         case when u.id is null then null else json_build_object(
           'id', u.id, 'full_name', u.full_name, 'email', u.email, 'level', u.level, 'trusted', u.trusted,
           'approved_count', (select count(*)::int from public.documents a
                               where a.uploader_id = u.id and a.status = 'approved' and a.parent_folder_doc_id is null),
           'rejected_count', (select count(*)::int from public.documents a
                               where a.uploader_id = u.id and a.status = 'rejected')) end as uploader
    from public.documents d ${DOC_JOINS}
   where d.status = 'pending'
     and ($1::smallint[] is null or p.level_id = any($1))
     and ($2::smallint is null or p.level_id = $2)
     and ($3::uuid is null or d.subject_id = $3)
   order by d.created_at asc
   limit 200`;

/** Moderation change. $1 doc, $2 status, $3 moderator, $4 reject_reason, $5 reject_note, $6 hidden_reason */
export const SET_STATUS = `
  update public.documents
     set status = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now(),
         reject_reason = $4, reject_note = $5, hidden_reason = $6
   where id = $1
  returning id, status`;

/** Folder hidden/rejected → its files too; folder restored → files hidden because of it come back. */
export const HIDE_FOLDER_CHILDREN = `
  update public.documents set status = 'hidden', hidden_reason = 'folder', updated_at = now()
   where parent_folder_doc_id = $1 and status = 'approved'`;
export const RESTORE_FOLDER_CHILDREN = `
  update public.documents set status = 'approved', hidden_reason = null, updated_at = now()
   where parent_folder_doc_id = $1 and status = 'hidden' and hidden_reason = 'folder'`;

/** $1 doc, $2 actor, $3 action, $4 title, $5 target user, $6 report, $7 details json */
export const INSERT_LOG = `
  insert into public.moderation_log (document_id, actor_id, action, document_title, target_user_id, report_id, details)
  values ($1, $2, $3, $4, $5, $6, coalesce($7::jsonb, '{}'::jsonb))`;

/** Becomes trusted after TRUST_THRESHOLD approved contributions (unless a moderator decided otherwise). */
export const AUTO_TRUST = `
  update public.profiles pr
     set trusted = true
   where pr.id = $1 and not pr.trusted and not pr.trusted_locked
     and (select count(*) from public.documents d
           where d.uploader_id = pr.id and d.status = 'approved' and d.parent_folder_doc_id is null) >= ${TRUST_THRESHOLD}
  returning pr.id`;

/** $1 escaped search|null */
export const MOD_USERS = `
  select pr.id, pr.full_name, pr.email, pr.username, pr.level, pr.role, pr.trusted, pr.trusted_locked, pr.avatar_url,
         us.banned_at is not null as suspended, us.banned_at,
         coalesce((select array_agg(ml.level_id order by ml.level_id) from public.moderator_levels ml where ml.user_id = pr.id), '{}')
           as moderated_level_ids,
         (select count(*)::int from public.documents d
           where d.uploader_id = pr.id and d.status = 'approved' and d.parent_folder_doc_id is null) as approved_count,
         (select count(*)::int from public.documents d where d.uploader_id = pr.id and d.status = 'pending') as pending_count,
         (select count(*)::int from public.documents d where d.uploader_id = pr.id and d.status = 'rejected') as rejected_count
    from public.profiles pr
    join public.users us on us.id = pr.id
   where ($1::text is null or pr.full_name ilike '%' || $1 || '%' or pr.email ilike '%' || $1 || '%'
          or pr.username ilike '%' || $1 || '%')
   order by approved_count desc, pr.full_name
   limit 50`;

export const USER_ROLE = `select p.role, us.banned_at from public.profiles p join public.users us on us.id = p.id where p.id = $1`;
export const SET_TRUSTED = `
  update public.profiles set trusted = $2, trusted_locked = true where id = $1
  returning id, trusted, trusted_locked`;
export const SET_ROLE = `update public.profiles set role = $2 where id = $1 returning id, role`;
export const CLEAR_MOD_LEVELS = `delete from public.moderator_levels where user_id = $1`;
export const ADD_MOD_LEVELS = `
  insert into public.moderator_levels (user_id, level_id)
  select $1, unnest($2::smallint[]) on conflict do nothing`;
export const EXISTING_LEVEL_IDS = `select id from public.levels where id = any($1::smallint[])`;

/** $1 level ids|null */
export const MOD_STATS = `
  with scope as (
    select s.id as subject_id from public.subjects s join public.periods p on p.id = s.period_id
     where $1::smallint[] is null or p.level_id = any($1)
  )
  select
    (select count(*)::int from public.documents d join scope on scope.subject_id = d.subject_id
      where d.status = 'pending') as pending,
    (select count(*)::int from public.documents d join scope on scope.subject_id = d.subject_id
      where d.status = 'approved' and d.parent_folder_doc_id is null
        and coalesce(d.reviewed_at, d.created_at) >= now() - interval '7 days') as approved_this_week,
    (select count(*)::int from public.document_reports r join public.documents d on d.id = r.document_id
       join scope on scope.subject_id = d.subject_id where r.status = 'open') as open_reports,
    (select count(*)::int from public.documents d join scope on scope.subject_id = d.subject_id
      where d.status = 'hidden') as hidden,
    coalesce((select json_agg(t) from (
       select u.id, u.full_name, u.level, u.trusted, count(*)::int as approved_count
         from public.documents d join scope on scope.subject_id = d.subject_id
         join public.profiles u on u.id = d.uploader_id
        where d.status = 'approved' and d.parent_folder_doc_id is null
        group by u.id order by approved_count desc limit 10) t), '[]'::json) as top_contributors,
    coalesce((select json_agg(t) from (
       select s.id, s.name, s.code, p.name as period, l.short_name as level
         from public.subjects s
         join scope on scope.subject_id = s.id
         join public.periods p on p.id = s.period_id
         join public.levels  l on l.id = p.level_id
        where not exists (select 1 from public.documents d where d.subject_id = s.id and ${LIVE})
        order by l.sort, p.sort, s.name limit 200) t), '[]'::json) as empty_subjects`;

/* ───────────── Google Drive sync ───────────── */

/** Claims the subject for a re-sync (at most every 6 hours) if it has a Drive folder. */
export const CLAIM_SUBJECT_SYNC = `
  update public.subjects s
     set drive_synced_at = now()
   where s.id = $1
     and (s.drive_synced_at is null or s.drive_synced_at < now() - interval '6 hours')
     and (s.drive_folder_id is not null
          or exists (select 1 from public.documents d
                      where d.subject_id = s.id and d.source = 'drive_folder' and d.status = 'approved'))
  returning s.id`;

export const TOUCH_SUBJECT_SYNC = `update public.subjects set drive_synced_at = now() where id = $1`;

/** Approved folder documents of a subject. */
export const FOLDERS_OF_SUBJECT = `
  select id, subject_id, uploader_id, academic_year, type, drive_file_id, title
    from public.documents
   where subject_id = $1 and source = 'drive_folder' and status = 'approved'`;

export const FOLDER_DOC_FOR = `
  select id from public.documents
   where subject_id = $1 and source = 'drive_folder' and drive_file_id = $2 and status <> 'rejected'
   limit 1`;

export const CHILDREN_STATE = `
  select id, drive_file_id, status, hidden_reason, drive_modified_at
    from public.documents where parent_folder_doc_id = $1`;

/** Subjects that have something to sync. $1 level ids|null */
export const SUBJECTS_TO_SYNC = `
  select s.id from public.subjects s join public.periods p on p.id = s.period_id
   where ($1::smallint[] is null or p.level_id = any($1))
     and (s.drive_folder_id is not null
          or exists (select 1 from public.documents d
                      where d.subject_id = s.id and d.source = 'drive_folder' and d.status = 'approved'))`;
