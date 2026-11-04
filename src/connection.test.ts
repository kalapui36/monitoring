import {
  readConnection,
  saveConnection,
  removeConnection,
  getProjectUrl,
  CONNECTION_KEY,
} from './connection'
import { buildStudentPackage } from './student-package'
import { unzipSync, strFromU8 } from 'fflate'
const key = 'sb_publishable_' + 'a'.repeat(25)
describe('개인 Supabase 연결 경계', () => {
  it('설정 전에는 배포자 프로젝트로 자동 연결하지 않는다', () => {
    expect(readConnection()).toBeNull()
    expect(getProjectUrl()).toBe('')
    expect(() => buildStudentPackage()).toThrow()
  })
  it('공개 연결값만 브라우저에 저장하고 읽는다', () => {
    saveConnection({ url: ' https://teacher-a.supabase.co/ ', key })
    expect(readConnection()).toEqual({ url: 'https://teacher-a.supabase.co', key })
    expect(JSON.parse(localStorage.getItem(CONNECTION_KEY)!)).toEqual(readConnection())
    removeConnection()
    expect(readConnection()).toBeNull()
  })
  it('손상된 설정·비밀키·경로/쿼리가 붙은 주소를 거부한다', () => {
    localStorage.setItem(CONNECTION_KEY, 'broken')
    expect(readConnection()).toBeNull()
    for (const value of [
      { url: 'https://a.supabase.co', key: 'sb_secret_no' },
      { url: 'http://a.supabase.co', key },
      { url: 'https://a.supabase.co?project=b', key },
    ])
      expect(() => saveConnection(value)).toThrow()
    expect(readConnection()).toBeNull()
  })
  it('프로젝트를 바꾸면 새 ZIP에는 새 서버 주소만 들어간다', () => {
    for (const name of ['teacher-a', 'teacher-b']) {
      saveConnection({ url: `https://${name}.supabase.co`, key })
      const files = unzipSync(buildStudentPackage())
      const config = JSON.parse(strFromU8(files['package-config.json']))
      expect(config).toEqual({
        protocolVersion: 1,
        apiUrl: `https://${name}.supabase.co/functions/v1/device`,
      })
      expect(JSON.stringify(config)).not.toContain(key)
    }
  })
})
