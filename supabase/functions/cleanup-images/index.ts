import { createClient } from 'npm:@supabase/supabase-js@2'
import { cleanImage, runCleanup } from './worker.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cleanup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
Deno.serve(async (request) => {
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response({ error: 'POST required' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return response({ error: 'Server configuration missing' }, 503)
  const api = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const secret = Deno.env.get('IMAGE_CLEANUP_SECRET')
    if (secret && request.headers.get('x-cleanup-secret') === secret) return response(await runCleanup(api))
    // Normal users may only request queued cleanup of their own image, never a global sweep.
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return response({ error: 'Unauthorized' }, 401)
    const { data: { user }, error: authError } = await api.auth.getUser(token)
    if (authError || !user) return response({ error: 'Unauthorized' }, 401)
    const { image_id } = await request.json()
    if (typeof image_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(image_id)) return response({ error: 'Invalid image ID' }, 400)
    const { data: image, error } = await api.from('chat_image_uploads').select('id,user_id,state,storage_path').eq('id', image_id).maybeSingle()
    if (error) throw error
    if (!image || image.user_id !== user.id) return response({ error: 'Image unavailable' }, 403)
    if (['expired', 'deleted'].includes(image.state)) return response({ removed: true })
    if (image.state !== 'delete_pending') return response({ error: 'Image is not queued for deletion' }, 409)
    const removed = await cleanImage(api, image)
    return response({ removed, queued: !removed }, removed ? 200 : 202)
  } catch (error) {
    console.error('Image cleanup failed', error instanceof Error ? error.message : 'Unknown error')
    return response({ error: 'Cleanup failed; queued files will be retried' }, 500)
  }
})
