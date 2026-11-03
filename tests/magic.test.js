import test from 'node:test'
import assert from 'node:assert/strict'
import { MAGIC_DURATIONS, MAGIC_EFFECTS, createMagicClock, findMagicEffect, magicIsActive, magicRemainingLabel, normalizeMagic, readMagicClock, validMagicDuration } from '../src/lib/magic.js'

const start = '2026-11-03T10:00:00.000Z'
const row = { conversation_id: 'chat', effect_id: 'aurora', applied_at: start, expires_at: '2026-11-03T11:00:00.000Z' }
test('twelve distinct named atmospheres and all eight required durations are available', () => {
  assert.equal(MAGIC_EFFECTS.length, 12); assert.equal(new Set(MAGIC_EFFECTS.map((item) => item.id)).size, 12)
  for (const effect of MAGIC_EFFECTS) { assert.ok(effect.name && effect.mood && effect.detail && effect.tint); assert.equal(findMagicEffect(effect.id), effect) }
  assert.deepEqual(MAGIC_DURATIONS.map(([seconds]) => seconds), [300, 900, 1800, 3600, 10800, 21600, 43200, 86400])
  for (const seconds of [60, 300, 86400]) assert.equal(validMagicDuration(seconds), true)
  for (const seconds of [0, 59, 86401, Infinity, NaN, 60.5, '3600', null]) assert.equal(validMagicDuration(seconds), false)
})
test('invalid, foreign, removed and overlong settings never become atmospheres', () => {
  assert.equal(normalizeMagic(row, 'chat'), row)
  for (const invalid of [null, {}, { ...row, conversation_id: 'other' }, { ...row, effect_id: 'unknown' }, { ...row, effect_id: null }, { ...row, expires_at: 'invalid' }, { ...row, expires_at: start }, { ...row, expires_at: '2026-11-05T00:00:00Z' }]) assert.equal(normalizeMagic(invalid, 'chat'), null)
})
test('initial client date skew does not change server-derived remaining time', () => {
  const clock = createMagicClock(start, -1000000000000, 100)
  const reading = readMagicClock(clock, -1000000000000 + 600000, 600100)
  assert.equal(reading.now, Date.parse(start) + 600000); assert.equal(reading.needsSync, false)
  assert.equal(magicIsActive(row, reading), true)
  assert.equal(magicRemainingLabel(row.expires_at, reading.now), '50 min left')
  assert.throws(() => createMagicClock('bad'), /server clock/)
})
test('exact expiry, reopening and already expired server rows restore the underlying theme', () => {
  const clock = createMagicClock(start, 100, 100)
  assert.equal(magicIsActive(row, readMagicClock(clock, 3600099, 3600099)), true)
  assert.equal(magicIsActive(row, readMagicClock(clock, 3600100, 3600100)), false)
  const reopened = createMagicClock('2026-11-03T11:00:01Z', 999, 50)
  assert.equal(magicIsActive(row, readMagicClock(reopened, 999, 50)), false)
  assert.equal(magicRemainingLabel(row.expires_at, Date.parse(row.expires_at)), 'Expired')
})
test('sleep/wake and client clock jumps pause effects until server resynchronization', () => {
  const clock = createMagicClock(start, 1000, 1000)
  const asleep = readMagicClock(clock, 7201000, 2000)
  assert.equal(asleep.needsSync, true); assert.equal(magicIsActive(row, asleep), false)
  const backwards = readMagicClock(clock, -50000, 2000)
  assert.equal(backwards.needsSync, true); assert.ok(backwards.now >= Date.parse(start))
  const refreshed = createMagicClock('2026-11-03T10:05:00Z', -50000, 2000)
  assert.equal(magicIsActive(row, readMagicClock(refreshed, -50000, 2000)), true)
  assert.equal(magicIsActive(row, readMagicClock(null)), false)
})
test('remaining labels stay subtle and handle hours without overflowing the header', () => {
  assert.equal(magicRemainingLabel(row.expires_at, Date.parse(start)), '1h left')
  assert.equal(magicRemainingLabel('2026-11-03T13:42:00Z', Date.parse(start)), '3h 42m left')
  assert.equal(magicRemainingLabel('2026-11-04T10:00:00Z', Date.parse(start)), '24h left')
})
