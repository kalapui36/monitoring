import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { RELEASE_VERSION } from '../src/release.ts'
import { PRODUCTION_CSP } from '../src/security-policy.ts'
const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const detailedGuide = await readFile('docs/SETUP.ko.md', 'utf8')
const guide = await readFile('docs/FIRST_SETUP.ko.md', 'utf8')
await mkdir('dist/docs', { recursive: true })
await mkdir('dist/setup', { recursive: true })
for (const name of ['monitoring-install.sql', 'device-dashboard.txt'])
  await writeFile('dist/setup/' + name, await readFile('setup-files/' + name))
await writeFile('dist/docs/SETUP.ko.md', detailedGuide)
await writeFile('dist/docs/FIRST_SETUP.ko.md', guide)
const files = [
  '202610220001_monitoring.sql',
  '202611040001_teacher_accounts.sql',
  '202611040002_personal_project.sql',
  '202611040003_security_hardening.sql',
]
for (const file of files)
  await writeFile('dist/docs/' + file, await readFile('supabase/migrations/' + file))
await writeFile(
  'dist/SETUP.html',
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}"><meta name="referrer" content="no-referrer"><title>클래스온 Supabase 설정 안내</title><style>body{max-width:940px;margin:30px auto;padding:20px;font:16px/1.8 system-ui;color:#172a49;background:#f6f8fc}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:24px;border-radius:12px}a{color:#2459c4}li{margin:10px}</style></head><body><h1>Supabase 가입·연결 안내</h1><p>개인 Supabase 연결형 ${RELEASE_VERSION}. 각 교사가 본인 프로젝트를 설정합니다.</p><p><a href="./">프로그램 연결 화면 열기</a> · <a href="https://supabase.com/dashboard" rel="noreferrer" target="_blank">Supabase 관리 화면</a></p><p><a href="setup/monitoring-install.sql" download>새 프로젝트 설치 통합 SQL 다운로드</a> · <a href="setup/device-dashboard.txt" target="_blank" rel="noreferrer">학생 연결 서버 코드 열기</a></p><ol>${files.map((f, i) => `<li><a href="docs/${f}" download>SQL ${i + 1} 다운로드</a></li>`).join('')}</ol><pre>${escape(guide)}</pre></body></html>`,
)
await writeFile(
  'dist/version.json',
  JSON.stringify(
    {
      version: RELEASE_VERSION,
      mode: 'personal-supabase',
      demoData: false,
      setup: 'SETUP.html',
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
)
