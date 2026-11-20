import { useMemo } from 'react'
import { Eye } from 'lucide-react'
import { maskText } from '../lib/shadow'
import ImageMessage from './ImageMessage'

export default function ShadowMessage({ message, now, reveal }) {
  const fake = useMemo(() => maskText(message.content), [message.content])
  const visible = reveal.revealed === message.id
  const pointer = (event, eye = false) => {
    if (event.button !== 0 || (event.pointerType !== 'mouse' && !eye)) return
    event.preventDefault()
    event.stopPropagation()
    reveal.start(message.id, event.pointerType === 'mouse' ? 0 : 250)
  }
  return <div className="shadow-message" onPointerDown={pointer} onPointerLeave={reveal.hide} onLostPointerCapture={reveal.hide} onContextMenu={(event) => { event.preventDefault(); reveal.hide() }} onCopy={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
    <button className="icon-button shadow-eye" aria-label="Hold to reveal message" onPointerDown={(event) => pointer(event, true)} onBlur={reveal.hide} onClick={(event) => event.preventDefault()} onKeyDown={(event) => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); if (!event.repeat) reveal.start(message.id) } }}><Eye size={15} /></button>
    {message.kind === 'image' && <ImageMessage message={message} now={now} shadow revealed={visible} />}
    {message.content && <p>{visible ? message.content : fake}</p>}
  </div>
}
