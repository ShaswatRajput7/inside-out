import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { getMessage, getMessages, getMessagesByIds, getReactions, sendMessage } from '../services/chatService'
import { sendImage } from '../services/images'
import { errorMessage, mergeMessages } from '../lib/chat'

export function useMessages(conversationId, userId) {
  const [messages, setMessages] = useState([])
  const [reactions, setReactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [error, setError] = useState('')
  const [connection, setConnection] = useState('connecting')
  const state = useRef(null)
  useEffect(() => {
    const scope = { active: true, messages: [], cursor: null, syncing: false, pending: false, older: false, initialized: false }
    state.current = scope
    scope.merge = (incoming) => {
      if (!scope.active) return
      scope.messages = mergeMessages(scope.messages, incoming)
      setMessages(scope.messages)
    }
    scope.refreshReactions = async () => {
      const data = await getReactions(conversationId, scope.messages.map((message) => message.id))
      if (scope.active) setReactions(data)
    }
    scope.sync = async () => {
      if (!scope.active) return
      if (scope.syncing) { scope.pending = true; return }
      scope.pending = false; scope.syncing = true
      try {
        if (!scope.initialized) {
          const initial = await getMessages(conversationId)
          if (!scope.active) return
          scope.merge(initial); scope.cursor = initial[0] || null
          setHasOlder(initial.length === 50); scope.initialized = true
        } else {
          let cursor = scope.cursor, page
          do {
            page = await getMessages(conversationId, { after: cursor, forward: true, limit: 500 })
            if (!scope.active) return
            scope.merge(page); cursor = page.at(-1) || cursor; scope.cursor = cursor
          } while (page.length === 500 && scope.active)
          // Reconcile loaded history too: edits/deletions may have happened while offline.
          const ids = scope.messages.map((message) => message.id)
          for (let i = 0; i < ids.length && scope.active; i += 200) scope.merge(await getMessagesByIds(ids.slice(i, i + 200)))
        }
        await scope.refreshReactions()
        if (scope.active) setError('')
      } catch (err) { if (scope.active) setError(errorMessage(err)) }
      finally {
        scope.syncing = false
        if (scope.active) { setLoading(false); if (scope.pending) void scope.sync() }
      }
    }
    void scope.sync()
    const channel = supabase.channel(`conversation:${conversationId}:messages`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => { void scope.sync() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${conversationId}` }, () => { void scope.sync() })
      .subscribe((status) => {
        if (!scope.active) return
        if (status === 'SUBSCRIBED') { setConnection('connected'); void scope.sync() }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setConnection('reconnecting')
      })
    const online = () => { if (scope.active) { setConnection(supabase.realtime.isConnected() ? 'connected' : 'connecting'); void scope.sync() } }
    const offline = () => { if (scope.active) setConnection('offline') }
    const interval = setInterval(scope.sync, 10000)
    window.addEventListener('online', online); window.addEventListener('offline', offline); window.addEventListener('focus', scope.sync)
    return () => { scope.active = false; clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('focus', scope.sync); void supabase.removeChannel(channel) }
  }, [conversationId])
  const loadOlder = useCallback(async () => {
    const scope = state.current
    if (!scope?.active || scope.older || !hasOlder || !scope.messages.length) return
    scope.older = true; setLoadingOlder(true)
    try {
      const older = await getMessages(conversationId, { before: scope.messages[0] })
      if (scope.active) { scope.merge(older); setHasOlder(older.length === 50); await scope.refreshReactions(); setError('') }
    } catch (err) { if (scope.active) setError(errorMessage(err)) }
    finally { scope.older = false; if (scope.active) setLoadingOlder(false) }
  }, [conversationId, hasOlder])
  const send = useCallback(async (content, pending, attachment) => {
    const scope = state.current
    let message
    try {
      if (attachment) { await sendImage(conversationId, content, attachment, pending); message = await getMessage(pending.id) }
      else message = await sendMessage(conversationId, userId, content, pending.id)
    } catch (err) {
      if (err.code !== '23505') throw err
      message = await getMessage(pending.id)
    }
    if (scope?.active) scope.merge([message])
  }, [conversationId, userId])
  const refresh = useCallback(async () => { await state.current?.sync() }, [])
  return { messages, reactions, loading, loadingOlder, hasOlder, error, connection, loadOlder, send, refresh }
}
