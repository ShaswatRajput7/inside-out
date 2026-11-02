export const normalizeUsername = (value) => value.trim().toLowerCase()
export const validUsername = (value) => /^[a-z0-9_]{3,24}$/.test(normalizeUsername(value))
export const usernameEmail = (value) => `${normalizeUsername(value)}@insideout.invalid`
export function createMessageId(random = globalThis.crypto) {
  if (typeof random?.randomUUID === 'function') return random.randomUUID()
  // randomUUID requires HTTPS/localhost; getRandomValues also works on HTTP LAN URLs.
  if (typeof random?.getRandomValues !== 'function') throw new Error('Your browser cannot generate a message ID. Try a current browser or open the app over HTTPS.')
  const bytes = random.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export const mergeMessages = (current, incoming) => [...new Map([...current, ...incoming].map((message) => [message.id, message])).values()]
  .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
export function conversationTitle(conversation, userId) {
  if (conversation.type === 'group') return conversation.name
  return conversation.members.find((member) => member.user_id !== userId)?.profile?.display_name || 'Direct message'
}
export function errorMessage(error) {
  if (/Failed to fetch|NetworkError|fetch failed/i.test(error?.message || '')) return 'Could not connect. Check your internet connection and try again.'
  return error?.message || 'Something went wrong. Please try again.'
}
