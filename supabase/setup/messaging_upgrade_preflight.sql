-- READ ONLY. Run as the database owner in SQL Editor before approving 002.
-- Missing baseline objects, existing upgrade objects, or overlapping policies need review.
begin transaction read only;
select current_database() as database, current_user as role, version() as postgres;
select table_schema,table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in ('profiles','conversations','conversation_members','messages','chat_image_uploads','message_reactions')
order by table_name,ordinal_position;
select conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid='public.messages'::regclass;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where (schemaname='storage' and tablename='objects')
or (schemaname='realtime' and tablename='messages')
or (schemaname='public' and tablename in ('profiles','conversations','conversation_members','messages','chat_image_uploads','message_reactions'))
order by schemaname,tablename,policyname;
select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname,tablename;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='chat-images';
select name,installed_version,default_version from pg_available_extensions
where name in ('pg_cron','pg_net','supabase_vault') order by name;
select to_regprocedure('private.is_member(uuid)') is not null as baseline_membership_helper,
  to_regprocedure('public.edit_message(uuid,text)') is not null as upgrade_already_present,
  to_regclass('public.chat_image_uploads') is not null as image_table_already_present,
  to_regclass('public.message_reactions') is not null as reactions_already_present;
commit;
