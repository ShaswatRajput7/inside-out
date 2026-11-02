-- Incremental upgrade: preserves all existing rows. Apply after 001, with explicit owner approval.
begin;
alter table public.conversation_members
  add column last_read_at timestamptz not null default now(),
  add column last_read_id uuid not null default '00000000-0000-0000-0000-000000000000';

create table public.chat_image_uploads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/webp','image/jpeg','image/png')),
  width int not null check (width between 1 and 1600),
  height int not null check (height between 1 and 1600),
  byte_size int not null check (byte_size between 1 and 512000),
  state text not null default 'pending' check (state in ('pending','ready','delete_pending','expired','deleted')),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  expires_at timestamptz,
  cleanup_reason text,
  cleanup_claimed_until timestamptz,
  cleanup_attempts int not null default 0,
  cleanup_error text
);
create index image_cleanup_idx on public.chat_image_uploads(state, expires_at, created_at);
alter table public.messages
  add column kind text not null default 'text' check (kind in ('text','image')),
  add column image_id uuid unique references public.chat_image_uploads(id),
  add column edited_at timestamptz,
  add column deleted_at timestamptz,
  add column updated_at timestamptz not null default now();
alter table public.messages drop constraint messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (deleted_at is not null and content = '') or
  (deleted_at is null and ((kind='text' and image_id is null and length(btrim(content)) between 1 and 4000)
    or (kind='image' and image_id is not null and length(content) <= 4000)))
);
create index messages_unread_idx on public.messages(conversation_id,created_at,id) where deleted_at is null;
create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  emoji text not null check (length(emoji) between 1 and 32 and octet_length(emoji) <= 200),
  removed_at timestamptz,
  primary key(message_id,user_id,emoji)
);
create index reactions_conversation_idx on public.message_reactions(conversation_id,message_id) where removed_at is null;
alter table public.chat_image_uploads enable row level security;
alter table public.message_reactions enable row level security;
revoke all on public.chat_image_uploads, public.message_reactions from anon, authenticated;
grant select (id,conversation_id,user_id,storage_path,mime_type,width,height,byte_size,state,created_at,uploaded_at,expires_at) on public.chat_image_uploads to authenticated;
grant select on public.message_reactions to authenticated;
grant all on public.chat_image_uploads, public.message_reactions to service_role;
create policy image_metadata_members on public.chat_image_uploads for select to authenticated using (private.is_member(conversation_id));
create policy reactions_members on public.message_reactions for select to authenticated using (private.is_member(conversation_id));
-- Mutations use ownership-checked RPCs; direct client UPDATE/DELETE stays revoked.
create policy messages_owner_update on public.messages for update to authenticated
  using (sender_id=(select auth.uid()) and private.is_member(conversation_id))
  with check (sender_id=(select auth.uid()) and private.is_member(conversation_id));

create function private.message_is_active(mid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messages m left join public.chat_image_uploads i on i.id=m.image_id
 where m.id=mid and m.deleted_at is null and private.is_member(m.conversation_id)
 and (m.kind='text' or (i.state='ready' and i.expires_at>now())));
