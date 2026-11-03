import { createClient } from 'npm:@supabase/supabase-js@2'
import { changeUsername, UsernameChangeError } from './handler.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
Deno.serve(async (request) => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return respond({ error: 'POST required' }, 405)
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return respond({ error: 'Please sign in again.' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return respond({ error: 'Server configuration missing' }, 503)
  let body
  try { body = await request.json() } catch { return respond({ error: 'Invalid request' }, 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'Invalid request' }, 400)
  try {
    const api = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return respond({ profile: await changeUsername(api, token, body.username) })
  } catch (error) {
    if (error instanceof UsernameChangeError) return respond({ error: error.message }, error.status)
    // Never log tokens, email identities, passwords, or the request body.
    console.error('Username change failed')
    return respond({ error: 'Could not change your username. Please try again.' }, 503)
  }
})
