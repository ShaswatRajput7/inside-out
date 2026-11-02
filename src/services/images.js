import { supabase } from './supabase'
import { MAX_IMAGE_BYTES } from '../lib/messaging'
import { fitImageDimensions, validateImageFile } from '../lib/images'

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* Older WebKit fallback. */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally { URL.revokeObjectURL(url) }
}
export async function compressImage(file) {
  await validateImageFile(file)
  const image = await decodeImage(file)
  try {
    const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight
    if (!width || !height || width * height > 80000000) throw new Error('This image is too large to process safely. Choose a smaller image.')
    let dimensions = fitImageDimensions(width, height)
    let format = 'image/webp'
    for (let size = 0; size < 9; size++) {
      const canvas = document.createElement('canvas')
      canvas.width = dimensions.width; canvas.height = dimensions.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image compression is unavailable in this browser.')
      if (format === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height) }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.82, 0.68, 0.52, 0.36]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, format, quality))
        if (!blob || (format === 'image/webp' && blob.type !== 'image/webp')) { format = 'image/jpeg'; break }
        if (blob.size > 0 && blob.size <= MAX_IMAGE_BYTES) return { file: blob, ...dimensions, mime: blob.type }
      }
      dimensions = fitImageDimensions(width, height, Math.max(160, Math.round(Math.max(dimensions.width, dimensions.height) * 0.78)))
    }
    throw new Error('Could not compress this image below 500 KB. Choose a smaller image.')
  } finally { image.close?.() }
}
async function checked(query) { const { data, error } = await query; if (error) throw error; return data }
export async function sendImage(conversationId, content, attachment, pending) {
  if (!pending.upload) {
    const data = await checked(supabase.rpc('reserve_chat_image', { target_conversation: conversationId, image_mime: attachment.mime, image_width: attachment.width, image_height: attachment.height, image_bytes: attachment.file.size }))
    pending.upload = data[0]
  }
  if (!pending.uploaded) {
    const { error } = await supabase.storage.from('chat-images').upload(pending.upload.storage_path, attachment.file, { contentType: attachment.mime, upsert: false, cacheControl: '60' })
    if (error && String(error.statusCode) !== '409' && !/already exists|duplicate/i.test(error.message)) throw error
    pending.uploaded = true
  }
  try {
    return await checked(supabase.rpc('finalize_chat_image', { upload_id: pending.upload.id, message_id: pending.id, caption: content }))
  } catch (error) {
    if (/reservation expired/i.test(error.message)) {
      pending.upload = null; pending.uploaded = false
      throw new Error('The image upload expired. Send again to start a fresh upload.')
    }
    throw error
  }
}
export async function requestImageCleanup(id) {
  if (!id) return
  // Deletion is already authorized/queued in SQL. Cron retries even if this nudge fails.
  try { await supabase.functions.invoke('cleanup-images', { body: { image_id: id } }) } catch { /* Durable queue remains. */ }
}
export async function abandonImage(pending) {
  if (!pending?.upload) return
  try { await checked(supabase.rpc('cancel_chat_image', { upload_id: pending.upload.id })); await requestImageCleanup(pending.upload.id) } catch { /* Stale reservations are swept by Cron. */ }
}
export async function downloadImage(path) {
  return checked(supabase.storage.from('chat-images').download(path))
}
