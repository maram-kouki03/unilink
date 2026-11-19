// Rents & Borrow + Lost & Found

const ITEM_SELECT = `
  select i.*, json_build_object('id', o.id, 'full_name', o.full_name, 'level', o.level) as owner
    from public.items i
    join public.profiles o on o.id = i.owner_id`;

/** $1 mode, $2 escaped search|null */
export const LIST_ITEMS = `
  ${ITEM_SELECT}
   where i.mode = $1 and i.available and i.hidden_at is null
     and ($2::text is null or i.title ilike '%' || $2 || '%' or i.category ilike '%' || $2 || '%')
   order by i.created_at desc
   limit 60`;

export const MY_ITEMS = `${ITEM_SELECT} where i.owner_id = $1 order by i.created_at desc`;

export const ACTIVITY_ITEMS = MY_ITEMS;

/** $1 item, $2 me: hidden items only for their owner. */
export const ITEM_BY_ID = `${ITEM_SELECT} where i.id = $1 and (i.hidden_at is null or i.owner_id = $2)`;

export const INSERT_ITEM = `
  insert into public.items
    (owner_id, mode, title, description, category, price_tnd, price_unit, max_duration, condition, location, photo_path)
  values ($1, $2, $3, $4, coalesce($5, 'Other'), $6, coalesce($7, 'day'), $8, $9, $10, $11)
  returning id`;

export const ITEM_OWNER = `select owner_id from public.items where id = $1`;

export const SET_ITEM_AVAILABLE = `update public.items set available = $2 where id = $1 returning id, available`;

/* ── Lost & Found ── */

export const LIST_LOST_FOUND = `
  select lf.*, json_build_object('id', r.id, 'full_name', r.full_name) as reporter
    from public.lost_found lf
    join public.profiles r on r.id = lf.reporter_id
   where lf.kind = $1 and lf.hidden_at is null
     and ($2::text is null or lf.title ilike '%' || $2 || '%' or lf.location ilike '%' || $2 || '%')
   order by lf.status, lf.created_at desc
   limit 60`;

export const RETURNED_THIS_MONTH = `
  select count(*)::int as count
    from public.lost_found
   where status = 'returned' and returned_at >= date_trunc('month', now())`;

export const INSERT_LOST_FOUND = `
  insert into public.lost_found
    (reporter_id, kind, title, category, location, happened_at, description, photo_path)
  values ($1, $2, $3, coalesce($4, 'Other'), $5, $6, $7, $8)
  returning id`;

export const LOST_FOUND_REPORTER = `select reporter_id from public.lost_found where id = $1`;

export const MARK_RETURNED = `
  update public.lost_found
     set status = 'returned', returned_at = coalesce(returned_at, now())
   where id = $1
  returning id, status, returned_at`;

/** $1 report, $2 me */
export const LOST_FOUND_BY_ID = `
  select lf.*, json_build_object('id', r.id, 'full_name', r.full_name) as reporter
    from public.lost_found lf
    join public.profiles r on r.id = lf.reporter_id
   where lf.id = $1 and (lf.hidden_at is null or lf.reporter_id = $2)`;
