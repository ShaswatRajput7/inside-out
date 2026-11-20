import { isDesktop } from './index.js'

// Keep browser downloads synchronous with the user's click (WebKit gesture rules).
export async function saveImage(url, filename) {
  if (!isDesktop()) {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    return
  }
  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs'),
  ])
  const extension = filename.split('.').pop()
  const path = await save({ defaultPath: filename, filters: [{ name: 'Image', extensions: [extension] }] })
  if (!path) return
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not read the image. Close and reopen the preview, then try again.')
  // The dialog grants access to this path for this session; no broad filesystem scope.
  await writeFile(path, new Uint8Array(await response.arrayBuffer()))
}
