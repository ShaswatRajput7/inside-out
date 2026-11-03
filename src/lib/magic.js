export const MAGIC_EFFECTS = [
  { id: 'starry-night', name: 'Starry Night', mood: 'Peaceful · dreamy', detail: 'A thousand quiet lights, a sky of your own.', color: '#acbfff', tint: 'radial-gradient(ellipse at 65% 18%,#30397880,transparent 65%),linear-gradient(#071126a6,#11152a6b)' },
  { id: 'falling-stars', name: 'Falling Stars', mood: 'Wonder · wishes', detail: 'Stay a little longer. Make another wish.', color: '#b9a6ff', tint: 'radial-gradient(ellipse at 80% 0%,#59419166,transparent 65%),linear-gradient(#100c27b3,#18132c73)' },
  { id: 'sakura-rain', name: 'Sakura Rain', mood: 'Affection · serenity', detail: 'Soft petals, carried by the evening breeze.', color: '#f0b7d2', tint: 'radial-gradient(ellipse at 25% 10%,#a2657b5c,transparent 75%),linear-gradient(#2a172354,#351e335e)' },
  { id: 'fireflies', name: 'Fireflies', mood: 'Warmth · nostalgia', detail: 'Little lights finding their way back home.', color: '#d4df8e', tint: 'radial-gradient(ellipse at 45% 85%,#365d374f,transparent 70%),linear-gradient(#091b19a6,#101f1678)' },
  { id: 'aurora', name: 'Aurora', mood: 'Wonder · tranquility', detail: 'Let the northern lights find the two of you.', color: '#8ee3d5', tint: 'radial-gradient(ellipse at 60% 20%,#1e43595c,transparent 75%),linear-gradient(#071926a6,#0b152273)' },
  { id: 'heart-bloom', name: 'Heart Bloom', mood: 'Affection · warmth', detail: 'Some things are better felt than said.', color: '#e8a0cc', tint: 'radial-gradient(ellipse at 50% 90%,#803b7866,transparent 70%),linear-gradient(#28162c78,#31192d78)' },
  { id: 'golden-celebration', name: 'Golden Celebration', mood: 'Joy · little victories', detail: 'Here’s to the good things, big and small.', color: '#eac87f', tint: 'radial-gradient(ellipse at 70% 20%,#85633457,transparent 70%),linear-gradient(#241a1778,#271d2478)' },
  { id: 'winter-whisper', name: 'Winter Whisper', mood: 'Cozy · peaceful', detail: 'The world gets quieter. You get closer.', color: '#c8e1f3', tint: 'radial-gradient(ellipse at 20% 10%,#54769057,transparent 70%),linear-gradient(#14233991,#1b283173)' },
  { id: 'bubble-dream', name: 'Bubble Dream', mood: 'Playful · lighthearted', detail: 'A little lighter than the everyday.', color: '#b9d4ed', tint: 'radial-gradient(ellipse at 80% 25%,#73568f4d,transparent 65%),radial-gradient(ellipse at 10% 80%,#37697557,transparent 70%)' },
  { id: 'cosmic-pulse', name: 'Cosmic Pulse', mood: 'Energy · mystery', detail: 'On the same wavelength, a world apart.', color: '#baa0f4', tint: 'radial-gradient(ellipse at 50% 45%,#6249a65c,transparent 75%),linear-gradient(#11102d99,#1713298c)' },
  { id: 'sunrise-glow', name: 'Sunrise Glow', mood: 'Hope · encouragement', detail: 'There’s a little light on the horizon.', color: '#f0c195', tint: 'radial-gradient(ellipse at 12% 100%,#d4945378,transparent 70%),radial-gradient(ellipse at 85% 80%,#a35d7747,transparent 80%),linear-gradient(#251b2a54,#30202357)' },
  { id: 'butterfly-wishes', name: 'Butterfly Wishes', mood: 'Kindness · friendship', detail: 'Small wonders. Beautiful company.', color: '#c4b2f2', tint: 'radial-gradient(ellipse at 70% 25%,#68579e59,transparent 70%),radial-gradient(ellipse at 10% 90%,#72634b47,transparent 70%)' },
]
export const MAGIC_DURATIONS = [
  [300, '5 minutes'], [900, '15 minutes'], [1800, '30 minutes'], [3600, '1 hour'],
  [10800, '3 hours'], [21600, '6 hours'], [43200, '12 hours'], [86400, '24 hours'],
]
export const findMagicEffect = (id) => MAGIC_EFFECTS.find((effect) => effect.id === id)
export const validMagicDuration = (seconds) => Number.isInteger(seconds) && seconds >= 60 && seconds <= 86400
export function normalizeMagic(row, conversationId) {
  if (!row || row.conversation_id !== conversationId || !findMagicEffect(row.effect_id)) return null
  const start = Date.parse(row.applied_at), end = Date.parse(row.expires_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 60000 || end - start > 86400000) return null
  return row
}
export function createMagicClock(serverTime, wall = Date.now(), monotonic = performance.now()) {
  const server = Date.parse(serverTime)
  if (!Number.isFinite(server)) throw new Error('Chat Magic could not sync its server clock. Please try again.')
  return { server, wall, monotonic }
}
export function readMagicClock(clock, wall = Date.now(), monotonic = performance.now()) {
  if (!clock) return { now: 0, needsSync: true }
  const elapsed = Math.max(0, monotonic - clock.monotonic), wallElapsed = wall - clock.wall
  // Initial client clock skew is irrelevant. Sleep or later clock jumps require a
  // fresh server reading; keep the atmosphere off until that reading arrives.
  return { now: clock.server + Math.max(0, elapsed, wallElapsed), needsSync: Math.abs(wallElapsed - elapsed) > 2000 }
}
export const magicIsActive = (row, clockReading) => Boolean(row && !clockReading.needsSync && Date.parse(row.expires_at) > clockReading.now)
export function magicRemainingLabel(expiresAt, now) {
  const minutes = Math.ceil((Date.parse(expiresAt) - now) / 60000)
  if (minutes <= 0) return 'Expired'
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return `${hours}h${rest ? ` ${rest}m` : ''} left`
}
