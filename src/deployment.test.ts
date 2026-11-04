import { httpsUpgrade } from './entry-policy'
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

it('공개 HTTP 주소는 경로를 유지해 HTTPS로 이동하며 개발용 loopback만 예외다', () => {
  expect(httpsUpgrade('http://kalapui.com/monitoring/#guide')).toBe(
    'https://kalapui.com/monitoring/#guide',
  )
  expect(httpsUpgrade('https://kalapui.com/monitoring/')).toBeNull()
  expect(httpsUpgrade('http://127.0.0.1:4173/')).toBeNull()
  expect(httpsUpgrade('http://localhost:5173/')).toBeNull()
  expect(httpsUpgrade('http://localhost.attacker.test/')).toBe('https://localhost.attacker.test/')
})
it('Auth 진입점은 HTTPS 이동과 프레임 검사 뒤에만 불러온다', () => {
  const main = readFileSync('src/main.tsx', 'utf8')
  expect(main.indexOf('httpsUpgrade(window.location.href)')).toBeLessThan(
    main.indexOf("import('./bootstrap')"),
  )
  expect(main.indexOf('window.top !== window.self')).toBeLessThan(
    main.indexOf("import('./bootstrap')"),
  )
})
