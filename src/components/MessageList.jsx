import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Pencil, SmilePlus, Trash2 } from 'lucide-react'
import { Avatar, ErrorNotice, Spinner } from './Shared'
import { canReact, groupReactions, isActivelyViewing } from '../lib/messaging'
import { deleteMessage, toggleReaction } from '../services/chatService'
import { requestImageCleanup } from '../services/images'
import { errorMessage } from '../lib/chat'
import EmojiPicker from './EmojiPicker'
import MessageEditor from './MessageEditor'
import ImageMessage from './ImageMessage'
import Modal from './Modal'

export default function MessageList({ messages, reactions, members, userId, title, loading, hasOlder, loadingOlder, loadOlder, refresh, onRead }) {
  const ref = useRef(null)
  const previous = useRef({ first: null, last: null, height: 0, nearBottom: true })
  const latest = useRef({ messages, onRead })
  latest.current = { messages, onRead }
  const lastMarked = useRef(null), reactionAnchor = useRef(null)
  const [editing, setEditing] = useState(null), [removing, setRemoving] = useState(null), [reacting, setReacting] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now())
  const currentTime = Math.max(now, Date.now())
  const names = Object.fromEntries(members.map((member) => [member.user_id, member.profile?.display_name || 'Former member']))
  const reactionMap = useMemo(() => {
    const map = {}
    for (const item of reactions) (map[item.message_id] ||= []).push(item)
    return map
  }, [reactions])
  useEffect(() => {
    const times = messages.filter((message) => !message.deleted_at && message.image?.state === 'ready').map((message) => new Date(message.image.expires_at).getTime()).filter((stamp) => stamp > Date.now())
    if (!times.length) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.min(...times) - Date.now() + 20))
    return () => clearTimeout(timer)
  }, [messages, now])
  useLayoutEffect(() => {
    const element = ref.current, first = messages[0]?.id, last = messages.at(-1)?.id, old = previous.current
    if (old.first && old.first !== first && old.last === last) element.scrollTop += element.scrollHeight - old.height
    else if (old.nearBottom || !old.last || (old.last !== last && messages.at(-1)?.sender_id === userId)) element.scrollTop = element.scrollHeight
    previous.current = { first, last, height: element.scrollHeight, nearBottom: element.scrollHeight - element.scrollTop - element.clientHeight < 100 }
  }, [messages, loading, userId])
  const messageIds = messages.map((message) => message.id).join(',')
  useEffect(() => {
    const visible = new Set()
    let timer, reading = false, active = true
    const mark = () => {
      if (!active || !isActivelyViewing() || reading) return
      const lastVisible = [...latest.current.messages].reverse().find((message) => visible.has(message.id))
      if (!lastVisible || lastMarked.current === lastVisible.id) return
      reading = true
      Promise.resolve(latest.current.onRead?.(lastVisible.id)).then((ok) => { if (ok !== false) lastMarked.current = lastVisible.id }).finally(() => {
        reading = false
        const newestVisible = [...latest.current.messages].reverse().find((message) => visible.has(message.id))
        if (active && newestVisible && newestVisible.id !== lastVisible.id) { clearTimeout(timer); timer = setTimeout(mark, 200) }
      })
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) { if (entry.isIntersecting) visible.add(entry.target.dataset.messageId); else visible.delete(entry.target.dataset.messageId) }
      clearTimeout(timer); timer = setTimeout(mark, 300)
    }, { root: ref.current, threshold: 0.2 })
    ref.current.querySelectorAll('[data-message-id]').forEach((node) => observer.observe(node))
    window.addEventListener('focus', mark); window.addEventListener('online', mark); document.addEventListener('visibilitychange', mark)
    return () => { active = false; observer.disconnect(); clearTimeout(timer); window.removeEventListener('focus', mark); window.removeEventListener('online', mark); document.removeEventListener('visibilitychange', mark) }
  }, [messageIds])
  async function onScroll() {
    const element = ref.current
    previous.current.nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100
    previous.current.height = element.scrollHeight
    if (element.scrollTop < 65 && hasOlder && !loadingOlder) await loadOlder()
  }
  async function react(messageId, emoji) {
    setError('')
    try { await toggleReaction(messageId, emoji); setReacting(null); await refresh() }
    catch (err) { setError(errorMessage(err)) }
  }
  async function remove() {
    setBusy(true); setError('')
    try { const imageId = await deleteMessage(removing); void requestImageCleanup(imageId); setRemoving(null); await refresh() }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <><div className="message-list" ref={ref} onScroll={onScroll} role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text"><ErrorNotice>{error}</ErrorNotice>{loading ? <Spinner label="Loading your conversation…" /> : <>{hasOlder ? <button className="load-older" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? 'Loading…' : 'Load older messages'}</button> : <div className="conversation-start"><span className="start-icon"><MessageCircle size={29} strokeWidth={1.5} /></span><h2>This is the start of something good.</h2><p>{messages.length ? `Your conversation with ${title} begins here.` : `Say hello to ${title}. Make yourself at home.`}</p></div>}{messages.map((message, index) => {
    const date = new Date(message.created_at), day = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    const showDate = index === 0 || new Date(messages[index - 1].created_at).toDateString() !== date.toDateString()
    const name = message.sender?.display_name || names[message.sender_id] || 'Former member'
    const eligible = canReact(message, currentTime), own = message.sender_id === userId
    return <div key={message.id} data-message-id={message.id}>
      {showDate && <div className="date-divider"><span>{day}</span></div>}
      <article className={`message ${own ? 'own-message' : 'received-message'} ${editing === message.id ? 'is-editing' : ''}`} aria-label={own ? 'Your message' : `Message from ${name}`}>
        {!own && <Avatar name={name} small />}
        <div className="message-body">
          {!own && <div className="message-meta"><strong>{name}</strong></div>}
          {message.deleted_at ? <p className="deleted-message">This message was deleted</p> : editing === message.id ?
            <MessageEditor message={message} onDone={() => setEditing(null)} onChanged={refresh} /> : <>
              {message.kind === 'image' && <ImageMessage message={message} now={currentTime} />}
              {message.content && <p>{message.content}</p>}
            </>}
          <div className="message-footer">
            {!message.deleted_at && editing !== message.id && <div className="message-actions" role="group" aria-label="Message actions">
              {eligible && <button className="icon-button" title="React with any emoji" aria-label="Add emoji reaction" onClick={(event) => { reactionAnchor.current = event.currentTarget; setReacting(message.id) }}><SmilePlus size={15} /></button>}
              {own && message.kind === 'text' && <button className="icon-button" title="Edit message" aria-label="Edit message" onClick={() => setEditing(message.id)}><Pencil size={14} /></button>}
              {own && <button className="icon-button danger" title="Delete message" aria-label="Delete message" onClick={() => setRemoving(message.id)}><Trash2 size={14} /></button>}
            </div>}
            <span className="message-stamp">
              {message.edited_at && !message.deleted_at && <span className="edited-label">edited</span>}
              <time dateTime={message.created_at} title={date.toLocaleString()}>{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
            </span>
          </div>
          {eligible && editing !== message.id && <div className="reaction-badges">
            {groupReactions(reactionMap[message.id] || [], userId).map((reaction) => <button key={reaction.emoji} className={`reaction-badge ${reaction.mine ? 'mine' : ''}`} aria-label={`${reaction.emoji}: ${reaction.count} reaction${reaction.count === 1 ? '' : 's'}${reaction.mine ? ', including you' : ''}`} aria-pressed={reaction.mine} onClick={() => react(message.id, reaction.emoji)}><span>{reaction.emoji}</span>{reaction.count}</button>)}
          </div>}
        </div>
      </article>
    </div>
  })}</>}</div>{reacting && <EmojiPicker anchorRef={reactionAnchor} onSelect={(emoji) => react(reacting, emoji)} onClose={() => setReacting(null)} />}{removing && <Modal title="Delete this message?" description="Your message will be replaced with a deleted-message notice. Attached images will also be removed." onClose={() => { if (!busy) setRemoving(null) }}><ErrorNotice>{error}</ErrorNotice><div className="editor-actions"><button className="button secondary" onClick={() => setRemoving(null)} disabled={busy}>Cancel</button><button className="button danger-button" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete message'}</button></div></Modal>}</>
}
