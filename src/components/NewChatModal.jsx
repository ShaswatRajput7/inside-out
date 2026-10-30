import { useState } from 'react'
import Modal from './Modal'
import UserLookup from './UserLookup'
import { ErrorNotice } from './Shared'
import { createDirect } from '../services/chatService'
import { errorMessage } from '../lib/chat'

export default function NewChatModal({ userId, onClose, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function start(user) {
    setBusy(true); setError('')
    try { const id = await createDirect(user.id); await onCreated(id) }
    catch (err) { setError(errorMessage(err)); setBusy(false) }
  }
  return <Modal title="Start a conversation" description="A good conversation starts with a familiar name." onClose={onClose}><UserLookup userId={userId} onSelect={start} action={busy ? 'Opening…' : 'Start chat'} disabled={busy} /><ErrorNotice>{error}</ErrorNotice></Modal>
}
