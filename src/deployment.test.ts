import { resolveOAuthRedirect } from './backend'
import { readFileSync } from 'node:fs'
it('공통 사이트의 하위 경로와 이식 가능한 빌드 모두 자기 경로로 OAuth가 돌아온다', () => {
  const href = 'https://teacher.example/works/monitoring/index.html?code=auth#main'
  expect(resolveOAuthRedirect('./', href)).toBe('https://teacher.example/works/monitoring/')
  expect(resolveOAuthRedirect('/monitoring/', href)).toBe('https://teacher.example/monitoring/')
})
it('브라우저 진입점에는 데모 코드 대신 실제 연결 앱과 스크립트 실패 안내가 있다', () => {
  const bootstrap = readFileSync('src/bootstrap.tsx', 'utf8'),
    html = readFileSync('index.html', 'utf8')
  expect(bootstrap).toContain("from './App'")
  expect(bootstrap).not.toContain('demo/')
  expect(html).toContain('웹 배포가 완료되지 않았거나')
  expect(html).not.toContain('app.mjs')
  expect(html).not.toContain('가상 학생')
})
