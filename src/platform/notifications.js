import { isDesktop } from './index.js'

export function claimNotification(storage, userId, messageId) {
  const key = `inside-out:notification-ids:${userId}`
  let ids
  try { ids = JSON.parse(storage.getItem(key) || '[]') } catch { ids = [] }
  if (!Array.isArray(ids)) ids = []
  if (ids.includes(messageId)) return false
  storage.setItem(key, JSON.stringify([...ids.slice(-199), messageId]))
  return true
}
export async function requestNotifications() {
  if (isDesktop()) {
    const api = await import('@tauri-apps/plugin-notification')
    return (await api.isPermissionGranted()) || (await api.requestPermission()) === 'granted'
  }
  if (!('Notification' in window)) throw new Error('Notifications are unavailable in this browser. Use HTTPS or the desktop app.')
  return Notification.permission === 'granted' || await Notification.requestPermission() === 'granted'
}
export async function watchNotificationClicks(onNavigate) {
  if (!isDesktop()) return () => {}
  const api = await import('@tauri-apps/plugin-notification')
  const listener = await api.onAction(async (event) => {
    const conversationId = event.notification?.extra?.conversationId
    if (typeof conversationId !== 'string') return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const app = getCurrentWindow()
    await app.unminimize(); await app.show(); await app.setFocus()
    onNavigate(conversationId)
  })
  return () => listener.unregister()
}
export async function notifyMessage({ userId, messageId, conversationId, title, body, onNavigate }) {
  const show = async () => {
    try { if (!claimNotification(localStorage, userId, messageId)) return } catch { /* Session-level deduplication still applies. */ }
    if (isDesktop()) {
      const api = await import('@tauri-apps/plugin-notification')
      if (!await api.isPermissionGranted()) return
      await api.sendNotification({ title, body, extra: { conversationId } })
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, { body, tag: messageId })
      notification.onclick = () => { window.focus(); onNavigate(conversationId); notification.close() }
    }
  }
  if (navigator.locks?.request) return navigator.locks.request(`inside-out-notify:${userId}`, show)
  return show()
}
