// Direct messages. $1 is always the signed-in user.

/** Same columns as the old my_conversations view + unread_count, last_sender_id, other_avatar_url. */
export const MY_CONVERSATIONS = `
  select c.id,
         case when c.user_a = $1 then c.user_b else c.user_a end as other_id,
         p.full_name as other_name,
         p.avatar_url as other_avatar_url,
         c.context,
         lm.body as last_message,
         lm.sender_id as last_sender_id,
         coalesce(lm.created_at, c.created_at) as last_at,
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id <> $1 and m.read_at is null) as unread_count
    from public.conversations c
    join public.profiles p on p.id = case when c.user_a = $1 then c.user_b else c.user_a end
    left join lateral (
      select m.body, m.sender_id, m.created_at from public.messages m
       where m.conversation_id = c.id
       order by m.created_at desc
       limit 1
    ) lm on true
   where $1 in (c.user_a, c.user_b)
   order by last_at desc`;

export const PROFILE_EXISTS = `select 1 from public.profiles where id = $1`;

/** Always stores user_a < user_b, so there is only one conversation per pair; reuses it. $1 me, $2 other, $3 context */
export const START_CONVERSATION = `
  insert into public.conversations (user_a, user_b, context)
  values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $3)
  on conflict (user_a, user_b)
    do update set context = coalesce(excluded.context, public.conversations.context)
  returning id, (xmax = 0) as created`;

/** $1 conversation, $2 me → the other member (null row if not a member) */
export const CONVERSATION_OTHER = `
  select case when user_a = $2 then user_b else user_a end as other_id
    from public.conversations
   where id = $1 and $2 in (user_a, user_b)`;

/**
 * Newest `$2` messages before `$3` (null = the latest), returned oldest first.
 * $1 conversation, $2 limit, $3 before (timestamptz) | null
 */
export const LIST_MESSAGES = `
  select * from (
    select * from public.messages
     where conversation_id = $1
       and ($3::timestamptz is null or created_at < $3)
     order by created_at desc
     limit $2
  ) page
  order by created_at`;

export const INSERT_MESSAGE = `
  insert into public.messages (conversation_id, sender_id, body)
  values ($1, $2, $3)
  returning *`;

/** Mark the other person's messages as read. $1 conversation, $2 me */
export const MARK_CONVERSATION_READ = `
  update public.messages
     set read_at = now()
   where conversation_id = $1 and sender_id <> $2 and read_at is null
  returning id`;

export const UNREAD_MESSAGES_TOTAL = `
  select count(*)::int as count
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
   where $1 in (c.user_a, c.user_b) and m.sender_id <> $1 and m.read_at is null`;
