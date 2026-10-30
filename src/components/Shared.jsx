import { LoaderCircle, MessagesSquare } from 'lucide-react'

export function Brand({ compact = false }) {
  return <div className="brand"><span className="brand-icon"><MessagesSquare size={22} strokeWidth={1.8} /></span>{!compact && <span>inside out<span className="brand-dot">.</span></span>}</div>
}
export function Spinner({ label = 'Loading…' }) { return <div className="loading" role="status"><LoaderCircle className="spin" size={20} />{label}</div> }
export function Avatar({ name = '?', group = false, small = false }) {
  return <span className={`avatar ${group ? 'avatar-group' : ''} ${small ? 'avatar-small' : ''}`} aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
}
export function ErrorNotice({ children }) { return children ? <div className="error-notice" role="alert">{children}</div> : null }
