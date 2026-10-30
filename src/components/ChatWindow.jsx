import { Menu, Users, MessageCircle } from 'lucide-react'
import { useMessages } from '../hooks/useMessages'
import { conversationTitle } from '../lib/chat'
import { Avatar, ErrorNotice } from './Shared'
import MessageList from './MessageList'
import MessageInput from './MessageInput'

export default function ChatWindow({ conversation, userId, onMenu, onMembers }) {
  const chat = useMessages(conversation.id, userId)
  const title = conversationTitle(conversation, userId)
  return <main className="chat-window"><header className="chat-header"><button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open conversations"><Menu size={21} /></button><Avatar name={title} group={conversation.type === 'group'} small /><div className="chat-heading"><h1>{title}</h1><span>{conversation.type === 'group' ? `${conversation.members.length} members · Your little circle` : 'Direct conversation'}</span></div><div className={`connection-status ${chat.connection === 'connected' ? '' : 'disconnected'}`} title="Message connection status"><span className="status-dot" />{chat.connection === 'connected' ? 'Connected' : chat.connection === 'offline' ? 'Offline' : 'Reconnecting…'}</div>{conversation.type === 'group' ? <button className="icon-button" onClick={onMembers} aria-label="View and manage group members" title="Group members"><Users size={20} /></button> : <MessageCircle className="header-chat-icon" size={20} />}</header><ErrorNotice>{chat.error}</ErrorNotice><MessageList {...chat} members={conversation.members} userId={userId} title={title} /><MessageInput title={title} send={chat.send} /></main>
}
