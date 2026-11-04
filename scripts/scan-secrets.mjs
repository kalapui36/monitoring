// Pattern scan of all locally reachable Git blobs, working source and the build.
// Never prints matched values; this cannot prove that every possible secret is absent.
import { execFileSync } from 'node:child_process'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
const matches = [],
  patterns = [
    ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
    ['supabase_secret', /\bsb_secret_[A-Za-z0-9_-]{24,}\b/g],
    ['google_client_secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g],
  ]
let working = 0,
  blobs = 0,
  built = 0
function scan(label, bytes) {
  const text = bytes.toString('utf8')
  for (const [kind, re] of patterns) {
    re.lastIndex = 0
    for (const m of text.matchAll(re))
      matches.push({ file: label, line: text.slice(0, m.index).split('\n').length, kind })
  }
  for (const m of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\b/g)) {
    try {
      if (
        JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString()).role === 'service_role'
      )
        matches.push({
          file: label,
          line: text.slice(0, m.index).split('\n').length,
          kind: 'service_role_jwt',
        })
    } catch {}
  }
}
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'])
  .toString()
  .split('\0')
  .filter(Boolean)
for (const file of files) {
  if (file.startsWith('artifacts/')) continue
  scan(file, await readFile(file))
  working++
}
const objects = execFileSync('git', ['rev-list', '--objects', '--all'])
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean)
for (const object of objects) {
  const id = object.split(' ')[0]
  if (!/^[a-f0-9]{40,64}$/.test(id)) throw Error('Unexpected Git object ID')
  const type = execFileSync('git', ['cat-file', '-t', id]).toString().trim()
  if (type === 'blob') {
    scan('git:' + id, execFileSync('git', ['cat-file', 'blob', id]))
    blobs++
  }
}
async function build(path) {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch (e) {
    if (e.code === 'ENOENT') return
    throw e
  }
  for (const entry of entries) {
    const file = path + '/' + entry.name
    if (entry.isDirectory()) await build(file)
    else {
      scan(file, await readFile(file))
      built++
    }
  }
}
await build('dist')
const report = {
  scope: 'known-pattern scan; no credential values included',
  time: new Date().toISOString(),
  working_files: working,
  git_blobs: blobs,
  build_files: built,
  findings: matches,
}
await mkdir('artifacts', { recursive: true })
await writeFile('artifacts/secret-scan.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
if (matches.length) process.exitCode = 1
