import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { changeUsername } from '../supabase/functions/change-username/handler.js'

const alice='00000000-0000-0000-0000-000000000021', bob='00000000-0000-0000-0000-000000000022'
test('username changes preserve identity/history and roll back collisions atomically', async (t) => {
  const db=new PGlite()
  t.after(()=>db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb,encrypted_password text,created_at timestamptz default now());
    create table auth.identities(user_id uuid primary key references auth.users(id),email text);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth to authenticated,supabase_auth_admin;
    grant execute on function auth.uid() to authenticated;
    grant select,update on auth.users,auth.identities to supabase_auth_admin;
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/001_inside_out.sql',import.meta.url),'utf8'))
  const rows=async (sql,args=[]) => (await db.query(sql,args)).rows
  const one=async (sql,args=[]) => Object.values((await rows(sql,args))[0])[0]
  const signup=async (id,name) => {
    await db.query('insert into auth.users(id,email,raw_user_meta_data,encrypted_password) values($1,$2,$3,$4)',[id,`${name}@insideout.invalid`,JSON.stringify({username:name}),'unchanged-auth-password-hash'])
    await db.query('insert into auth.identities values($1,$2)',[id,`${name}@insideout.invalid`])
  }
  await signup(alice,'alice'); await signup(bob,'bob')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice])
  const cid=await one('select public.create_direct($1)',[bob])
  await db.query("insert into public.messages(conversation_id,sender_id,content) values($1,$2,'Existing message')",[cid,alice])
  const snapshot=async()=>Promise.all(['auth.users','auth.identities','public.profiles','public.conversations','public.conversation_members','public.messages'].map(table=>rows(`select * from ${table} order by 1`)))
  const original=await snapshot()
  await db.exec(await readFile(new URL('../supabase/migrations/004_username_changes.sql',import.meta.url),'utf8'))

  // Emulate Auth's documented transaction; real hosted Auth sign-in remains a rollout check.
  const authUpdate=async (id,username)=> {
    await db.exec('begin; set local role supabase_auth_admin')
    try {
      await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data||jsonb_build_object('username',$1::text) where id=$2",[username,id])
      await db.query('update auth.identities set email=$1 where user_id=$2',[`${username}@insideout.invalid`,id])
      await db.query('update auth.users set email=$1 where id=$2',[`${username}@insideout.invalid`,id])
      await db.exec('commit')
    } catch(error) { await db.exec('rollback'); throw error }
  }
  await t.test('migration is additive and does not rewrite any existing data',async()=>{
    assert.deepEqual(await snapshot(),original)
    await db.exec('set role service_role')
    assert.equal(await one('select public.username_change_ready()'),true)
    await db.exec('reset role')
  })
  await t.test('rename keeps UUID, password hash, message ownership and memberships',async()=>{
    const history=await rows('select * from public.messages'), members=await rows('select * from public.conversation_members')
    await authUpdate(alice,'alice_new')
    assert.equal(await one('select username from public.profiles where id=$1',[alice]),'alice_new')
    assert.equal(await one('select display_name from public.profiles where id=$1',[alice]),'alice_new')
    assert.equal(await one('select email from auth.users where id=$1',[alice]),'alice_new@insideout.invalid')
    assert.equal(await one('select email from auth.identities where user_id=$1',[alice]),'alice_new@insideout.invalid')
    assert.equal(await one('select encrypted_password from auth.users where id=$1',[alice]),'unchanged-auth-password-hash')
    assert.deepEqual(await rows('select * from public.messages'),history)
    assert.deepEqual(await rows('select * from public.conversation_members'),members)
    assert.deepEqual(await rows("select * from public.lookup_username('alice')"),[])
    assert.equal((await rows("select * from public.lookup_username('ALICE_NEW')"))[0].id,alice)
  })
  await t.test('duplicate and invalid renames roll back the Auth identity and metadata too',async()=>{
    const before=await snapshot()
    await assert.rejects(authUpdate(alice,'bob'),/unique constraint/)
    assert.deepEqual(await snapshot(),before)
    for(const name of ['ab','with.dot','not valid','UPPER','x'.repeat(25)]) {
      await assert.rejects(authUpdate(alice,name),/Invalid Inside Out/)
      assert.deepEqual(await snapshot(),before)
    }
    // Simulate a stale profile collision even when the email itself is free.
    await db.query('update public.profiles set username=$1 where id=$2',['reserved',bob])
    const stale=await snapshot()
    await assert.rejects(authUpdate(alice,'reserved'),/unique constraint/)
    assert.deepEqual(await snapshot(),stale)
    await db.query('update public.profiles set username=$1 where id=$2',['bob',bob])
  })
  await t.test('old username becomes reusable; custom display names survive renames',async()=>{
    await authUpdate(bob,'alice')
    assert.equal((await rows("select * from public.lookup_username('alice')"))[0].id,bob)
    const newcomer='00000000-0000-0000-0000-000000000023'
    await signup(newcomer,'bob')
    assert.equal((await rows("select * from public.lookup_username('bob')"))[0].id,newcomer)
    await db.query('update public.profiles set display_name=$1 where id=$2',['A Friend',alice])
    await authUpdate(alice,'another_name')
    assert.equal(await one('select display_name from public.profiles where id=$1',[alice]),'A Friend')
  })
  await t.test('metadata-only spoofing cannot rename a profile; ordinary clients cannot write profiles or Auth',async()=>{
    await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[JSON.stringify({username:'bob'}),alice])
    assert.equal(await one('select username from public.profiles where id=$1',[alice]),'another_name')
    await db.exec('set role authenticated')
    await assert.rejects(db.query('update public.profiles set username=$1 where id=$2',['taken',bob]),/permission denied/)
    await assert.rejects(db.query('update auth.users set email=$1 where id=$2',['taken@insideout.invalid',bob]),/permission denied/)
    await assert.rejects(db.query('select public.username_change_ready()'),/permission denied/)
    await assert.rejects(db.query('select private.sync_username_from_auth()'),/permission denied/)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select public.username_change_ready()'),/permission denied/)
    await db.exec('reset role')
  })
})

