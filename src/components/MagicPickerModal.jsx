import { useEffect, useState } from 'react'
import { Check, Clock3, LoaderCircle, Sparkles, XCircle } from 'lucide-react'
import Modal from './Modal'
import { ErrorNotice } from './Shared'
import MagicAtmosphere from './MagicAtmosphere'
import { MAGIC_DURATIONS, MAGIC_EFFECTS, findMagicEffect, validMagicDuration } from '../lib/magic'
import { errorMessage } from '../lib/chat'

export default function MagicPickerModal({ active, remaining, loading, error: syncError, onApply, onRemove, onClose }) {
  const [selection, setSelection] = useState(active?.effect_id || 'starry-night')
  const [duration, setDuration] = useState('3600'), [minutes, setMinutes] = useState('60')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [hidden, setHidden] = useState(document.hidden)
  useEffect(() => { const update = () => setHidden(document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update) }, [])
  const effect = findMagicEffect(selection)
  const seconds = duration === 'custom' ? Number(minutes) * 60 : Number(duration)
  const valid = validMagicDuration(seconds) && (duration !== 'custom' || Number.isInteger(Number(minutes)))
  async function save(remove = false) {
    if (busy) return
    setBusy(true); setError('')
    try { if (remove) await onRemove(); else await onApply(selection, seconds); onClose() }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <Modal className={`magic-modal ${hidden ? 'is-paused' : ''}`} title="Chat Magic" description={active ? `${findMagicEffect(active.effect_id)?.name} · ${remaining} · Shared with your friend` : 'A little wonder. Just for the two of you.'} onClose={() => { if (!busy) onClose() }}>
    <div className="magic-picker-body">
      <div className="magic-hero" style={{ '--magic-color': effect.color }}>
        <MagicAtmosphere effectId={selection} preview />
        <div className="magic-hero-copy"><span className="magic-eyebrow"><Sparkles size={12} /> A WORLD OF YOUR OWN</span><strong>{effect.name}</strong><p>{effect.detail}</p></div>
        <span className="magic-live-label"><span />LIVE PREVIEW</span>
      </div>
      <div className="magic-section-heading"><span>CHOOSE YOUR ATMOSPHERE</span><span>12 little worlds</span></div>
      <div className="magic-grid" role="group" aria-label="Magical atmospheres">
        {MAGIC_EFFECTS.map((item) => <button key={item.id} className={`magic-card ${selection === item.id ? 'selected' : ''}`} style={{ '--magic-color': item.color }} aria-label={`${item.name}, ${item.mood}`} aria-pressed={selection === item.id} disabled={busy} onClick={() => setSelection(item.id)}>
          <span className={`magic-swatch magic-swatch-${item.id}`} style={{ background: item.tint }} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--i': i, left: `${[14, 38, 67, 82, 54, 24][i]}%`, top: `${[22, 62, 18, 53, 78, 42][i]}%` }} />)}</span>
          <strong>{item.name}</strong><span className="magic-card-mood">{item.mood}</span>{selection === item.id && <Check className="magic-card-check" size={14} />}
        </button>)}
      </div>
      <div className="magic-current"><Sparkles size={14} /><span>{active ? <><strong>{findMagicEffect(active.effect_id)?.name}</strong> · {remaining}</> : 'No magic active. Your selected theme stays underneath.'}</span></div>
      <p className="magic-footnote">Shared with your friend. Either of you can change or remove it. Your original theme returns automatically when time is up.</p>
    </div>
    <div className="magic-picker-footer">
      <ErrorNotice>{error || syncError}</ErrorNotice>
      <div className="magic-duration-row"><label htmlFor="magic-duration"><Clock3 size={15} />Let it linger for</label><select id="magic-duration" value={duration} onChange={(event) => setDuration(event.target.value)} disabled={busy}>{MAGIC_DURATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="custom">Custom duration</option></select></div>
      {duration === 'custom' && <div className="magic-custom-duration"><label htmlFor="magic-custom-minutes">Minutes</label><input id="magic-custom-minutes" type="number" min="1" max="1440" step="1" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={busy} /><span>1–1,440 · up to 24 hours</span></div>}
      <div className="magic-picker-actions"><button className="button magic-remove" disabled={busy || !active} onClick={() => save(true)}><XCircle size={15} />Remove Magic</button><button className="button primary" disabled={busy || loading || !valid} onClick={() => save()}>{busy ? <><LoaderCircle size={15} className="spin" />One moment…</> : <><Sparkles size={15} />Apply Magic</>}</button></div>
    </div>
  </Modal>
}
