import { isTauri } from '@tauri-apps/api/core'

// Keep runtime checks and future native integrations out of chat/auth services.
export function isDesktop() {
  return isTauri()
}

export function getRuntime() {
  return isDesktop() ? 'tauri' : 'browser'
}
