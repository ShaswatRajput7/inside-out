import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const alice = '00000000-0000-0000-0000-000000000011', bob = '00000000-0000-0000-0000-000000000012', eve = '00000000-0000-0000-0000-000000000013'
test('incremental messaging upgrade preserves data and enforces all new permissions', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
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
  await db.exec(await readFile(new URL('../supabase/migrations/001_inside_out.sql', import.meta.url), 'utf8'))
  for (const [id, username] of [[alice,'alice'],[bob,'bob'],[eve,'eve']]) await db.query('insert into auth.users values($1,$2,$3)',[id,`${username}@insideout.invalid`,JSON.stringify({username})])
  async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']); await db.exec('set role authenticated') }
  const rows = async (sql,args=[]) => (await db.query(sql,args)).rows
  const one = async (sql,args=[]) => Object.values((await rows(sql,args))[0])[0]
  await asUser(alice)
  const cid = await one('select public.create_direct($1)',[bob])
  const oldId = await one("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'existing history') returning id",[cid,alice])
  await db.exec('reset role')
  // Compare every original column/row, including Auth identities, across the migration.
  const originalColumns = [
    ['auth.users', '*'], ['public.profiles', '*'], ['public.conversations', '*'],
    ['public.conversation_members', 'conversation_id,user_id,role,joined_at'],
    ['public.messages', 'id,conversation_id,sender_id,content,created_at'],
  ]
  const snapshot = () => Promise.all(originalColumns.map(([table, columns]) =>
    rows(`select * from (select ${columns} from ${table}) original order by to_jsonb(original)::text`)))
  const beforeUpgrade = await snapshot()
  await db.exec(await readFile(new URL('../supabase/migrations/002_messaging_upgrade.sql', import.meta.url), 'utf8'))
  let mid, image, imageMessage
  await t.test('existing history and memberships remain unchanged; old messages initialize as read', async () => {
    assert.deepEqual(await snapshot(), beforeUpgrade, '002 must preserve every existing value in every original table')
    await asUser(bob)
    assert.equal(await one('select content from public.messages where id=$1',[oldId]),'existing history')
    assert.equal(await one('select count(*)::int from public.conversation_members'),2)
    assert.equal((await rows('select * from public.conversation_unreads()'))[0].unread_count,0)
    await asUser(alice)
    mid = await one("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'Hello 👩🏽‍💻') returning id",[cid,alice])
  })
  await t.test('editing is owner-only and preserves the original timestamp', async () => {
    const before = await one('select created_at from public.messages where id=$1',[mid])
    await asUser(bob)
    await assert.rejects(db.query('select public.edit_message($1,$2)',[mid,'spoof']),/own messages/)
    await asUser(eve)
    await assert.rejects(db.query('select public.edit_message($1,$2)',[mid,'intrusion']),/own messages/)
    await asUser(alice)
    await db.query('select public.edit_message($1,$2)',[mid,'👨‍👩‍👧‍👦 🏳️‍🌈'])
    const [row] = await rows('select content,created_at,edited_at from public.messages where id=$1',[mid])
    assert.equal(row.content,'👨‍👩‍👧‍👦 🏳️‍🌈'); assert.equal(new Date(row.created_at).getTime(),new Date(before).getTime()); assert.ok(row.edited_at)
    await assert.rejects(db.query('update public.messages set content=$1 where id=$2',['bypass',mid]),/permission denied/)
  })
  await t.test('full Unicode reaction sequences toggle uniquely and are private', async () => {
    await asUser(bob)
    await db.query('select public.toggle_reaction($1,$2)',[mid,'👩🏽‍💻'])
    await db.query('select public.toggle_reaction($1,$2)',[mid,'🏳️‍🌈'])
    assert.equal(await one('select count(*)::int from public.message_reactions where removed_at is null'),2)
    await db.query('select public.toggle_reaction($1,$2)',[mid,'👩🏽‍💻'])
    assert.equal(await one('select count(*)::int from public.message_reactions where removed_at is null'),1)
    await db.query('select public.toggle_reaction($1,$2)',[mid,'👩🏽‍💻'])
    assert.equal(await one('select count(*)::int from public.message_reactions'),2)
    await asUser(eve)
    assert.deepEqual(await rows('select * from public.message_reactions'),[])
    await assert.rejects(db.query('select public.toggle_reaction($1,$2)',[mid,'🦄']),/unavailable/)
  })
  await t.test('unreads exclude own messages; read cursors cannot move backwards or be set by outsiders', async () => {
    await asUser(bob)
    assert.equal(Number((await rows('select * from public.conversation_unreads()'))[0].unread_count),1)
    await db.query('select public.mark_conversation_read($1,$2)',[cid,mid])
    await db.query('select public.mark_conversation_read($1,$2)',[cid,oldId])
    assert.equal(Number((await rows('select * from public.conversation_unreads()'))[0].unread_count),0)
    await asUser(alice)
    assert.equal(Number((await rows('select * from public.conversation_unreads()'))[0].unread_count),0)
    await asUser(eve)
    assert.deepEqual(await rows('select * from public.conversation_unreads()'),[])
    await assert.rejects(db.query('select public.mark_conversation_read($1,$2)',[cid,mid]),/unavailable/)
  })
  await t.test('deletion removes content and reactions; deleted messages cannot be edited or reacted to', async () => {
    await asUser(bob)
    await assert.rejects(db.query('select public.delete_message($1)',[mid]),/own messages/)
    await asUser(alice)
    await db.query('select public.delete_message($1)',[mid])
    await db.query('select public.delete_message($1)',[mid])
    const [row] = await rows('select content,deleted_at from public.messages where id=$1',[mid])
    assert.equal(row.content,''); assert.ok(row.deleted_at)
    assert.equal(await one('select count(*)::int from public.message_reactions where removed_at is null'),0)
    await assert.rejects(db.query('select public.edit_message($1,$2)',[mid,'recover']),/cannot be edited/)
    await assert.rejects(db.query('select public.toggle_reaction($1,$2)',[mid,'💚']),/unavailable/)
  })
  await t.test('private Broadcast/Presence authorization only permits members and exact conversation topics', async () => {
    await asUser(alice)
    await db.query("select set_config('request.topic',$1,false)",[`conversation:${cid}`])
    await db.query("insert into realtime.messages values('presence',$1)",[`conversation:${cid}`])
    await db.query("insert into realtime.messages values('broadcast',$1)",[`conversation:${cid}`])
    assert.equal(await one('select count(*)::int from realtime.messages'),2)
    await asUser(eve)
    assert.deepEqual(await rows('select * from realtime.messages'),[])
    await assert.rejects(db.query("insert into realtime.messages values('broadcast',$1)",[`conversation:${cid}`]),/row-level security/)
    await asUser(alice)
    await db.query("select set_config('request.topic','conversation:not-a-uuid',false)")
    assert.deepEqual(await rows('select * from realtime.messages'),[])
  })
  await t.test('image reservations validate membership, MIME, size, dimensions and randomized scope', async () => {
    await asUser(eve)
    await assert.rejects(db.query('select * from public.reserve_chat_image($1,$2,100,100,100)',[cid,'image/webp']),/unavailable/)
    await asUser(alice)
    await assert.rejects(db.query('select * from public.reserve_chat_image($1,$2,100,100,100)',[cid,'image/gif']),/Unsupported/)
    await assert.rejects(db.query('select * from public.reserve_chat_image($1,$2,100,100,600000)',[cid,'image/png']),/check constraint/)
    await assert.rejects(db.query('select * from public.reserve_chat_image($1,$2,1700,100,100)',[cid,'image/png']),/check constraint/)
    image = (await rows('select * from public.reserve_chat_image($1,$2,100,100,100)',[cid,'image/webp']))[0]
    assert.ok(image.storage_path.startsWith(`${cid}/${alice}/`))
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('chat-images','arbitrary.png')"),/row-level security/)
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-images',$1,$2)",[image.storage_path,JSON.stringify({size:100,mimetype:'image/webp'})])
    imageMessage = '10000000-0000-0000-0000-000000000001'
    await db.query('select public.finalize_chat_image($1,$2,$3)',[image.id,imageMessage,'photo'])
    await db.query('select public.finalize_chat_image($1,$2,$3)',[image.id,imageMessage,'photo'])
    assert.equal(await one('select count(*)::int from public.messages where image_id=$1',[image.id]),1)
    const [metadata] = await rows('select uploaded_at,expires_at from public.chat_image_uploads where id=$1',[image.id])
    assert.equal(new Date(metadata.expires_at)-new Date(metadata.uploaded_at),30*24*60*60*1000)
  })
  await t.test('image access is member-only, immutable, and denied immediately on expiry before cleanup runs', async () => {
    await asUser(bob)
    assert.equal(await one('select count(*)::int from storage.objects'),1)
    await db.query('select public.toggle_reaction($1,$2)',[imageMessage,'🌻'])
    await asUser(eve)
    assert.deepEqual(await rows('select * from storage.objects'),[])
    assert.deepEqual(await rows('select id from public.chat_image_uploads'),[])
    await asUser(alice)
    assert.equal((await rows('delete from storage.objects returning id')).length,0)
    await db.exec('reset role')
    await db.query("update public.chat_image_uploads set expires_at=now()-interval '1 second' where id=$1",[image.id])
    await asUser(bob)
    assert.deepEqual(await rows('select * from storage.objects'),[])
    assert.equal(Number((await rows('select * from public.conversation_unreads()'))[0].unread_count),0)
    await assert.rejects(db.query('select public.toggle_reaction($1,$2)',[imageMessage,'💥']),/unavailable/)
    await assert.rejects(db.query('select * from public.claim_image_cleanup(100)'),/permission denied/)
  })
  await t.test('cleanup claims are idempotent leases; expired metadata is retained and content order preserved', async () => {
    await db.exec('reset role; set role service_role')
    const batch = await rows('select * from public.claim_image_cleanup(100)')
    assert.equal(batch.length,1); assert.equal(batch[0].id,image.id)
    assert.equal((await rows('select * from public.claim_image_cleanup(100)')).length,0)
    // Real files are deleted by the Edge worker (tested separately), not SQL.
    await db.query('select public.complete_image_cleanup($1)',[image.id])
    await db.query('select public.complete_image_cleanup($1)',[image.id])
    assert.equal(await one('select state from public.chat_image_uploads where id=$1',[image.id]),'expired')
    await asUser(alice)
    assert.equal(await one('select image_id from public.messages where id=$1',[imageMessage]),image.id)
  })
  await t.test('sender-deleted image access ends before asynchronous physical removal', async () => {
    await asUser(alice)
    const [second] = await rows('select * from public.reserve_chat_image($1,$2,100,100,100)',[cid,'image/png'])
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-images',$1,$2)",[second.storage_path,JSON.stringify({size:100,mimetype:'image/png'})])
    const messageId='10000000-0000-0000-0000-000000000002'
    await db.query('select public.finalize_chat_image($1,$2,$3)',[second.id,messageId,''])
    assert.equal(await one('select public.delete_message($1)',[messageId]),second.id)
    assert.equal(await one('select state from public.chat_image_uploads where id=$1',[second.id]),'delete_pending')
    await asUser(bob)
    assert.deepEqual(await rows('select * from storage.objects'),[])
  })
  await t.test('abandoned upload reservations are swept and cannot be finalized after a cleanup claim', async () => {
    await asUser(alice)
    const [orphan] = await rows('select * from public.reserve_chat_image($1,$2,100,100,100)',[cid,'image/png'])
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-images',$1,$2)",[orphan.storage_path,JSON.stringify({size:100,mimetype:'image/png'})])
    await db.exec('reset role')
    await db.query("update public.chat_image_uploads set created_at=now()-interval '2 hours' where id=$1",[orphan.id])
    await db.exec('set role service_role')
    assert.ok((await rows('select * from public.claim_image_cleanup(100)')).some((item)=>item.id===orphan.id))
    await asUser(alice)
    await assert.rejects(db.query('select public.finalize_chat_image($1,$2,$3)',[orphan.id,'10000000-0000-0000-0000-000000000003','']),/reservation expired/)
  })
  await t.test('group unread, reactions, images and removal enforce the same private rules', async () => {
    await asUser(alice)
    const group = await one('select public.create_group($1,$2)', ['Upgrade friends', [bob]])
    const text = await one("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'Group hello 🌻') returning id", [group,alice])
    await asUser(bob)
    assert.equal(Number((await rows('select * from public.conversation_unreads()')).find(row=>row.conversation_id===group).unread_count),1)
    await db.query('select public.mark_conversation_read($1,$2)', [group,text])
    await db.query('select public.toggle_reaction($1,$2)', [text,'👨‍👩‍👧‍👦'])
    const [upload] = await rows('select * from public.reserve_chat_image($1,$2,80,80,100)', [group,'image/png'])
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-images',$1,$2)", [upload.storage_path,JSON.stringify({size:100,mimetype:'image/png'})])
    const photo='10000000-0000-0000-0000-000000000004'
    await db.query('select public.finalize_chat_image($1,$2,$3)', [upload.id,photo,''])
    await asUser(alice)
    assert.equal(await one('select count(*)::int from storage.objects where name=$1', [upload.storage_path]),1)
    await db.query('select public.remove_group_member($1,$2)', [group,bob])
    await asUser(bob)
    assert.equal(await one('select count(*)::int from storage.objects where name=$1', [upload.storage_path]),0)
    await assert.rejects(db.query('select public.delete_message($1)',[photo]),/own messages/)
    await assert.rejects(db.query('select public.toggle_reaction($1,$2)',[text,'👀']),/unavailable/)
  })
  await t.test('account topics are owner-only and all new mutation RPCs reject anonymous callers', async () => {
    await asUser(alice)
    assert.equal(await one('select private.can_join_conversation_topic($1)',[`account:${alice}:activity`]),true)
    assert.equal(await one('select private.can_join_conversation_topic($1)',[`account:${bob}:activity`]),false)
    assert.equal(await one('select private.can_join_conversation_topic($1)',[`conversation:${cid}:messages`]),true)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select public.edit_message($1,$2)',[mid,'bad']),/permission denied/)
    await assert.rejects(db.query('select public.delete_message($1)',[mid]),/permission denied/)
    await assert.rejects(db.query('select public.toggle_reaction($1,$2)',[mid,'👀']),/permission denied/)
    await assert.rejects(db.query('select * from public.conversation_unreads()'),/permission denied/)
    await assert.rejects(db.query('select * from public.claim_image_cleanup(100)'),/permission denied/)
  })

})
