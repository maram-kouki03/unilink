// Socket room access checks

export const IS_CONVERSATION_MEMBER = `
  select 1 from public.conversations
   where id = $1 and $2 in (user_a, user_b)`;
