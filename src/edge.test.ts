// @vitest-environment node
import { createHandler, cleanUrl, hash } from '../supabase/functions/device/handler'
import type { SupabaseClient } from '@supabase/supabase-js'
function fake() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'no' } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    from: vi.fn(),
  }
}
function request(action: string, body: Record<string, unknown> = {}, token = '') {
  return new Request('https://project.test/functions/v1/device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, securityVersion: 2, ...body }),
  })
}
function handler(db: ReturnType<typeof fake>) {
  return createHandler(
    { url: 'https://project.test', serviceKey: 'not-used' },
    db as unknown as SupabaseClient,
  )
}
describe('Edge Function 입력과 인증 경계', () => {
  it('비로그인 사용자는 참여 코드·복구 코드·정리 작업을 실행할 수 없다', async () => {
    for (const action of ['issue_code', 'recovery_code', 'cleanup']) {
      const db = fake()
      const r = await handler(db)(request(action))
      expect(r.status).toBe(401)
      expect(db.from).not.toHaveBeenCalled()
    }
  })
  it('이메일이나 로그인만으로 관리자가 되지 않는다', async () => {
    const db = fake()
    db.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u', email: 'admin@school.test' } },
      error: null,
    } as never)
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const query = { select: () => query, eq: () => query, maybeSingle }
    db.from.mockReturnValue(query)
    expect(
      (await handler(db)(request('issue_code', { classId: crypto.randomUUID() }, 'jwt'))).status,
    ).toBe(403)
  })
  it('가입한 교사도 다른 교사 학급의 참여·복구 코드를 발급할 수 없다', async () => {
    const own = crypto.randomUUID(),
      foreign = crypto.randomUUID()
    for (const action of ['issue_code', 'recovery_code']) {
      const db = fake()
      db.auth.getUser.mockResolvedValue({
        data: { user: { id: 'teacher-a' } },
        error: null,
      } as never)
      const eq = vi.fn().mockReturnThis(),
        insert = vi.fn(),
        update = vi.fn()
      const q = {
        select: () => q,
        eq,
        insert,
        update,
        maybeSingle: async () => ({ data: { user_id: 'teacher-a' }, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: own, retention_days: 7 }], error: null }).then(resolve),
      }
      db.from.mockReturnValue(q)
      const r = await handler(db)(request(action, { classId: foreign }, 'jwt'))
      expect(r.status).toBe(403)
      expect(eq).toHaveBeenCalledWith('active', true)
      expect(eq).toHaveBeenCalledWith('owner_id', 'teacher-a')
      expect(insert).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    }
  })
  it('보존 기간 정리는 본인 학급 목록으로 캡처·코드·기록을 한정한다', async () => {
    const own = crypto.randomUUID(),
      calls: { table: string; method: string; args: unknown[] }[] = []
    const db = fake()
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'teacher-a' } }, error: null } as never)
    db.from.mockImplementation((table: string) => {
      const q: Record<string, any> = {}
      for (const method of ['select', 'eq', 'in', 'lt', 'limit', 'delete'])
        q[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return q
        }
      q.maybeSingle = async () => ({ data: { user_id: 'teacher-a' }, error: null })
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: table === 'app_classes' ? [{ id: own, retention_days: 7 }] : [],
          error: null,
        }).then(resolve)
      return q
    })
    expect((await handler(db)(request('cleanup', {}, 'jwt'))).status).toBe(200)
    expect(calls).toContainEqual({
      table: 'app_classes',
      method: 'eq',
      args: ['owner_id', 'teacher-a'],
    })
    for (const table of ['app_captures', 'app_join_codes'])
      expect(calls).toContainEqual({ table, method: 'in', args: ['class_id', [own]] })
    for (const table of ['app_visits', 'app_events'])
      expect(calls).toContainEqual({ table, method: 'eq', args: ['class_id', own] })
  })
  it('이전 교사 회원이 있어도 개인 프로젝트 소유자가 아니면 서버 작업을 거부한다', async () => {
    const db = fake()
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null } as never)
    db.from.mockImplementation((table) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: table === 'app_teachers' ? { user_id: 'other' } : null,
          error: null,
        }),
      }
      return q
    })
    expect((await handler(db)(request('cleanup', {}, 'jwt'))).status).toBe(403)
  })
  it('학급 코드만으로 기기 폴링이나 캡처를 인증할 수 없다', async () => {
    const db = fake()
    expect((await handler(db)(request('poll', {}, 'class-code'))).status).toBe(401)
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('등록 비밀·이름·번호 형식과 등록 빈도를 제한한다', async () => {
    const db = fake()
    expect(
      (await handler(db)(request('register', { code: 'bad', secret: 'x', name: 'A', number: 1 })))
        .status,
    ).toBe(400)
    db.rpc.mockResolvedValue({ data: false, error: null })
    expect((await handler(db)(request('register'))).status).toBe(429)
  })
  it('허용된 기기 요청에는 토큰 해시만 RPC에 전달한다', async () => {
    const db = fake()
    const token = 'A'.repeat(43)
    db.rpc.mockImplementation(async (name) =>
      name === 'app_consume_rate'
        ? { data: true, error: null }
        : { data: { state: 'pending' }, error: null },
    )
    const r = await handler(db)(request('poll', {}, token))
    expect(r.status).toBe(200)
    expect(db.rpc).toHaveBeenCalledWith(
      'app_device_exchange',
      expect.objectContaining({ _token: await hash(token), _action: 'poll' }),
    )
  })
  it('telemetry의 URL과 ACK를 검증한다', async () => {
    const db = fake()
    const h = handler(db),
      token = 'B'.repeat(43)
    expect(
      (
        await h(
          request(
            'telemetry',
            {
              payload: {
                visitId: crypto.randomUUID(),
                url: 'chrome://unsupported-internal-page',
                title: 'x',
                duration: 10,
              },
            },
            token,
          ),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await h(
          request('poll', { payload: { acks: [{ id: 'not-uuid', status: 'applied' }] } }, token),
        )
      ).status,
    ).toBe(400)
    expect(cleanUrl('https://user:secret@example.com/path?secret=1#fragment')).toBe(
      'https://example.com/path',
    )
  })
  it('캡처는 승인된 기기와 유효한 대상 명령을 요구한다', async () => {
    const db = fake()
    db.rpc.mockImplementation(async (name) =>
      name === 'app_consume_rate'
        ? { data: true, error: null }
        : { data: { state: 'pending' }, error: null },
    )
    const r = await handler(db)(
      request(
        'capture',
        { commandId: crypto.randomUUID(), image: 'data:image/png;base64,aGVsbG8=' },
        'C'.repeat(43),
      ),
    )
    expect(r.status).toBe(403)
    expect(db.from).not.toHaveBeenCalled()
  })
  it('Content-Length가 없더라도 큰 스트림은 JSON 파싱 전에 중단한다', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4100001))
        controller.close()
      },
    })
    const req = new Request('https://project.test/functions/v1/device', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: string })
    const db = fake()
    expect((await handler(db)(req)).status).toBe(413)
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
