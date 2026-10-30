import { useRef, useState } from 'react'
import { AtSign, Search, Plus } from 'lucide-react'
import { findUser } from '../services/chatService'
import { errorMessage, validUsername } from '../lib/chat'
import { Avatar, ErrorNotice } from './Shared'

export default function UserLookup({ userId, onSelect, selectedIds = [], action = 'Add', disabled = false }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)
  async function search(event) {
    event.preventDefault()
    if (!validUsername(query)) { setError('Enter an exact username: 3–24 letters, numbers, or underscores.'); return }
    const request = ++version.current
    setBusy(true); setError(''); setResult(null); setSearched(false)
    try {
      const user = await findUser(query)
      if (request === version.current) { setResult(user); setSearched(true) }
    } catch (err) { if (request === version.current) setError(errorMessage(err)) }
    finally { if (request === version.current) setBusy(false) }
  }
  const selected = result && selectedIds.includes(result.id)
  return <div className="lookup"><form onSubmit={search}><label htmlFor="lookup-username">Find a friend by exact username</label><div className="search-row"><div className="input-with-icon"><AtSign size={17} /><input id="lookup-username" placeholder="exact_username" maxLength={24} autoComplete="off" autoCapitalize="none" spellCheck={false} value={query} onChange={(event) => { version.current++; setQuery(event.target.value); setSearched(false); setResult(null); setBusy(false); setError('') }} required /></div><button className="button secondary" disabled={busy || disabled} type="submit"><Search size={16} />{busy ? 'Searching…' : 'Search'}</button></div></form><ErrorNotice>{error}</ErrorNotice>{searched && !result && <p className="empty-result">User not found. Check the exact username.</p>}{result && <div className="user-result"><Avatar name={result.display_name} /><div><strong>{result.display_name}</strong><span>@{result.username}</span></div><button className="button secondary" disabled={disabled || selected || result.id === userId} onClick={() => onSelect(result)}>{result.id === userId ? 'You' : selected ? 'Added' : <><Plus size={15} />{action}</>}</button></div>}<p className="field-hint">No directory. No suggestions. Just the people you know.</p></div>
}
