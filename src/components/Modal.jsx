import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, description, children, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === ref.current) onClose() }}><div className="modal-inner"><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button><h2>{title}</h2><p className="muted modal-description">{description}</p>{children}</div></dialog>
}
