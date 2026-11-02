// Storage removal is always performed through the API, never by deleting storage.objects rows.
export async function cleanImage(api, item, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  let failure
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { error } = await api.storage.from('chat-images').remove([item.storage_path])
      if (error && !['404', 'not_found'].includes(String(error.statusCode || error.status || error.code))) throw error
      const result = await api.rpc('complete_image_cleanup', { upload_id: item.id })
      if (result.error) throw result.error
      return true
    } catch (error) {
      failure = error
      if (attempt < 2) await wait(150 * (attempt + 1))
    }
  }
  await api.rpc('fail_image_cleanup', { upload_id: item.id, error_text: failure?.message || 'Storage cleanup failed' })
  return false
}
export async function runCleanup(api) {
  let removed = 0, failed = 0
  const deadline = Date.now() + 50000
  for (let batch = 0; batch < 5 && Date.now() < deadline; batch++) {
    const { data, error } = await api.rpc('claim_image_cleanup', { batch_size: 100 })
    if (error) throw error
    if (!data.length) break
    for (let offset = 0; offset < data.length; offset += 5) {
      const results = await Promise.all(data.slice(offset, offset + 5).map((item) => cleanImage(api, item)))
      removed += results.filter(Boolean).length
      failed += results.filter((value) => !value).length
    }
  }
  return { removed, failed }
}
