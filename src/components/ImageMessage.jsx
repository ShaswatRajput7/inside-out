import { useEffect, useState } from 'react'
import { Download, ImageOff } from 'lucide-react'
import { imageExpired } from '../lib/messaging'
import { downloadImage } from '../services/images'
import { errorMessage } from '../lib/chat'
import Modal from './Modal'

export default function ImageMessage({ message, now }) {
  const image = message.image
  const expired = imageExpired(image, now)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [large, setLarge] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (expired || message.deleted_at) return
    let active = true, objectUrl
    setUrl(''); setError('')
    downloadImage(image.storage_path).then((blob) => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    }).catch((err) => { if (active) setError(errorMessage(err)) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [image?.storage_path, expired, message.deleted_at, attempt])
  if (expired) return <div className="image-placeholder"><ImageOff size={19} />Image expired</div>
  function download() {
    if (!url || imageExpired(image)) return
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `inside-out-${image.id}.${image.mime_type === 'image/webp' ? 'webp' : image.mime_type === 'image/png' ? 'png' : 'jpg'}`
    anchor.click()
  }
  return <div className="image-message">{error ? <button className="image-placeholder" onClick={() => setAttempt(attempt + 1)}>Image unavailable. Retry</button> : url ? <><button className="image-thumbnail" onClick={() => setLarge(true)} aria-label="Open image preview"><img src={url} width={image.width} height={image.height} alt={`Image from ${message.sender?.display_name || 'a friend'}`} /></button><button className="image-download" onClick={download}><Download size={13} />Download</button></> : <div className="image-placeholder" role="status">Loading image…</div>}{large && !expired && <Modal title="Image preview" description="Images are available for 30 days after upload." onClose={() => setLarge(false)}><img className="large-image" src={url} alt="Shared image preview" /><button className="button secondary full-width" onClick={download}><Download size={15} />Download image</button></Modal>}</div>
}
