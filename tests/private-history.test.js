import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const alice='00000000-0000-0000-0000-000000000011', bob='00000000-0000-0000-0000-000000000012', eve='00000000-0000-0000-0000-000000000013'
test('private clear preserves shared data and filters every read path for only the caller', async (t) => {
 const db=new PGlite(); t.after(()=>db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema realtime;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth,storage,realtime to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,metadata jsonb,created_at timestamptz default now());
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant all on storage.objects to service_role;
    create table realtime.messages(extension text,topic text);
    alter table realtime.messages enable row level security;
    grant select,insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as 'select current_setting(''request.topic'',true)';
    grant execute on function realtime.topic() to authenticated;
  `)

 for(const name of ['001_inside_out.sql','002_messaging_upgrade.sql','003_conversation_themes.sql','004_username_changes.sql','005_chat_magic.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 for(const [id,username] of [[alice,'alice'],[bob,'bob'],[eve,'eve']]) await db.query('insert into auth.users values($1,$2,$3)',[id,username+'@insideout.invalid',JSON.stringify({username})])
 const rows=async(sql,args=[]) => (await db.query(sql,args)).rows
 const one=async(sql,args=[]) => Object.values((await rows(sql,args))[0])[0]
 async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']); await db.exec('set role authenticated') }
 await asUser(alice)
 const cid=await one('select public.create_direct($1)',[bob])
 const other=await one('select public.create_direct($1)',[eve])
 const group=await one('select public.create_group($1,$2)',['circle',[bob,eve]])
 const own=await one("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'old outgoing') returning id",[cid,alice])
 await db.query("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'other conversation'),($3,$2,'group history')",[other,alice,group])
 await asUser(bob)
 await db.query("insert into public.messages(conversation_id,sender_id,content) select $1,$2,'old incoming '||n from generate_series(1,65) n",[cid,bob])
 await db.query('select public.toggle_reaction($1,$2)',[own,'🌻'])
 const [image]=await rows("select * from public.reserve_chat_image($1,'image/png',20,20,100)",[cid])
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-images',$1,'{\"size\":100,\"mimetype\":\"image/png\"}')",[image.storage_path])
 const imageId='10000000-0000-0000-0000-000000000001'
 await db.query("select public.finalize_chat_image($1,$2,'old caption')",[image.id,imageId])
 await db.exec('reset role')
 const snapshot=async()=>Promise.all(['messages','message_reactions','chat_image_uploads'].map(table=>rows('select to_jsonb(t) as row from public.'+table+' t order by to_jsonb(t)::text')))
 const before=await snapshot()
 await db.exec(await readFile(new URL('../supabase/migrations/006_private_history.sql',import.meta.url),'utf8'))
 assert.deepEqual(await snapshot(),before,'migration preserves existing shared data')
 await asUser(alice)
 assert.equal(Number((await rows('select * from public.conversation_unreads()')).find(r=>r.conversation_id===cid).unread_count),66)
 const cutoff=await one('select public.clear_conversation_history($1)',[cid]); assert.ok(cutoff)
 assert.deepEqual(await rows('select * from public.messages where conversation_id=$1',[cid]),[])
 assert.deepEqual(await rows('select * from public.messages where id=$1',[own]),[])
 assert.deepEqual(await rows("select * from public.messages where content ilike '%old%'"),[])
 assert.deepEqual(await rows('select * from public.messages where conversation_id=$1 order by created_at desc,id desc limit 50 offset 50',[cid]),[])
 assert.deepEqual(await rows('select * from public.message_reactions'),[])
 assert.deepEqual(await rows('select id from public.chat_image_uploads where id=$1',[image.id]),[])
 assert.deepEqual(await rows('select * from storage.objects where name=$1',[image.storage_path]),[])
 assert.equal(Number((await rows('select * from public.conversation_unreads()')).find(r=>r.conversation_id===cid).unread_count),0)
 assert.equal((await rows('select * from public.messages')).length,2,'other DM and group retained')
 await assert.rejects(db.query('select public.clear_conversation_history($1)',[group]),/Direct conversation unavailable/)
 await assert.rejects(db.query('update public.conversation_members set cleared_at=null'),/permission denied/)
 await assert.rejects(db.query('select public.toggle_reaction($1,$2)',[own,'🌻']),/unavailable/)
 await asUser(eve)
 await assert.rejects(db.query('select public.clear_conversation_history($1)',[cid]),/Direct conversation unavailable/)
 await db.exec('reset role; set role anon')
 await assert.rejects(db.query('select public.clear_conversation_history($1)',[cid]),/permission denied/)
 await asUser(bob)
 assert.equal((await rows('select * from public.messages where conversation_id=$1',[cid])).length,67)
 assert.equal((await rows('select * from storage.objects where name=$1',[image.storage_path])).length,1)
 assert.equal(await one('select cleared_at from public.conversation_members where conversation_id=$1 and user_id=$2',[cid,bob]),null)
 const fresh=await one("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'new incoming') returning id",[cid,bob])
 await asUser(alice)
 assert.deepEqual((await rows('select id from public.messages where conversation_id=$1',[cid])).map(r=>r.id),[fresh])
 assert.equal(Number((await rows('select * from public.conversation_unreads()')).find(r=>r.conversation_id===cid).unread_count),1)
 await db.query('select public.mark_conversation_read($1,$2)',[cid,fresh])
 assert.equal(Number((await rows('select * from public.conversation_unreads()')).find(r=>r.conversation_id===cid).unread_count),0)
 await asUser(alice) // New session still respects the stored cutoff.
 assert.equal((await rows('select * from public.messages where conversation_id=$1',[cid])).length,1)
 await db.exec('reset role')
 const after=await snapshot()
 assert.deepEqual(after[0].filter(r=>r.row.id!==fresh),before[0])
 assert.deepEqual(after.slice(1),before.slice(1),'clear never changes shared reactions or image files')
})
