// @vitest-environment node
import { afterEach } from 'vitest'
const drains: (() => Promise<unknown>)[] = []
type Handler = (
  message: Record<string, unknown>,
  sender: { id: string; url?: string; tab?: unknown },
  reply: (r: any) => void,
) => boolean
async function worker() {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  let clock = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  const values: Record<string, any> = {},
    requests: Record<string, any>[] = [],
    windows: Record<string, any>[] = [],
    noticeReads: unknown[] = []
  let handler: Handler = () => false
  let nextWindow = 2
  const noop = { addListener: vi.fn() }
  const runtime = {
    id: 'own',
    getURL: (path: string) => 'chrome-extension://own/' + path,
    onMessage: { addListener: vi.fn((fn: Handler) => (handler = fn)) },
    onInstalled: noop,
    onStartup: noop,
  }
  const storage = {
    get: vi.fn(async () => structuredClone(values)),
    set: vi.fn(async (v: Record<string, any>) => {
      Object.assign(values, structuredClone(v))
    }),
    remove: vi.fn(async (key: string) => {
      delete values[key]
    }),
    setAccessLevel: vi.fn().mockResolvedValue(undefined),
  }
  const chrome = {
    runtime,
    storage: { local: storage },
    alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: noop },
    scripting: { executeScript: vi.fn().mockResolvedValue(undefined) },
    tabs: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      query: vi
        .fn()
        .mockResolvedValue([{ id: 1, windowId: 1, url: 'https://example.test/', title: '수업' }]),
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      captureVisibleTab: vi.fn().mockResolvedValue('data:image/jpeg;base64,/9j/AAAAAA=='),
      onActivated: noop,
      onUpdated: noop,
    },
    windows: {
      get: vi.fn(async (id: number) => windows.find((w) => w.id === id) || { id, focused: true }),
      getAll: vi.fn(async () => windows),
      create: vi.fn(async (options: Record<string, any>) => {
        const w = {
          id: nextWindow++,
          state: options.state || 'normal',
          tabs: [{ url: options.url }],
        }
        windows.push(w)
        if (options.url.includes('notice.html#'))
          setTimeout(() => {
            const sender = { id: runtime.id, url: options.url, tab: { windowId: w.id } }
            const id = options.url.split('#')[1]
            handler({ type: 'NOTICE_READ', id }, sender, (r) => noticeReads.push(r))
            handler({ type: 'NOTICE_READY', id }, sender, () => {})
          }, 0)
        return w
      }),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn(async (id: number) => {
        const i = windows.findIndex((w) => w.id === id)
        if (i >= 0) windows.splice(i, 1)
      }),
      onFocusChanged: noop,
      onRemoved: noop,
    },
  }
  const server = {
    active: false,
    monitoring: false,
    lock: false,
    revision: 1,
    commands: [] as Record<string, unknown>[],
  }
  const snapshot = () => ({
    ok: true,
    state: server.active ? 'active' : 'pending',
    studentId: 'student-a',
    studentName: '테스트',
    className: '실제 학급',
    monitoring: server.monitoring,
    serverTime: new Date(clock).toISOString(),
    commands: server.commands,
    lock: {
      revision: server.revision,
      enabled: server.lock,
      message: '집중',
      expiresAt: new Date(clock + 300000).toISOString(),
    },
  })
  vi.stubGlobal('chrome', chrome)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      if (!options)
        return new Response(JSON.stringify({ apiUrl: 'https://project.test/functions/v1/device' }))
      const body = JSON.parse(options.body)
      requests.push(body)
      if (body.action === 'register')
        return new Response(
          JSON.stringify({
            ok: true,
            state: 'pending',
            studentId: 'student-a',
            studentName: '테스트',
          }),
        )
      if (body.action === 'ack') {
        server.commands = []
        return new Response(JSON.stringify(snapshot()))
      }
      return new Response(JSON.stringify(snapshot()))
    }),
  )
  await import('../student-extension/background.js')
  const send = (message: Record<string, unknown>, url = runtime.getURL('setup.html')) =>
    new Promise<any>((resolve, reject) => {
      const accepted = handler(message, { id: runtime.id, url }, resolve)
      if (!accepted) reject(Error('rejected'))
    })
  await new Promise((r) => setTimeout(r, 0))
  drains.push(() => send({ type: 'SYNC' }))
  return {
    values,
    noticeReads,
    server,
    requests,
    chrome,
    send,
    tick: () => {
      clock += 5000
    },
    advance: (ms: number) => (clock += ms),
  }
}
afterEach(async () => {
  for (const drain of drains.splice(0)) await drain()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('실제 MV3 worker의 Chrome API 모의 통합', () => {
  it('등록 신청은 pending이며 STATUS로 기기 비밀을 노출하지 않는다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    await new Promise((r) => setTimeout(r, 0))
    const status = await w.send({ type: 'STATUS' })
    expect(status.state).toBe('pending')
    expect(status.deviceSecret).toBeUndefined()
    expect(w.values.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(w.requests[0].action).toBe('register')
    await expect(w.send({ type: 'REGISTER', code: 'x' }, 'https://evil.test')).rejects.toThrow(
      'rejected',
    )
  })
  it('승인된 명령만 잠금 창을 만들고 통신 lease 만료 후 안전 해제한다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    await new Promise((r) => setTimeout(r, 0))
    w.server.active = true
    w.server.lock = true
    w.server.commands = [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: 'lock',
        message: '집중',
        duration_seconds: 300,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      },
    ]
    w.tick()
    await w.send({ type: 'SYNC' })
    expect(w.chrome.windows.create).toHaveBeenCalledTimes(1)
    expect(w.values.lock.enabled).toBe(true)
    expect(
      w.requests.some((r) => r.action === 'ack' && r.payload.acks[0].status === 'applied'),
    ).toBe(true)
    w.advance(121000)
    await w.send({ type: 'HEALTH' }, 'chrome-extension://own/lock.html')
    expect(w.values.lock.enabled).toBe(false)
    expect(w.chrome.windows.remove).toHaveBeenCalledWith(2)
    expect(w.values.safetyReport).toBeDefined()
  })
  it('학생 도움 요청은 인증된 서버 요청으로 보내고 임의 웹 메시지는 거부한다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    w.server.active = true
    await w.send({ type: 'HELP' })
    expect(w.requests.some((r) => r.action === 'help')).toBe(true)
    await expect(w.send({ type: 'HELP' }, 'https://evil.test')).rejects.toThrow('rejected')
  })
  it('공지 원문을 웹페이지에 전송하지 않고 확장 창의 실제 표시 확인 후 ACK한다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    await w.send({ type: 'SYNC' })
    w.server.active = true
    const id = crypto.randomUUID()
    w.server.commands = [
      {
        id,
        revision: 1,
        kind: 'notice',
        message: '개인 상담 공지',
        duration_seconds: 5,
        expires_at: new Date(Date.now() + 90000).toISOString(),
      },
    ]
    w.tick()
    await w.send({ type: 'SYNC' })
    expect(w.chrome.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'chrome-extension://own/notice.html#' + id, type: 'popup' }),
    )
    expect(w.noticeReads).toContainEqual(expect.objectContaining({ text: '개인 상담 공지' }))
    expect(w.chrome.tabs.sendMessage).not.toHaveBeenCalled()
    expect(w.chrome.scripting.executeScript).not.toHaveBeenCalled()
    expect(
      w.requests.some((r) => r.action === 'ack' && r.payload.acks[0].status === 'applied'),
    ).toBe(true)
  })
  it('보안 업그레이드 이전에 수집한 미전송 기록은 새 서버에 업로드하지 않는다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    await w.send({ type: 'SYNC' })
    w.values.securityVersion = 1
    w.values.monitoring = true
    w.values.registration = 'active'
    w.values.visits = [
      {
        visitId: crypto.randomUUID(),
        url: 'https://private-old.example/',
        title: '이전 개인 기록',
        duration: 10,
      },
    ]
    w.server.active = true
    w.server.monitoring = true
    w.tick()
    await w.send({ type: 'SYNC' })
    expect(
      w.requests.some(
        (r) => r.action === 'telemetry' && r.payload.url === 'https://private-old.example/',
      ),
    ).toBe(false)
    expect(w.values.securityVersion).toBe(2)
  })
  it('Chrome이 보고한 카메라 앱은 활동으로 전송하되 카메라 앱 화면을 캡처하지 않는다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    await w.send({ type: 'SYNC' })
    w.server.active = true
    w.server.monitoring = true
    w.chrome.tabs.query.mockResolvedValue([
      {
        id: 1,
        windowId: 1,
        url: 'chrome://camera-app/views/main.html?private=1',
        title: '민감한 제목',
      },
    ] as never)
    w.server.commands = [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: 'capture',
        message: '',
        duration_seconds: 5,
        expires_at: new Date(Date.now() + 90000).toISOString(),
      },
    ]
    w.tick()
    await w.send({ type: 'SYNC' })
    expect(w.requests).toContainEqual(
      expect.objectContaining({
        action: 'telemetry',
        payload: expect.objectContaining({ url: 'chrome://camera-app/', title: '카메라 앱' }),
      }),
    )
    expect(w.chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()
  })
  it('시크릿 탭은 모니터링과 캡처 대상에서 제외한다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    await w.send({ type: 'SYNC' })
    w.server.active = true
    w.server.monitoring = true
    w.chrome.tabs.query.mockResolvedValue([
      { id: 1, windowId: 1, url: 'https://private.example/', incognito: true },
    ] as never)
    w.server.commands = [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: 'capture',
        message: '',
        duration_seconds: 5,
        expires_at: new Date(Date.now() + 90000).toISOString(),
      },
    ]
    w.tick()
    await w.send({ type: 'SYNC' })
    expect(w.chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()
    expect(w.requests.some((r) => r.action === 'telemetry')).toBe(false)
    expect(
      w.requests.some((r) => r.action === 'ack' && r.payload.acks[0].status === 'failed'),
    ).toBe(true)
  })
  it('정책으로 확장 공지 창을 열지 못하면 성공 ACK 대신 실패를 회신한다', async () => {
    const w = await worker()
    await w.send({ type: 'REGISTER', code: 'a'.repeat(32), name: '테스트', number: 1 })
    await w.send({ type: 'SYNC' })
    w.server.active = true
    w.server.commands = [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: 'notice',
        message: '공지',
        duration_seconds: 5,
        expires_at: new Date(Date.now() + 90000).toISOString(),
      },
    ]
    w.chrome.windows.create.mockRejectedValue(Error('policy denied'))
    w.tick()
    await w.send({ type: 'SYNC' })
    expect(
      w.requests.some((r) => r.action === 'ack' && r.payload.acks[0].status === 'failed'),
    ).toBe(true)
  })
})
