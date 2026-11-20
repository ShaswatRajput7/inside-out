import { isDesktop } from './index.js'

export function externalLinkUrl(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

export function installExternalLinks() {
  if (!isDesktop()) return
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]')
    const url = anchor && !anchor.hasAttribute('download') && externalLinkUrl(anchor.href)
    if (!url || new URL(url).origin === location.origin || event.defaultPrevented) return
    event.preventDefault()
    void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url))
      .catch((error) => console.error('Could not open external link', error))
  })
}
