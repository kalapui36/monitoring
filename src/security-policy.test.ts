// @vitest-environment node
import { PRODUCTION_CSP } from './security-policy'
import { readFileSync } from 'node:fs'
it('운영 정책은 인라인 JS·임의 서버 전송·폼 전송·외부 프레임을 허용하지 않는다', () => {
  const scripts = PRODUCTION_CSP.split('; ').find((x) => x.startsWith('script-src '))!
  expect(scripts).toBe("script-src 'self'")
  for (const directive of [
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ])
    expect(PRODUCTION_CSP).toContain(directive)
  expect(PRODUCTION_CSP).not.toContain('https:;')
  expect(readFileSync('package.json', 'utf8')).toContain('node scripts/secure-build.mjs')
})
