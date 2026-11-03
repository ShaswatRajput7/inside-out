import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { getConversationTheme, setConversationTheme } from '../services/themeService'
import { DEFAULT_THEME, normalizeTheme } from '../lib/themes'
import { errorMessage } from '../lib/chat'

export function useConversationTheme(conversationId, userId) {
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const alive = useRef(false), sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    try {
      const row = normalizeTheme(await getConversationTheme(conversationId), conversationId)
      if (alive.current && request === sequence.current) {
        setTheme((current) => current.updated_at === row.updated_at && current.kind === row.kind ? current : row)
        setError('')
      }
    } catch (err) {
      if (alive.current && request === sequence.current) setError(`Themes could not sync. ${errorMessage(err)}`)
    } finally { if (alive.current && request === sequence.current) setLoading(false) }
  }, [conversationId])
  useEffect(() => {
    const requests = sequence
    alive.current = true
    void refresh()
    const channel = supabase.channel(`theme:${conversationId}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_themes', filter: `conversation_id=eq.${conversationId}` }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh() })
    const interval = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh)
    return () => {
      alive.current = false; requests.current++
      clearInterval(interval)
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
      void supabase.removeChannel(channel)
    }
  }, [conversationId, userId, refresh])
  const save = useCallback(async (selection) => {
    const row = await setConversationTheme(conversationId, selection)
    if (alive.current) {
      sequence.current++ // A pre-save request must not overwrite the confirmed selection.
      setTheme(normalizeTheme(row, conversationId)); setError('')
      void refresh()
    }
  }, [conversationId, refresh])
  return { theme, loading, error, save }
}
