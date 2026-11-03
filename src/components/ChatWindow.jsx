import { useEffect, useMemo, useState } from 'react'
import { Menu, Users, MessageCircle, Palette, Sparkles } from 'lucide-react'
import { useMessages } from '../hooks/useMessages'
import { conversationTitle } from '../lib/chat'
import { Avatar, ErrorNotice } from './Shared'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import { useConversationTheme } from '../hooks/useConversationTheme'
import { useThemeImage } from '../hooks/useThemeImage'
import ChatBackground from './ChatBackground'
import ThemePickerModal from './ThemePickerModal'
import { useConversationMagic } from '../hooks/useConversationMagic'
import MagicAtmosphere from './MagicAtmosphere'
import MagicPickerModal from './MagicPickerModal'
import { findMagicEffect } from '../lib/magic'

export default function ChatWindow({ conversation, userId, onMenu, onMembers, onRead, sendTyping, typingUsers = {}, onlineUsers = [] }) {
  const direct = conversation.type === 'direct'
  const magic = useConversationMagic(conversation.id, direct)
  const chat = useMessages(conversation.id, userId, direct ? magic.refresh : undefined)
  const appearance = useConversationTheme(conversation.id, userId)
  const background = useThemeImage(appearance.theme)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [magicPickerOpen, setMagicPickerOpen] = useState(false), [magicNotice, setMagicNotice] = useState('')
  useEffect(() => { if (!magicNotice) return; const timer = setTimeout(() => setMagicNotice(''), 4000); return () => clearTimeout(timer) }, [magicNotice])
  async function applyMagic(effect, seconds) { await magic.apply(effect, seconds); setMagicNotice(`${findMagicEffect(effect).name} is here. Enjoy your little world.`) }
  async function removeMagic() { await magic.apply(null); setMagicNotice('Magic removed. Back to your familiar space.') }
  const title = conversationTitle(conversation, userId)
  const typingNames = useMemo(() => conversation.members.filter((member) => member.user_id !== userId && typingUsers[member.user_id] > Date.now()).map((member) => member.profile?.display_name || 'Someone'), [conversation.members, typingUsers, userId])
  return <main className="chat-window">
    <header className="chat-header">
      <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open conversations"><Menu size={21} /></button>
      <Avatar name={title} group={conversation.type === 'group'} small />
      <div className="chat-heading">
        <h1>{title}</h1>
        <span>{conversation.type === 'group' ? `${conversation.members.length} members · ${onlineUsers.length} online` : onlineUsers.some((id) => id !== userId) ? 'Online' : 'Offline · Direct conversation'}</span>
        {magic.active && <button className="magic-active-label" onClick={() => setMagicPickerOpen(true)}><Sparkles size={11} /><span>{magic.effect.name} · {magic.remaining}</span></button>}
      </div>
      <div className={`connection-status ${chat.connection === 'connected' ? '' : 'disconnected'}`} title="Message connection status">
        <span className="status-dot" />{chat.connection === 'connected' ? 'Connected' : chat.connection === 'offline' ? 'Offline' : 'Reconnecting…'}
      </div>
      <button className="icon-button theme-trigger" onClick={() => setThemePickerOpen(true)} aria-label="Change theme" title="Change theme" disabled={appearance.loading}><Palette size={19} /></button>
      {direct && <button className={`icon-button magic-trigger ${magic.active ? 'active' : ''}`} onClick={() => setMagicPickerOpen(true)} aria-label="Chat Magic" title="Chat Magic" disabled={magic.loading}><Sparkles size={19} /></button>}
      {conversation.type === 'group' ? <button className="icon-button" onClick={onMembers} aria-label="View and manage group members" title="Group members"><Users size={20} /></button> : <MessageCircle className="header-chat-icon" size={20} />}
    </header>
    <ErrorNotice>{chat.error}</ErrorNotice>
    <ErrorNotice>{appearance.error}</ErrorNotice>
    <div className={`chat-scene ${background ? 'has-theme' : ''} ${magic.active ? 'has-magic' : ''}`}>
      <ChatBackground src={background} />
      {magic.active && <MagicAtmosphere effectId={magic.active.effect_id} seed={conversation.id} clock={magic.clock} appliedAt={magic.active.applied_at} expiresAt={magic.active.expires_at} paused={magicPickerOpen || themePickerOpen} />}
      {magicNotice && <div className="magic-confirmation" role="status"><Sparkles size={13} />{magicNotice}</div>}
      <MessageList {...chat} members={conversation.members} userId={userId} title={title} onRead={(messageId) => onRead(conversation.id, messageId)} />
      <div className="typing-indicator" role="status">{typingNames.length ? `${typingNames.slice(0, 3).join(', ')}${typingNames.length > 3 ? ' and others' : ''} ${typingNames.length === 1 ? 'is' : 'are'} typing…` : ''}</div>
      <MessageInput title={title} send={chat.send} onTyping={(value) => sendTyping(conversation.id, value)} />
    </div>
    {themePickerOpen && <ThemePickerModal conversationId={conversation.id} userId={userId} theme={appearance.theme} onSave={appearance.save} onClose={() => setThemePickerOpen(false)} />}
    {direct && magicPickerOpen && <MagicPickerModal active={magic.active} remaining={magic.remaining} loading={magic.loading} error={magic.error} onApply={applyMagic} onRemove={removeMagic} onClose={() => setMagicPickerOpen(false)} />}
  </main>
}
