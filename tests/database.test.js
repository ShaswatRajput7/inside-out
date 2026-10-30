import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Real PostgreSQL engine in WASM. Only Supabase's Auth schema and auth.uid() are stubbed.
// This exercises SQL/RLS, not the hosted Auth or Realtime services.
test('migration, atomic conversation RPCs, and database privacy', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/001_inside_out.sql', import.meta.url), 'utf8'))
  const alice = '00000000-0000-0000-0000-000000000001'
  const bob = '00000000-0000-0000-0000-000000000002'
  const charlie = '00000000-0000-0000-0000-000000000003'
  const dora = '00000000-0000-0000-0000-000000000004'
  const account = (id, name) => db.query('insert into auth.users values ($1,$2,$3)', [id, `${name}@insideout.invalid`, JSON.stringify({ username: name })])
  const asUser = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']); await db.exec('set role authenticated') }
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0]
  await account(alice, 'alice'); await account(bob, 'bob'); await account(charlie, 'charlie'); await account(dora, 'dora')
  let direct, group

  await t.test('Auth insert creates normalized profile and rejects invalid or colliding usernames atomically', async () => {
    assert.equal(await scalar('select username from public.profiles where id=$1', [alice]), 'alice')
    await assert.rejects(account('00000000-0000-0000-0000-000000000005', 'ALICE'))
    assert.equal(await scalar('select count(*)::int from auth.users'), 4)
    // Free the old synthetic email to exercise the PROFILE uniqueness constraint itself.
    await db.query('update auth.users set email=$1 where id=$2', ['retired@insideout.invalid', alice])
    await assert.rejects(account('00000000-0000-0000-0000-000000000007', 'alice'), /unique constraint/)
    assert.equal(await scalar('select count(*)::int from auth.users'), 4)
    await db.query('update auth.users set email=$1 where id=$2', ['alice@insideout.invalid', alice])
    await assert.rejects(account('00000000-0000-0000-0000-000000000006', 'a.b'))
    assert.equal(await scalar('select count(*)::int from auth.users'), 4)
  })
  await t.test('profiles cannot be listed; exact case-insensitive lookup returns only safe fields', async () => {
    await asUser(alice)
    assert.equal((await rows('select * from public.profiles')).length, 1)
    assert.deepEqual(await rows("select * from public.lookup_username(' BOB ')"), [{ id: bob, username: 'bob', display_name: 'bob' }])
    assert.deepEqual(await rows("select * from public.lookup_username('bo')"), [])
    assert.deepEqual(await rows("select * from public.lookup_username('%')"), [])
  })
  await t.test('creating a direct conversation twice from either side returns one shared conversation', async () => {
    direct = await scalar('select public.create_direct($1)', [bob])
    assert.equal(await scalar('select public.create_direct($1)', [bob]), direct)
    await asUser(bob)
    assert.equal(await scalar('select public.create_direct($1)', [alice]), direct)
    assert.equal(await scalar('select count(*)::int from public.conversations'), 1)
    assert.equal(await scalar('select count(*)::int from public.conversation_members'), 2)
    await assert.rejects(db.query('select public.create_direct($1)', [bob]), /another user/)
  })
  await t.test('members exchange persistent messages; spoofing and timestamp overrides fail', async () => {
    await asUser(alice)
    await db.query('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)', [direct, alice, 'hello bob'])
    await asUser(bob)
    assert.equal(await scalar('select content from public.messages'), 'hello bob')
    await db.query('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)', [direct, bob, 'hello alice'])
    await assert.rejects(db.query('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)', [direct, alice, 'spoof']), /row-level security/)
    await assert.rejects(db.query("insert into public.messages(conversation_id,sender_id,content,created_at) values ($1,$2,'bad',now())", [direct, bob]), /permission denied/)
    await assert.rejects(db.query("insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'   ')", [direct, bob]), /check constraint/)
    await assert.rejects(db.query('update public.messages set content = $1', ['edited']), /permission denied/)
    await assert.rejects(db.query('delete from public.messages'), /permission denied/)
    await asUser(alice)
    assert.equal(await scalar('select count(*)::int from public.messages'), 2)
  })
  await t.test('outsiders cannot read conversations, memberships, profiles, or messages or inject messages', async () => {
    await asUser(charlie)
    assert.deepEqual(await rows('select * from public.conversations'), [])
    assert.deepEqual(await rows('select * from public.conversation_members'), [])
    assert.deepEqual(await rows('select * from public.messages'), [])
    assert.equal((await rows('select * from public.profiles')).length, 1)
    await assert.rejects(db.query("insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'intrusion')", [direct, charlie]), /row-level security/)
    await assert.rejects(db.query('insert into public.conversation_members(conversation_id,user_id) values ($1,$2)', [direct, charlie]), /permission denied/)
  })
  await t.test('group creation is atomic, deduplicates members, and creates one owner', async () => {
    await asUser(alice)
    group = await scalar('select public.create_group($1,$2)', [' Friends ', [alice, bob, bob]])
    assert.equal(await scalar('select name from public.conversations where id=$1', [group]), 'Friends')
    assert.equal(await scalar('select count(*)::int from public.conversation_members where conversation_id=$1', [group]), 2)
    assert.equal(await scalar("select count(*)::int from public.conversation_members where conversation_id=$1 and role='admin'", [group]), 1)
    await assert.rejects(db.query('select public.create_group($1,$2)', ['Broken', ['00000000-0000-0000-0000-000000000099']]), /User not found/)
    assert.equal(await scalar('select count(*)::int from public.conversations'), 2)
    await assert.rejects(db.query('select public.create_group($1,$2)', [' ', []]), /Group name/)
    await assert.rejects(db.query('select public.create_group($1,$2)', [null, []]), /Group name/)
  })
  await t.test('only the group creator can add/remove members, never mutate direct memberships', async () => {
    await asUser(bob)
    await assert.rejects(db.query('select public.add_group_member($1,$2)', [group, 'charlie']), /Only the group creator/)
    await assert.rejects(db.query('select public.remove_group_member($1,$2)', [group, alice]), /Only the group creator/)
    await asUser(alice)
    await assert.rejects(db.query('select public.add_group_member($1,$2)', [direct, 'charlie']), /Only the group creator/)
    await assert.rejects(db.query('select public.remove_group_member($1,$2)', [group, alice]), /cannot be removed/)
    await db.query('select public.add_group_member($1,$2)', [group, 'CHARLIE'])
    await db.query('select public.add_group_member($1,$2)', [group, 'charlie'])
    assert.equal(await scalar('select count(*)::int from public.conversation_members where conversation_id=$1', [group]), 3)
  })
  await t.test('group members can exchange messages; removed members immediately lose access', async () => {
    await asUser(charlie)
    assert.equal(await scalar('select count(*)::int from public.conversations'), 1)
    await db.query("insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'hello group')", [group, charlie])
    await asUser(bob)
    assert.equal(await scalar('select content from public.messages where conversation_id=$1', [group]), 'hello group')
    await asUser(alice)
    await db.query('select public.remove_group_member($1,$2)', [group, charlie])
    assert.equal(await scalar('select display_name from public.profiles where id=$1', [charlie]), 'charlie')
    await asUser(charlie)
    assert.deepEqual(await rows('select * from public.conversations'), [])
    assert.deepEqual(await rows('select * from public.messages'), [])
    await assert.rejects(db.query("insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'removed')", [group, charlie]), /row-level security/)
  })
  await t.test('keyset history pagination returns stable 50-message pages with equal timestamps', async () => {
    await asUser(alice)
    await db.query("insert into public.messages(conversation_id,sender_id,content) select $1,$2,'history ' || n from generate_series(1,125) n", [direct, alice])
    const page = await rows('select * from public.messages where conversation_id=$1 order by created_at desc, id desc limit 50', [direct])
    const cursor = page.at(-1)
    const older = await rows('select * from public.messages where conversation_id=$1 and (created_at,id)<($2::timestamptz,$3::uuid) order by created_at desc,id desc limit 50', [direct, cursor.created_at, cursor.id])
    assert.equal(page.length, 50); assert.equal(older.length, 50)
    assert.equal(new Set([...page, ...older].map((message) => message.id)).size, 100)
    const missed = await rows('select * from public.messages where conversation_id=$1 and (created_at,id)>($2::timestamptz,$3::uuid) order by created_at,id', [direct, cursor.created_at, cursor.id])
    assert.equal(missed.length, 49)
  })
  await t.test('anonymous clients cannot read tables or call discovery/conversation functions', async () => {
    await db.exec('reset role; set role anon')
    for (const table of ['profiles', 'conversations', 'conversation_members', 'messages']) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/)
    await assert.rejects(db.query("select * from public.lookup_username('alice')"), /permission denied/)
    await assert.rejects(db.query('select public.create_direct($1)', [bob]), /permission denied/)
    await assert.rejects(db.query("insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'anonymous')", [direct, alice]), /permission denied/)
  })
  await t.test('functions do not accept a null caller even with authenticated role', async () => {
    await asUser(null)
    assert.deepEqual(await rows("select * from public.lookup_username('alice')"), [])
    await assert.rejects(db.query('select public.create_direct($1)', [bob]), /Please sign in/)
    await assert.rejects(db.query('select public.create_group($1,$2)', ['Bad', []]), /Please sign in/)
  })
})
