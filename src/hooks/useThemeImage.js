import { useEffect, useState } from 'react'
import { findBuiltinTheme } from '../lib/themes'
import { downloadThemeImage } from '../services/themeService'

export function useThemeImage(theme) {
  const path = theme.kind === 'custom' ? theme.custom_path : null
  const [image, setImage] = useState(null)
  useEffect(() => {
    setImage(null)
    if (!path) return
    let active = true, url, downloading = false
    const load = async () => {
      if (!active || url || downloading) return
      downloading = true
      try {
        const blob = await downloadThemeImage(path)
        if (active) { url = URL.createObjectURL(blob); setImage({ path, url }) }
      } catch { if (active) setImage(null) }
      finally { downloading = false }
    }
    void load()
    window.addEventListener('focus', load); window.addEventListener('online', load)
    return () => {
      active = false
      window.removeEventListener('focus', load); window.removeEventListener('online', load)
      if (url) URL.revokeObjectURL(url)
    }
  }, [path])
  if (theme.kind === 'builtin') return findBuiltinTheme(theme.builtin_key)?.image || ''
  return path && image?.path === path ? image.url : ''
}
