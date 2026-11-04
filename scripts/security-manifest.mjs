import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
const files = {}
const record = async (path) => {
  files[path] = createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}
for (const file of execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'])
  .toString()
  .split('\0')
  .filter(Boolean))
  if (!file.startsWith('artifacts/')) await record(file)
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) await walk(path + '/' + entry.name)
    else await record(path + '/' + entry.name)
  }
}
await walk('dist')
const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()
await mkdir('artifacts', { recursive: true })
await writeFile(
  'artifacts/security-manifest.json',
  JSON.stringify(
    {
      time: new Date().toISOString(),
      algorithm: 'sha256',
      baseline_head: head,
      working_tree_modified: Boolean(
        execFileSync('git', ['status', '--porcelain']).toString().trim(),
      ),
      note: 'HEAD does not identify uncommitted source. Hashes include working files and final build; no environment files or credential values.',
      files,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Recorded ${Object.keys(files).length} source/build hashes`)
