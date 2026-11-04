// @vitest-environment node
import { buildSetupSources } from '../scripts/setup-assets.mjs'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import vm from 'node:vm'
it('웹 복사용 통합 SQL/함수는 현재 운영 원본에서 생성되고 상대 import를 남기지 않는다', async () => {
  const { sql, functionSource } = await buildSetupSources()
  expect(sql).toBe(readFileSync('setup-files/monitoring-install.sql', 'utf8'))
  expect(functionSource).toBe(readFileSync('setup-files/device-dashboard.txt', 'utf8'))
  for (const migration of ['202610220001', '202611040001', '202611040002', '202611040003'])
    expect(sql).toContain(migration)
  expect(sql).toContain('select public.app_security_version() as installed_security_version;')
  expect(functionSource).not.toMatch(/from ['"]\.\//)
  expect(functionSource).toContain("from 'npm:@supabase/supabase-js@2.118.0'")
})
it('대시보드에 붙이는 단일 함수도 인증 없이 관리 요청을 허용하지 않는다', async () => {
  const { functionSource } = await buildSetupSources()
  const compiled = transpileModule(functionSource, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  let handler: (r: Request) => Promise<Response> = async () => new Response('', { status: 500 })
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
  const createClient = vi.fn(() => ({ auth: { getUser } }))
  vm.runInNewContext(compiled, {
    exports: {},
    require: (name: string) => {
      if (name !== 'npm:@supabase/supabase-js@2.118.0') throw Error('Unexpected dependency')
      return { createClient }
    },
    Deno: {
      env: {
        get: (name: string) =>
          name === 'SUPABASE_URL' ? 'https://fixture.supabase.co' : 'synthetic-service-key',
      },
      serve: (fn: typeof handler) => {
        handler = fn
      },
    },
    Response,
    Request,
    AbortSignal,
    TextDecoder,
    TextEncoder,
    crypto,
    URL,
    Uint8Array,
  })
  expect(createClient).toHaveBeenCalledWith(
    'https://fixture.supabase.co',
    'synthetic-service-key',
    expect.any(Object),
  )
  const response = await handler(
    new Request('https://fixture.supabase.co/functions/v1/device', {
      method: 'POST',
      body: JSON.stringify({ action: 'cleanup' }),
    }),
  )
  expect(response.status).toBe(401)
  expect(getUser).toHaveBeenCalledWith('')
})
