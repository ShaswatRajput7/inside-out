-- Incremental: no messages, memberships, reactions or Storage objects are removed.
-- Apply after 005, only with the owner's approval.
begin;
alter table public.conversation_members add column cleared_at timestamptz;

create function private.history_visible(cid uuid, stamp timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversation_members cm
 where cm.conversation_id=cid and cm.user_id=auth.uid()
 and (cm.cleared_at is null or stamp>cm.cleared_at));
$$;
create function private.message_visible(mid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messages m where m.id=mid
 and private.history_visible(m.conversation_id,m.created_at));
$$;
-- All SELECT paths (including ID lookups, search, pagination and Realtime's
-- subscriber authorization) use the current user's cutoff at the database.
alter policy messages_member on public.messages
 using (private.history_visible(conversation_id,created_at));
alter policy reactions_members on public.message_reactions
 using (private.message_visible(message_id));
alter policy image_metadata_members on public.chat_image_uploads
 using (private.is_member(conversation_id) and
 ((user_id=auth.uid() and state='pending') or exists(
 select 1 from public.messages m where m.image_id=chat_image_uploads.id)));

create function public.clear_conversation_history(target_conversation uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz;
begin
 if auth.uid() is null or not exists(select 1 from public.conversations c
 where c.id=target_conversation and c.type='direct') then
 raise exception 'Direct conversation unavailable'; end if;
 -- Lock only the caller's membership. No user ID or timestamp is accepted.
 perform 1 from public.conversation_members
 where conversation_id=target_conversation and user_id=auth.uid() for update;
 if not found then raise exception 'Direct conversation unavailable'; end if;
 cutoff:=clock_timestamp();
 update public.conversation_members set cleared_at=cutoff,
 last_read_at=greatest(last_read_at,cutoff),last_read_id='ffffffff-ffff-ffff-ffff-ffffffffffff'
 where conversation_id=target_conversation and user_id=auth.uid();
 return cutoff;
end $$;

create or replace function public.conversation_unreads() returns table(conversation_id uuid,unread_count bigint)
language sql stable security definer set search_path='' as $$
 select cm.conversation_id,count(m.id) from public.conversation_members cm
 left join public.messages m on m.conversation_id=cm.conversation_id and m.sender_id<>auth.uid()
 and (m.created_at,m.id)>(cm.last_read_at,cm.last_read_id) and (cm.cleared_at is null or m.created_at>cm.cleared_at) and m.deleted_at is null
 and (m.kind='text' or exists(select 1 from public.chat_image_uploads i where i.id=m.image_id and i.state='ready' and i.expires_at>now()))
 where cm.user_id=auth.uid() group by cm.conversation_id;
$$;

create or replace function private.message_is_active(mid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messages m left join public.chat_image_uploads i on i.id=m.image_id
 where m.id=mid and m.deleted_at is null and private.history_visible(m.conversation_id,m.created_at)
 and (m.kind='text' or (i.state='ready' and i.expires_at>now())));
$$;

create or replace function private.can_read_image(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chat_image_uploads i join public.messages m on m.image_id=i.id
 where i.storage_path=path and i.state='ready' and i.expires_at>now() and m.deleted_at is null and private.history_visible(m.conversation_id,m.created_at));
$$;

revoke all on function private.history_visible(uuid,timestamptz),private.message_visible(uuid),public.clear_conversation_history(uuid) from public,anon,authenticated;
grant execute on function private.history_visible(uuid,timestamptz),private.message_visible(uuid),public.clear_conversation_history(uuid) to authenticated;
commit;
