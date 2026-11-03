import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

export default function MessageActions({ canEdit, canDelete, onEdit, onDelete }) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0 })
  const trigger = useRef(null), menu = useRef(null)
  useLayoutEffect(() => {
    if (!open) return
    const anchor = trigger.current.getBoundingClientRect(), box = menu.current.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)), top: Math.max(8, anchor.bottom + box.height + 8 < window.innerHeight ? anchor.bottom + 5 : anchor.top - box.height - 5) })
    menu.current.querySelector('[role="menuitem"]')?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event) => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false) }
    const moved = (event) => { if (!menu.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', moved); window.addEventListener('scroll', moved, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', moved); window.removeEventListener('scroll', moved, true) }
  }, [open])
  function choose(action) { setOpen(false); trigger.current?.focus(); action?.(trigger.current) }
  function keys(event) {
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
    else if (event.key === 'Tab') setOpen(false)
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    }
  }
  return <><button ref={trigger} className="icon-button" title="Message options" aria-label="Message options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}><MoreHorizontal size={17} /></button>
    {open && createPortal(<div ref={menu} className="message-options-menu" role="menu" aria-label="Message options" style={position} onKeyDown={keys}>
      {canEdit && <button role="menuitem" onClick={() => choose(onEdit)}><Pencil size={15} />Edit message</button>}
      {canDelete && <button role="menuitem" className="danger" onClick={() => choose(onDelete)}><Trash2 size={15} />Delete message</button>}
    </div>, document.body)}
  </>
}
