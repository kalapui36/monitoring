// @vitest-environment node
import { createHandler } from '../supabase/functions/device/handler'
import type { SupabaseClient } from '@supabase/supabase-js'
const commandId = '11111111-1111-4111-8111-111111111111',
  studentId = '22222222-2222-4222-8222-222222222222',
  classId = '33333333-3333-4333-8333-333333333333'
function fixture(
  options: {
    metadataFailure?: boolean
    uploadFailure?: boolean
    expired?: boolean
    foreign?: boolean
    finalizeFailure?: boolean
  } = {},
) {
  const calls: { table: string; op: string; args: any[] }[] = [],
    order: string[] = [],
    reservations: any[] = []
  const upload = vi.fn(
    async (_path: string, _bytes: Uint8Array, _options: Record<string, unknown>) => {
      order.push('upload')
      return {
        data: null,
        error: options.uploadFailure ? { message: 'sensitive storage diagnostic' } : null,
      }
    },
  )
  const rpc = vi.fn(async (name: string) => {
    order.push(name)
    if (name === 'app_consume_rate') return { data: true, error: null }
    if (name === 'app_complete_capture')
      return {
        data: null,
        error: options.finalizeFailure ? { message: 'private DB detail' } : null,
      }
    return { data: { state: 'active', studentId }, error: null }
  })
  const db = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: { message: 'invalid signature' } }),
    },
    rpc,
    storage: { from: () => ({ upload }) },
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const q: Record<string, any> = {}
      for (const op of ['select', 'eq', 'in', 'order', 'limit', 'upsert'])
        q[op] = (...args: any[]) => {
          calls.push({ table, op, args })
          if (op === 'eq') filters[args[0]] = args[1]
          if (op === 'upsert') {
            order.push('reserve')
            reservations.push(args[0])
          }
          return q
        }
      const result = () => ({
        data:
          table === 'app_commands'
            ? options.foreign || filters.student_id !== studentId
              ? null
              : {
                  id: commandId,
                  class_id: classId,
                  student_id: studentId,
                  kind: 'capture',
                  status: 'delivered',
                  expires_at: new Date(Date.now() + (options.expired ? -1 : 60000)).toISOString(),
                }
            : table === 'app_classes'
              ? { capture_retention_days: 1 }
              : null,
        error:
          table === 'app_captures' && options.metadataFailure
            ? { message: 'confidential SQL diagnostic' }
            : null,
      })
      q.maybeSingle = async () => result()
      q.single = async () => result()
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(table === 'app_commands' ? { data: [], error: null } : result()).then(
          resolve,
        )
      return q
    },
  }
  const handler = createHandler(
    { url: 'https://project.supabase.co', serviceKey: 'test-only' },
    db as unknown as SupabaseClient,
  )
  const request = (
    action = 'capture',
    body: Record<string, unknown> = {},
    bearer = 'A'.repeat(43),
  ) =>
    handler(
      new Request('https://project.supabase.co/functions/v1/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
        body: JSON.stringify({
          action,
          securityVersion: 2,
          commandId,
          image: 'data:image/jpeg;base64,/9j/AAAAAAA=',
          ...body,
        }),
      }),
    )
  return { request, handler, upload, rpc, calls, order, reservations, db }
}
it('이미지 저장 전에 비공개 만료 예약을 만들고 업로드 확인 후 서버에서 완료한다', async () => {
  const f = fixture()
  expect((await f.request()).status).toBe(200)
  expect(f.order.indexOf('reserve')).toBeLessThan(f.order.indexOf('upload'))
  expect(f.order.indexOf('upload')).toBeLessThan(f.order.indexOf('app_complete_capture'))
  expect(f.reservations[0]).toMatchObject({
    uploaded: false,
    student_id: studentId,
    class_id: classId,
  })
  expect(f.upload.mock.calls[0][2]).toEqual({ contentType: 'image/jpeg', upsert: false })
  expect(f.upload.mock.calls[0][0]).toBe(`${classId}/${studentId}/${commandId}.jpg`)
  expect(f.calls).toContainEqual({
    table: 'app_commands',
    op: 'eq',
    args: ['student_id', studentId],
  })
})
it('메타데이터 저장 실패 시 이미지 바이트는 저장하지 않고 DB 진단도 응답에 노출하지 않는다', async () => {
  const f = fixture({ metadataFailure: true })
  const r = await f.request()
  expect(r.status).toBe(400)
  expect(f.upload).not.toHaveBeenCalled()
  expect(await r.text()).not.toContain('confidential')
})
it('업로드 중단·최종 확정 실패는 성공으로 표시하지 않고 만료 예약을 남긴다', async () => {
  for (const options of [{ uploadFailure: true }, { finalizeFailure: true }]) {
    const f = fixture(options)
    const r = await f.request()
    expect(r.status).not.toBe(200)
    expect(f.reservations[0].uploaded).toBe(false)
    expect(await r.text()).not.toContain('private DB detail')
    if (options.uploadFailure)
      expect(f.rpc.mock.calls.some(([name]) => name === 'app_complete_capture')).toBe(false)
  }
})
it('다른 학생의 캡처 명령·만료된 요청은 업로드를 시작하지 않는다', async () => {
  for (const options of [{ expired: true }, { foreign: true }]) {
    const f = fixture(options)
    expect((await f.request()).status).toBe(409)
    expect(f.upload).not.toHaveBeenCalled()
  }
})
it('위조·만료·다른 프로젝트 JWT는 인증 서비스 거부 후 데이터 작업에 도달하지 않는다', async () => {
  const f = fixture()
  for (const jwt of ['forged.admin.jwt', 'expired.jwt', 'other-project.jwt'])
    expect((await f.request('cleanup', {}, jwt)).status).toBe(401)
  expect(f.db.auth.getUser).toHaveBeenCalledTimes(3)
  expect(f.calls).toHaveLength(0)
  expect(f.upload).not.toHaveBeenCalled()
})
it('비이미지 대형 본문·잘못된 JSON·상태 변경 GET 요청을 차단한다', async () => {
  const f = fixture()
  expect((await f.request('poll', { padding: 'x'.repeat(17000) })).status).toBe(413)
  expect(f.rpc).not.toHaveBeenCalled()
  expect(
    (
      await f.handler(
        new Request('https://project.supabase.co/functions/v1/device', { method: 'GET' }),
      )
    ).status,
  ).toBe(405)
  expect(
    (
      await f.handler(
        new Request('https://project.supabase.co/functions/v1/device', {
          method: 'POST',
          body: '{broken',
        }),
      )
    ).status,
  ).toBe(400)
})

