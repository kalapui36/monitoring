import { effectiveStatus, lockState, online, type Command, type Student } from './models'
import { validPublicConfig } from './backend'
const now = Date.parse('2026-10-22T00:00:00Z')
describe('실제 수신 상태와 공개 설정', () => {
  it('접속은 실제 last_seen과 승인 상태로만 계산한다', () => {
    expect(
      online(
        { approval: 'active', last_seen: new Date(now - 30000).toISOString() } as Student,
        now,
      ),
    ).toBe(true)
    expect(
      online({ approval: 'pending', last_seen: new Date(now).toISOString() } as Student, now),
    ).toBe(false)
    expect(
      online(
        { approval: 'active', last_seen: new Date(now - 121000).toISOString() } as Student,
        now,
      ),
    ).toBe(false)
  })
  it('요청·전달을 잠금 성공으로 표시하지 않고 ACK를 요구한다', () => {
    const c = {
      student_id: 's',
      kind: 'lock',
      revision: 1,
      status: 'queued',
      expires_at: new Date(now + 10000).toISOString(),
    } as Command
    expect(lockState([c], 's', now)).toBe(false)
    expect(lockState([{ ...c, status: 'applied' }], 's', now)).toBe(true)
    expect(
      lockState(
        [
          { ...c, status: 'applied' },
          { ...c, kind: 'unlock', revision: 2 },
        ],
        's',
        now,
      ),
    ).toBe(false)
    expect(effectiveStatus({ ...c, expires_at: new Date(now - 1).toISOString() }, now)).toBe(
      'expired',
    )
  })
  it('브라우저 설정에 service role이나 비밀키를 사용하지 못한다', () => {
    expect(validPublicConfig('https://example.supabase.co', 'sb_secret_fake')).toBe(false)
    const jwt = 'x.' + btoa(JSON.stringify({ role: 'service_role' })) + '.x'
    expect(validPublicConfig('https://example.supabase.co', jwt)).toBe(false)
    const anon = 'x.' + btoa(JSON.stringify({ role: 'anon' })) + '.x'
    expect(validPublicConfig('https://example.supabase.co', anon)).toBe(true)
    expect(validPublicConfig('http://example.com', anon)).toBe(false)
  })
})
