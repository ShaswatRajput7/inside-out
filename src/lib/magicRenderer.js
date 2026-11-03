// Small procedural 2D scenes. No images, emoji graphics, physics engine or network.
const TAU = Math.PI * 2
const sprites = new Map()
const colors = { ice: '#c9dfff', violet: '#b79aff', pink: '#f5b6d9', gold: '#ffe5a0', green: '#ceee9d', teal: '#8ae8da' }
const mod = (n, size) => ((n % size) + size) % size
function randomFor(seed) {
  let value = 2166136261
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return () => { value += 0x6d2b79f5; let n = Math.imul(value ^ value >>> 15, 1 | value); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296 }
}
function glowSprite(color) {
  if (sprites.has(color)) return sprites.get(color)
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96
  const c = canvas.getContext('2d'), gradient = c.createRadialGradient(48, 48, 0, 48, 48, 48)
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.06, color); gradient.addColorStop(0.25, `${color}88`); gradient.addColorStop(1, `${color}00`)
  c.fillStyle = gradient; c.fillRect(0, 0, 96, 96); sprites.set(color, canvas)
  return canvas
}
function bubbleSprite() {
  if (sprites.has('bubble')) return sprites.get('bubble')
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
  const c = canvas.getContext('2d'), fill = c.createRadialGradient(48, 37, 2, 64, 64, 57)
  fill.addColorStop(0, '#fff9'); fill.addColorStop(0.12, '#c9e9fa12'); fill.addColorStop(0.8, '#8e92e408'); fill.addColorStop(1, '#c3a4ef42')
  c.fillStyle = fill; c.beginPath(); c.arc(64, 64, 56, 0, TAU); c.fill()
  const rim = c.createLinearGradient(15, 12, 105, 116)
  for (const [at, color] of [[0, '#fff9'], [0.25, '#b4f6ecb3'], [0.48, '#d5b4ff77'], [0.7, '#f3bed29c'], [1, '#b1ddf366']]) rim.addColorStop(at, color)
  c.strokeStyle = rim; c.lineWidth = 1.4; c.stroke()
  c.strokeStyle = '#ffffff99'; c.lineWidth = 2.3; c.beginPath(); c.ellipse(64, 64, 48, 49, -0.7, Math.PI * 1.07, Math.PI * 1.45); c.stroke()
  c.fillStyle = '#ffffff7a'; c.beginPath(); c.ellipse(43, 30, 5, 2.5, -0.6, 0, TAU); c.fill()
  sprites.set('bubble', canvas); return canvas
}

