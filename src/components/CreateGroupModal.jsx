import { useState } from 'react'
import { Users, X } from 'lucide-react'
import Modal from './Modal'
import UserLookup from './UserLookup'
import { ErrorNotice } from './Shared'
import { createGroup } from '../services/chatService'
import { errorMessage } from '../lib/chat'

export default function CreateGroupModal({ userId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create(event) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError('')
    try { const id = await createGroup(name.trim(), members.map((member) => member.id)); await onCreated(id) }
    catch (err) { setError(errorMessage(err)); setBusy(false) }
  }
  return <Modal title="Bring your people together" description="One little group. Plenty to talk about." onClose={onClose}><form id="group-form" onSubmit={create}><label htmlFor="group-name">Group name</label><input id="group-name" placeholder="The inner circle" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} required /></form><UserLookup userId={userId} selectedIds={members.map((member) => member.id)} disabled={busy || members.length >= 29} onSelect={(member) => setMembers((current) => current.some((item) => item.id === member.id) ? current : [...current, member])} />{members.length > 0 && <div className="selected-members">{members.map((member) => <span className="member-chip" key={member.id}>@{member.username}<button onClick={() => setMembers(members.filter((item) => item.id !== member.id))} aria-label={`Remove ${member.username}`}><X size={13} /></button></span>)}</div>}<ErrorNotice>{error}</ErrorNotice><button form="group-form" className="button primary full-width" disabled={busy || !name.trim()}><Users size={17} />{busy ? 'Creating…' : `Create group${members.length ? ` · ${members.length + 1} people` : ''}`}</button><p className="field-hint text-center">You can add more friends later.</p></Modal>
}
