import { useState } from 'react'
import { UserMinus } from 'lucide-react'
import Modal from './Modal'
import UserLookup from './UserLookup'
import { Avatar, ErrorNotice } from './Shared'
import { addMember, removeMember } from '../services/chatService'
import { errorMessage } from '../lib/chat'

export default function MembersModal({ conversation, userId, onClose, refresh }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const owner = conversation.created_by === userId
  async function change(action) {
    setBusy(true); setError('')
    try { await action(); await refresh() }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <Modal title={conversation.name} description={`${conversation.members.length} people in this circle`} onClose={onClose}><div className="members-list">{conversation.members.map((member) => <div className="user-result" key={member.user_id}><Avatar name={member.profile?.display_name} /><div><strong>{member.profile?.display_name || 'Former member'}{member.user_id === userId ? ' (you)' : ''}</strong><span>{member.role === 'admin' ? 'Group creator' : `@${member.profile?.username || 'unknown'}`}</span></div>{owner && member.user_id !== userId && <button className="icon-button danger" aria-label={`Remove ${member.profile?.username}`} disabled={busy} onClick={() => change(() => removeMember(conversation.id, member.user_id))}><UserMinus size={17} /></button>}</div>)}</div>{owner && <UserLookup userId={userId} selectedIds={conversation.members.map((member) => member.user_id)} disabled={busy || conversation.members.length >= 30} onSelect={(member) => change(() => addMember(conversation.id, member.username))} />}<ErrorNotice>{error}</ErrorNotice></Modal>
}
