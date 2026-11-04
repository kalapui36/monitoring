import { internalActivity } from './activity.js'
export function safeUrl(value) {
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol)) return ''
    u.username = ''
    u.password = ''
    u.search = ''
    u.hash = ''
    return u.href.slice(0, 2048)
  } catch {
    return ''
  }
}
export function leaseValid(state, now = Date.now()) {
  return !!state?.enabled && now >= state.lastContact && now < state.leaseUntil
}
export function lockFromResponse(previous, response, now = Date.now()) {
  const lock = response.lock || { revision: 0, enabled: false }
  const revision = Number(lock.revision) || 0
  if (revision < Number(previous?.revision || 0)) return previous
  const serverTime = Date.parse(response.serverTime)
  if (!Number.isFinite(serverTime) || serverTime < Number(previous?.serverTime || 0))
    return previous
  const remaining = Date.parse(lock.expiresAt) - serverTime
  const held = revision <= Number(previous?.holdRevision || 0)
  return {
    revision,
    enabled: !held && lock.enabled === true && remaining > 0,
    message: String(lock.message || '선생님의 안내를 확인하세요.').slice(0, 500),
    lastContact: now,
    leaseUntil: now + Math.min(120000, Math.max(0, remaining || 0)),
    serverTime,
    holdRevision: held ? previous?.holdRevision || 0 : 0,
  }
}
export function track(previous, url, title, now = Date.now(), newId = () => crypto.randomUUID()) {
  const internal = internalActivity(url)
  const clean = internal?.url || safeUrl(url)
  const displayTitle = internal?.title || String(title || '').slice(0, 200)
  const elapsed = previous ? Math.max(0, Math.min(30000, now - previous.lastSample)) / 1000 : 0
  const updated = previous
    ? { ...previous, duration: previous.duration + elapsed, lastSample: now }
    : null
  if (!clean) return { current: null, completed: updated }
  if (updated?.url === clean)
    return { current: { ...updated, title: displayTitle }, completed: null }
  return {
    current: {
      visitId: newId(),
      url: clean,
      title: displayTitle,
      duration: 0,
      lastSample: now,
    },
    completed: updated,
  }
}
export async function digest(value) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
export function secret() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
export function trustedUi(sender, runtime) {
  return (
    sender?.id === runtime.id &&
    ['setup.html', 'lock.html'].some((path) => sender.url === runtime.getURL(path))
  )
}

export function trustedNotice(sender, runtime, id) {
  return (
    typeof id === 'string' &&
    /^[a-f0-9-]{36}$/i.test(id) &&
    sender?.id === runtime.id &&
    Number.isInteger(sender.tab?.windowId) &&
    sender.url === runtime.getURL('notice.html') + '#' + id
  )
}

export const SECURITY_VERSION = 2
