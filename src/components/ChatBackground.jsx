import { useState } from 'react'

export default function ChatBackground({ src }) {
  const [loaded, setLoaded] = useState('')
  return <div className={`chat-background ${src && loaded === src ? 'is-loaded' : ''}`} aria-hidden="true">
    {src && <img key={src} src={src} alt="" decoding="async" onLoad={() => setLoaded(src)} onError={() => setLoaded('')} />}
    <div className="chat-background-shade" />
  </div>
}
