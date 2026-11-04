import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PRODUCTION_CSP } from '../src/security-policy.ts'
let html = await readFile('dist/index.html', 'utf8')
html = html.replace(
  '<head>',
  `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />\n    <meta name="referrer" content="no-referrer" />`,
)
// Integrity protects asset mismatches/CDN modifications when the HTML remains trusted.
// It cannot protect against an attacker who can replace the HTML as well.
for (const match of [...html.matchAll(/<(script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)]) {
  const [tag, , url] = match
  const asset = /(?:^|\/)assets\/([\w.-]+\.(?:js|css))$/.exec(url)
  if (!asset) throw Error('Unexpected production asset path')
  const bytes = await readFile(`dist/assets/${asset[1]}`)
  const digest = createHash('sha384').update(bytes).digest('base64')
  html = html.replace(tag, tag.replace(/>$/, ` integrity="sha384-${digest}">`))
}
await writeFile('dist/index.html', html)
