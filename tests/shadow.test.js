import test from 'node:test'
import assert from 'node:assert/strict'
import { maskText, shadowEnabled, SHADOW_KEY } from '../src/lib/shadow.js'
import { notifyMessage } from '../src/platform/notifications.js'

test('shadow words preserve whitespace, approximate size and never expose punctuation or source words', () => {
  const text='Are we meeting after work today?\nSecret https://example.com/password 😃\tclassified'
  const fake=maskText(text)
  assert.match(fake,/^[a-z\s]+$/)
  assert.equal(fake.split('\n').length,2)
  assert.equal(fake.split('\t').length,2)
  assert.ok(fake.length>text.length*0.6 && fake.length<text.length*1.6)
  for(const word of text.toLowerCase().match(/[a-z]+/g)) assert.ok(!fake.split(/\s/).includes(word))
  assert.equal(maskText(''), '')
  const samples=new Set(Array.from({length:5000},()=>maskText('secret')))
  assert.ok(samples.size>100,'large collection avoids obvious repetition')
  assert.ok(maskText('a'.repeat(300)).includes(' '),'long tokens still look like ordinary words')
})
test('notification delivery honors the current device privacy preference', async () => {
  const original={window:globalThis.window,localStorage:globalThis.localStorage,Notification:globalThis.Notification,isTauri:globalThis.isTauri}
  const data=new Map(), delivered=[]
  globalThis.window={}
  globalThis.localStorage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)}
  globalThis.Notification=class { static permission='granted'; constructor(title,options) {delivered.push({title,...options})} }
  globalThis.window.Notification=globalThis.Notification
  try {
    assert.equal(shadowEnabled(),false)
    data.set(SHADOW_KEY,'true')
    await notifyMessage({userId:'alice',messageId:'one',conversationId:'dm',title:'Bob',body:'private content'})
    assert.equal(delivered[0].body,'New message')
    assert.equal(delivered[0].title,'Bob')
    data.set(SHADOW_KEY,'false')
    await notifyMessage({userId:'alice',messageId:'two',conversationId:'dm',title:'Bob',body:'normal content'})
    assert.equal(delivered[1].body,'normal content')
    globalThis.isTauri=true
    data.set(SHADOW_KEY,'true')
    await notifyMessage({userId:'alice',messageId:'three',conversationId:'dm',title:'Bob',body:'desktop secret'})
    assert.equal(delivered[2].body,'New message')
    assert.deepEqual(delivered[2].extra,{conversationId:'dm'})
  } finally { for(const [key,value] of Object.entries(original)) { if(value===undefined) delete globalThis[key]; else globalThis[key]=value } }
})
