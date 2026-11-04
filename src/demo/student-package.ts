import { strToU8, zipSync } from 'fflate'
// Explicit allowlist prevents reference uploads, tests, and local config from entering the ZIP.
const sources = import.meta.glob(
  [
    '../../reference/installation-prototype/manifest.json',
    '../../reference/installation-prototype/background.js',
    '../../reference/installation-prototype/diagnostics.js',
    '../../reference/installation-prototype/setup.html',
    '../../reference/installation-prototype/setup.js',
    '../../reference/installation-prototype/setup.css',
    '../../reference/installation-prototype/README.txt',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>
export const PACKAGE_FILES = [
  'manifest.json',
  'background.js',
  'diagnostics.js',
  'setup.html',
  'setup.js',
  'setup.css',
  'README.txt',
] as const
export function buildStudentPackage(classroom: { id: string; name: string }): Uint8Array {
  if (
    !/^[a-zA-Z0-9-]{1,80}$/.test(classroom.id) ||
    !classroom.name.trim() ||
    classroom.name.length > 80
  )
    throw new Error('학급 설정을 확인하세요.')
  const files: Record<string, Uint8Array> = {}
  for (const name of PACKAGE_FILES) {
    const source = sources[`../../reference/installation-prototype/${name}`]
    if (!source) throw new Error(`설치 파일 누락: ${name}`)
    files[name] = strToU8(source)
  }
  files['package-config.json'] = strToU8(
    JSON.stringify(
      {
        protocolVersion: 1,
        channel: 'development',
        backendReady: false,
        classroom: { id: classroom.id, name: classroom.name.trim() },
      },
      null,
      2,
    ),
  )
  return zipSync(files, { level: 6 })
}
export function downloadStudentPackage(classroom: { id: string; name: string }) {
  const data = buildStudentPackage(classroom)
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(data).buffer], { type: 'application/zip' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `ClassOn-dev-${classroom.id}.zip`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
