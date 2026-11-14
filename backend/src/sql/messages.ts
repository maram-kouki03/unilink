// Direct messages. $1 is always the signed-in user.

/** Same columns as the old my_conversations view. */
export const MY_CONVERSATIONS = `
  select c.id,
         case when c.user_a = $1 then c.user_b else c.user_a end as other_id,
         p.full_name as other_name,
         c.context,
         lm.body as last_message,
         coalesce(lm.created_at, c.created_at) as last_at
    from public.conversations c
    join public.profiles p on p.id = case when c.user_a = $1 then c.user_b else c.user_a end
    left join lateral (
      select m.body, m.created_at from public.messages m
       where m.conversation_id = c.id
       order by m.created_at desc
       limit 1
    ) lm on true
   where $1 in (c.user_a, c.user_b)
   order by last_at desc`;

export const PROFILE_EXISTS = `select 1 from public.profiles where id = $1`;

/** Always stores user_a < user_b; reuses the existing conversation. $1 me, $2 other, $3 context */
export const START_CONVERSATION = `
  insert into public.conversations (user_a, user_b, context)
  values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $3)
  on conflict (user_a, user_b)
    do update set context = coalesce(excluded.context, public.conversations.context)
  returning id`;

/** $1 conversation, $2 me → the other member (null row if not a member) */
export const CONVERSATION_OTHER = `
  select case when user_a = $2 then user_b else user_a end as other_id
    from public.conversations
   where id = $1 and $2 in (user_a, user_b)`;

export const LIST_MESSAGES = `
  select * from public.messages
   where conversation_id = $1
   order by created_at`;

export const INSERT_MESSAGE = `
  insert into public.messages (conversation_id, sender_id, body)
  values ($1, $2, $3)
  returning *`;
