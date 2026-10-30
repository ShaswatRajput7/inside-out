import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { getConversations } from '../services/chatService'
import { errorMessage } from '../lib/chat'

export function useConversations(userId) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const alive = useRef(false)
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    try {
      const data = await getConversations()
      if (alive.current && request === sequence.current) { setConversations(data); setError('') }
      return data
    } catch (err) {
      if (alive.current && request === sequence.current) setError(errorMessage(err))
      return null
    } finally {
      if (alive.current && request === sequence.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    alive.current = true
    void refresh()
    const channel = supabase.channel(`conversations:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh() })
    // Polling also detects removals and changed member details without broad subscriptions.
    const interval = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      alive.current = false
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      void supabase.removeChannel(channel)
    }
  }, [userId, refresh])
  return { conversations, loading, error, refresh }
}