it('SVG·잘못된 이미지 서명을 업로드하거나 캡처 파일을 덮어쓰지 않는다', async () => {
  const f = fixture()
  for (const image of [
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,aGVsbG93b3JsZA==',
  ])
    expect((await f.request('capture', { image })).status).toBe(400)
  expect(f.upload).not.toHaveBeenCalled()
})

it('이전 확장은 업데이트 전 학생 데이터·교사 명령을 받지 않는다', async () => {
  const f = fixture()
  const r = await f.handler(
    new Request('https://project.supabase.co/functions/v1/device', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + 'A'.repeat(43) },
      body: JSON.stringify({ action: 'poll' }),
    }),
  )
  expect(r.status).toBe(426)
  expect(f.rpc).not.toHaveBeenCalled()
  expect(f.upload).not.toHaveBeenCalled()
})
it('실제 Supabase SDK를 서명 검증 Auth 대역에 연결해 변조·다른 서명키·만료 JWT를 거부한다', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const signingKey = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, [
    'sign',
    'verify',
  ])
  const otherKey = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, [
    'sign',
    'verify',
  ])
  const owner = '11111111-1111-4111-8111-111111111111',
    now = Math.floor(Date.now() / 1000)
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const issue = async (sub: string, key: CryptoKey, exp = now + 300) => {
    const message =
      encode({ alg: 'HS256', typ: 'JWT' }) +
      '.' +
      encode({
        sub,
        exp,
        aud: 'authenticated',
        email: 'owner@school.test',
        user_metadata: { role: 'admin' },
      })
    return (
      message +
      '.' +
      Buffer.from(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)),
      ).toString('base64url')
    )
  }
  let restReads = 0
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init),
      url = new URL(req.url)
    if (url.pathname === '/auth/v1/user') {
      try {
        const token = req.headers.get('authorization')!.replace(/^Bearer /, ''),
          [header, payload, signature] = token.split('.')
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()),
          algorithm = JSON.parse(Buffer.from(header, 'base64url').toString()).alg
        const verified =
          algorithm === 'HS256' &&
          (await crypto.subtle.verify(
            'HMAC',
            signingKey,
            Buffer.from(signature, 'base64url'),
            new TextEncoder().encode(header + '.' + payload),
          ))
        if (!verified || claims.exp <= now) throw Error('denied')
        return new Response(
          JSON.stringify({
            id: claims.sub,
            aud: 'authenticated',
            email: claims.email,
            role: 'authenticated',
            app_metadata: { provider: 'google' },
            user_metadata: claims.user_metadata,
            created_at: new Date().toISOString(),
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      } catch {
        return new Response(JSON.stringify({ msg: 'invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    restReads++
    const isOwner = url.searchParams.get('user_id') === 'eq.' + owner
    return new Response(
      JSON.stringify(
        url.pathname.endsWith('app_classes') ? [] : isOwner ? [{ user_id: owner }] : [],
      ),
      { headers: { 'Content-Type': 'application/json' } },
    )
  })
  const db = createClient('https://auth-fixture.supabase.co', 'test-only-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: transport },
  })
  const handler = createHandler(
    { url: 'https://auth-fixture.supabase.co', serviceKey: 'test-only-service-key' },
    db,
  )
  const call = (token: string) =>
    handler(
      new Request('https://auth-fixture.supabase.co/functions/v1/device', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'cleanup' }),
      }),
    )
  const valid = await issue(owner, signingKey)
  for (const token of [
    await issue(owner, otherKey),
    await issue(owner, signingKey, now - 1),
    valid
      .split('.')
      .map((part, index) =>
        index === 2 ? (part.startsWith('a') ? 'b' : 'a') + part.slice(1) : part,
      )
      .join('.'),
  ]) {
    expect((await call(token)).status).toBe(401)
    expect(restReads).toBe(0)
  }
  expect((await call(await issue('22222222-2222-4222-8222-222222222222', signingKey))).status).toBe(
    403,
  )
  expect((await call(valid)).status).toBe(200)
})
