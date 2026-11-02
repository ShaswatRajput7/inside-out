import { useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import EmojiPicker from './EmojiPicker'
import { insertEmoji } from '../lib/messaging'
import { editMessage } from '../services/chatService'
import { errorMessage } from '../lib/chat'
import { ErrorNotice } from './Shared'

export default function MessageEditor({ message, onDone, onChanged }) {
  const [text, setText] = useState(message.content)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = useRef(null), anchor = useRef(null), selection = useRef({ start: text.length, end: text.length })
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await editMessage(message.id, text); await onChanged(); onDone() }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  function emoji(value) {
    const result = insertEmoji(text, selection.current.start, selection.current.end, value)
    if (result.text.length > 4000) return
    setText(result.text)
    selection.current = { start: result.cursor, end: result.cursor }
    requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(result.cursor, result.cursor) })
  }
  return <form className="message-editor" onSubmit={save}><textarea ref={field} value={text} aria-label="Edit message" autoFocus maxLength={4000} disabled={busy} onChange={(e) => setText(e.target.value)} onSelect={(e) => { selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd } }} onKeyDown={(e) => { if (e.key === 'Escape' && !picker) onDone(); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void save(e) } }} /><div className="editor-actions"><button ref={anchor} className="icon-button" type="button" aria-label="Emoji for edited message" onClick={() => setPicker(!picker)}><Smile size={17} /></button><button className="button secondary" type="button" onClick={onDone} disabled={busy}>Cancel</button><button className="button primary" disabled={busy || !text.trim()}>Save</button></div><ErrorNotice>{error}</ErrorNotice>{picker && <EmojiPicker anchorRef={anchor} onSelect={emoji} onClose={() => setPicker(false)} />}</form>
}
