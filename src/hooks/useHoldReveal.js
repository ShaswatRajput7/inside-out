import { useCallback, useEffect, useRef, useState } from 'react'

export function useHoldReveal() {
  const [revealed, setRevealed] = useState(null)
  const timer = useRef(null)
  const hide = useCallback(() => { clearTimeout(timer.current); setRevealed(null) }, [])
  useEffect(() => {
    const events = ['pointerup', 'pointercancel', 'blur', 'scroll', 'visibilitychange', 'keyup']
    events.forEach((name) => window.addEventListener(name, hide, name !== 'blur'))
    return () => { clearTimeout(timer.current); events.forEach((name) => window.removeEventListener(name, hide, name !== 'blur')) }
  }, [hide])
  function start(id, delay = 0) {
    hide()
    if (delay) timer.current = setTimeout(() => setRevealed(id), delay)
    else setRevealed(id)
  }
  return { revealed, hide, start }
}
