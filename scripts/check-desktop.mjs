import { loadEnv } from 'vite'
import { readFileSync } from 'node:fs'

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env }
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key || url.includes('YOUR_PROJECT') || key.includes('YOUR_PUBLISHABLE')) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before packaging.')
}
const endpoint = new URL(url)
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.supabase.co') || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
  throw new Error('Desktop CSP expects an HTTPS *.supabase.co project URL. Review CSP explicitly for custom domains.')
}
let publicKey = key.startsWith('sb_publishable_')
if (!publicKey) {
  try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon' } catch { /* Invalid JWT. */ }
}
if (!publicKey) throw new Error('Only a Supabase publishable key or legacy anon key may be bundled. Never use secret/service-role keys.')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const version = json('package.json').version
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1]
const lock = readFileSync('src-tauri/Cargo.lock', 'utf8').match(/name = "inside-out"\r?\nversion = "([^"]+)"/)?.[1]
if ([json('src-tauri/tauri.conf.json').version, json('package-lock.json').version, cargo, lock].some((value) => value !== version)) {
  throw new Error('Keep package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json versions consistent.')
}
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error('The version tag must match the application version.')
}
console.log(`Desktop public configuration and version ${version} validated (values not logged).`)
