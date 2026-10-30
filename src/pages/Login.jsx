import { useState } from 'react'
import { ArrowRight, AtSign, LockKeyhole, MessageCircle, Users, ShieldCheck } from 'lucide-react'
import { Brand, ErrorNotice } from '../components/Shared'
import { supabase } from '../services/supabase'
import { errorMessage, normalizeUsername, usernameEmail, validUsername } from '../lib/chat'

export default function Login() {
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!validUsername(username)) { setError('Use 3–24 letters, numbers, or underscores for your username.'); return }
    setBusy(true)
    try {
      const credentials = { email: usernameEmail(username), password }
      const { data, error: authError } = register
        ? await supabase.auth.signUp({ ...credentials, options: { data: { username: normalizeUsername(username) } } })
        : await supabase.auth.signInWithPassword(credentials)
      if (authError) throw authError
      if (register && !data.session) throw new Error('Email confirmation must be disabled in Supabase. Ask the app owner to check the setup instructions.')
    } catch (err) {
      setError(/already registered|database error saving new user/i.test(err.message) ? 'That username may already be taken. Try another username, or ask the app owner to check the database setup.' : errorMessage(err))
    } finally { setBusy(false) }
  }
  return <main className="auth-shell">
    <section className="auth-story"><Brand /><div className="story-main"><span className="eyebrow">YOUR PEOPLE. YOUR SPACE.</span><h1>Good conversations<br />start from <span>within.</span></h1><p>A little closer to your friends.<br />A little further from the noise.</p><div className="chat-illustration" aria-hidden="true"><div className="floating-bubble bubble-one"><MessageCircle size={24} /><span>Just us, catching up.</span></div><div className="floating-bubble bubble-two"><span>Feels like being there.</span><span>✦</span></div><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="illustration-center"><MessageCircle size={52} strokeWidth={1.3} /></div></div></div><div className="story-footer"><ShieldCheck size={15} /> A private place for your circle</div></section>
    <section className="auth-form-panel"><div className="mobile-brand"><Brand /></div><div className="auth-card"><div className="mini-label"><span className="status-dot" /> LESS NOISE, MORE CONNECTION</div><h2>{register ? 'Make yourself at home.' : 'Welcome back.'}</h2><p className="muted">{register ? 'Your next good conversation is one sign-up away.' : 'Your people are just a conversation away.'}</p><div className="auth-tabs"><button className={!register ? 'active' : ''} onClick={() => { setRegister(false); setError('') }}>Log in</button><button className={register ? 'active' : ''} onClick={() => { setRegister(true); setError('') }}>Create account</button></div><form onSubmit={submit}><label htmlFor="username">Username</label><div className="input-with-icon"><AtSign size={17} /><input id="username" autoComplete="username" placeholder="your_username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} required autoCapitalize="none" spellCheck={false} /></div>{register && <p className="field-hint">3–24 letters, numbers, or underscores. No email needed.</p>}<label htmlFor="password">Password</label><div className="input-with-icon"><LockKeyhole size={17} /><input id="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 8 characters' : 'Your password'} minLength={register ? 8 : 1} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required /></div><ErrorNotice>{error}</ErrorNotice><button className="button primary auth-submit" disabled={busy}>{busy ? 'One moment…' : register ? 'Create account' : 'Let’s catch up'}<ArrowRight size={17} /></button></form><p className="auth-note"><Users size={15} /> Made for friends. Built for real conversations.</p></div><span className="auth-bottom">A small space. A closer circle.</span></section>
  </main>
}
