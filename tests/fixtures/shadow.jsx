import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import MessageList from '../../src/components/MessageList'
import { useShadowMode } from '../../src/hooks/useShadowMode'
import '../../src/index.css'
const incoming={id:'one',sender_id:'bob',content:'Hidden incoming secret',created_at:new Date().toISOString(),kind:'text'}
const outgoing={...incoming,id:'two',sender_id:'alice',content:'Hidden outgoing secret'}
const image={...incoming,id:'image',content:'Hidden caption',kind:'image',image:{storage_path:'fake.png',state:'ready',expires_at:new Date(Date.now()+1000000).toISOString(),width:100,height:100}}
export default function Harness() {
  const shadow=useShadowMode(), [tick,setTick]=useState(0), [extra,setExtra]=useState(false), [conversation,setConversation]=useState('a')
  return <><button onClick={shadow.toggle}>Shadow {String(shadow.enabled)}</button><button onClick={()=>setTick(tick+1)}>Rerender {tick}</button><button onClick={()=>setExtra(true)}>Receive</button><button onClick={()=>setConversation(conversation==='a'?'b':'a')}>Switch conversation</button><div style={{height:500,display:'flex'}}><MessageList key={conversation+shadow.enabled} messages={[incoming,outgoing,image,...(extra?[{...incoming,id:'new',content:'New incoming secret'}]:[])]} members={[]} userId="alice" title="Bob" reactions={[]} shadow={shadow.enabled} loading={false} /></div></>
}
createRoot(document.getElementById('root')).render(<Harness />)