function fakeApi({ authenticated=true, ready=true, taken=null, updateError=null }={}) {
  let profile={id:alice,username:'alice',display_name:'alice',created_at:'2026-11-03T00:00:00Z'}
  const updates=[]
  return {
    updates,
    auth:{getUser:async(token)=>({data:{user:authenticated&&token==='valid-token'?{id:alice,user_metadata:{username:'alice',other:'keep'}}:null},error:null}),admin:{updateUserById:async(id,attributes)=>{updates.push({id,attributes}); if(!updateError) profile={...profile,username:attributes.user_metadata.username}; return {error:updateError} }}},
    rpc:async()=>({data:ready,error:null}),
    from:()=>({select:()=>({eq:()=>({single:async()=>({data:profile,error:null}),maybeSingle:async()=>({data:taken,error:null})})})}),
  }
}
test('username endpoint validates auth and setup before using Admin API',async()=>{
  for (const api of [fakeApi({authenticated:false}),fakeApi({ready:false})]) {
    await assert.rejects(changeUsername(api,'valid-token','new_name'))
    assert.equal(api.updates.length,0)
  }
  const api=fakeApi()
  for(const input of [null,{},'ab','a.b','a b']) await assert.rejects(changeUsername(api,'valid-token',input),/3–24/)
  assert.equal(api.updates.length,0)
})
test('username endpoint updates only verified caller, uses official email confirmation, keeps metadata and returns no credentials',async()=>{
  const api=fakeApi()
  const result=await changeUsername(api,'valid-token','  NEW_NAME  ')
  assert.deepEqual(api.updates,[{id:alice,attributes:{email:'new_name@insideout.invalid',email_confirm:true,user_metadata:{username:'new_name',other:'keep'}}}])
  assert.equal(result.username,'new_name')
  assert.equal(result.email,undefined); assert.equal(result.password,undefined)
  await changeUsername(api,'valid-token','new_name')
  assert.equal(api.updates.length,1,'retries after success must not change identity again')
})
test('username endpoint reports existing and concurrent collisions without returning another profile',async()=>{
  const api=fakeApi({taken:{id:bob}})
  await assert.rejects(changeUsername(api,'valid-token','bob'),error=>error.status===409)
  assert.equal(api.updates.length,0)
  const race=fakeApi({updateError:{code:'email_exists',message:'already exists'}})
  await assert.rejects(changeUsername(race,'valid-token','bob'),error=>error.status===409)
})
