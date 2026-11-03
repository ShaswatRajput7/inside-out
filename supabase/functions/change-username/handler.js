export class UsernameChangeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

export async function changeUsername(api, token, input) {
  const { data: { user }, error: authError } = await api.auth.getUser(token)
  if (authError || !user) throw new UsernameChangeError('Please sign in again.', 401)
  const username = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new UsernameChangeError('Use 3–24 letters, numbers, or underscores.')
  const { data: ready, error: setupError } = await api.rpc('username_change_ready')
  if (setupError || ready !== true) throw new UsernameChangeError('Username changes are not configured yet. Ask the app owner to apply migration 004.', 503)
  const profileQuery = () => api.from('profiles').select('id,username,display_name,created_at').eq('id', user.id).single()
  const { data: profile, error: profileError } = await profileQuery()
  if (profileError || !profile) throw new UsernameChangeError('Your profile could not be loaded. Please try again.', 503)
  if (profile.username === username) return profile // Safe retry after a lost response.
  const { data: taken, error: lookupError } = await api.from('profiles').select('id').eq('username', username).maybeSingle()
  if (lookupError) throw new UsernameChangeError('Could not check that username. Please try again.', 503)
  if (taken && taken.id !== user.id) throw new UsernameChangeError('That username is already taken.', 409)

  // The caller can only update their own verified Auth identity. No client target ID,
  // password, service key, or email is accepted. The SQL trigger makes this atomic.
  const { error } = await api.auth.admin.updateUserById(user.id, {
    email: `${username}@insideout.invalid`, email_confirm: true,
    user_metadata: { ...user.user_metadata, username },
  })
  if (error) {
    if (['email_exists', 'user_already_exists', '23505'].includes(error.code) || /already.*(registered|exists)|unique constraint/i.test(error.message)) {
      throw new UsernameChangeError('That username is already taken.', 409)
    }
    throw new UsernameChangeError('Could not change your username. Refresh your account and try again.', 503)
  }
  const { data: updated, error: reloadError } = await profileQuery()
  if (reloadError || updated?.username !== username) throw new UsernameChangeError('Could not confirm the change. Refresh your account before retrying.', 503)
  return updated
}
