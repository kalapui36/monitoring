// @vitest-environment node
import { readFileSync } from 'node:fs'
import { internalActivity } from '../student-extension/activity.js'
import { safeUrl, track } from '../student-extension/protocol.js'
import { cleanUrl } from '../supabase/functions/device/handler'
it('Chrome이 노출한 카메라·파일·설정 활동은 안전한 고정 이름으로 기록한다', () => {
  for (const [url, title] of [
    ['chrome://camera-app/views/main.html?account=private#state', '카메라 앱'],
    ['chrome://file-manager/?filename=private', '파일 앱'],
    ['chrome://os-settings/people?email=private', '크롬북 설정'],
    ['chrome-extension://hfhhnacclhffhdffklopdkcgdhifgngh/views/main.html', '카메라 앱'],
  ]) {
    const record = track(null, url, '민감한 원본 제목', 0, () => 'test').current
    expect(record.title).toBe(title)
    expect(record.url).not.toMatch(/private|main.html/)
    expect(cleanUrl(url)).toBe(record.url)
    expect(safeUrl(url)).toBe('') // Capture still accepts only ordinary HTTP(S) pages.
  }
})
it('지원하지 않는 앱·임의 확장·자바스크립트 주소는 활동으로 허용하지 않는다', () => {
  for (const url of [
    'chrome://unknown-app/',
    'chrome-extension://unknown/',
    'javascript:alert(1)',
    'file:///private/path',
  ]) {
    expect(internalActivity(url)).toBeNull()
    expect(track(null, url, 'unknown', 0).current).toBeNull()
    expect(() => cleanUrl(url)).toThrow()
  }
})
it('확장과 서버의 내부 앱 주소 규칙이 동일하다', () => {
  expect(readFileSync('student-extension/activity.js', 'utf8')).toBe(
    readFileSync('supabase/functions/device/activity.js', 'utf8'),
  )
})
