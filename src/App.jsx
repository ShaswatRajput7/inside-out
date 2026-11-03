import { Settings2 } from 'lucide-react'
import { isConfigured, supabase } from './services/supabase'
import { useAuth } from './hooks/useAuth'
import { Brand, ErrorNotice, Spinner } from './components/Shared'
import Login from './pages/Login'
import Chat from './pages/Chat'

export default function App() {
  const { user, profile, loading, error, updateProfile } = useAuth()
  if (!isConfigured) return <main className="setup-screen"><div className="setup-card"><Brand /><div className="setup-icon"><Settings2 size={28} /></div><h1>Your space is almost ready.</h1><p>Connect Inside Out to your Supabase project to bring your people together.</p><ol><li>Run <code>supabase/migrations/001_inside_out.sql</code> in the Supabase SQL Editor.</li><li>Enable email/password sign-in and turn off email confirmation.</li><li>Copy <code>.env.example</code> to <code>.env</code> and add your project URL and publishable key.</li><li>Restart the development server.</li></ol><span className="field-hint">The README has the complete setup steps.</span></div></main>
  if (loading) return <main className="full-screen-loading"><Brand /><Spinner label="Making yourself at home…" /></main>
  if (error) return <main className="setup-screen"><div className="setup-card"><Brand /><h1>Couldn’t open your account.</h1><ErrorNotice>{error}</ErrorNotice><p>Check the Supabase migration and your connection, then try again.</p><div className="flex gap-3"><button className="button primary" onClick={() => location.reload()}>Retry</button><button className="button secondary" onClick={() => supabase.auth.signOut({ scope: 'local' })}>Log out</button></div></div></main>
  return user && profile ? <Chat key={user.id} profile={profile} onProfileChanged={updateProfile} /> : <Login />
}
