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
  `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}">
    <meta name="referrer" content="no-referrer">
    <title>monitoring Supabase 설정 안내</title>
    <style>
      body { max-width: 860px; margin: 32px auto; padding: 20px; font: 16px/1.8 system-ui; color: #172a49; background: #f6f8fc; }
      h1 { line-height: 1.25; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; background: white; padding: 20px; border-radius: 12px; }
      a { color: #2459c4; }
      .start { display: inline-block; padding: 10px 16px; border-radius: 8px; background: #3158bd; color: white; text-decoration: none; font-weight: 700; }
      summary { cursor: pointer; font-weight: 600; }
      li { margin: 8px 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Supabase 가입·연결 안내</h1>
      <p>교사 본인의 Supabase를 연결하는 방법을 한 장씩 확인하세요.</p>
      <p><a class="start" href="./#guide">단계별 설정 안내 시작 →</a></p>
      <details>
        <summary>전체 설정 안내와 설치 파일 보기</summary>
        <p><a href="https://supabase.com/dashboard" rel="noreferrer" target="_blank">Supabase 관리 화면</a></p>
        <ul>
          <li><a href="setup/monitoring-install.sql" download>통합 설치 SQL 다운로드</a></li>
          <li><a href="setup/device-dashboard.txt" target="_blank" rel="noreferrer">학생 연결 서버 코드 열기</a></li>
        </ul>
        <pre>${escape(guide)}</pre>
        <details>
          <summary>기존 프로젝트의 개별 SQL 다운로드</summary>
          <ol>${files.map((f, i) => `<li><a href="docs/${f}" download>SQL ${i + 1} 다운로드</a></li>`).join('')}</ol>
        </details>
      </details>
    </main>
  </body>
</html>`,
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
