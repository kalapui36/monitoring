import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { zipSync } from 'fflate'
import { RELEASE_VERSION } from '../src/release.ts'
const files = {}
async function add(path, prefix = '') {
  for (const e of await readdir(path, { withFileTypes: true })) {
    if (e.isDirectory()) await add(path + '/' + e.name, prefix + e.name + '/')
    else files[prefix + e.name] = new Uint8Array(await readFile(path + '/' + e.name))
  }
}
await add('dist')
const info = JSON.parse(new TextDecoder().decode(files['version.json']))
if (info.demoData !== false || info.mode !== 'personal-supabase')
  throw Error('Unexpected build mode')
if (!files['SETUP.html'] || !files['index.html']) throw Error('Missing setup entry')
await mkdir('artifacts', { recursive: true })
await writeFile(`artifacts/monitoring-web-${RELEASE_VERSION}.zip`, zipSync(files, { level: 6 }))
console.log(
  `Prepared ${Object.keys(files).length} static files: artifacts/monitoring-web-${RELEASE_VERSION}.zip`,
)
