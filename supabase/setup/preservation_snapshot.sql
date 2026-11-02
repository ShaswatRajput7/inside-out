-- READ ONLY. Run immediately before and after 002 while chat activity is paused.
-- Save both result sets. These fingerprint original fields; no message text, email,
-- password hash, or token is returned. This is verification, not a backup.
-- Auth identity fingerprints exclude login/session timestamps, which legitimately change.
begin transaction isolation level repeatable read read only;
set local timezone = 'UTC';
select 'auth.users' as relation, count(*) as rows,
  md5(coalesce(string_agg(md5(jsonb_build_array(id,created_at)::text),'' order by id),'')) as original_fields_md5
from auth.users
union all
select 'public.profiles',count(*),
  md5(coalesce(string_agg(md5(jsonb_build_array(id,username,display_name,created_at)::text),'' order by id),''))
from public.profiles
union all
select 'public.conversations',count(*),
  md5(coalesce(string_agg(md5(jsonb_build_array(id,type,name,created_by,created_at,direct_key)::text),'' order by id),''))
from public.conversations
union all
select 'public.conversation_members',count(*),
  md5(coalesce(string_agg(md5(jsonb_build_array(conversation_id,user_id,role,joined_at)::text),'' order by conversation_id,user_id),''))
from public.conversation_members
union all
select 'public.messages',count(*),
  md5(coalesce(string_agg(md5(jsonb_build_array(id,conversation_id,sender_id,content,created_at)::text),'' order by id),''))
from public.messages;
commit;
