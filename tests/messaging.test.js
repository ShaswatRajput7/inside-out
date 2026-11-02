import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { insertEmoji, groupReactions, imageExpired, canReact, notificationText, MAX_IMAGE_BYTES } from '../src/lib/messaging.js'
import { fitImageDimensions, validateImageFile } from '../src/lib/images.js'
import { claimNotification } from '../src/platform/notifications.js'
import { cleanImage, runCleanup } from '../supabase/functions/cleanup-images/worker.js'
const require = createRequire(import.meta.url)

test('emoji insertion respects UTF-16 selection/cursor positions and supports multi-codepoint emoji', () => {
  assert.deepEqual(insertEmoji('Hi friend',3,9,'👩🏽‍💻'),{text:'Hi 👩🏽‍💻',cursor:10})
  const first=insertEmoji('',0,0,'🏳️‍🌈')
  const second=insertEmoji(first.text,first.cursor,first.cursor,'👨‍👩‍👧‍👦')
  assert.equal(second.text,'🏳️‍🌈👨‍👩‍👧‍👦')
  assert.equal(second.cursor,second.text.length)
  assert.equal(insertEmoji('a😀b',3,3,'🌻').text,'a😀🌻b')
})
test('full picker data includes every category, search names and skin-tone variations', () => {
  const data=require('@emoji-mart/data')
  for(const category of ['people','nature','foods','activity','places','objects','symbols','flags'])assert.ok(data.categories.some((item)=>item.id===category))
  assert.ok(Object.keys(data.emojis).length>1800)
  assert.ok(data.emojis['female-technologist'].skins.some((skin)=>skin.native==='👩🏽‍💻'))
  assert.ok(data.emojis['female-technologist'].keywords.includes('developer'))
})
test('reactions count users per exact Unicode sequence and highlight the current user', () => {
  assert.deepEqual(groupReactions([{emoji:'👍🏽',user_id:'a'},{emoji:'👍🏽',user_id:'b'},{emoji:'👍',user_id:'a'},{emoji:'🌻',user_id:'a',removed_at:'now'}],'a'),[{emoji:'👍🏽',count:2,mine:true},{emoji:'👍',count:1,mine:true}])
})
test('expired/deleted images never qualify for reactions or new unread notifications', () => {
  const now=100000
  const image={state:'ready',expires_at:new Date(now+1).toISOString()}
  assert.equal(imageExpired(image,now),false)
  assert.equal(imageExpired(image,now+1),true)
  assert.equal(canReact({kind:'image',image},now+1),false)
  assert.equal(canReact({kind:'text',deleted_at:'now'},now),false)
  assert.equal(notificationText({kind:'image'}),'Sent an image')
  assert.equal(notificationText({kind:'text',content:'👩🏽‍💻 hello'}),'👩🏽‍💻 hello')
})
test('notification claims prevent duplicate delivery across tabs sharing storage', () => {
  const map=new Map(), storage={getItem:(key)=>map.get(key),setItem:(key,value)=>map.set(key,value)}
  assert.equal(claimNotification(storage,'alice','one'),true)
  assert.equal(claimNotification(storage,'alice','one'),false)
  assert.equal(claimNotification(storage,'bob','one'),true)
})
test('image dimensions preserve aspect ratio, avoid upscaling and cap the long side', () => {
  assert.deepEqual(fitImageDimensions(4000,2000),{width:1600,height:800})
  assert.deepEqual(fitImageDimensions(2000,4000),{width:800,height:1600})
  assert.deepEqual(fitImageDimensions(300,200),{width:300,height:200})
  assert.equal(MAX_IMAGE_BYTES,512000)
})
test('file validation rejects GIFs, disguised files and originals over 15 MB', async () => {
  const jpeg=new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})
  await validateImageFile(jpeg)
  await assert.rejects(validateImageFile(new Blob(['GIF89a'],{type:'image/gif'})),/JPEG, PNG, or WebP/)
  await assert.rejects(validateImageFile(new Blob(['GIF89a'],{type:'image/png'})),/not a supported image/)
  await assert.rejects(validateImageFile({type:'image/jpeg',size:15*1024*1024+1}),/15 MB/)
})
function fakeStorage({failures=0,missing=false,permanent=false}={}) {
  const calls=[]
  return {calls,storage:{from:(bucket)=>({remove:async(paths)=>{calls.push(['remove',bucket,paths]);return {error:missing?{statusCode:'404'}:permanent||failures-->0?{message:'transient failure'}:null}}})},rpc:async(name,args)=>{calls.push([name,args]);return {error:null}}}
}
test('cleanup retries transient Storage failures and only marks completion after actual API removal', async () => {
  const api=fakeStorage({failures:1})
  assert.equal(await cleanImage(api,{id:'image',storage_path:'chat/user/image.webp'},async()=>{}),true)
  assert.equal(api.calls.filter(([name])=>name==='remove').length,2)
  assert.equal(api.calls.at(-1)[0],'complete_image_cleanup')
})
test('cleanup treats missing files as success and retains failures for later retries', async () => {
  const missing=fakeStorage({missing:true})
  assert.equal(await cleanImage(missing,{id:'i',storage_path:'missing'},async()=>{}),true)
  const failure=fakeStorage({permanent:true})
  assert.equal(await cleanImage(failure,{id:'i',storage_path:'path'},async()=>{}),false)
  assert.equal(failure.calls.filter(([name])=>name==='remove').length,3)
  assert.equal(failure.calls.at(-1)[0],'fail_image_cleanup')
  assert.ok(!failure.calls.some(([name])=>name==='complete_image_cleanup'))
})
test('cleanup runner drains claimed batches without touching internal Storage tables', async () => {
  const api=fakeStorage()
  let claims=0
  const rpc=api.rpc
  api.rpc=async(name,args)=>name==='claim_image_cleanup'?{data:claims++===0?[{id:'a',storage_path:'a.webp'},{id:'b',storage_path:'b.webp'}]:[],error:null}:rpc(name,args)
  assert.deepEqual(await runCleanup(api),{removed:2,failed:0})
})
