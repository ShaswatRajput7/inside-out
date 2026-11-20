import { useEffect, useState } from 'react'
import { SHADOW_KEY, shadowEnabled } from '../lib/shadow'

export function useShadowMode() {
  const [enabled, setEnabled] = useState(shadowEnabled)
  useEffect(() => {
    const changed = (event) => { if (event.key === SHADOW_KEY || event.key === null) setEnabled(shadowEnabled()) }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  function toggle() {
    const next = !enabled
    try { localStorage.setItem(SHADOW_KEY, String(next)) } catch { /* Still works for this session. */ }
    setEnabled(next)
  }
  return { enabled, toggle }
}
