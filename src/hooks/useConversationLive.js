import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'

export function useConversationLive(conversations, userId) {
  const [online, setOnline] = useState({})
  const [typing, setTyping] = useState({})
  const [error, setError] = useState('')
  const channels = useRef(new Map())
  const lastTyping = useRef(new Map())
  const latest = useRef(conversations)
  latest.current = conversations
  const ids = conversations.map((conversation) => conversation.id).sort().join(',')
  useEffect(() => {
    const activeIds = new Set(ids.split(',').filter(Boolean))
    for (const [id, entry] of channels.current) {
      if (!activeIds.has(id)) { void supabase.removeChannel(entry.channel); channels.current.delete(id); lastTyping.current.delete(id); setOnline((state) => { const next = { ...state }; delete next[id]; return next }); setTyping((state) => { const next = { ...state }; delete next[id]; return next }) }
    }
    for (const id of activeIds) {
      if (channels.current.has(id)) continue
      const entry = { channel: null, joined: false }
      const channel = supabase.channel(`conversation:${id}`, { config: { private: true, presence: { key: userId } } })
      entry.channel = channel
      channels.current.set(id, entry)
      channel.on('presence', { event: 'sync' }, () => {
        if (channels.current.get(id) !== entry) return
        const memberIds = new Set(latest.current.find((item) => item.id === id)?.members.map((member) => member.user_id) || [])
        setOnline((state) => ({ ...state, [id]: Object.keys(channel.presenceState()).filter((key) => memberIds.has(key)) }))
      }).on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (channels.current.get(id) !== entry || !payload || typeof payload.user_id !== 'string' || typeof payload.typing !== 'boolean' || payload.user_id === userId) return
        const known = latest.current.find((item) => item.id === id)?.members.some((member) => member.user_id === payload.user_id)
        if (!known) return
        setTyping((state) => ({ ...state, [id]: { ...state[id], [payload.user_id]: payload.typing ? Date.now() + 3000 : 0 } }))
      }).subscribe(async (status) => {
        if (channels.current.get(id) !== entry) return
        entry.joined = status === 'SUBSCRIBED'
        if (entry.joined) {
          setError('')
          try { await channel.track({ user_id: userId }) } catch { if (channels.current.get(id) === entry) setError('Presence could not reconnect. Messaging is still available.') }
        }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          setOnline((state) => ({ ...state, [id]: [] })); setTyping((state) => ({ ...state, [id]: {} }))
          setError('Live status unavailable. Check the private Realtime channel configuration.')
        }
      })
    }
  }, [ids, userId])
  useEffect(() => {
    const current = channels.current
    const interval = setInterval(() => setTyping((state) => {
      let changed = false
      const next = {}
      for (const [id, users] of Object.entries(state)) {
        next[id] = Object.fromEntries(Object.entries(users).filter(([, expiry]) => { if (expiry <= Date.now()) { changed = true; return false } return true }))
      }
      return changed ? next : state
    }), 500)
    const offline = () => { setOnline({}); setTyping({}) }
    window.addEventListener('offline', offline)
    return () => { clearInterval(interval); window.removeEventListener('offline', offline); for (const { channel } of current.values()) void supabase.removeChannel(channel); current.clear() }
  }, [])
  const sendTyping = useCallback((id, value) => {
    const entry = channels.current.get(id)
    if (!entry?.joined) return
    const now = Date.now(), last = lastTyping.current.get(id) || 0
    if (value && now - last < 1000) return
    lastTyping.current.set(id, value ? now : 0)
    void entry.channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, typing: Boolean(value) } }).catch(() => {})
  }, [userId])
  return { online, typing, sendTyping, error }
}
