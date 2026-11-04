import { unzipSync, strFromU8 } from 'fflate'
import { buildStudentPackage, PACKAGE_FILES } from './student-package'
describe('운영 학생 확장 패키지', () => {
  it('모든 학급이 같은 ZIP 구성으로 연결하며 classId·교사 키·학생 데이터가 없다', () => {
    const files = unzipSync(buildStudentPackage('https://example.supabase.co'))
    expect(Object.keys(files).sort()).toEqual([...PACKAGE_FILES, 'package-config.json'].sort())
    expect(JSON.parse(strFromU8(files['package-config.json']))).toEqual({
      protocolVersion: 1,
      apiUrl: 'https://example.supabase.co/functions/v1/device',
    })
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).not.toContain('identity.email')
    expect(manifest.content_security_policy.extension_pages).toContain(
      "connect-src 'self' https://example.supabase.co",
    )
    for (const path of [
      manifest.background.service_worker,
      manifest.action.default_popup,
      'lock.html',
      'lock.js',
      'protocol.js',
      'control.js',
    ])
      expect(files[path].length).toBeGreaterThan(0)
  })
  it('자격증명이나 임의 경로를 포함한 설정을 ZIP에 넣지 않는다', () => {
    for (const url of [
      'http://example.com',
      'https://user:password@example.com',
      'https://example.com/api/',
      'not-url',
    ])
      expect(() => buildStudentPackage(url)).toThrow()
  })
})
