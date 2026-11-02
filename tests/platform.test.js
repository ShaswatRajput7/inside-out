import test from 'node:test'
import assert from 'node:assert/strict'
import { isDesktop, getRuntime } from '../src/platform/index.js'

test('platform utility works without a window, including Node and build tooling', () => {
  assert.equal(isDesktop(), false)
  assert.equal(getRuntime(), 'browser')
})

test('platform utility distinguishes an ordinary browser from a Tauri webview', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'isTauri')
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'isTauri', original)
    else delete globalThis.isTauri
  })
  // The official API reads the runtime marker injected by Tauri v2.
  Object.defineProperty(globalThis, 'isTauri', { value: false, configurable: true })
  assert.equal(isDesktop(), false)
  assert.equal(getRuntime(), 'browser')
  Object.defineProperty(globalThis, 'isTauri', { value: true, configurable: true })
  assert.equal(isDesktop(), true)
  assert.equal(getRuntime(), 'tauri')
})
