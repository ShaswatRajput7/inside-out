export const normalizeUsername = (value) => value.trim().toLowerCase()
export const validUsername = (value) => /^[a-z0-9_]{3,24}$/.test(normalizeUsername(value))
export const usernameEmail = (value) => `${normalizeUsername(value)}@insideout.invalid`
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
