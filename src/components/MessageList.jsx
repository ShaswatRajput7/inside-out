import { useLayoutEffect, useRef } from 'react'
import { MessageCircle } from 'lucide-react'
import { Avatar, Spinner } from './Shared'

export default function MessageList({ messages, members, userId, title, loading, hasOlder, loadingOlder, loadOlder }) {
  const ref = useRef(null)
  const previous = useRef({ first: null, last: null, height: 0, nearBottom: true })
  const names = Object.fromEntries(members.map((member) => [member.user_id, member.profile?.display_name || 'Former member']))
  useLayoutEffect(() => {
    const element = ref.current
    const first = messages[0]?.id
    const last = messages.at(-1)?.id
    const old = previous.current
    if (old.first && old.first !== first && old.last === last) element.scrollTop += element.scrollHeight - old.height
    else if (old.nearBottom || !old.last || (old.last !== last && messages.at(-1)?.sender_id === userId)) element.scrollTop = element.scrollHeight
    previous.current = { first, last, height: element.scrollHeight, nearBottom: element.scrollHeight - element.scrollTop - element.clientHeight < 100 }
  }, [messages, loading, userId])
  async function onScroll() {
    const element = ref.current
    previous.current.nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100
    previous.current.height = element.scrollHeight
    if (element.scrollTop < 65 && hasOlder && !loadingOlder) await loadOlder()
  }
  return <div className="message-list" ref={ref} onScroll={onScroll} role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text">{loading ? <Spinner label="Loading your conversation…" /> : <>{hasOlder ? <button className="load-older" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? 'Loading…' : 'Load older messages'}</button> : <div className="conversation-start"><span className="start-icon"><MessageCircle size={29} strokeWidth={1.5} /></span><h2>This is the start of something good.</h2><p>{messages.length ? `Your conversation with ${title} begins here.` : `Say hello to ${title}. Make yourself at home.`}</p></div>}{messages.map((message, index) => {
    const date = new Date(message.created_at)
    const day = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    const showDate = index === 0 || new Date(messages[index - 1].created_at).toDateString() !== date.toDateString()
    const name = message.sender?.display_name || names[message.sender_id] || 'Former member'
    return <div key={message.id}>{showDate && <div className="date-divider"><span>{day}</span></div>}<article className={`message ${message.sender_id === userId ? 'own-message' : ''}`}><Avatar name={name} small /><div className="message-body"><div className="message-meta"><strong>{name}</strong>{message.sender_id === userId && <span className="you-label">you</span>}<time dateTime={message.created_at} title={date.toLocaleString()}>{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></div><p>{message.content}</p></div></article></div>
  })}</>}</div>
}
