import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { externalLinkUrl } from '../src/platform/links.js'

const publicEnv = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }
function check(extra = {}) {
  return spawnSync(process.execPath, ['scripts/check-desktop.mjs'], { encoding: 'utf8', env: { ...process.env, ...publicEnv, ...extra } })
}
test('desktop packaging accepts public configuration without logging the key', () => {
  const result = check()
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!result.stdout.includes(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY))
})
test('desktop packaging rejects missing, secret and service-role credentials', () => {
  for (const key of ['', 'sb_secret_do_not_bundle', `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x`]) {
    const result = check({ VITE_SUPABASE_PUBLISHABLE_KEY: key })
    assert.notEqual(result.status, 0)
    if (key) assert.ok(!(result.stdout + result.stderr).includes(key))
  }
})
test('legacy anon keys remain valid; custom endpoints require explicit CSP review', () => {
  assert.equal(check({ VITE_SUPABASE_PUBLISHABLE_KEY: `x.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.x` }).status, 0)
  assert.notEqual(check({ VITE_SUPABASE_URL: 'https://example.com' }).status, 0)
  assert.notEqual(check({ VITE_SUPABASE_URL: 'http://example.supabase.co' }).status, 0)
})
test('version tags must match the bundled version', () => {
  assert.notEqual(check({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v999.0.0' }).status, 0)
})
test('external link adapter excludes script, file, data and application protocols', () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,test', 'tauri://localhost', 'not a URL']) assert.equal(externalLinkUrl(url), null)
  assert.equal(externalLinkUrl('https://example.com/help'), 'https://example.com/help')
})


test('desktop configuration validation accepts Windows CRLF checkouts', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inside-out-crlf-'))
  try {
    mkdirSync(join(cwd, 'src-tauri'))
    for (const file of ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json']) {
      writeFileSync(join(cwd, file), readFileSync(file, 'utf8').replace(/\r?\n/g, '\r\n'))
    }
    const result = spawnSync(process.execPath, [resolve('scripts/check-desktop.mjs')], { cwd, encoding: 'utf8', env: { ...process.env, ...publicEnv } })
    assert.equal(result.status, 0, result.stderr)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
