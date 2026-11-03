import { useEffect, useRef } from 'react'
import { createMagicRenderer } from '../lib/magicRenderer'
import { findMagicEffect, readMagicClock } from '../lib/magic'

export default function MagicAtmosphere({ effectId, seed, preview = false, paused = false, clock, appliedAt, expiresAt }) {
  const ref = useRef(null)
  const effect = findMagicEffect(effectId)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !effect) return
    const scene = createMagicRenderer(canvas, { effectId, seed, density: preview ? 0.4 : window.innerWidth < 700 ? 0.65 : 1 })
    if (!scene) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, visible = true, disposed = false, last = -Infinity
    const start = performance.now()
    function draw(time) {
      frame = 0
      if (disposed || paused || document.hidden || !visible) return
      let elapsed = (time - start) / 1000 + 8
      if (clock) {
        const reading = readMagicClock(clock)
        if (reading.needsSync || reading.now >= Date.parse(expiresAt)) { scene.clear(); return }
        elapsed = Math.max(0, (reading.now - Date.parse(appliedAt)) / 1000)
      }
      if (time - last >= 1000 / 30 || reduced.matches) { scene.draw(reduced.matches ? 8 : elapsed); last = time }
      if (!reduced.matches) frame = requestAnimationFrame(draw)
    }
    function resume() { cancelAnimationFrame(frame); frame = 0; if (!disposed && !paused && !document.hidden && visible) frame = requestAnimationFrame(draw) }
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      scene.resize(width, height, Math.min(window.devicePixelRatio || 1, width * height > 1500000 ? 1 : 1.5)); last = -Infinity; resume()
    })
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume() })
    resize.observe(canvas); intersection.observe(canvas)
    document.addEventListener('visibilitychange', resume); reduced.addEventListener('change', resume)
    resume()
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', resume); reduced.removeEventListener('change', resume); scene.clear() }
  }, [effect, effectId, seed, preview, paused, clock, appliedAt, expiresAt])
  if (!effect) return null
  return <div className={`chat-magic-layer magic-${effect.id} ${preview ? 'magic-preview-layer' : ''}`} style={{ background: effect.tint }} aria-hidden="true"><canvas ref={ref} /></div>
}
