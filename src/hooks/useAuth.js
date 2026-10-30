import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { getProfile } from '../services/chatService'
import { errorMessage } from '../lib/chat'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  useEffect(() => {
    if (!supabase) return
    let active = true
    let version = 0
    let currentId
    const update = async (session) => {
      if (!active || currentId === (session?.user?.id || null)) return
      currentId = session?.user?.id || null
      const request = ++version
      setUser(session?.user || null)
      setProfile(null)
      setError('')
      if (!session) { setLoading(false); return }
      setLoading(true)
      try {
        const data = await getProfile(session.user.id)
        if (active && request === version) setProfile(data)
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
  return { user, profile, loading, error }
}
