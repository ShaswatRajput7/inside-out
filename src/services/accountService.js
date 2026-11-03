import { supabase } from './supabase'
import { normalizeUsername, validUsername } from '../lib/chat'

export async function changeUsername(username) {
  if (!validUsername(username)) throw new Error('Use 3–24 letters, numbers, or underscores.')
  const { data, error } = await supabase.functions.invoke('change-username', { body: { username: normalizeUsername(username) } })
  if (error) {
    let detail
    try { detail = (await error.context?.json())?.error } catch { /* Network failures have no JSON response. */ }
    throw new Error(detail || (error.context?.status === 404 ? 'Username changes are not configured yet. Ask the app owner to deploy change-username.' : 'Could not change your username. Check your connection and try again.'))
  }
  if (!data?.profile) throw new Error('Could not confirm the change. Refresh your account before retrying.')
  // Admin API changes do not update the cached session's email automatically.
  // A failed refresh never hides an already committed successful rename.
  await supabase.auth.refreshSession().catch(() => {})
  return data.profile
}
