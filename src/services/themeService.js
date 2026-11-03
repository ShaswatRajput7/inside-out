import { supabase } from './supabase'
import { compressImage } from './images'
import { createMessageId } from '../lib/chat'

const BUCKET = 'conversation-themes'
async function checked(request) {
  const { data, error } = await request
  if (error) throw error
  return data
}
export const getConversationTheme = (id) => checked(supabase.from('conversation_themes').select('*').eq('conversation_id', id).maybeSingle())
export const setConversationTheme = (id, theme) => checked(supabase.rpc('set_conversation_theme', {
  target_conversation: id, theme_kind: theme.kind, theme_key: theme.builtin_key || null, image_path: theme.custom_path || null,
}))
export const prepareThemeImage = compressImage // Shared JPEG/PNG/WebP signature validation, 1600px / 500 KB ceiling.
export async function uploadThemeImage(conversationId, userId, image) {
  const extension = image.mime === 'image/webp' ? 'webp' : image.mime === 'image/png' ? 'png' : 'jpg'
  const path = `${conversationId}/${userId}/${createMessageId()}.${extension}`
  await checked(supabase.storage.from(BUCKET).upload(path, image.file, { contentType: image.mime, upsert: false, cacheControl: '0' }))
  return path
}
// Authenticated downloads match message images and work with the browser/Tauri CSP.
// No public URLs or durable signed URLs; access is checked on every new download.
export const downloadThemeImage = (path) => checked(supabase.storage.from(BUCKET).download(path))
