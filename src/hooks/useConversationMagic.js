import { useCallback, useEffect, useRef, useState } from 'react'
import { getConversationMagic, setConversationMagic } from '../services/magicService'
import { createMagicClock, findMagicEffect, magicIsActive, magicRemainingLabel, normalizeMagic, readMagicClock } from '../lib/magic'
import { errorMessage } from '../lib/chat'

export function useConversationMagic(conversationId, enabled) {
  const [snapshot, setSnapshot] = useState(null), [loading, setLoading] = useState(enabled), [error, setError] = useState('')
  const [, render] = useState(0)
  const scope = useRef(null)
  const receive = useCallback((row, current, roundTrip = 0) => {
    const next = { row: normalizeMagic(row, conversationId), clock: createMagicClock(row.server_now) }
    next.clock.server += Math.max(0, roundTrip / 2)
    if (current.active && scope.current === current) { current.snapshot = next; setSnapshot(next); setError('') }
  }, [conversationId])
  const refresh = useCallback(async () => {
    const current = scope.current
    if (!enabled || !current?.active) return false
    const request = ++current.request
    const start = performance.now()
    current.lastAttempt = start
    try {
      const row = await getConversationMagic(conversationId)
      if (request === current.request) receive(row, current, performance.now() - start)
      return true
    } catch (err) { if (current.active && request === current.request) setError(errorMessage(err)); return false }
    finally { if (current.active && scope.current === current) setLoading(false) }
  }, [conversationId, enabled, receive])
  useEffect(() => {
    if (!enabled) return
    const current = { active: true, request: 0, snapshot: null, display: '', lastAttempt: 0 }
    scope.current = current
    void refresh()
    const tick = () => {
      if (document.hidden || !current.snapshot) return
      const reading = readMagicClock(current.snapshot.clock), row = current.snapshot.row
      const active = magicIsActive(row, reading)
      const display = active ? `${row.effect_id}:${Math.ceil((Date.parse(row.expires_at) - reading.now) / 60000)}` : 'off'
      if (display !== current.display) { current.display = display; render((value) => value + 1) }
      if (reading.needsSync && performance.now() - current.lastAttempt > 15000) void refresh()
    }
    const wake = () => { if (!document.hidden) { tick(); void refresh() } }
    const timer = setInterval(tick, 1000), reconciliation = setInterval(() => { if (!document.hidden) void refresh() }, 30000)
    window.addEventListener('focus', wake); window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake)
    return () => {
      current.active = false; current.request++
      clearInterval(timer); clearInterval(reconciliation)
      window.removeEventListener('focus', wake); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake)
    }
  }, [enabled, refresh])
  const apply = useCallback(async (effectId, seconds) => {
    const current = scope.current
    if (!enabled || !current?.active) throw new Error('Chat Magic is available in direct conversations only.')
    const start = performance.now(), row = await setConversationMagic(conversationId, effectId, seconds)
    current.request++ // Discard any pre-save fetch still in flight.
    receive(row, current, performance.now() - start)
    return row
  }, [conversationId, enabled, receive])
  const reading = readMagicClock(snapshot?.clock)
  const active = enabled && magicIsActive(snapshot?.row, reading) ? snapshot.row : null
  return { active, clock: snapshot?.clock, effect: findMagicEffect(active?.effect_id), remaining: active ? magicRemainingLabel(active.expires_at, reading.now) : '', loading, error, refresh, apply }
}