export function createMagicRenderer(canvas, { effectId, seed = effectId, density = 1 }) {
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return null
  const random = randomFor(`${seed}:${effectId}`)
  const points = Array.from({ length: 125 }, () => ({ x: random(), y: random(), r: random(), s: random(), phase: random() * TAU, drift: random() * TAU }))
  let width = 1, height = 1, ratio = 1
  const count = (n) => Math.max(4, Math.round(n * density))
  function light(x, y, radius, color, alpha = 1) {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2)
  }
  function sparkle(x, y, radius, color, alpha) {
    ctx.globalAlpha = Math.max(0, alpha); ctx.fillStyle = color
    ctx.beginPath(); ctx.moveTo(x, y - radius); ctx.quadraticCurveTo(x + radius * 0.12, y - radius * 0.12, x + radius, y)
    ctx.quadraticCurveTo(x + radius * 0.12, y + radius * 0.12, x, y + radius)
    ctx.quadraticCurveTo(x - radius * 0.12, y + radius * 0.12, x - radius, y)
    ctx.quadraticCurveTo(x - radius * 0.12, y - radius * 0.12, x, y - radius); ctx.fill()
  }
  function stars(t, n, alpha = 1) {
    for (let i = 0; i < count(n); i++) {
      const p = points[i], twinkle = 0.3 + Math.pow((Math.sin(t * (0.22 + p.s * 0.5) + p.phase) + 1) / 2, 3) * 0.7
      const x = p.x * width + Math.sin(t * 0.025 + p.phase) * 4, y = p.y * height
      if (i % 11 === 0) light(x, y, 8 + p.r * 4, colors.ice, twinkle * alpha * 0.42)
      ctx.globalAlpha = twinkle * alpha * (0.25 + p.r * 0.7); ctx.fillStyle = i % 3 ? '#dfebff' : '#d6c6ef'
      ctx.beginPath(); ctx.arc(x, y, 0.45 + p.r * 0.9, 0, TAU); ctx.fill()
      if (i % 23 === 0) sparkle(x, y, 3 + p.r, '#e8e2ff', twinkle * alpha * 0.45)
    }
  }
  function meteors(t) {
    stars(t, 75, 0.65)
    for (let i = 0; i < 6; i++) {
      const p = points[i], period = i === 0 ? 29 : 9 + p.s * 12
      const age = mod(t + p.phase * 3, period), duration = 0.85 + p.r * 0.95
      if (age > duration) continue
      const progress = age / duration, distance = width * (0.5 + p.r * 0.35), tail = Math.min(210, width * 0.25) * (i ? 1 : 1.7)
      const x = width * (0.3 + p.x * 0.9) - progress * distance, y = height * p.y * 0.45 + progress * distance * 0.48
      const fade = Math.sin(progress * Math.PI) ** 0.65
      const gradient = ctx.createLinearGradient(x, y, x + tail, y - tail * 0.48)
      gradient.addColorStop(0, '#f2ebff'); gradient.addColorStop(0.2, '#bba1ff8c'); gradient.addColorStop(1, '#aa8fff00')
      ctx.globalAlpha = fade * (i ? 0.7 : 0.95); ctx.strokeStyle = gradient; ctx.lineWidth = i ? 0.8 : 1.7
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + tail, y - tail * 0.48); ctx.stroke()
      light(x, y, i ? 8 : 15, colors.violet, fade * 0.7)
    }
  }
  function petals(t) {
    for (let i = 0; i < count(34); i++) {
      const p = points[i], z = 0.35 + p.r, size = 3 + z * 5
      const y = mod(p.y * (height + 80) + t * (8 + z * 13), height + 80) - 40
      const x = mod(p.x * (width + 100) + Math.sin(t * 0.28 + p.phase) * (20 + 15 * z) + t * (2 + p.s * 3), width + 100) - 50
      if (i % 9 === 0) light(x, y, size * 2.3, colors.pink, 0.09)
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.phase + t * (0.18 + p.s * 0.18)); ctx.scale(0.4 + Math.abs(Math.cos(t * 0.6 + p.drift)) * 0.65, 1)
      ctx.globalAlpha = 0.28 + p.r * 0.46; ctx.fillStyle = ['#f6c4d9', '#e6a3c1', '#fbe1e7'][i % 3]
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.bezierCurveTo(size * 1.2, -size * 0.5, size * 0.9, size * 0.5, 0, size)
      ctx.bezierCurveTo(-size * 0.8, size * 0.2, -size * 0.7, -size * 0.55, -size * 0.16, -size * 0.8)
      ctx.lineTo(0, -size * 0.55); ctx.closePath(); ctx.fill(); ctx.restore()
    }
  }
  function fireflies(t) {
    const position = (p, time) => ({ x: p.x * width + Math.sin(time * (0.1 + p.s * 0.1) + p.phase) * 40 + Math.sin(time * 0.37 + p.drift) * 9, y: p.y * height + Math.cos(time * 0.18 + p.phase) * 25 + Math.sin(time * 0.31 + p.drift) * 12 })
    for (let i = 0; i < count(29); i++) {
      const p = points[i], pulse = 0.08 + ((Math.sin(t * (0.7 + p.s * 0.6) + p.phase) + 1) / 2) ** 3 * 0.82
      const color = i % 3 ? colors.gold : colors.green, pos = position(p, t)
      for (let j = 3; j > 0; j--) { const trail = position(p, t - j * 0.32); light(trail.x, trail.y, 3 + p.r * 3, color, pulse * (4 - j) * 0.035) }
      light(pos.x, pos.y, 9 + p.r * 11, color, pulse * 0.5)
      ctx.globalAlpha = pulse; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(pos.x, pos.y, 0.65 + p.r, 0.9 + p.r, -0.3, 0, TAU); ctx.fill()
    }
  }
  function aurora(t) {
    stars(t, 65, 0.48)
    ctx.globalCompositeOperation = 'screen'
    for (let band = 0; band < 5; band++) {
      const top = (x) => height * (0.14 + band * 0.065) + Math.sin(x / width * 4.6 + t * 0.08 + band * 0.8) * height * 0.1 + Math.sin(x / width * 9.5 - t * 0.05 + band) * height * 0.035
      const depth = height * (0.26 + band * 0.015), gradient = ctx.createLinearGradient(0, height * 0.05, 0, height * 0.85)
      const color = ['#81f5cc', '#4ed6df', '#8095ed', '#ae78eb', '#56dfb2'][band]
      gradient.addColorStop(0, `${color}00`); gradient.addColorStop(0.2, `${color}6b`); gradient.addColorStop(0.55, `${color}21`); gradient.addColorStop(1, `${color}00`)
      ctx.globalAlpha = 0.45 + Math.sin(t * 0.12 + band) * 0.15; ctx.fillStyle = gradient; ctx.beginPath()
      ctx.moveTo(-20, top(-20))
      for (let x = 0; x <= width + 20; x += width / 60) ctx.lineTo(x, top(x))
      for (let x = width + 20; x >= -20; x -= width / 60) ctx.lineTo(x, top(x) + depth * (0.7 + 0.3 * Math.sin(x / width * 3 + band)))
      ctx.closePath(); ctx.fill()
      // Fine luminous folds give the broad ribbons a curtain-like texture.
      ctx.strokeStyle = color; ctx.lineWidth = 0.65
      for (let i = 0; i < 50; i++) {
        const x = i / 49 * width, y = top(x)
        ctx.globalAlpha = (0.025 + (Math.sin(i * 0.7 + t * 0.14 + band) + 1) * 0.018) * (1 - band * 0.08)
        ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.bezierCurveTo(x + 3, y + depth * 0.2, x - 9, y + depth * 0.5, x - 17, y + depth * 0.85); ctx.stroke()
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }
  function hearts(t) {
    for (let i = 0; i < count(19); i++) {
      const p = points[i], size = 3 + p.r * 8, y = height + 35 - mod(p.y * (height + 70) + t * (7 + p.r * 11), height + 70)
      const x = p.x * width + Math.sin(t * 0.24 + p.phase) * (15 + p.r * 15)
      light(x, y, size * 2.5, colors.pink, 0.1)
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.3 + p.phase) * 0.18)
      ctx.globalAlpha = 0.17 + p.r * 0.3; ctx.fillStyle = '#eaa6d5'; ctx.strokeStyle = '#ffd3eb'; ctx.lineWidth = 0.65
      ctx.beginPath(); ctx.moveTo(0, size); ctx.bezierCurveTo(-size * 1.8, -size * 0.15, -size * 0.8, -size * 1.3, 0, -size * 0.5)
      ctx.bezierCurveTo(size * 0.8, -size * 1.3, size * 1.8, -size * 0.15, 0, size); ctx.fill(); ctx.stroke(); ctx.restore()
    }
    for (let i = 0; i < 3; i++) {
      const p = points[40 + i], age = mod(t + i * 3.7, 12)
      if (age > 2) continue
      for (let j = 0; j < 6; j++) sparkle(p.x * width + Math.cos(j * TAU / 6) * age * 14, p.y * height + Math.sin(j * TAU / 6) * age * 14, 2.5 * (1 - age / 2), colors.pink, (1 - age / 2) * 0.65)
    }
  }
  function celebration(t) {
    for (let i = 0; i < count(36); i++) {
      const p = points[i], y = mod(p.y * (height + 40) + t * (11 + p.r * 16), height + 40) - 20
      const x = p.x * width + Math.sin(t * 0.45 + p.phase) * 21
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.phase + t * (0.3 + p.s)); ctx.scale(Math.cos(t + p.phase), 1)
      ctx.globalAlpha = 0.25 + p.r * 0.42; ctx.fillStyle = i % 3 ? '#e6c47f' : '#fae9bc'; ctx.fillRect(-1, -3, 1.5 + p.r * 2.5, 3 + p.r * 4); ctx.restore()
    }
    for (let i = 40; i < 40 + count(24); i++) {
      const p = points[i], pulse = (Math.sin(t * (0.4 + p.s) + p.phase) + 1) / 2
      sparkle(p.x * width, p.y * height, 1.5 + p.r * 2.4, colors.gold, pulse ** 4 * 0.58)
    }
    const age = mod(t, 17)
    if (age < 3) for (let i = 0; i < count(12); i++) {
      const p = points[85 + i], angle = Math.PI + p.x * Math.PI, speed = 12 + p.s * 23
      light(width * 0.65 + Math.cos(angle) * speed * age, height * 0.45 + Math.sin(angle) * speed * age + 9 * age * age, 3 + p.r * 2, colors.gold, (1 - age / 3) * 0.35)
    }
  }
  function snow(t) {
    for (let i = 0; i < count(51); i++) {
      const p = points[i], size = 0.7 + p.r * 3.4
      const x = mod(p.x * (width + 70) + Math.sin(t * 0.2 + p.phase) * 18 + t * (2 + p.s * 4), width + 70) - 35
      const y = mod(p.y * (height + 70) + t * (10 + p.r * 22), height + 70) - 35
      if (i % 12 === 0) { light(x, y, 6 + size * 2, colors.ice, 0.22); continue }
      ctx.globalAlpha = 0.18 + p.r * 0.43; ctx.strokeStyle = '#dbe9f7'; ctx.fillStyle = '#dfedf9'; ctx.lineWidth = 0.65
      if (size > 2.6) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.phase + t * 0.1); ctx.beginPath()
        for (let arm = 0; arm < 6; arm++) {
          const a = arm * TAU / 6, dx = Math.cos(a), dy = Math.sin(a)
          ctx.moveTo(0, 0); ctx.lineTo(dx * size, dy * size)
          for (const side of [-1, 1]) { ctx.moveTo(dx * size * 0.62, dy * size * 0.62); ctx.lineTo(dx * size * 0.45 + Math.cos(a + side * 1.1) * size * 0.35, dy * size * 0.45 + Math.sin(a + side * 1.1) * size * 0.35) }
        }
        ctx.stroke(); ctx.restore()
      } else { ctx.beginPath(); ctx.arc(x, y, size * 0.65, 0, TAU); ctx.fill() }
    }
  }
  function bubbles(t) {
    for (let i = 0; i < count(16); i++) {
      const p = points[i], size = 11 + p.r * 31, periodHeight = height + size * 4
      const y = height + size * 2 - mod(p.y * periodHeight + t * (6 + p.r * 8), periodHeight)
      const x = p.x * width + Math.sin(t * (0.18 + p.s * 0.1) + p.phase) * 17 + Math.cos(t * 0.39 + p.drift) * 5
      ctx.globalAlpha = 0.26 + p.r * 0.32; ctx.drawImage(bubbleSprite(), x - size, y - size, size * 2, size * 2)
      const age = mod(t + p.phase * 3, 19)
      if (age < 0.9 && i % 3 === 0) for (let j = 0; j < 4; j++) sparkle(x + Math.cos(j * TAU / 4) * (size + age * 12), y + Math.sin(j * TAU / 4) * (size + age * 12), 1.7 * (1 - age / 0.9), colors.ice, (1 - age / 0.9) * 0.5)
    }
  }
  function cosmic(t) {
    for (let ring = 0; ring < 4; ring++) {
      const progress = mod(t * 0.055 + ring / 4, 1), radius = 20 + progress * Math.max(width, height) * 0.72
      ctx.globalAlpha = Math.sin(progress * Math.PI) * (1 - progress) * 0.15; ctx.strokeStyle = ring % 2 ? '#b398f4' : '#859be9'; ctx.lineWidth = 8 + progress * 20
      ctx.beginPath(); ctx.ellipse(width * 0.53, height * 0.48, radius, radius * 0.58, -0.18, 0, TAU); ctx.stroke()
      ctx.globalAlpha *= 2.1; ctx.lineWidth = 0.8; ctx.stroke()
    }
    const pulse = (Math.sin(t * 0.18) + 1) / 2
    light(width * 0.53, height * 0.48, Math.min(width, height) * 0.4, colors.violet, 0.12 + pulse * 0.1)
    for (let i = 0; i < count(35); i++) {
      const p = points[i], a = p.phase + t * (0.015 + p.r * 0.02)
      light(p.x * width + Math.cos(a) * 14, p.y * height + Math.sin(a) * 12, 3 + p.r * 6, i % 3 ? colors.violet : colors.ice, 0.2 + Math.sin(t * 0.4 + p.phase) * 0.14)
    }
  }
  function sunrise(t) {
    ctx.save(); ctx.translate(width * 0.08, height * 1.05)
    for (let i = 0; i < 7; i++) {
      const angle = -1.6 + i * 0.19 + Math.sin(t * 0.04 + i) * 0.035, length = Math.max(width, height) * 1.6
      const gradient = ctx.createLinearGradient(0, 0, Math.cos(angle) * length, Math.sin(angle) * length)
      gradient.addColorStop(0, '#ffe5a84d'); gradient.addColorStop(0.45, '#f1c89917'); gradient.addColorStop(1, '#e7bccc00')
      ctx.globalAlpha = 0.3 + Math.sin(t * 0.12 + i) * 0.1; ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(angle - 0.035) * length, Math.sin(angle - 0.035) * length)
      ctx.lineTo(Math.cos(angle + 0.035) * length, Math.sin(angle + 0.035) * length); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
    for (let i = 0; i < count(37); i++) {
      const p = points[i], x = p.x * width + Math.sin(t * 0.12 + p.phase) * 18, y = mod(p.y * height - t * (1.5 + p.s * 4), height)
      light(x, y, 2 + p.r * 5, colors.gold, 0.12 + (Math.sin(t * 0.3 + p.phase) + 1) * 0.12)
    }
  }
  function butterflies(t) {
    const position = (p, time) => ({ x: mod(p.x * (width + 100) + time * (5 + p.s * 8) + Math.sin(time * 0.35 + p.phase) * 22, width + 100) - 50, y: p.y * height + Math.sin(time * 0.22 + p.phase) * 30 + Math.cos(time * 0.43 + p.drift) * 13 })
    for (let i = 0; i < count(13); i++) {
      const p = points[i], size = 4 + p.r * 9, color = [colors.violet, colors.ice, colors.gold][i % 3], pos = position(p, t)
      for (let j = 1; j <= 4; j++) { const trail = position(p, t - j * 0.25); light(trail.x, trail.y, 3.5, color, (5 - j) * 0.035) }
      light(pos.x, pos.y, size * 2, color, 0.13)
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(Math.sin(t * 0.32 + p.phase) * 0.3 - 0.1)
      ctx.scale(0.16 + Math.abs(Math.sin(t * (4.5 + p.s * 2) + p.phase)) * 0.84, 1)
      ctx.globalAlpha = 0.35 + p.r * 0.35; ctx.fillStyle = color; ctx.strokeStyle = '#f6eaff'; ctx.lineWidth = 0.4
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(side * size * 1.4, -size * 1.3, side * size * 1.5, -size * 0.15, side * size * 0.45, size * 0.15)
        ctx.bezierCurveTo(side * size, size * 1.2, side * size * 0.15, size * 1.15, 0, 0); ctx.fill(); ctx.stroke()
      }
      ctx.restore(); ctx.globalAlpha = 0.65; ctx.strokeStyle = '#efe0ff'; ctx.lineWidth = 0.7
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y - size * 0.35); ctx.lineTo(pos.x, pos.y + size * 0.55); ctx.stroke()
    }
  }
  const scenes = { 'starry-night': (t) => stars(t, 120), 'falling-stars': meteors, 'sakura-rain': petals, fireflies, aurora, 'heart-bloom': hearts, 'golden-celebration': celebration, 'winter-whisper': snow, 'bubble-dream': bubbles, 'cosmic-pulse': cosmic, 'sunrise-glow': sunrise, 'butterfly-wishes': butterflies }
  return {
    resize(w, h, dpr) { width = Math.max(1, w); height = Math.max(1, h); ratio = dpr; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio) },
    draw(time) { ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height); ctx.globalCompositeOperation = 'source-over'; scenes[effectId]?.(time); ctx.globalAlpha = 1 },
    clear() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height) },
  }
}
