import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { MAGIC_EFFECTS, createMagicClock, magicIsActive, normalizeMagic, readMagicClock } from '../src/lib/magic.js'

const alice = '00000000-0000-0000-0000-000000000031', bob = '00000000-0000-0000-0000-000000000032', eve = '00000000-0000-0000-0000-000000000033'
test('Chat Magic is shared, server-timed, private, DM-only and preserves existing data/themes', async (t) => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema realtime;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth,storage,realtime to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,metadata jsonb,created_at timestamptz default now());
    alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;
    create table realtime.messages(extension text,topic text); alter table realtime.messages enable row level security;
    grant select,insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as 'select current_setting(''request.topic'',true)';
  `)
  for (const file of ['001_inside_out.sql', '002_messaging_upgrade.sql', '003_conversation_themes.sql', '004_username_changes.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  for (const [id, username] of [[alice, 'alice'], [bob, 'bob'], [eve, 'eve']]) await db.query('insert into auth.users values($1,$2,$3)', [id, `${username}@insideout.invalid`, JSON.stringify({ username })])
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows
  const one = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0]
  const asUser = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']); await db.exec('set role authenticated') }
  const set = (id, effect, seconds = 3600) => rows('select * from public.set_conversation_magic($1,$2,$3)', [id, effect, seconds])
  const get = async (id) => (await rows('select * from public.get_conversation_magic($1)', [id]))[0]
  await asUser(alice)
  const cid = await one('select public.create_direct($1)', [bob])
  const group = await one('select public.create_group($1,$2)', ['Circle', [bob]])
  await db.query("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'Do not alter this history')", [cid, alice])
  await db.query("select public.set_conversation_theme($1,'builtin','purple-hour')", [cid])
  await db.exec('reset role')
  const tables = ['auth.users', 'public.profiles', 'public.messages', 'public.conversations', 'public.conversation_members', 'public.conversation_themes', 'public.message_reactions', 'public.chat_image_uploads']
  const snapshot = () => Promise.all(tables.map((table) => rows(`select to_jsonb(t) from ${table} t order by to_jsonb(t)::text`)))
  const before = await snapshot()
  await db.exec(await readFile(new URL('../supabase/migrations/005_chat_magic.sql', import.meta.url), 'utf8'))
  await t.test('migration preserves all previous rows and subscribes only the new settings table', async () => {
    assert.deepEqual(await snapshot(), before)
    assert.equal(await one("select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_magic'"), 1)
    await asUser(alice)
    const empty = await get(cid)
    assert.equal(empty.conversation_id, cid); assert.equal(empty.effect_id, null); assert.ok(empty.server_now)
  })
  await t.test('all twelve atmospheres have identical shared state and server-derived expiry', async () => {
    for (const effect of MAGIC_EFFECTS) {
      await asUser(alice)
      const [applied] = await set(cid, effect.id, 300)
      assert.equal(applied.applied_by, alice)
      assert.equal(new Date(applied.expires_at) - new Date(applied.applied_at), 300000)
      assert.ok(Math.abs(new Date(applied.server_now) - new Date(applied.applied_at)) < 5000)
      await asUser(bob)
      const shared = await get(cid)
      for (const key of ['conversation_id', 'effect_id', 'applied_by', 'applied_at', 'expires_at']) assert.deepEqual(shared[key], applied[key])
    }
    assert.equal(await one('select count(*)::int from public.conversation_magic'), 1)
  })
  await t.test('either participant can replace/remove magic; existing theme/history are unchanged', async () => {
    await asUser(bob)
    const [changed] = await set(cid, 'aurora', 86400)
    assert.equal(changed.applied_by, bob); assert.equal(new Date(changed.expires_at) - new Date(changed.applied_at), 86400000)
    await asUser(alice)
    const [removed] = await set(cid, null)
    assert.equal(removed.effect_id, null); assert.deepEqual(removed.expires_at, removed.applied_at)
    await asUser(bob)
    assert.equal((await get(cid)).effect_id, null)
    assert.equal(await one('select count(*)::int from public.conversation_magic'), 1, 'removal is an UPDATE tombstone')
    await db.exec('reset role'); assert.deepEqual(await snapshot(), before)
  })
  await t.test('outsiders and group members cannot discover, set or remove magic', async () => {
    await asUser(alice); await set(cid, 'fireflies')
    await asUser(eve)
    assert.deepEqual(await rows('select * from public.conversation_magic'), [])
    await assert.rejects(get(cid), /unavailable/); await assert.rejects(set(cid, 'aurora'), /unavailable/); await assert.rejects(set(cid, null), /unavailable/)
    await asUser(bob)
    await assert.rejects(get(group), /unavailable/); await assert.rejects(set(group, 'aurora'), /unavailable/); await assert.rejects(set(group, null), /unavailable/)
  })
  await t.test('arbitrary timestamps, unsupported IDs and out-of-bounds durations cannot be written', async () => {
    await asUser(alice)
    for (const seconds of [null, 0, 59, 86401, 2147483647]) await assert.rejects(set(cid, 'aurora', seconds), /duration/)
    await assert.rejects(set(cid, 'not-a-magic-effect'), /Unknown/)
    await assert.rejects(db.query('update public.conversation_magic set expires_at=now()+interval \'1 year\''), /permission denied/)
    await assert.rejects(db.query('delete from public.conversation_magic'), /permission denied/)
    await assert.rejects(db.query('insert into public.conversation_magic(conversation_id,applied_at,expires_at) values($1,now(),now())', [group]), /permission denied/)
    const [custom] = await set(cid, 'sakura-rain', 420)
    assert.equal(new Date(custom.expires_at) - new Date(custom.applied_at), 420000)
  })
  await t.test('expired rows are inactive on reopen without a job or changing the chosen theme', async () => {
    await db.exec('reset role')
    await db.query("update public.conversation_magic set applied_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where conversation_id=$1", [cid])
    await asUser(bob)
    const expired = await get(cid), clock = createMagicClock(expired.server_now, 0, 0)
    assert.equal(magicIsActive(normalizeMagic(expired, cid), readMagicClock(clock, 0, 0)), false)
    assert.equal(await one('select builtin_key from public.conversation_themes where conversation_id=$1', [cid]), 'purple-hour')
    assert.equal(await one('select content from public.messages where conversation_id=$1', [cid]), 'Do not alter this history')
    await set(cid, 'winter-whisper', 60)
    assert.equal((await get(cid)).effect_id, 'winter-whisper')
  })
  await t.test('anonymous calls and missing conversations are denied', async () => {
    await asUser(alice)
    await assert.rejects(get('ffffffff-ffff-ffff-ffff-ffffffffffff'), /unavailable/)
    await db.exec('reset role; set role anon')
    await assert.rejects(get(cid), /permission denied/); await assert.rejects(set(cid, 'aurora'), /permission denied/)
    await assert.rejects(db.query('select * from public.conversation_magic'), /permission denied/)
  })
})
