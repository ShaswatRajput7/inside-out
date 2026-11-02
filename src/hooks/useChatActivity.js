import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { getMessage, getUnreadCounts, markRead } from '../services/chatService'
import { conversationTitle, errorMessage } from '../lib/chat'
import { canReact, isActivelyViewing, notificationText } from '../lib/messaging'
import { notifyMessage, requestNotifications, watchNotificationClicks } from '../platform/notifications'

export function useChatActivity({ conversations, userId, activeId, onNavigate }) {
  const [unreads, setUnreads] = useState({})
  const countsRequest = useRef(0)
  const [notificationError, setNotificationError] = useState('')
  const settingKey = `inside-out:notifications:${userId}`
  const [notifications, setNotifications] = useState(() => { try { return localStorage.getItem(settingKey) === 'true' } catch { return false } })
  const latest = useRef({ conversations, activeId, onNavigate, notifications })
  latest.current = { conversations, activeId, onNavigate, notifications }
  const [activityError, setActivityError] = useState('')
  const channelIds = conversations.map((conversation) => conversation.id).sort().join(',')
  const refresh = useCallback(async () => {
    const request = ++countsRequest.current
    const data = await getUnreadCounts()
    if (request !== countsRequest.current) return
    setUnreads(Object.fromEntries(data.map((row) => [row.conversation_id, Number(row.unread_count)])))
  }, [])
  useEffect(() => {
    let active = true, timer
    const seen = new Set()
    const update = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (active) refresh().then(() => { if (active) setActivityError('') }).catch((error) => { if (active) setActivityError(errorMessage(error)) }) }, 200)
    }
    const channel = supabase.channel(`account:${userId}:activity`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (event) => {
        update()
        const raw = event.new
        if (event.eventType !== 'INSERT' || !raw?.id || raw.sender_id === userId || seen.has(raw.id)) return
        seen.add(raw.id)
        if (seen.size > 500) seen.delete(seen.values().next().value)
        if (!latest.current.notifications || (latest.current.activeId === raw.conversation_id && isActivelyViewing())) return
        try {
          const message = await getMessage(raw.id)
          if (!active || !canReact(message) || (latest.current.activeId === raw.conversation_id && isActivelyViewing())) return
          const conversation = latest.current.conversations.find((item) => item.id === raw.conversation_id)
          if (!conversation) return
          await notifyMessage({ userId, messageId: raw.id, conversationId: raw.conversation_id,
            title: conversation.type === 'group' ? `${message.sender?.display_name} · ${conversationTitle(conversation, userId)}` : message.sender?.display_name || 'New message',
            body: notificationText(message), onNavigate: (id) => latest.current.onNavigate(id) })
        } catch { /* Notification delivery never blocks messaging. */ }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` }, update)
      .subscribe((status) => { if (status === 'SUBSCRIBED') update() })
    update()
    const interval = setInterval(update, 15000)
    const storage = (event) => { if (event.key === settingKey) setNotifications(event.newValue === 'true') }
    window.addEventListener('focus', update); window.addEventListener('online', update); window.addEventListener('storage', storage)
    return () => { active = false; clearTimeout(timer); clearInterval(interval); window.removeEventListener('focus', update); window.removeEventListener('online', update); window.removeEventListener('storage', storage); void supabase.removeChannel(channel) }
  }, [userId, refresh, settingKey, channelIds])
  useEffect(() => {
    if (!notifications) return
    let active = true, stop
    watchNotificationClicks((id) => latest.current.onNavigate(id)).then((unlisten) => { if (active) stop = unlisten; else unlisten() }).catch(() => {})
    return () => { active = false; stop?.() }
  }, [notifications])
  async function toggleNotifications() {
    setNotificationError('')
    try {
      const enabled = !notifications
      if (enabled && !await requestNotifications()) throw new Error('Notification permission was not granted. You can enable it in your browser or system settings.')
      setNotifications(enabled)
      localStorage.setItem(settingKey, String(enabled))
    } catch (error) { setNotificationError(errorMessage(error)) }
  }
  const read = useCallback(async (conversationId, messageId) => {
    try { await markRead(conversationId, messageId); await refresh(); return true }
    catch (error) { setActivityError(errorMessage(error)); return false }
  }, [refresh])
  return { unreads, read, notifications, toggleNotifications, activityError, notificationError }
}
