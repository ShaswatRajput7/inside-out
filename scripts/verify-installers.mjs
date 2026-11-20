import { readdir, stat, readFile, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const [target, bundles] = process.argv.slice(2)
if (!target || !bundles || !/^[a-z0-9_-]+$/.test(target)) throw new Error('Usage: node scripts/verify-installers.mjs <target> <comma-separated bundles>')
const root = join('src-tauri', 'target', target, 'release', 'bundle')
const extensions = { dmg: '.dmg', deb: '.deb', appimage: '.AppImage', nsis: '.exe' }
const records = []
for (const kind of bundles.split(',')) {
  if (!extensions[kind]) throw new Error(`Unsupported bundle: ${kind}`)
  const directory = join(root, kind)
  const files = (await readdir(directory)).filter((name) => name.endsWith(extensions[kind]))
  if (!files.length) throw new Error(`Missing ${kind} installer in ${directory}`)
  for (const name of files) {
    const path = join(directory, name)
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size === 0) throw new Error(`Empty installer: ${path}`)
    records.push({ file: `${kind}/${name}`, bytes: metadata.size, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
  }
}
const manifest = { version: JSON.parse(await readFile('package.json', 'utf8')).version, target, commit: process.env.GITHUB_SHA || null, installers: records }
await writeFile(join(root, 'installers.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${target}\n\n| Installer | Bytes | SHA-256 |\n| --- | ---: | --- |\n${records.map((r) => `| ${r.file} | ${r.bytes} | \`${r.sha256}\` |`).join('\n')}\n`)
}
