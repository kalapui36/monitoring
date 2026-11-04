import { strFromU8, unzipSync } from 'fflate'
import { buildStudentPackage, PACKAGE_FILES } from './student-package'
import {
  installationStatus,
  isSetupSender,
} from '../../reference/installation-prototype/diagnostics.js'
const group = { id: 'club-1', name: '코딩 동아리' }
function unpack() {
  return unzipSync(buildStudentPackage(group))
}
describe('개발용 확장 ZIP', () => {
  it('표준 ZIP으로 열리며 manifest의 모든 진입 파일과 정적 자원을 포함한다', () => {
    const files = unpack()
    expect(Object.keys(files).sort()).toEqual([...PACKAGE_FILES, 'package-config.json'].sort())
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest.manifest_version).toBe(3)
    for (const file of [
      manifest.background.service_worker,
      manifest.action.default_popup,
      'diagnostics.js',
      'setup.js',
      'setup.css',
    ])
      expect(files[file].length).toBeGreaterThan(0)
    expect(manifest.permissions).toEqual(['storage'])
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.content_security_policy.extension_pages).toContain("connect-src 'self'")
  })
  it('학급 공개 정보만 포함하며 학생 목록·명령·인증값을 복사하지 않는다', () => {
    const input = {
      ...group,
      students: ['실제 데이터 금지'],
      token: 'test-sensitive-value',
      locked: true,
    }
    const config = JSON.parse(
      strFromU8(unzipSync(buildStudentPackage(input))['package-config.json']),
    )
    expect(config).toEqual({
      protocolVersion: 1,
      channel: 'development',
      backendReady: false,
      classroom: group,
    })
    expect(JSON.stringify(config)).not.toContain('test-sensitive-value')
  })
  it('한국어와 따옴표를 안전하게 직렬화하고 잘못된 학급은 거부한다', () => {
    const name = '실험 "반"'
    expect(
      JSON.parse(
        strFromU8(unzipSync(buildStudentPackage({ ...group, name }))['package-config.json']),
      ).classroom.name,
    ).toBe(name)
    for (const classroom of [
      { id: '../escape', name: '반' },
      { ...group, name: ' ' },
      { ...group, name: 'a'.repeat(81) },
    ])
      expect(() => buildStudentPackage(classroom)).toThrow()
  })
  it('설치 성공과 서버 등록 성공을 구분한다', () => {
    const config = JSON.parse(strFromU8(unpack()['package-config.json']))
    expect(installationStatus(config)).toMatchObject({
      ok: true,
      installed: true,
      registered: false,
      code: 'BACKEND_NOT_CONNECTED',
    })
  })
  it('변조되거나 지원하지 않는 패키지를 등록 완료로 표시하지 않는다', () => {
    for (const config of [
      null,
      {},
      { protocolVersion: 99 },
      { protocolVersion: 1, channel: 'production', backendReady: true, classroom: group },
    ])
      expect(installationStatus(config)).toMatchObject({ ok: false, code: 'INVALID_PACKAGE' })
  })
  it('확장 내부 설치 화면의 진단 요청만 허용한다', () => {
    const runtime = {
      id: 'extension-id',
      getURL: (path: string) => `chrome-extension://extension-id/${path}`,
    }
    expect(isSetupSender({ id: runtime.id, url: runtime.getURL('setup.html') }, runtime)).toBe(true)
    for (const sender of [
      undefined,
      { id: 'other', url: runtime.getURL('setup.html') },
      { id: runtime.id, url: 'https://example.com' },
    ])
      expect(isSetupSender(sender, runtime)).toBe(false)
  })
})
