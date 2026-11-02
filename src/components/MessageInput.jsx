import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LoaderCircle, SendHorizontal, Smile, X } from 'lucide-react'
import { ErrorNotice } from './Shared'
import { createMessageId, errorMessage } from '../lib/chat'
import { insertEmoji } from '../lib/messaging'
import { abandonImage, compressImage } from '../services/images'
import EmojiPicker from './EmojiPicker'

export default function MessageInput({ title, send, onTyping }) {
  const [content, setContent] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [preview, setPreview] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(null), textarea = useRef(null), fileInput = useRef(null), emojiAnchor = useRef(null)
  const selection = useRef({ start: 0, end: 0 }), prepareVersion = useRef(0), typingTimer = useRef(null)
  const latestTyping = useRef(onTyping)
  latestTyping.current = onTyping
  useEffect(() => {
    if (!attachment) { setPreview(''); return }
    const url = URL.createObjectURL(attachment.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [attachment])
  useEffect(() => () => { prepareVersion.current++; clearTimeout(typingTimer.current); latestTyping.current?.(false); void abandonImage(pending.current) }, [])
  function typing(value) {
    onTyping?.(Boolean(value)); clearTimeout(typingTimer.current)
    if (value) typingTimer.current = setTimeout(() => latestTyping.current?.(false), 2000)
  }
  async function chooseImage(file) {
    if (!file || busy) return
    const request = ++prepareVersion.current
    setPreparing(true); setError('')
    try {
      const compressed = await compressImage(file)
      if (request !== prepareVersion.current) return
      void abandonImage(pending.current); pending.current = null; setAttachment(compressed)
    } catch (err) { if (request === prepareVersion.current) setError(errorMessage(err)) }
    finally { if (request === prepareVersion.current) setPreparing(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (busy || preparing || (!content.trim() && !attachment)) return
    setBusy(true); setError(''); typing(false)
    const text = content.trim()
    try {
      if (!pending.current || pending.current.content !== text || pending.current.file !== attachment?.file) {
        void abandonImage(pending.current)
        pending.current = { content: text, file: attachment?.file, id: createMessageId() }
      }
      await send(text, pending.current, attachment)
      setContent(''); setAttachment(null); pending.current = null
      selection.current = { start: 0, end: 0 }
      if (textarea.current) textarea.current.style.height = 'auto'
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false); setTimeout(() => textarea.current?.focus(), 0) }
  }
  function emoji(value) {
    const result = insertEmoji(content, selection.current.start, selection.current.end, value)
    if (result.text.length > 4000) return
    setContent(result.text); selection.current = { start: result.cursor, end: result.cursor }; typing(true)
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(result.cursor, result.cursor) })
  }
  return <div className="composer-wrap"><ErrorNotice>{error}</ErrorNotice>{(preparing || attachment) && <div className="attachment-preview">{preparing ? <><LoaderCircle size={18} className="spin" />Compressing image…</> : <><img src={preview} alt="Image ready to send" /><span>{Math.ceil(attachment.file.size / 1024)} KB · available for 30 days</span><button className="icon-button" aria-label="Remove attached image" disabled={busy} onClick={() => { void abandonImage(pending.current); pending.current = null; setAttachment(null) }}><X size={17} /></button></>}</div>}<form className="composer" onSubmit={submit}><div className="composer-tools"><button type="button" className="icon-button" aria-label="Attach an image" title="Attach JPEG, PNG, or WebP" disabled={busy || preparing} onClick={() => fileInput.current?.click()}><ImagePlus size={18} /></button><button type="button" className="icon-button" ref={emojiAnchor} aria-label="Choose emoji" disabled={busy} onClick={() => setPicker(!picker)}><Smile size={18} /></button></div><input type="file" ref={fileInput} hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseImage(event.target.files?.[0]); event.target.value = '' }} /><textarea ref={textarea} rows={1} aria-label={`Message ${title}`} placeholder={`Message ${title}`} value={content} disabled={busy} maxLength={4000} onSelect={(event) => { selection.current = { start: event.target.selectionStart, end: event.target.selectionEnd } }} onChange={(event) => { setContent(event.target.value); typing(event.target.value.trim().length > 0); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px` }} onPaste={(event) => { const item = [...event.clipboardData.items].find((item) => item.kind === 'file' && item.type.startsWith('image/')); if (item) { event.preventDefault(); void chooseImage(item.getAsFile()) } }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(event) } }} /><button className="send-button" disabled={busy || preparing || (!content.trim() && !attachment)} aria-label={busy ? attachment ? 'Uploading image' : 'Sending message' : 'Send message'}>{busy && attachment ? <LoaderCircle size={19} className="spin" /> : <SendHorizontal size={19} />}</button></form><div className="composer-hint"><span>Just a conversation between friends.</span><span><kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line</span></div>{picker && <EmojiPicker anchorRef={emojiAnchor} onSelect={emoji} onClose={() => setPicker(false)} />}</div>
}
