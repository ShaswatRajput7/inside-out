import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeMessages, normalizeUsername, usernameEmail, validUsername, conversationTitle } from '../src/lib/chat.js'

test('username identity is case-insensitive and uses a reserved domain', () => {
  assert.equal(normalizeUsername('  FRIEND_1 '), 'friend_1')
  assert.equal(usernameEmail('  FRIEND_1 '), 'friend_1@insideout.invalid')
  for (const input of ['ab', 'a.b', 'a@b', 'a b', 'ålice', 'a'.repeat(25)]) assert.equal(validUsername(input), false)
  assert.equal(validUsername('Alice_123'), true)
})
test('live, sent, and fetched messages merge without duplicates in stable cursor order', () => {
  const first = { id: 'a', created_at: '2026-10-30T01:00:00Z' }
  const second = { id: 'b', created_at: first.created_at }
  const last = { id: 'c', created_at: '2026-10-30T02:00:00Z' }
  assert.deepEqual(mergeMessages([last, second], [first, second]), [first, second, last])
})
test('direct titles use the other member and groups use their name', () => {
  const direct = { type: 'direct', members: [{ user_id: 'me', profile: { display_name: 'Me' } }, { user_id: 'friend', profile: { display_name: 'Alice' } }] }
  assert.equal(conversationTitle(direct, 'me'), 'Alice')
  assert.equal(conversationTitle({ type: 'group', name: 'Friends' }, 'me'), 'Friends')
})
