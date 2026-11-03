import { useEffect, useRef, useState } from 'react'
import { AtSign } from 'lucide-react'
import Modal from './Modal'
import { ErrorNotice } from './Shared'
import { changeUsername } from '../services/accountService'
import { errorMessage, normalizeUsername, validUsername } from '../lib/chat'

export default function AccountModal({ profile, onChanged, onClose }) {
  const [username, setUsername] = useState(profile.username)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const input = useRef(null)
  useEffect(() => { input.current?.select() }, [])
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const updated = await changeUsername(username)
      await onChanged(updated)
      onClose()
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <Modal title="Your account" description="Give your friends a name to find you by." onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <label htmlFor="account-username">Username</label>
      <div className="input-with-icon"><AtSign size={17} /><input ref={input} id="account-username" value={username} onChange={(event) => { setUsername(event.target.value); setError('') }} autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={24} required disabled={busy} /></div>
      <p className="field-hint">3–24 letters, numbers, or underscores. Usernames are case-insensitive.</p>
      <p className="account-rename-note">After saving, use <strong>@{normalizeUsername(username) || 'your_new_username'}</strong> to log in. Your password and conversations stay the same.</p>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="editor-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !validUsername(username) || normalizeUsername(username) === profile.username}>{busy ? 'Saving…' : 'Save username'}</button></div>
    </form>
  </Modal>
}
