// Documents library: levels → periods → subjects → documents

/** Columns of a document row with uploader{} and subject{period{level{}}}. Needs DOC_JOINS. */
const DOC_COLUMNS = `
  d.*,
  case when u.id is null then null
       else json_build_object('id', u.id, 'full_name', u.full_name, 'level', u.level) end as uploader,
  json_build_object(
    'id', s.id, 'name', s.name,
    'period', json_build_object(
      'id', p.id, 'name', p.name,
      'level', json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name))) as subject`;

const DOC_JOINS = `
  join public.subjects s on s.id = d.subject_id
  join public.periods  p on p.id = s.period_id
  join public.levels   l on l.id = p.level_id
  left join public.profiles u on u.id = d.uploader_id`;

/* ── folders (counts only visible documents; no dependency on the old *_stats views) ── */

const LEVEL_STATS = `
  select l.id, l.code, l.name, l.short_name, l.sort,
         count(d.id)::int as files,
         max(d.created_at) as last_updated
    from public.levels l
    left join public.periods  p on p.level_id = l.id
    left join public.subjects s on s.period_id = p.id
    left join public.documents d on d.subject_id = s.id and d.hidden_at is null`;

export const LIST_LEVELS = `${LEVEL_STATS} group by l.id order by l.sort`;

export const LEVEL_BY_ID = `${LEVEL_STATS} where l.id = $1 group by l.id`;

const PERIOD_STATS = `
  select p.id, p.level_id, p.name, p.label, p.months, p.sort,
         count(distinct s.id)::int as subjects,
         count(d.id)::int as files,
         max(d.created_at) as last_updated
    from public.periods p
    left join public.subjects s on s.period_id = p.id
    left join public.documents d on d.subject_id = s.id and d.hidden_at is null`;

export const PERIODS_OF_LEVEL = `${PERIOD_STATS} where p.level_id = $1 group by p.id order by p.sort`;

export const PERIOD_BY_ID = `
  select ps.*, json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name) as level
    from (${PERIOD_STATS} where p.id = $1 group by p.id) ps
    join public.levels l on l.id = ps.level_id`;

const SUBJECT_STATS = `
  select s.id, s.period_id, s.name, s.color,
         count(d.id)::int as files,
         max(d.created_at) as last_updated
    from public.subjects s
    left join public.documents d on d.subject_id = s.id and d.hidden_at is null`;

export const SUBJECTS_OF_PERIOD = `${SUBJECT_STATS} where s.period_id = $1 group by s.id order by s.name`;

export const SUBJECT_BY_ID = `
  select ss.*,
         json_build_object('id', p.id, 'name', p.name,
           'level', json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name)) as period
    from (${SUBJECT_STATS} where s.id = $1 group by s.id) ss
    join public.periods p on p.id = ss.period_id
    join public.levels  l on l.id = p.level_id`;

export const FOLDER_TREE = `
  select l.id, l.code, l.name, l.short_name, l.sort,
         coalesce((
           select json_agg(json_build_object(
                    'id', p.id, 'name', p.name, 'sort', p.sort,
                    'subjects', coalesce((
                      select json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name)
                        from public.subjects s where s.period_id = p.id), '[]'::json))
                  order by p.sort)
             from public.periods p where p.level_id = l.id), '[]'::json) as periods
    from public.levels l
   order by l.sort`;

/* ── document lists ── */

/** $1 subject, $2 doc_type|null, $3 escaped search|null */
export const DOCS_OF_SUBJECT = `
  select ${DOC_COLUMNS}
    from public.documents d ${DOC_JOINS}
   where d.subject_id = $1
     and d.hidden_at is null
     and ($2::text is null or d.doc_type = $2)
     and ($3::text is null or d.title ilike '%' || $3 || '%')
   order by d.created_at desc`;

/** $1 escaped search|null, $2 doc_type|null */
export const SEARCH_DOCS = `
  select ${DOC_COLUMNS}
    from public.documents d ${DOC_JOINS}
   where d.hidden_at is null
     and ($1::text is null or d.title ilike '%' || $1 || '%' or s.name ilike '%' || $1 || '%')
     and ($2::text is null or d.doc_type = $2)
   order by d.created_at desc
   limit 40`;

export const RECENT_DOCS = `
  select ${DOC_COLUMNS}, o.opened_at
    from public.document_opens o
    join public.documents d on d.id = o.document_id ${DOC_JOINS}
   where o.user_id = $1 and d.hidden_at is null
   order by o.opened_at desc
   limit 8`;

export const STARRED_DOCS = `
  select ${DOC_COLUMNS}
    from public.document_stars st
    join public.documents d on d.id = st.document_id ${DOC_JOINS}
   where st.user_id = $1 and d.hidden_at is null
   order by st.created_at desc`;

export const MY_DOCS = `
  select ${DOC_COLUMNS}
    from public.documents d ${DOC_JOINS}
   where d.uploader_id = $1
   order by d.created_at desc`;

export const ACTIVITY_UPLOADS = MY_DOCS;

/** $1 document, $2 me, $3 I am admin. Hidden documents: only the uploader and admins see them. */
export const DOC_BY_ID = `
  select ${DOC_COLUMNS},
         exists (select 1 from public.document_stars x where x.document_id = d.id and x.user_id = $2) as starred
    from public.documents d ${DOC_JOINS}
   where d.id = $1
     and (d.hidden_at is null or d.uploader_id = $2 or $3::boolean)`;

export const DOC_FILE = `
  select id, file_path, file_name, file_ext, uploader_id, storage_resource_type, storage_format, hidden_at
    from public.documents where id = $1`;

/* ── writes ── */

/** file_path = Cloudinary public_id, $11 storage_resource_type, $12 storage_format */
export const INSERT_DOC = `
  insert into public.documents
    (subject_id, title, doc_type, academic_year, file_path, file_name, file_ext, size_bytes, drive_url, uploader_id,
     storage_resource_type, storage_format)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  returning id`;

export const UNSTAR = `delete from public.document_stars where user_id = $1 and document_id = $2 returning document_id`;

export const STAR = `
  insert into public.document_stars (user_id, document_id) values ($1, $2)
  on conflict do nothing`;

export const RECORD_OPEN = `
  insert into public.document_opens (user_id, document_id, opened_at) values ($1, $2, now())
  on conflict (user_id, document_id) do update set opened_at = now()`;

export const INCREMENT_DOWNLOAD = `
  update public.documents set downloads = downloads + 1 where id = $1 returning downloads`;
