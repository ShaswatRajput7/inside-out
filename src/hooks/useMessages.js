import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { getMessages, sendMessage } from '../services/chatService'
import { errorMessage, mergeMessages } from '../lib/chat'

export function useMessages(conversationId, userId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [error, setError] = useState('')
  const [connection, setConnection] = useState('connecting')
  const state = useRef({ active: false, messages: [], cursor: null, syncing: false, pendingSync: false, older: false, initialized: false })

  useEffect(() => {
    const scope = { active: true, messages: [], cursor: null, syncing: false, pendingSync: false, older: false, initialized: false }
    state.current = scope
    const merge = (incoming) => {
      if (!scope.active) return
      scope.messages = mergeMessages(scope.messages, incoming)
      setMessages(scope.messages)
    }
    const sync = async () => {
      if (!scope.active) return
      if (scope.syncing) { scope.pendingSync = true; return }
      scope.pendingSync = false
      scope.syncing = true
      try {
        if (!scope.initialized) {
          const initial = await getMessages(conversationId)
          if (!scope.active) return
          merge(initial)
          scope.cursor = initial[0] || null
          setHasOlder(initial.length === 50)
          scope.initialized = true
        } else {
          // Page forward from the last stored cursor, never skip a reconnect gap.
          let cursor = scope.cursor
          let page
          do {
            page = await getMessages(conversationId, { after: cursor, forward: true, limit: 500 })
            if (!scope.active) return
            merge(page)
            cursor = page.at(-1) || cursor
            scope.cursor = cursor
          } while (page.length === 500 && scope.active)
        }
        if (scope.active) setError('')
      } catch (err) {
        if (scope.active) setError(errorMessage(err))
      } finally {
        scope.syncing = false
        if (scope.active) {
          setLoading(false)
          if (scope.pendingSync) void sync()
        }
      }
    }
    // Start fetching even if the websocket is unavailable; subscribe then reconcile.
    void sync()
    const channel = supabase.channel(`messages:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => {
        // Reconcile from our cursor: live events cannot jump over a reconnect gap.
        void sync()
      })
      .subscribe((status) => {
        if (!scope.active) return
        if (status === 'SUBSCRIBED') { setConnection('connected'); void sync() }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setConnection('reconnecting')
      })
    const online = () => { if (scope.active) { setConnection(supabase.realtime.isConnected() ? 'connected' : 'connecting'); void sync() } }
    const offline = () => { if (scope.active) setConnection('offline') }
    const interval = setInterval(sync, 10000)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', sync)
    return () => {
      scope.active = false
      clearInterval(interval)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', sync)
      void supabase.removeChannel(channel)
    }
  }, [conversationId])

  const loadOlder = useCallback(async () => {
    const scope = state.current
    if (!scope.active || scope.older || !hasOlder || !scope.messages.length) return
    scope.older = true
    setLoadingOlder(true)
    try {
      const older = await getMessages(conversationId, { before: scope.messages[0] })
      if (scope.active) {
        scope.messages = mergeMessages(scope.messages, older)
        setMessages(scope.messages)
        setHasOlder(older.length === 50)
        setError('')
      }
    } catch (err) { if (scope.active) setError(errorMessage(err)) }
    finally { scope.older = false; if (scope.active) setLoadingOlder(false) }
  }, [conversationId, hasOlder])

  const send = useCallback(async (content, id) => {
    const scope = state.current
    try {
      const message = await sendMessage(conversationId, userId, content, id)
      if (scope.active) {
        scope.messages = mergeMessages(scope.messages, [message])
        setMessages(scope.messages)
      }
    } catch (err) {
      // A timed-out successful insert can be retried safely with the same client ID.
      if (err.code === '23505') return
      throw err
    }
  }, [conversationId, userId])
  return { messages, loading, loadingOlder, hasOlder, error, connection, loadOlder, send }
}
