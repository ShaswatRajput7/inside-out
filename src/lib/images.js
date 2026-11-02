import { MAX_ORIGINAL_IMAGE } from './messaging.js'

export function fitImageDimensions(width, height, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
export async function validateImageFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.')
  if (!file.size || file.size > MAX_ORIGINAL_IMAGE) throw new Error('Original images must be 15 MB or smaller.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end))
  const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
      : text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP'
  if (!valid) throw new Error('The file is not a supported image. GIFs and other files cannot be attached.')
}
