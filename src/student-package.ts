import { strToU8, zipSync } from 'fflate'
import { getProjectUrl } from './connection'
import { validProjectUrl } from './public-config'
const sources = import.meta.glob(
  [
    '../student-extension/manifest.json',
    '../student-extension/activity.js',
    '../student-extension/background.js',
    '../student-extension/protocol.js',
    '../student-extension/control.js',
    '../student-extension/setup.html',
    '../student-extension/setup.js',
    '../student-extension/setup.css',
    '../student-extension/lock.html',
    '../student-extension/lock.js',
    '../student-extension/lock.css',
    '../student-extension/README.txt',
    '../student-extension/notice.html',
    '../student-extension/notice.js',
    '../student-extension/notice.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
export const PACKAGE_FILES = [
  'manifest.json',
  'activity.js',
  'background.js',
  'protocol.js',
  'control.js',
  'setup.html',
  'setup.js',
  'setup.css',
  'lock.html',
  'lock.js',
  'lock.css',
  'README.txt',
  'notice.html',
  'notice.js',
  'notice.css',
] as const
export function buildStudentPackage(url = getProjectUrl()): Uint8Array {
  const parsed = new URL(url)
  if (!validProjectUrl(url)) throw Error('올바른 Supabase 프로젝트 URL을 먼저 설정하세요.')
  const files: Record<string, Uint8Array> = {}
  for (const name of PACKAGE_FILES) {
    const text = sources[`../student-extension/${name}`]
    if (!text) throw Error(`설치 파일 누락: ${name}`)
    files[name] = strToU8(text)
  }
  files['package-config.json'] = strToU8(
    JSON.stringify({ protocolVersion: 1, apiUrl: `${parsed.origin}/functions/v1/device` }, null, 2),
  )
  const manifest = JSON.parse(strFrom(files['manifest.json']))
  manifest.content_security_policy = {
    extension_pages: `script-src 'self'; object-src 'self'; connect-src 'self' ${parsed.origin}`,
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  return zipSync(files, { level: 6 })
}
function strFrom(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes)
}
export function downloadStudentPackage(projectUrl = getProjectUrl()) {
  const data = buildStudentPackage(projectUrl)
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(data).buffer], { type: 'application/zip' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = 'ClassOn-student-1.2.0.zip'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
