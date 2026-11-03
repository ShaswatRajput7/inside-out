import { useMemo, useState } from 'react'
import { Menu, Users, MessageCircle, Palette } from 'lucide-react'
import { useMessages } from '../hooks/useMessages'
import { conversationTitle } from '../lib/chat'
import { Avatar, ErrorNotice } from './Shared'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import { useConversationTheme } from '../hooks/useConversationTheme'
import { useThemeImage } from '../hooks/useThemeImage'
import ChatBackground from './ChatBackground'
import ThemePickerModal from './ThemePickerModal'

export default function ChatWindow({ conversation, userId, onMenu, onMembers, onRead, sendTyping, typingUsers = {}, onlineUsers = [] }) {
  const chat = useMessages(conversation.id, userId)
  const appearance = useConversationTheme(conversation.id, userId)
  const background = useThemeImage(appearance.theme)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const title = conversationTitle(conversation, userId)
  const typingNames = useMemo(() => conversation.members.filter((member) => member.user_id !== userId && typingUsers[member.user_id] > Date.now()).map((member) => member.profile?.display_name || 'Someone'), [conversation.members, typingUsers, userId])
  return <main className="chat-window">
    <header className="chat-header">
      <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open conversations"><Menu size={21} /></button>
      <Avatar name={title} group={conversation.type === 'group'} small />
      <div className="chat-heading">
        <h1>{title}</h1>
        <span>{conversation.type === 'group' ? `${conversation.members.length} members · ${onlineUsers.length} online` : onlineUsers.some((id) => id !== userId) ? 'Online' : 'Offline · Direct conversation'}</span>
      </div>
      <div className={`connection-status ${chat.connection === 'connected' ? '' : 'disconnected'}`} title="Message connection status">
        <span className="status-dot" />{chat.connection === 'connected' ? 'Connected' : chat.connection === 'offline' ? 'Offline' : 'Reconnecting…'}
      </div>
      <button className="icon-button theme-trigger" onClick={() => setThemePickerOpen(true)} aria-label="Change theme" title="Change theme" disabled={appearance.loading}><Palette size={19} /></button>
      {conversation.type === 'group' ? <button className="icon-button" onClick={onMembers} aria-label="View and manage group members" title="Group members"><Users size={20} /></button> : <MessageCircle className="header-chat-icon" size={20} />}
    </header>
    <ErrorNotice>{chat.error}</ErrorNotice>
    <ErrorNotice>{appearance.error}</ErrorNotice>
    <div className={`chat-scene ${background ? 'has-theme' : ''}`}>
      <ChatBackground src={background} />
      <MessageList {...chat} members={conversation.members} userId={userId} title={title} onRead={(messageId) => onRead(conversation.id, messageId)} />
      <div className="typing-indicator" role="status">{typingNames.length ? `${typingNames.slice(0, 3).join(', ')}${typingNames.length > 3 ? ' and others' : ''} ${typingNames.length === 1 ? 'is' : 'are'} typing…` : ''}</div>
      <MessageInput title={title} send={chat.send} onTyping={(value) => sendTyping(conversation.id, value)} />
    </div>
    {themePickerOpen && <ThemePickerModal conversationId={conversation.id} userId={userId} theme={appearance.theme} onSave={appearance.save} onClose={() => setThemePickerOpen(false)} />}
  </main>
}
