import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { getProfile } from '../services/chatService'
import { errorMessage } from '../lib/chat'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const identity = useRef(null), profileRequest = useRef(0)
  const updateProfile = useCallback((next) => {
    if (next?.id === identity.current) { profileRequest.current++; setProfile(next) }
  }, [])
  useEffect(() => {
    if (!supabase) return
    let active = true
    let version = 0
    let currentId
    const update = async (session) => {
      if (!active || currentId === (session?.user?.id || null)) return
      currentId = session?.user?.id || null
      identity.current = currentId
      const profileVersion = ++profileRequest.current
      const request = ++version
      setUser(session?.user || null)
      setProfile(null)
      setError('')
      if (!session) { setLoading(false); return }
      setLoading(true)
      try {
        const data = await getProfile(session.user.id)
        if (active && request === version && profileVersion === profileRequest.current) setProfile(data)
      } catch (err) {
        if (active && request === version) setError(errorMessage(err))
      } finally {
        if (active && request === version) setLoading(false)
      }
    }
    // Async work runs outside the auth callback's lock. Token refresh keeps chat mounted.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { if (active) void update(session) }, 0)
    })
    // INITIAL_SESSION handles restoration as well as fresh login/logout.
    return () => { active = false; version++; subscription.unsubscribe() }
  }, [])
  // Keep other tabs/devices in sync without unmounting the conversation or exposing
  // a public profile subscription. The current account is always readable via RLS.
  useEffect(() => {
    if (!user?.id || profile?.id !== user.id) return
    let active = true
    const refresh = async () => {
      if (!active || identity.current !== user.id) return
      const request = ++profileRequest.current
      try {
        const next = await getProfile(user.id)
        if (active && request === profileRequest.current && identity.current === user.id) setProfile(next)
      } catch { /* Keep the cached account while offline; retry on focus/online. */ }
    }
    const interval = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh)
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh) }
  }, [user?.id, profile?.id])
  return { user, profile, loading, error, updateProfile }
}
