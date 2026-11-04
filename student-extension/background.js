import {
  digest,
  leaseValid,
  lockFromResponse,
  safeUrl,
  secret,
  track,
  trustedUi,
  trustedNotice,
  SECURITY_VERSION,
} from './protocol.js'
let registering = false
let lastStart = 0,
  failures = 0,
  nextAttempt = 0,
  opening = null
const lockUrl = chrome.runtime.getURL('lock.html')
const config = fetch(chrome.runtime.getURL('package-config.json')).then((r) => r.json())
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {})
async function stored() {
  return chrome.storage.local.get(null)
}
async function api(action, payload = {}, token) {
  const cfg = await config
  if (!/^https:\/\//.test(cfg.apiUrl || ''))
    throw Error('서버 주소가 설정되지 않았습니다. 교사에게 새 ZIP을 받으세요.')
  const response = await fetch(cfg.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload, securityVersion: SECURITY_VERSION }),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  let result
  try {
    result = await response.json()
  } catch {
    throw Error('서버 응답을 확인하지 못했습니다.')
  }
  if (!response.ok || !result.ok) {
    const e = Error(result.error || `통신 오류 ${response.status}`)
    e.status = response.status
    throw e
  }
  return result
}
async function recordAck(command, status, error) {
  const s = await stored()
  const acks = (s.acks || []).filter((a) => a.id !== command.id)
  acks.push({ id: command.id, status, error })
  await chrome.storage.local.set({ acks: acks.slice(-20) })
}
let lockTail = Promise.resolve()
function serializeLock(task) {
  const next = lockTail.then(task)
  lockTail = next.catch(() => {})
  return next
}
async function release(reason, hold = false, expiredOnly = false) {
  let previous
  await serializeLock(async () => {
    const s = await stored()
    if (expiredOnly && (!s.lock?.enabled || leaseValid(s.lock))) return
    previous = s
    await chrome.storage.local.set({
      lock: {
        ...(s.lock || {}),
        enabled: false,
        ...(hold ? { holdRevision: s.lock?.revision || 0 } : {}),
      },
      lockWindow: null,
      ...(hold ? { safetyReport: { revision: s.lock?.revision || 0, reason } } : {}),
    })
  })
  if (!previous) return
  if (Number.isInteger(previous.lockWindow)) {
    try {
      const win = await chrome.windows.get(previous.lockWindow, { populate: true })
      if (win.tabs?.some((t) => (t.url || t.pendingUrl || '') === lockUrl))
        await chrome.windows.remove(win.id)
    } catch {
      /* already closed */
    }
  }
}
async function health() {
  await release('통신 두절 또는 잠금 기한 만료로 안전 해제', true, true)
}
async function ensureWindow() {
  if (opening) return opening
  opening = (async () => {
    const s = await stored()
    if (!leaseValid(s.lock)) return
    const windows = await chrome.windows.getAll({ populate: true })
    const existing = windows.find((w) =>
      w.tabs?.some((t) => (t.url || t.pendingUrl || '') === lockUrl),
    )
    if (existing) {
      if (existing.state !== 'fullscreen')
        await chrome.windows.update(existing.id, { state: 'fullscreen', focused: true })
      await chrome.storage.local.set({ lockWindow: existing.id })
      return
    }
    const win = await chrome.windows.create({
      url: lockUrl,
      type: 'popup',
      state: 'fullscreen',
      focused: true,
    })
    const latest = await stored()
    if (!leaseValid(latest.lock)) {
      if (win.id) await chrome.windows.remove(win.id)
      return
    }
    await chrome.storage.local.set({ lockWindow: win.id })
  })().finally(() => (opening = null))
  return opening
}
async function apply(result) {
  if (result.state !== 'active') {
    await chrome.storage.local.set({
      registration: result.state,
      studentName: result.studentName || '',
      lastError: '',
    })
    await release('등록 승인 대기 또는 폐기')
    return
  }
  const old = await stored()
  let lock
  await serializeLock(async () => {
    const latest = await stored()
    lock = lockFromResponse(latest.lock, result)
    await chrome.storage.local.set({
      registration: 'active',
      studentId: result.studentId,
      studentName: result.studentName,
      className: result.className,
      monitoring: result.monitoring,
      recoveryHash: result.recoveryHash,
      lock,
      lastContact: Date.now(),
      lastError: '',
      ...(latest.monitoring !== result.monitoring ? { tracker: null, visits: [] } : {}),
    })
  })
  if (leaseValid(lock)) await ensureWindow()
  else await release('교사 해제 또는 만료')
  const seen = new Set(old.seen || [])
  for (const command of result.commands || []) {
    if (Date.parse(command.expires_at) <= Date.parse(result.serverTime)) continue
    if (seen.has(command.id)) {
      await recordAck(command, 'applied')
      continue
    }
    try {
      if (command.kind === 'lock') {
        const state = await stored()
        if (Number(command.revision) < Number(state.lock?.revision || 0) || !leaseValid(state.lock))
          throw Error('새 해제·만료 상태가 우선합니다.')
        await ensureWindow()
      } else if (command.kind === 'unlock') await release('교사 잠금 해제')
      else if (command.kind === 'notice') await showNotice(command)
      else if (command.kind === 'capture') await capture(command)
      seen.add(command.id)
      await chrome.storage.local.set({ seen: Array.from(seen).slice(-200) })
      await recordAck(command, 'applied')
    } catch (error) {
      await recordAck(command, 'failed', String(error.message || error).slice(0, 200))
    }
  }
}
const noticePending = new Map()
async function showNotice(command) {
  const url = chrome.runtime.getURL('notice.html') + '#' + command.id
  let timer, windowId
  const pending = { command, windowId: null, resolve: null }
  const ready = new Promise((resolve, reject) => {
    pending.resolve = resolve
    timer = setTimeout(() => reject(Error('공지 창 표시 확인 시간이 초과되었습니다.')), 10000)
  })
  ready.catch(() => {})
  noticePending.set(command.id, pending)
  try {
    const win = await chrome.windows.create({
      url,
      type: 'popup',
      focused: true,
      width: 760,
      height: 360,
    })
    windowId = win.id
    pending.windowId = win.id
    await ready
  } catch (error) {
    if (Number.isInteger(windowId)) await chrome.windows.remove(windowId).catch(() => {})
    throw error
  } finally {
    clearTimeout(timer)
    noticePending.delete(command.id)
  }
}
async function capture(command) {
  const s = await stored()
  if (leaseValid(s.lock)) throw Error('잠금 중에는 캡처할 수 없습니다. 먼저 해제하세요.')
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id || tab.incognito || !safeUrl(tab.url || ''))
    throw Error('일반 웹페이지를 활성화하세요.')
  const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 })
  const [after] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (
    after?.id !== tab.id ||
    after?.incognito ||
    safeUrl(after.url || '') !== safeUrl(tab.url || '')
  )
    throw Error('캡처 중 활성 탭이 바뀌어 업로드를 취소했습니다.')
  await api('capture', { commandId: command.id, image }, s.deviceSecret)
}
async function sample() {
  const s = await stored()
  if (s.securityVersion !== SECURITY_VERSION || !s.monitoring || s.registration !== 'active') return
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const focused = tab ? await chrome.windows.get(tab.windowId).catch(() => null) : null
  const result = track(
    s.tracker,
    focused?.focused && !tab.incognito ? tab.url || '' : '',
    tab?.title || '',
  )
  const visits = s.visits || []
  for (const entry of [result.completed, result.current])
    if (entry) {
      const value = {
        visitId: entry.visitId,
        url: entry.url,
        title: entry.title,
        duration: Math.floor(entry.duration),
      }
      const index = visits.findIndex((v) => v.visitId === entry.visitId)
      if (index >= 0) visits[index] = value
      else visits.push(value)
    }
  await chrome.storage.local.set({ tracker: result.current, visits: visits.slice(-50) })
}
let syncPromise
function sync(force = false) {
  if (syncPromise) return syncPromise
  syncPromise = runSync(force).finally(() => (syncPromise = null))
  return syncPromise
}
async function runSync(force = false) {
  await health()
  if (Date.now() - lastStart < 3000 || (!force && Date.now() < nextAttempt)) return
  const s = await stored()
  if (!s.deviceSecret) return
  if (s.securityVersion !== SECURITY_VERSION) {
    // Do not upload unsent activity gathered by an older privacy policy.
    await chrome.storage.local.set({
      securityVersion: SECURITY_VERSION,
      tracker: null,
      visits: [],
      lastSentVisit: null,
      lastTelemetrySent: 0,
    })
  }
  lastStart = Date.now()
  try {
    if (s.safetyReport) {
      await api('safety_release', { payload: s.safetyReport }, s.deviceSecret)
      await chrome.storage.local.remove('safetyReport')
    }
    const acks = s.acks || []
    const result = await api('poll', { payload: { acks } }, s.deviceSecret)
    // Keep ACKs created after this request started; remove only acknowledged IDs.
    const latest = await stored()
    await chrome.storage.local.set({
      acks: (latest.acks || []).filter((a) => !acks.some((sent) => sent.id === a.id)),
    })
    await apply(result)
    if (result.state === 'active' && result.monitoring) {
      await sample()
      const current = await stored()
      const visit = current.visits?.[0]
      if (
        visit &&
        (visit.visitId !== current.lastSentVisit ||
          Date.now() - Number(current.lastTelemetrySent || 0) >= 15000)
      ) {
        const response = await api('telemetry', { payload: visit }, s.deviceSecret)
        const snapshot = await stored()
        await chrome.storage.local.set({
          lastSentVisit: visit.visitId,
          lastTelemetrySent: Date.now(),
          visits: (snapshot.visits || []).filter(
            (v) => v.visitId !== visit.visitId || v.duration > visit.duration,
          ),
        })
        await apply(response)
      }
    }
    const confirmed = (await stored()).acks || []
    if (confirmed.length) {
      const reply = await api('ack', { payload: { acks: confirmed } }, s.deviceSecret)
      const latest = await stored()
      await chrome.storage.local.set({
        acks: (latest.acks || []).filter((a) => !confirmed.some((sent) => sent.id === a.id)),
      })
      await apply(reply)
    }
    failures = 0
    nextAttempt = 0
  } catch (error) {
    failures++
    nextAttempt =
      Date.now() + Math.min(60000, 2000 * 2 ** Math.min(failures, 5)) + Math.random() * 1000
    await chrome.storage.local.set({ lastError: String(error.message || error).slice(0, 200) })
    if (error.status === 401) {
      await release('인증 만료 또는 등록 폐기', true)
      await chrome.storage.local.set({ registration: 'revoked' })
    }
  }
}
async function init() {
  await chrome.alarms.create('classon-sync', { periodInMinutes: 0.5 })
  await health()
  void sync()
}
chrome.runtime.onInstalled.addListener(async () => {
  await init()
  await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') })
})
chrome.runtime.onStartup.addListener(init)
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'classon-sync') void sync()
})
chrome.tabs.onActivated.addListener(() => {
  void sync()
  void sample()
})
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && change.status === 'complete') {
    void sync()
    void sample()
  }
})
chrome.windows.onFocusChanged.addListener(() => {
  void sample()
  void sync()
})
chrome.windows.onRemoved.addListener(async (id) => {
  const s = await stored()
  if (id !== s.lockWindow || !leaseValid(s.lock)) return
  const now = Date.now()
  const attempts = (s.windowRestarts || []).filter((t) => now - t < 60000)
  if (attempts.length >= 3) {
    await release('잠금 창 반복 종료로 안전 해제', true)
    return
  }
  await chrome.storage.local.set({ windowRestarts: [...attempts, now], lockWindow: null })
  await ensureWindow().catch(async () => release('잠금 창 복구 실패', true))
})
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false
  if (m?.type === 'POLL' && sender.tab) {
    void sync()
    reply({ ok: true })
    return false
  }
  if (m?.type === 'NOTICE_READ' || m?.type === 'NOTICE_READY') {
    if (!trustedNotice(sender, chrome.runtime, m.id)) return false
    const pending = noticePending.get(m.id)
    if (!pending || (pending.windowId !== null && pending.windowId !== sender.tab?.windowId)) {
      reply({ ok: false, error: '이 공지는 만료되었습니다.' })
      return false
    }
    if (m.type === 'NOTICE_READ')
      reply({
        ok: true,
        text: String(pending.command.message).slice(0, 500),
        seconds: Math.min(60, Math.max(1, Number(pending.command.duration_seconds) || 5)),
      })
    else {
      pending.resolve()
      reply({ ok: true })
    }
    return false
  }
  if (!trustedUi(sender, chrome.runtime)) return false
  const task = async () => {
    if (m.type === 'STATUS') {
      const s = await stored()
      return {
        ok: true,
        state: s.registration || 'unregistered',
        className: s.className || '',
        name: s.studentName || '',
        monitoring: !!s.monitoring,
        error: s.lastError || '',
        lastContact: s.lastContact || null,
      }
    }
    if (m.type === 'REGISTER') {
      if (registering) throw Error('등록 요청을 처리 중입니다.')
      registering = true
      try {
        const current = await stored()
        if (['active', 'pending'].includes(current.registration))
          throw Error('이미 등록 신청한 기기입니다. 교사에게 수정·폐기를 요청하세요.')
        const key = current.registration === 'revoked' ? secret() : current.deviceSecret || secret()
        await chrome.storage.local.set({ deviceSecret: key })
        const result = await api('register', {
          code: String(m.code || '').trim(),
          name: String(m.name || '').trim(),
          number: Number(m.number),
          secret: key,
        })
        await chrome.storage.local.set({
          registration: result.state,
          studentId: result.studentId,
          studentName: result.studentName || String(m.name || '').trim(),
          lastError: '',
          tracker: null,
          visits: [],
          seen: [],
          acks: [],
          lock: { enabled: false, revision: 0 },
          recoveryHash: null,
          safetyReport: null,
          className: '',
        })
        void sync(true)
        return { ok: true, state: result.state }
      } finally {
        registering = false
      }
    }
    if (m.type === 'HELP') {
      const s = await stored()
      await api('help', {}, s.deviceSecret)
      return { ok: true }
    }
    if (m.type === 'RECOVER') {
      const s = await stored()
      const now = Date.now()
      const attempts = (s.recoveryAttempts || []).filter((t) => now - t < 60000)
      if (attempts.length >= 5) throw Error('1분 후 다시 시도하세요.')
      await chrome.storage.local.set({ recoveryAttempts: [...attempts, now] })
      if (!s.recoveryHash || (await digest(String(m.code || '').trim())) !== s.recoveryHash)
        throw Error('교사 비상 해제 코드를 확인하세요.')
      await release('교사 코드로 비상 해제', true)
      await sync(true)
      return { ok: true }
    }
    if (m.type === 'HEALTH') {
      await health()
      return { ok: true }
    }
    if (m.type === 'SYNC') {
      await sync(true)
      return { ok: true }
    }
    throw Error('지원하지 않는 요청입니다.')
  }
  task()
    .then(reply)
    .catch((error) => reply({ ok: false, error: String(error.message || error).slice(0, 200) }))
  return true
})
void init()
// Best effort while awake; MV3 sleep is handled by alarms + visible page/lock wakeups.
setInterval(() => void sync(), 5000)
