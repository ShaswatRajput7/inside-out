import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

let pickerModules
const loadPicker = () => pickerModules ||= Promise.all([import('emoji-mart'), import('@emoji-mart/data')])
export default function EmojiPicker({ anchorRef, onSelect, onClose }) {
  const popup = useRef(null)
  const host = useRef(null)
  const callbacks = useRef({ onSelect, onClose })
  callbacks.current = { onSelect, onClose }
  const [error, setError] = useState('')
  const [position, setPosition] = useState({ left: 12, top: 12 })
  useEffect(() => {
    let active = true
    const positionPopup = () => {
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!anchor) return
      const width = Math.min(352, window.innerWidth - 24)
      const height = Math.min(440, window.innerHeight - 24)
      setPosition({ left: Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)), top: Math.max(12, anchor.top > height + 12 ? anchor.top - height - 8 : Math.min(anchor.bottom + 8, window.innerHeight - height - 12)) })
    }
    positionPopup()
    loadPicker().then(([{ Picker }, data]) => {
      if (!active) return
      host.current.replaceChildren(new Picker({
        data: data.default, theme: 'dark', set: 'native', previewPosition: 'none',
        skinTonePosition: 'search', perLine: 8, emojiButtonSize: 34, autoFocus: false,
        onEmojiSelect: (emoji) => callbacks.current.onSelect(emoji.native),
      }))
    }).catch(() => { if (active) setError('Could not load emojis. Close and try again.') })
    const outside = (event) => { if (!popup.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) callbacks.current.onClose() }
    const escape = (event) => { if (event.key === 'Escape') { event.stopPropagation(); callbacks.current.onClose() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', positionPopup)
    window.addEventListener('scroll', positionPopup, true)
    return () => {
      active = false
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', positionPopup)
      window.removeEventListener('scroll', positionPopup, true)
    }
  }, [anchorRef])
  return createPortal(<div className="emoji-popup" ref={popup} style={position} role="dialog" aria-label="Choose an emoji"><div ref={host}>{error || 'Loading emojis…'}</div></div>, document.body)
}
