import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, LoaderCircle, RotateCcw } from 'lucide-react'
import Modal from './Modal'
import ChatBackground from './ChatBackground'
import { ErrorNotice } from './Shared'
import { BUILTIN_THEMES, DEFAULT_THEME, findBuiltinTheme } from '../lib/themes'
import { prepareThemeImage, uploadThemeImage } from '../services/themeService'
import { errorMessage } from '../lib/chat'
import { useThemeImage } from '../hooks/useThemeImage'

export default function ThemePickerModal({ conversationId, userId, theme, onSave, onClose }) {
  const [selection, setSelection] = useState(theme)
  const [custom, setCustom] = useState(null)
  const [processing, setProcessing] = useState(false), [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null), active = useRef(true), fileSequence = useRef(0), uploadPath = useRef(null)
  const busy = processing || saving
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => () => { if (custom?.url) URL.revokeObjectURL(custom.url) }, [custom])
  const selectedBuiltin = findBuiltinTheme(selection.builtin_key)
  const storedImage = useThemeImage(selection)
  const image = selection.kind === 'custom' && custom ? custom.url : storedImage
  const name = selectedBuiltin?.name || (selection.kind === 'custom' ? 'Your own atmosphere' : 'Inside Out')
  async function chooseFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const request = ++fileSequence.current
    setProcessing(true); setError('')
    try {
      const prepared = await prepareThemeImage(file)
      if (!active.current || request !== fileSequence.current) return
      uploadPath.current = null
      setCustom({ ...prepared, url: URL.createObjectURL(prepared.file) })
      setSelection({ kind: 'custom', builtin_key: null, custom_path: null })
    } catch (err) { if (active.current) setError(errorMessage(err)) }
    finally { if (active.current && request === fileSequence.current) setProcessing(false) }
  }
  async function apply() {
    setSaving(true); setError('')
    try {
      let next = selection
      if (selection.kind === 'custom' && custom) {
        // Keep a successful upload for retries if the subsequent database write fails.
        if (!uploadPath.current) uploadPath.current = await uploadThemeImage(conversationId, userId, custom)
        next = { kind: 'custom', builtin_key: null, custom_path: uploadPath.current }
      }
      await onSave(next)
      if (active.current) onClose()
    } catch (err) { if (active.current) setError(errorMessage(err)) }
    finally { if (active.current) setSaving(false) }
  }
  return <Modal className="theme-modal" title="A little more you." description="Choose a theme for this conversation. Everyone here will see it." onClose={() => { if (!saving) onClose() }}>
    <div className="theme-picker-body">
    <div className={`theme-preview ${image ? 'has-theme' : ''}`} aria-label={`Preview: ${name}`}>
      <ChatBackground src={image} />
      <div className="theme-preview-content"><span className="theme-preview-label">{name} <span>PREVIEW</span></span><div className="preview-message">A little space for our stories.</div><div className="preview-message preview-own">Make yourself at home ✦<small>Just now</small></div></div>
    </div>
    <div className="theme-section-label">CURATED FOR YOUR CONVERSATIONS</div>
    <div className="theme-grid" role="group" aria-label="Conversation themes">
      <button className={`theme-option theme-default ${selection.kind === 'default' ? 'selected' : ''}`} aria-pressed={selection.kind === 'default'} onClick={() => setSelection(DEFAULT_THEME)} disabled={busy}><span className="theme-swatch"><RotateCcw size={22} /></span><strong>Inside Out</strong><span>The original quiet</span>{selection.kind === 'default' && <Check className="theme-check" size={15} />}</button>
      {BUILTIN_THEMES.map((item) => <button key={item.key} className={`theme-option ${selection.builtin_key === item.key ? 'selected' : ''}`} style={{ '--theme-accent': item.color }} aria-pressed={selection.builtin_key === item.key} aria-label={`${item.name}, ${item.inspiration}`} title={item.description} disabled={busy} onClick={() => setSelection({ kind: 'builtin', builtin_key: item.key, custom_path: null })}><span className="theme-swatch"><img src={item.image} alt="" loading="lazy" /></span><strong>{item.name}</strong><span>{item.inspiration}</span>{selection.builtin_key === item.key && <Check className="theme-check" size={15} />}</button>)}
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Upload a custom chat background" onChange={chooseFile} disabled={busy} />
    <button className={`theme-upload ${selection.kind === 'custom' ? 'selected' : ''}`} disabled={busy} onClick={() => input.current?.click()}>{processing ? <LoaderCircle size={20} className="spin" /> : <ImagePlus size={20} />}<span><strong>{processing ? 'Preparing your image…' : custom ? 'Custom image ready' : 'Bring your own background'}<small>JPEG, PNG or WebP · up to 15 MB · optimized for you</small></strong></span>{selection.kind === 'custom' && <Check size={16} />}</button>
    {custom && selection.kind !== 'custom' && <button className="button secondary full-width" disabled={busy} onClick={() => setSelection({ kind: 'custom', builtin_key: null, custom_path: null })}>Preview your uploaded image</button>}
    <p className="field-hint">Preview is just for you. Apply to share with everyone in this chat. Choose Inside Out to reset.</p>
    <ErrorNotice>{error}</ErrorNotice>
    </div>
    <div className="theme-actions"><button className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" onClick={apply} disabled={busy}>{saving ? <><LoaderCircle size={15} className="spin" />Applying…</> : 'Apply theme'}</button></div>
  </Modal>
}
