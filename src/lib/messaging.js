export const MAX_ORIGINAL_IMAGE = 15 * 1024 * 1024
export const MAX_IMAGE_BYTES = 500 * 1024
export function imageExpired(image, now = Date.now()) {
  return !image || image.state !== 'ready' || !image.expires_at || new Date(image.expires_at).getTime() <= now
}
export function canReact(message, now = Date.now()) {
  return !message.deleted_at && (message.kind !== 'image' || !imageExpired(message.image, now))
}
export function insertEmoji(text, start, end, emoji) {
  const cursor = Math.max(0, Math.min(start ?? text.length, text.length))
  return { text: text.slice(0, cursor) + emoji + text.slice(Math.max(cursor, end ?? cursor)), cursor: cursor + emoji.length }
}
export function groupReactions(reactions, userId) {
  const groups = new Map()
  for (const reaction of reactions) {
    if (reaction.removed_at) continue
    const group = groups.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, mine: false }
    group.count++
    group.mine ||= reaction.user_id === userId
    groups.set(reaction.emoji, group)
  }
  return [...groups.values()]
}
export const isActivelyViewing = () => document.visibilityState === 'visible' && document.hasFocus()
export function notificationText(message) {
  return message.kind === 'image' ? 'Sent an image' : [...message.content].slice(0, 140).join('')
}
