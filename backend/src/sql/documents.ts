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

/* ── folders ── */

export const LIST_LEVELS = `select * from public.level_stats order by sort`;

export const LEVEL_BY_ID = `select * from public.level_stats where id = $1`;

export const PERIODS_OF_LEVEL = `select * from public.period_stats where level_id = $1 order by sort`;

export const PERIOD_BY_ID = `
  select ps.*, json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name) as level
    from public.period_stats ps
    join public.levels l on l.id = ps.level_id
   where ps.id = $1`;

export const SUBJECTS_OF_PERIOD = `select * from public.subject_stats where period_id = $1 order by name`;

export const SUBJECT_BY_ID = `
  select ss.*,
         json_build_object('id', p.id, 'name', p.name,
           'level', json_build_object('id', l.id, 'name', l.name, 'short_name', l.short_name)) as period
    from public.subject_stats ss
    join public.periods p on p.id = ss.period_id
    join public.levels  l on l.id = p.level_id
   where ss.id = $1`;

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
     and ($2::text is null or d.doc_type = $2)
     and ($3::text is null or d.title ilike '%' || $3 || '%')
   order by d.created_at desc`;

/** $1 escaped search|null, $2 doc_type|null */
export const SEARCH_DOCS = `
  select ${DOC_COLUMNS}
    from public.documents d ${DOC_JOINS}
   where ($1::text is null or d.title ilike '%' || $1 || '%')
     and ($2::text is null or d.doc_type = $2)
   order by d.created_at desc
   limit 40`;

export const RECENT_DOCS = `
  select ${DOC_COLUMNS}, o.opened_at
    from public.document_opens o
    join public.documents d on d.id = o.document_id ${DOC_JOINS}
   where o.user_id = $1
   order by o.opened_at desc
   limit 8`;

export const STARRED_DOCS = `
  select ${DOC_COLUMNS}
    from public.document_stars st
    join public.documents d on d.id = st.document_id ${DOC_JOINS}
   where st.user_id = $1
   order by st.created_at desc`;

export const MY_DOCS = `
  select ${DOC_COLUMNS}
    from public.documents d ${DOC_JOINS}
   where d.uploader_id = $1
   order by d.created_at desc`;

export const ACTIVITY_UPLOADS = MY_DOCS;

/** $1 document, $2 me */
export const DOC_BY_ID = `
  select ${DOC_COLUMNS},
         exists (select 1 from public.document_stars x where x.document_id = d.id and x.user_id = $2) as starred
    from public.documents d ${DOC_JOINS}
   where d.id = $1`;

export const DOC_FILE = `select id, file_path, file_name, file_ext, uploader_id from public.documents where id = $1`;

/* ── writes ── */

export const INSERT_DOC = `
  insert into public.documents
    (subject_id, title, doc_type, academic_year, file_path, file_name, file_ext, size_bytes, drive_url, uploader_id)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  returning id`;

export const DELETE_DOC = `delete from public.documents where id = $1`;

export const UNSTAR = `delete from public.document_stars where user_id = $1 and document_id = $2 returning document_id`;

export const STAR = `
  insert into public.document_stars (user_id, document_id) values ($1, $2)
  on conflict do nothing`;

export const RECORD_OPEN = `
  insert into public.document_opens (user_id, document_id, opened_at) values ($1, $2, now())
  on conflict (user_id, document_id) do update set opened_at = now()`;

export const INCREMENT_DOWNLOAD = `
  update public.documents set downloads = downloads + 1 where id = $1 returning downloads`;

export const REPORT_DOC = `
  insert into public.document_reports (document_id, reporter_id, reason) values ($1, $2, $3)
  on conflict (document_id, reporter_id) do nothing`;
