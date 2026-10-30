// Optional hosted integration test. Creates three QA accounts and sample chats.
// Run explicitly: node --env-file=.env scripts/live-smoke.mjs
// Credentials go only to a mode-0600 temporary file, never console output.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Supply the .env connection settings')
const clients = []
const fixtures = { accounts: [] }
const filename = join(tmpdir(), 'inside-out-qa.json')
const client = () => {
  const value = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  clients.push(value)
  return value
}
const checked = async (query) => { const { data, error } = await query; if (error) throw error; return data }
const pass = (message) => console.log(`PASS ${message}`)
try {
  for (const label of ['alice', 'bob', 'outsider']) {
    const username = `qa_${label}_${randomBytes(3).toString('hex')}`
    const password = randomBytes(24).toString('base64url')
    const api = client()
    const data = await checked(api.auth.signUp({ email: `${username}@insideout.invalid`, password, options: { data: { username } } }))
    assert.ok(data.session, 'Signup must return a session without email confirmation')
    fixtures.accounts.push({ username, password, id: data.user.id })
    await writeFile(filename, JSON.stringify(fixtures), { mode: 0o600 })
  }
  pass('three username/password accounts register with immediate sessions')
  const [a, b, outsider] = clients
  const [alice, bob] = fixtures.accounts
  await checked(a.auth.signOut())
  await checked(a.auth.signInWithPassword({ email: `${alice.username}@insideout.invalid`, password: alice.password }))
  pass('password login after logout')
  const lookup = await checked(a.rpc('lookup_username', { exact_username: bob.username.toUpperCase() }))
  assert.equal(lookup[0].id, bob.id)
  assert.equal((await checked(a.rpc('lookup_username', { exact_username: bob.username.slice(0, -1) }))).length, 0)
  assert.equal((await checked(a.from('profiles').select('*'))).length, 1)
  pass('exact case-insensitive lookup and no public profile directory')
  const attempts = await Promise.all([checked(a.rpc('create_direct', { other_user_id: bob.id })), checked(b.rpc('create_direct', { other_user_id: alice.id }))])
  assert.equal(attempts[0], attempts[1])
  fixtures.direct = attempts[0]
  pass('concurrent direct creation from both sides returns the same chat')
  const conversations = await checked(b.from('conversations').select('id,type,name,members:conversation_members(user_id,role,profile:profiles!conversation_members_user_id_fkey(id,username,display_name))'))
  assert.equal(conversations[0].members.length, 2)
  pass('frontend conversation and profile joins')
  assert.equal((await checked(outsider.from('conversations').select('*'))).length, 0)
  assert.equal((await checked(outsider.from('messages').select('*'))).length, 0)
  const spoof = await b.from('messages').insert({ conversation_id: fixtures.direct, sender_id: alice.id, content: 'must fail' })
  assert.ok(spoof.error)
  const intrude = await outsider.from('messages').insert({ conversation_id: fixtures.direct, sender_id: fixtures.accounts[2].id, content: 'must fail' })
  assert.ok(intrude.error)
  pass('hosted RLS denies outsiders and sender impersonation')

  async function liveMessage(sender, receiver, conversationId, content) {
    const id = randomUUID()
    let resolveArrival, rejectArrival
    const arrival = new Promise((resolve, reject) => { resolveArrival = resolve; rejectArrival = reject })
    // Attach rejection handling immediately while we await websocket subscription.
    arrival.catch(() => {})
    const timer = setTimeout(() => rejectArrival(new Error('Realtime delivery timed out')), 20000)
    let channel
    try {
      await new Promise((resolve, reject) => {
        channel = receiver.channel(`qa:${id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, ({ new: message }) => { if (message.id === id) resolveArrival(message) })
          .subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) reject(new Error(`Realtime ${status}`)) })
        setTimeout(() => reject(new Error('Realtime subscription timed out')), 15000).unref()
      })
      const stored = await checked(sender.from('messages').insert({ id, conversation_id: conversationId, sender_id: (await sender.auth.getUser()).data.user.id, content }).select('id,content,sender:profiles!messages_sender_id_fkey(display_name)').single())
      assert.ok(stored.sender.display_name)
      const received = await arrival
      assert.equal(received.content, content)
      const fetched = await checked(receiver.from('messages').select('id,content').eq('id', id).single())
      assert.equal(fetched.content, content)
    } finally { clearTimeout(timer); if (channel) await receiver.removeChannel(channel) }
  }
  await liveMessage(a, b, fixtures.direct, 'Hello from the Inside Out live check.')
  await liveMessage(b, a, fixtures.direct, 'Reply received — direct messages work.')
  pass('bidirectional direct messages delivered over Realtime and persisted')
  const latest = await checked(a.from('messages').select('id,created_at').eq('conversation_id', fixtures.direct).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1))
  const cursor = latest[0]
  const earlier = await checked(a.from('messages').select('id,created_at').eq('conversation_id', fixtures.direct).or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50))
  assert.equal(earlier.length, 1)
  const olderCursor = earlier[0]
  const caughtUp = await checked(a.from('messages').select('id').eq('conversation_id', fixtures.direct).or(`created_at.gt.${olderCursor.created_at},and(created_at.eq.${olderCursor.created_at},id.gt.${olderCursor.id})`).order('created_at').order('id').limit(500))
  assert.equal(caughtUp[0].id, cursor.id)
  pass('PostgREST timestamp/UUID cursors for older history and reconnect catch-up')
  fixtures.group = await checked(a.rpc('create_group', { group_name: 'Inside Out QA', member_ids: [bob.id] }))
  await liveMessage(b, a, fixtures.group, 'Group messaging works too.')
  pass('group creation and live group messaging')
  const nonOwner = await b.rpc('add_group_member', { target_conversation: fixtures.group, exact_username: fixtures.accounts[2].username })
  assert.ok(nonOwner.error)
  await checked(a.rpc('add_group_member', { target_conversation: fixtures.group, exact_username: fixtures.accounts[2].username }))
  assert.equal((await checked(outsider.from('conversations').select('id'))).length, 1)
  await checked(a.rpc('remove_group_member', { target_conversation: fixtures.group, target_user: fixtures.accounts[2].id }))
  assert.equal((await checked(outsider.from('messages').select('id'))).length, 0)
  pass('creator-only membership changes and immediate removal access revocation')
  const restored = client()
  await checked(restored.auth.signInWithPassword({ email: `${alice.username}@insideout.invalid`, password: alice.password }))
  assert.equal((await checked(restored.from('messages').select('id').eq('conversation_id', fixtures.direct))).length, 2)
  pass('conversation history survives a new client login')
  await writeFile(filename, JSON.stringify(fixtures), { mode: 0o600 })
  console.log('Hosted smoke checks complete. Three QA accounts and sample chats remain for inspection.')
  console.log(`Local QA fixture file: ${filename}`)
} catch (error) {
  console.error('FAIL', error.message)
  process.exitCode = 1
} finally {
  for (const api of clients) { await api.removeAllChannels(); await api.auth.signOut().catch(() => {}) }
}
