// @vitest-environment node
import {
  safeUrl,
  leaseValid,
  lockFromResponse,
  track,
  secret,
  digest,
  trustedUi,
} from '../student-extension/protocol.js'
const response = {
  serverTime: '2026-10-22T00:00:00Z',
  lock: { revision: 10, enabled: true, message: '수업 중', expiresAt: '2026-10-22T00:05:00Z' },
}
describe('실제 확장 프로토콜과 안전 복구', () => {
  it('URL 자격증명·검색어·fragment를 제거하고 내부 페이지를 기록하지 않는다', () => {
    expect(safeUrl('https://id:password@example.com/path?student=secret#token')).toBe(
      'https://example.com/path',
    )
    expect(safeUrl('chrome://settings')).toBe('')
    expect(safeUrl('javascript:alert(1)')).toBe('')
  })
  it('서버 시각과 로컬 시각이 달라도 lease를 최대 120초로 제한한다', () => {
    const lock = lockFromResponse(undefined, response, 1000)
    expect(leaseValid(lock, 120999)).toBe(true)
    expect(leaseValid(lock, 121000)).toBe(false)
    expect(leaseValid(lock, 999)).toBe(false)
  })
  it('늦은 이전 잠금과 이전 응답이 최신 해제를 덮지 못한다', () => {
    const old = lockFromResponse(undefined, response, 1000)
    const unlocked = lockFromResponse(
      old,
      {
        ...response,
        serverTime: '2026-10-22T00:00:01Z',
        lock: { ...response.lock, revision: 11, enabled: false },
      },
      2000,
    )
    expect(lockFromResponse(unlocked, response, 3000)).toBe(unlocked)
    expect(leaseValid(unlocked, 3000)).toBe(false)
  })
  it('비상 해제한 revision은 재접속으로 재잠금되지 않고 새 명령만 허용한다', () => {
    const held = {
      ...lockFromResponse(undefined, response, 1000),
      enabled: false,
      holdRevision: 10,
    }
    expect(lockFromResponse(held, response, 2000).enabled).toBe(false)
    expect(
      lockFromResponse(held, { ...response, lock: { ...response.lock, revision: 11 } }, 2000)
        .enabled,
    ).toBe(true)
  })
  it('명령이 없거나 만료된 초기 응답도 오류 없이 해제 상태가 된다', () => {
    expect(lockFromResponse(undefined, { serverTime: response.serverTime }, 1000).enabled).toBe(
      false,
    )
    expect(
      lockFromResponse(
        undefined,
        { ...response, lock: { ...response.lock, expiresAt: response.serverTime } },
        1000,
      ).enabled,
    ).toBe(false)
  })
  it('재시작 후 체류 누적을 유지하고 절전 공백을 과도하게 더하지 않는다', () => {
    const a = track(null, 'https://example.com', 'A', 0, () => 'id').current
    const b = track({ ...a, duration: 50 }, 'https://example.com', 'A', 3600000).current
    expect(b.visitId).toBe('id')
    expect(b.duration).toBe(80)
    const c = track(b, 'https://other.test', 'B', 3601000, () => 'new')
    expect(c.completed.visitId).toBe('id')
    expect(c.current.visitId).toBe('new')
  })
  it('256비트 기기 비밀을 생성하고 해시만 서버 DB에 저장할 수 있다', async () => {
    const a = secret(),
      b = secret()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
    expect(await digest(a)).toMatch(/^[a-f0-9]{64}$/)
  })
  it('페이지의 임의 API 중계를 허용하지 않고 확장 내부 UI만 신뢰한다', () => {
    const runtime = { id: 'own', getURL: (p: string) => 'chrome-extension://own/' + p }
    expect(trustedUi({ id: 'own', url: runtime.getURL('setup.html') }, runtime)).toBe(true)
    expect(trustedUi({ id: 'own', url: 'https://example.com' }, runtime)).toBe(false)
  })
})

it('웹페이지·다른 확장·잘못된 공지 ID는 공지 전용 창으로 인증되지 않는다', async () => {
  const { trustedNotice } = await import('../student-extension/protocol.js')
  const runtime = { id: 'own', getURL: (p: string) => 'chrome-extension://own/' + p },
    id = '11111111-1111-4111-8111-111111111111'
  const sender = { id: 'own', url: runtime.getURL('notice.html') + '#' + id, tab: { windowId: 2 } }
  expect(trustedNotice(sender, runtime, id)).toBe(true)
  for (const bad of [
    { ...sender, url: 'https://evil.test/' },
    { ...sender, id: 'another' },
    { ...sender, url: runtime.getURL('setup.html') },
    { ...sender, tab: undefined },
  ])
    expect(trustedNotice(bad, runtime, id)).toBe(false)
  expect(trustedNotice(sender, runtime, 'bad')).toBe(false)
})
