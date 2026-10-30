import { useState } from 'react'
import { Menu, MessageCircle, Plus, Users, ArrowUpRight } from 'lucide-react'
import { useConversations } from '../hooks/useConversations'
import { supabase } from '../services/supabase'
import { errorMessage } from '../lib/chat'
import Sidebar from '../components/Sidebar'
import ChatWindow from '../components/ChatWindow'
import NewChatModal from '../components/NewChatModal'
import CreateGroupModal from '../components/CreateGroupModal'
import MembersModal from '../components/MembersModal'
import { ErrorNotice } from '../components/Shared'

export default function Chat({ profile }) {
  const { conversations, loading, error, refresh } = useConversations(profile.id)
  const [activeId, setActiveId] = useState(null)
  const [modal, setModal] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const active = conversations.find((conversation) => conversation.id === activeId)
  async function created(id) {
    const data = await refresh()
    if (!data) throw new Error('Conversation created, but the list could not refresh. Close this dialog and retry refreshing.')
    setActiveId(id); setModal(null); setMobileOpen(false)
  }
  async function logout() {
    setLoggingOut(true); setLogoutError('')
    const { error: err } = await supabase.auth.signOut({ scope: 'local' })
    if (err) setLogoutError(errorMessage(err))
    setLoggingOut(false)
  }
  return <div className="app-shell"><Sidebar profile={profile} conversations={conversations} activeId={activeId} onSelect={(id) => { setActiveId(id); setMobileOpen(false) }} onNewChat={() => setModal('direct')} onCreateGroup={() => setModal('group')} onLogout={logout} loggingOut={loggingOut} error={error || logoutError} loading={loading} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />{active ? <ChatWindow key={active.id} conversation={active} userId={profile.id} onMenu={() => setMobileOpen(true)} onMembers={() => setModal('members')} /> : <main className="welcome"><header className="welcome-header"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open conversations"><Menu size={21} /></button><span>Your space, at your pace.</span><span className="welcome-header-right"><span className="status-dot" />INSIDE OUT</span></header><div className="welcome-content"><div className="welcome-symbol"><div className="symbol-ring" /><MessageCircle size={50} strokeWidth={1.4} /><span>✦</span></div><span className="eyebrow">A LITTLE SPACE FOR YOUR PEOPLE</span><h1>Hey, {profile.display_name}<span>.</span></h1><p>Big days, small thoughts, and everything in between.<br />There’s always room for a good conversation.</p><div className="welcome-cards"><button className="welcome-card" onClick={() => setModal('direct')}><span className="card-icon"><MessageCircle size={22} /></span><strong>Just between us <ArrowUpRight size={18} /></strong><span>Find a friend. Pick up where you left off.</span><span className="card-action"><Plus size={15} /> Start a conversation</span></button><button className="welcome-card" onClick={() => setModal('group')}><span className="card-icon blue"><Users size={22} /></span><strong>The whole circle <ArrowUpRight size={18} /></strong><span>A shared space for your favorite people.</span><span className="card-action"><Plus size={15} /> Create a group</span></button></div><div className="welcome-footnote"><span>✦</span> No feeds. No followers. Just you and your friends.</div><ErrorNotice>{logoutError}</ErrorNotice></div><footer className="welcome-footer">A smaller world. A little more connected.</footer></main>}{modal === 'direct' && <NewChatModal userId={profile.id} onClose={() => setModal(null)} onCreated={created} />}{modal === 'group' && <CreateGroupModal userId={profile.id} onClose={() => setModal(null)} onCreated={created} />}{modal === 'members' && active && <MembersModal conversation={active} userId={profile.id} onClose={() => setModal(null)} refresh={refresh} />}</div>
}