$$;
create function public.edit_message(target_message uuid, new_content text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.messages;
begin
 select * into m from public.messages where id=target_message for update;
 if auth.uid() is null or m.sender_id is distinct from auth.uid() or not private.is_member(m.conversation_id) then raise exception 'You can only edit your own messages'; end if;
 if m.deleted_at is not null or m.kind<>'text' then raise exception 'This message cannot be edited'; end if;
 if new_content is null or length(btrim(new_content)) not between 1 and 4000 then raise exception 'Message must be 1–4000 characters'; end if;
 update public.messages set content=btrim(new_content),edited_at=now(),updated_at=now() where id=m.id;
end $$;
create function public.delete_message(target_message uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.messages;
begin
 select * into m from public.messages where id=target_message for update;
 if auth.uid() is null or m.sender_id is distinct from auth.uid() or not private.is_member(m.conversation_id) then raise exception 'You can only delete your own messages'; end if;
 update public.messages set content='',deleted_at=coalesce(deleted_at,now()),updated_at=now() where id=m.id;
 update public.message_reactions set removed_at=now() where message_id=m.id;
 if m.image_id is not null then
   update public.chat_image_uploads set state='delete_pending',cleanup_reason='deleted',cleanup_claimed_until=null
   where id=m.image_id and state not in ('expired','deleted');
 end if;
 return m.image_id;
end $$;
create function public.toggle_reaction(target_message uuid, reaction_emoji text) returns void
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 -- Serializes reactions against sender deletion/expiry.
 select conversation_id into cid from public.messages where id=target_message for update;
 if auth.uid() is null or not private.message_is_active(target_message) then raise exception 'This message is unavailable'; end if;
 if reaction_emoji is null or length(reaction_emoji) not between 1 and 32 or octet_length(reaction_emoji)>200 then raise exception 'Invalid emoji'; end if;
 insert into public.message_reactions(message_id,conversation_id,user_id,emoji)
 values(target_message,cid,auth.uid(),reaction_emoji)
 on conflict(message_id,user_id,emoji) do update set removed_at=case when message_reactions.removed_at is null then now() else null end;
end $$;
create function public.mark_conversation_read(target_conversation uuid, through_message uuid) returns void
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
 if auth.uid() is null or not private.is_member(target_conversation) then raise exception 'Conversation unavailable'; end if;
 select created_at into stamp from public.messages where id=through_message and conversation_id=target_conversation;
 if stamp is null then return; end if;
 update public.conversation_members set last_read_at=stamp,last_read_id=through_message
 where conversation_id=target_conversation and user_id=auth.uid() and (last_read_at,last_read_id)<(stamp,through_message);
end $$;
create function public.conversation_unreads() returns table(conversation_id uuid,unread_count bigint)
language sql stable security definer set search_path='' as $$
 select cm.conversation_id,count(m.id) from public.conversation_members cm
 left join public.messages m on m.conversation_id=cm.conversation_id and m.sender_id<>auth.uid()
 and (m.created_at,m.id)>(cm.last_read_at,cm.last_read_id) and m.deleted_at is null
 and (m.kind='text' or exists(select 1 from public.chat_image_uploads i where i.id=m.image_id and i.state='ready' and i.expires_at>now()))
 where cm.user_id=auth.uid() group by cm.conversation_id;
$$;

create function public.reserve_chat_image(target_conversation uuid,image_mime text,image_width int,image_height int,image_bytes int)
returns table(id uuid,storage_path text) language plpgsql security definer set search_path='' as $$
declare iid uuid:=gen_random_uuid(); path text;
begin
 if auth.uid() is null or not private.is_member(target_conversation) then raise exception 'Conversation unavailable'; end if;
 if image_mime not in ('image/webp','image/jpeg','image/png') then raise exception 'Unsupported image'; end if;
 path:=target_conversation::text||'/'||auth.uid()::text||'/'||iid::text||case image_mime when 'image/webp' then '.webp' when 'image/png' then '.png' else '.jpg' end;
 insert into public.chat_image_uploads(id,conversation_id,user_id,storage_path,mime_type,width,height,byte_size)
 values(iid,target_conversation,auth.uid(),path,image_mime,image_width,image_height,image_bytes);
 return query select iid,path;
end $$;
create function public.finalize_chat_image(upload_id uuid, message_id uuid, caption text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.chat_image_uploads; object_time timestamptz;
begin
 select * into i from public.chat_image_uploads where id=upload_id for update;
 if auth.uid() is null or i.user_id is distinct from auth.uid() or not private.is_member(i.conversation_id) then raise exception 'Image unavailable'; end if;
 if exists(select 1 from public.messages m where m.id=message_id and m.image_id=i.id and m.sender_id=auth.uid()) then return message_id; end if;
 if i.state<>'pending' or i.created_at<now()-interval '1 hour' then raise exception 'Upload reservation expired'; end if;
 select created_at into object_time from storage.objects where bucket_id='chat-images' and name=i.storage_path
 and (metadata->>'size')::bigint between 1 and 512000 and metadata->>'mimetype'=i.mime_type;
 if object_time is null then raise exception 'Image upload not found or invalid'; end if;
 if caption is null or length(caption)>4000 then raise exception 'Caption too long'; end if;
 update public.chat_image_uploads set state='ready',uploaded_at=object_time,expires_at=object_time+interval '30 days' where id=i.id;
 insert into public.messages(id,conversation_id,sender_id,content,kind,image_id) values(message_id,i.conversation_id,auth.uid(),caption,'image',i.id);
 return message_id;
end $$;
create function public.cancel_chat_image(upload_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.chat_image_uploads set state='delete_pending',cleanup_reason='abandoned',cleanup_claimed_until=null
 where id=upload_id and user_id=auth.uid() and state='pending';
end $$;
create function private.can_upload_image(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chat_image_uploads i where i.storage_path=path and i.user_id=auth.uid()
 and i.state='pending' and i.created_at>now()-interval '1 hour' and private.is_member(i.conversation_id));
$$;
create function private.can_read_image(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chat_image_uploads i join public.messages m on m.image_id=i.id
 where i.storage_path=path and i.state='ready' and i.expires_at>now() and m.deleted_at is null and private.is_member(i.conversation_id));
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('chat-images','chat-images',false,512000,array['image/webp','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=512000,allowed_mime_types=excluded.allowed_mime_types;
create policy chat_images_upload on storage.objects for insert to authenticated
 with check(bucket_id='chat-images' and private.can_upload_image(name));
create policy chat_images_download on storage.objects for select to authenticated
 using(bucket_id='chat-images' and private.can_read_image(name));
-- No client UPDATE/DELETE policy: objects are immutable and removed only through the Edge Function.

-- Cleanup claims are leases: retryable, concurrency-safe, and cannot race upload finalization.
create function public.claim_image_cleanup(batch_size int default 100)
returns table(id uuid,storage_path text) language sql security definer set search_path='' as $$
 with candidates as (
   select i.id from public.chat_image_uploads i
   where (i.state='delete_pending' or (i.state='ready' and i.expires_at<=now()) or (i.state='pending' and i.created_at<now()-interval '1 hour'))
   and (i.cleanup_claimed_until is null or i.cleanup_claimed_until<now())
   order by i.created_at limit least(greatest(batch_size,1),100) for update skip locked
 ) update public.chat_image_uploads i set state='delete_pending',
 cleanup_reason=coalesce(i.cleanup_reason,case when i.expires_at<=now() then 'expired' else 'abandoned' end),
 cleanup_claimed_until=now()+interval '2 minutes',cleanup_attempts=i.cleanup_attempts+1
 from candidates c where i.id=c.id returning i.id,i.storage_path;
$$;
create function public.complete_image_cleanup(upload_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.chat_image_uploads set state=case when cleanup_reason='expired' then 'expired' else 'deleted' end,
 cleanup_claimed_until=null,cleanup_error=null where id=upload_id and state='delete_pending';
 update public.messages set updated_at=now() where image_id=upload_id;
 update public.message_reactions set removed_at=now() where message_id in (select id from public.messages where image_id=upload_id);
end $$;
create function public.fail_image_cleanup(upload_id uuid,error_text text) returns void
language sql security definer set search_path='' as $$
 update public.chat_image_uploads set cleanup_error=left(error_text,500),cleanup_claimed_until=now()+interval '2 minutes'
 where id=upload_id and state='delete_pending';
$$;

create function private.can_join_conversation_topic(topic text) returns boolean
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then false
 when topic in ('account:'||auth.uid()::text||':activity','account:'||auth.uid()::text||':conversations') then true
 when topic ~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:messages)?$'
 then private.is_member(split_part(topic,':',2)::uuid) else false end;
$$;
create policy inside_out_live_receive on realtime.messages for select to authenticated
 using(extension in ('broadcast','presence') and private.can_join_conversation_topic((select realtime.topic())));
create policy inside_out_live_send on realtime.messages for insert to authenticated
 with check(extension in ('broadcast','presence') and private.can_join_conversation_topic((select realtime.topic())));

revoke all on function private.message_is_active(uuid),private.can_upload_image(text),private.can_read_image(text),private.can_join_conversation_topic(text) from public,anon,authenticated;
grant execute on function private.message_is_active(uuid),private.can_upload_image(text),private.can_read_image(text),private.can_join_conversation_topic(text) to authenticated;
revoke all on function public.edit_message(uuid,text),public.delete_message(uuid),public.toggle_reaction(uuid,text),public.mark_conversation_read(uuid,uuid),public.conversation_unreads(),public.reserve_chat_image(uuid,text,int,int,int),public.finalize_chat_image(uuid,uuid,text),public.cancel_chat_image(uuid) from public,anon,authenticated;
grant execute on function public.edit_message(uuid,text),public.delete_message(uuid),public.toggle_reaction(uuid,text),public.mark_conversation_read(uuid,uuid),public.conversation_unreads(),public.reserve_chat_image(uuid,text,int,int,int),public.finalize_chat_image(uuid,uuid,text),public.cancel_chat_image(uuid) to authenticated;
revoke all on function public.claim_image_cleanup(int),public.complete_image_cleanup(uuid),public.fail_image_cleanup(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_image_cleanup(int),public.complete_image_cleanup(uuid),public.fail_image_cleanup(uuid,text) to service_role;
alter publication supabase_realtime add table public.message_reactions;
commit;
