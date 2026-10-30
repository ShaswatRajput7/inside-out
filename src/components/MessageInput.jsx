import { useRef, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { ErrorNotice } from './Shared'
import { errorMessage } from '../lib/chat'

export default function MessageInput({ title, send }) {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(null)
  const textarea = useRef(null)
  async function submit(event) {
    event.preventDefault()
    if (busy || !content.trim()) return
    setBusy(true); setError('')
    const text = content.trim()
    if (!pending.current || pending.current.content !== text) pending.current = { content: text, id: crypto.randomUUID() }
    try { await send(text, pending.current.id); setContent(''); pending.current = null; if (textarea.current) textarea.current.style.height = 'auto' }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false); setTimeout(() => textarea.current?.focus(), 0) }
  }
  return <div className="composer-wrap"><ErrorNotice>{error}</ErrorNotice><form className="composer" onSubmit={submit}><textarea ref={textarea} rows={1} aria-label={`Message ${title}`} placeholder={`Message ${title}`} value={content} disabled={busy} maxLength={4000} onChange={(event) => { setContent(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px` }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(event) } }} /><button className="send-button" disabled={busy || !content.trim()} aria-label={busy ? 'Sending message' : 'Send message'}><SendHorizontal size={19} /></button></form><div className="composer-hint"><span>Just a conversation between friends.</span><span><kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line</span></div></div>
}
