import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BUILTIN_THEMES, DEFAULT_THEME, normalizeTheme } from '../src/lib/themes.js'

const cid = '00000000-0000-0000-0000-000000000001'
test('curated themes have unique persistent keys and small, bundled artwork', async () => {
  assert.ok(BUILTIN_THEMES.length >= 5)
  assert.equal(new Set(BUILTIN_THEMES.map(({ key }) => key)).size, BUILTIN_THEMES.length)
  for (const theme of BUILTIN_THEMES) {
    const asset = await readFile(new URL(theme.image))
    assert.ok(asset.byteLength > 0 && asset.byteLength <= 512000)
    if (new URL(theme.image).pathname.endsWith('.svg')) {
      assert.ok(asset.toString().startsWith('<svg'))
      assert.doesNotMatch(asset.toString(), /<script|https?:\/\/(?!www.w3.org)/)
    }
    assert.equal(normalizeTheme({ conversation_id: cid, kind: 'builtin', builtin_key: theme.key }, cid).builtin_key, theme.key)
  }
})
test('absent, invalid, foreign or unsafe metadata safely resolves to the default', () => {
  const base = { conversation_id: cid, kind: 'custom', custom_path: `${cid}/${cid}/${cid}.webp` }
  assert.equal(normalizeTheme(base, cid), base)
  for (const value of [null, {}, { kind: 'unknown' }, { ...base, conversation_id: 'another-chat' },
    { ...base, custom_path: 'https://external.invalid/image.jpg' }, { ...base, custom_path: `${cid}/${cid}/${cid}.gif` },
    { ...base, custom_path: `${cid}/${cid}/../../other.png` }, { ...base, custom_path: `${cid}/${'-'.repeat(36)}/${cid}.png` },
    { ...base, builtin_key: 'neon-rain' }, { conversation_id: cid, kind: 'builtin', builtin_key: 'missing' }]) {
    assert.equal(normalizeTheme(value, cid), DEFAULT_THEME)
  }
})
