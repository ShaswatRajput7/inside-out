import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { BUILTIN_THEMES } from '../src/lib/themes.js'

const alice = '00000000-0000-0000-0000-000000000021', bob = '00000000-0000-0000-0000-000000000022', eve = '00000000-0000-0000-0000-000000000023'
test('conversation themes preserve history and enforce shared, persistent member-only settings', async (t) => {
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
  for (const name of ['001_inside_out.sql', '002_messaging_upgrade.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  for (const [id, username] of [[alice, 'alice'], [bob, 'bob'], [eve, 'eve']]) await db.query('insert into auth.users values($1,$2,$3)', [id, `${username}@insideout.invalid`, JSON.stringify({ username })])
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0]
  async function asUser(id) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ''])
    await db.exec('set role authenticated')
  }
  const set = (id, kind, key = null, path = null) => db.query('select * from public.set_conversation_theme($1,$2,$3,$4)', [id, kind, key, path])
  await asUser(alice)
  const cid = await scalar('select public.create_direct($1)', [bob])
  const other = await scalar('select public.create_direct($1)', [eve])
  await db.query("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'Keep this history')", [cid, alice])
  await db.exec('reset role')
  const tables = ['auth.users', 'public.profiles', 'public.conversations', 'public.conversation_members', 'public.messages', 'public.message_reactions', 'public.chat_image_uploads']
  const snapshot = () => Promise.all(tables.map((table) => rows(`select to_jsonb(t) as value from ${table} t order by to_jsonb(t)::text`)))
  const before = await snapshot()
  await db.exec(await readFile(new URL('../supabase/migrations/003_conversation_themes.sql', import.meta.url), 'utf8'))
  await t.test('003 preserves every existing value and opts existing chats into the default', async () => {
    assert.deepEqual(await snapshot(), before)
    await asUser(bob)
    assert.deepEqual(await rows('select * from public.conversation_themes'), [])
    await db.exec('reset role')
    const [bucket] = await rows("select * from storage.buckets where id='conversation-themes'")
    assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 512000)
    assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp'])
    assert.equal(await scalar("select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_themes'"), 1)
  })
  await t.test('each built-in persists for both DM participants and stays local to that chat', async () => {
    for (const theme of BUILTIN_THEMES) {
      await asUser(alice); await set(cid, 'builtin', theme.key)
      await asUser(bob)
      const [row] = await rows('select * from public.conversation_themes where conversation_id=$1', [cid])
      assert.equal(row.builtin_key, theme.key); assert.equal(row.updated_by, alice); assert.ok(row.updated_at)
    }
    await set(cid, 'builtin', 'purple-hour')
    await asUser(alice)
    assert.equal(await scalar('select updated_by from public.conversation_themes where conversation_id=$1', [cid]), bob)
    assert.deepEqual(await rows('select * from public.conversation_themes where conversation_id=$1', [other]), [])
  })
  await t.test('outsiders, anonymous users, invalid configs and direct writes are denied', async () => {
    await asUser(eve)
    assert.deepEqual(await rows('select * from public.conversation_themes'), [])
    await assert.rejects(set(cid, 'builtin', 'neon-rain'), /unavailable/)
    await asUser(alice)
    await assert.rejects(set(cid, 'builtin', 'made-up'), /check constraint/)
    await assert.rejects(set(cid, 'builtin'), /check constraint/)
    await assert.rejects(set(cid, 'invalid'), /Invalid theme/)
    await assert.rejects(set(cid, 'default', 'grand-line'), /check constraint/)
    await assert.rejects(db.query("update public.conversation_themes set updated_by=$1", [eve]), /permission denied/)
    await assert.rejects(db.query('delete from public.conversation_themes'), /permission denied/)
    await db.exec('reset role; set role anon')
    await assert.rejects(set(cid, 'default'), /permission denied/)
    await assert.rejects(db.query('select * from public.conversation_themes'), /permission denied/)
  })
  const path = `${cid}/${alice}/10000000-0000-0000-0000-000000000001.webp`
  const upload = (file, mime = 'image/webp', size = 1000) => db.query("insert into storage.objects(bucket_id,name,metadata) values('conversation-themes',$1,$2)", [file, JSON.stringify({ size, mimetype: mime })])
  await t.test('custom upload paths are immutable, member-scoped and validated before activation', async () => {
    await asUser(eve)
    await assert.rejects(upload(path), /row-level security/)
    await asUser(bob)
    await assert.rejects(upload(path), /row-level security/)
    await asUser(alice)
    await assert.rejects(upload('malformed/image.webp'), /row-level security/)
    await assert.rejects(set(cid, 'custom', null, path), /upload is unavailable/)
    await upload(path)
    assert.deepEqual(await rows("select * from storage.objects where bucket_id='conversation-themes'"), [], 'pending uploads cannot be downloaded')
    await set(cid, 'custom', null, path)
    assert.equal(await scalar('select custom_path from public.conversation_themes where conversation_id=$1', [cid]), path)
    assert.equal((await rows('select * from storage.objects where name=$1', [path])).length, 1)
    assert.equal((await rows("update storage.objects set name='overwritten' where name=$1 returning id", [path])).length, 0)
    assert.equal((await rows('delete from storage.objects where name=$1 returning id', [path])).length, 0)
    await assert.rejects(set(other, 'custom', null, path), /Invalid theme image path/)
  })
  await t.test('another participant sees the same durable custom image; outsiders cannot read or reuse it', async () => {
    await asUser(bob)
    assert.equal(await scalar('select custom_path from public.conversation_themes where conversation_id=$1', [cid]), path)
    assert.equal((await rows('select * from storage.objects where name=$1', [path])).length, 1)
    await set(cid, 'custom', null, path) // Reapplying an already shared image is permitted.
    await asUser(eve)
    assert.deepEqual(await rows('select * from storage.objects where name=$1', [path]), [])
    await assert.rejects(set(other, 'custom', null, path), /Invalid theme image path/)
    await asUser(alice)
    const invalid = path.replace('000000000001.webp', '000000000002.webp')
    await upload(invalid, 'image/gif')
    await assert.rejects(set(cid, 'custom', null, invalid), /unavailable/)
    const tooLarge = path.replace('000000000001.webp', '000000000003.webp')
    await upload(tooLarge, 'image/webp', 512001)
    await assert.rejects(set(cid, 'custom', null, tooLarge), /unavailable/)
  })
  await t.test('reset persists, preserves chat history and revokes new downloads of the previous image', async () => {
    await asUser(bob); await set(cid, 'default')
    await asUser(alice)
    const [row] = await rows('select * from public.conversation_themes where conversation_id=$1', [cid])
    assert.equal(row.kind, 'default'); assert.equal(row.builtin_key, null); assert.equal(row.custom_path, null)
    assert.deepEqual(await rows('select * from storage.objects where name=$1', [path]), [])
    assert.equal(await scalar('select content from public.messages where conversation_id=$1', [cid]), 'Keep this history')
  })
  await t.test('group members share changes and a removed member immediately loses theme data and download access', async () => {
    await asUser(alice)
    const group = await scalar('select public.create_group($1,$2)', ['Theme circle', [bob, eve]])
    await asUser(bob); await set(group, 'builtin', 'sakura-dream')
    await asUser(eve)
    assert.equal(await scalar('select builtin_key from public.conversation_themes where conversation_id=$1', [group]), 'sakura-dream')
    const groupPath = `${group}/${eve}/10000000-0000-0000-0000-000000000004.jpg`
    await upload(groupPath, 'image/jpeg'); await set(group, 'custom', null, groupPath)
    await asUser(alice)
    assert.equal((await rows('select * from storage.objects where name=$1', [groupPath])).length, 1)
    await db.query('select public.remove_group_member($1,$2)', [group, eve])
    await asUser(bob)
    assert.equal((await rows('select * from storage.objects where name=$1', [groupPath])).length, 1)
    await asUser(eve)
    assert.deepEqual(await rows('select * from public.conversation_themes where conversation_id=$1', [group]), [])
    assert.deepEqual(await rows('select * from storage.objects where name=$1', [groupPath]), [])
    await assert.rejects(set(group, 'default'), /unavailable/)
    await assert.rejects(upload(groupPath.replace('000000000004.jpg', '000000000005.jpg'), 'image/jpeg'), /row-level security/)
    await asUser(alice); await set(group, 'default')
  })
})
