import { oauthRedirect } from '../backend'
import { RELEASE_LABEL } from '../release'
import { useState } from 'react'
import setupTemplate from '../../docs/SETUP.ko.md?raw'
import baseSql from '../../supabase/migrations/202610220001_monitoring.sql?raw'
import teacherSql from '../../supabase/migrations/202611040001_teacher_accounts.sql?raw'
import personalSql from '../../supabase/migrations/202611040002_personal_project.sql?raw'
import securitySql from '../../supabase/migrations/202611040003_security_hardening.sql?raw'
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function ChromebookInstallGuide() {
  return (
    <div className="install-guide">
      <p>
        크롬북의 Chrome 120 이상을 기준으로 안내합니다. 교사가 먼저 학급과 참여 코드를 준비해
        주세요.
      </p>
      <ol className="help-list">
        <li>
          <strong>ZIP 받기:</strong> 교사 대시보드의 ‘학생 설치·ZIP’에서 받은 ZIP을 학생에게
          전달합니다. 현재 교사 프로젝트의 학급들은 같은 ZIP을 사용합니다. 다른 교사 프로젝트의
          ZIP은 섞지 마세요.
        </li>
        <li>
          <strong>압축 풀기:</strong> 크롬북의 ‘파일’ 앱 → ‘다운로드’에서 ZIP을 찾습니다. ‘모두
          추출’이 있으면 새 폴더에 추출합니다. 해당 메뉴가 없으면 ZIP을 열고 안의 파일을 모두 선택해
          복사한 뒤, ‘내 파일 → 다운로드’에 만든 새 폴더에 붙여 넣습니다.
        </li>
        <li>
          <strong>폴더 확인:</strong> 새 폴더를 열었을 때 <code>manifest.json</code>과 나머지 파일이
          보여야 합니다. ZIP이 열린 가상 드라이브가 아닌, 복사한 실제 폴더를 사용하고 설치 후에도
          지우지 마세요.
        </li>
        <li>
          <strong>확장 관리 열기:</strong> Chrome 주소창에 <code>chrome://extensions</code>를
          입력하고 Enter를 누릅니다.
        </li>
        <li>
          <strong>개발자 모드:</strong> 오른쪽 위 ‘개발자 모드’를 켭니다. 이것은 확장 관리 화면의
          스위치입니다. 크롬북 운영체제의 개발자 모드로 전환하거나 기기를 초기화할 필요가 없습니다.
        </li>
        <li>
          <strong>폴더 로드:</strong> ‘압축해제된 확장 프로그램을 로드합니다’를 누르고{' '}
          <code>manifest.json</code>이 들어 있는 폴더를 선택합니다. ZIP 파일 자체를 선택하지
          않습니다.
        </li>
        <li>
          <strong>등록 신청:</strong> ‘클래스온 학생 연결’ 창이 열리지 않으면 Chrome의 퍼즐 모양
          확장 아이콘에서 클래스온을 엽니다. 교사가 알려준 참여 코드·학생 번호·이름을 입력하고 ‘등록
          신청’을 누릅니다.
        </li>
        <li>
          <strong>교사 승인:</strong> 교사는 자기 학급의 승인 대기 학생을 실제 기기와 확인하고
          승인합니다. 학생 연결 창에서 연결 상태가 갱신되고 교사 화면에 ‘접속 중’이 나타나는지
          확인합니다.
        </li>
      </ol>
      <p className="guide-warning">
        학교 정책으로 개발자 모드나 압축해제 확장 로드가 막혀 있으면 설치할 수 없습니다. 정책을
        우회하지 말고 학교 기기 담당자에게 허용 여부를 확인하세요.
      </p>
      <details>
        <summary>설치 오류와 다른 기기 안내</summary>
        <ul className="help-list">
          <li>
            ‘매니페스트 파일이 없거나 읽을 수 없습니다’: 바깥 폴더가 아닌 manifest.json이 바로 들어
            있는 폴더를 선택하세요.
          </li>
          <li>
            승인 후 오프라인: 학생 인터넷 연결, 확장 오류, 참여 코드의 학급, 교사 승인 상태를
            확인하고 학생 연결 창에서 다시 연결하세요.
          </li>
          <li>
            코드 만료·번호 중복: 교사에게 새 코드를 요청하거나 등록 정보를 확인하세요. 재설치로
            해결하려 하지 마세요.
          </li>
          <li>
            Windows·Mac의 데스크톱 Chrome도 확장 로드 절차는 비슷하지만 별도 검증이 필요합니다.
            Android·iPad의 일반 Chrome에는 이 설치 방식을 적용할 수 없습니다.
          </li>
          <li>
            잠금·캡처는 Chrome의 권한과 학교 정책 범위에서만 작동합니다. OS 전체 잠금은 아닙니다.
            실제 학생 수업 전에 테스트 기기로 정상 해제·비상 해제·통신 장애를 확인하세요.
          </li>
        </ul>
      </details>
    </div>
  )
}
export function WelcomeGuide({
  onClose,
  initialTab = 'teacher',
}: {
  onClose: () => void
  initialTab?: 'teacher' | 'operator'
}) {
  const [tab, setTab] = useState<'teacher' | 'operator' | 'student'>(initialTab)
  const websiteUrl = oauthRedirect()
  const websiteOrigin = new URL(websiteUrl).origin
  const setupText = setupTemplate
    .replaceAll('https://kalapui.com/monitoring/', websiteUrl)
    .replaceAll('https://kalapui36.github.io/monitoring/', websiteUrl)
    .replaceAll('https://kalapui36.github.io', websiteOrigin)
    .replaceAll('https://kalapui.com', websiteOrigin)
  return (
    <main className="welcome-guide">
      <header className="guide-header">
        <div>
          <span className="eyebrow">클래스온 시작 안내</span>
          <h1>처음 오셨나요?</h1>
          <p className="muted">{RELEASE_LABEL}</p>
          <p>
            각 교사가 자기 Supabase 프로젝트를 연결합니다. 학생 데이터와 사용량은 각자의 프로젝트에
            저장됩니다.
          </p>
        </div>
        <button className="button primary" onClick={onClose}>
          서비스로 돌아가기
        </button>
      </header>
      <nav className="guide-tabs" aria-label="사용 안내 선택">
        <button
          className="button"
          aria-pressed={tab === 'teacher'}
          onClick={() => setTab('teacher')}
        >
          교사 회원가입·시작
        </button>
        <button
          className="button"
          aria-pressed={tab === 'operator'}
          onClick={() => setTab('operator')}
        >
          내 Supabase 설정
        </button>
        <button
          className="button"
          aria-pressed={tab === 'student'}
          onClick={() => setTab('student')}
        >
          학생 크롬북 설치
        </button>
      </nav>
      <aside className="guide-warning">
        <strong>확인할 수 있는 범위</strong>
        <p>
          일반 웹페이지와 Chrome이 탭/창 정보로 알려 주는 일부 내부 앱 활동을 확인합니다.
          카메라·파일·설정 앱도 해당 주소가 노출되는 기기에서만 감지할 수 있습니다.
          ChromeOS·Android·Linux의 모든 앱/활동을 감시하는 기능이나 카메라 촬영 영상을 보는 기능은
          아닙니다. 표시 정보는 최근 감지 결과이며 모든 앱의 현재 상태를 보장하지 않습니다.
        </p>
      </aside>
      {tab === 'teacher' && (
        <section className="guide-panel">
          <h2>내 프로젝트로 수업 시작</h2>
          <ol className="help-list">
            <li>
              본인 Supabase 계정·프로젝트를 만들고 SQL·Google 로그인·학생 연결 함수를 설정합니다.
              아래 ‘내 Supabase 설정’을 따라 하세요.
            </li>
            <li>
              공통 웹의 연결 화면에 본인 Project URL과 공개 Publishable key를 입력합니다. 배포자의
              Supabase를 공동 사용하지 않습니다.
            </li>
            <li>
              Google 계정으로 로그인한 뒤 표시된 본인 UUID를 본인 Supabase SQL Editor에서 소유자로
              지정하고 교사 회원가입을 완료합니다. 첫 로그인에 자동 권한을 주지 않습니다.
            </li>
            <li>
              학급 추가 → 참여 코드 발급 → 본인 프로젝트용 학생 ZIP 배포 → 기기 확인 후 승인을
              진행합니다.
            </li>
            <li>
              모니터링 ON에서 기록을 수집합니다. OFF는 활동 수집을 중단하되 제어는 유지합니다. 수업
              전 정상·비상 해제를 검증하세요.
            </li>
          </ol>
          <button className="button primary" onClick={() => setTab('operator')}>
            Supabase 가입부터 설정하기
          </button>
          <h3>로그인 정보와 보안</h3>
          <p>
            Google 비밀번호는 Google에, 사용자 UUID·이메일 등 인증 정보는 본인 Supabase Auth에
            저장됩니다. 로그인 유지용 토큰은 브라우저에 저장됩니다. 배포자 공용 회원 DB는 사용하지
            않습니다.
          </p>
          <p>
            Supabase가 인증 서버를 관리해도 웹 코드·배포 계정과 각자의 계정·RLS·비밀키는 관리해야
            합니다. 공통 웹이 침해되면 브라우저 세션도 영향을 받을 수 있어 개인 DB만으로 모든 위험이
            없어지지는 않습니다.
          </p>
        </section>
      )}
      {tab === 'student' && (
        <section className="guide-panel">
          <h2>학생용 ZIP 설치 — 크롬북 기준</h2>
          <ChromebookInstallGuide />
        </section>
      )}
      {tab === 'operator' && (
        <section className="guide-panel">
          <h2>Supabase를 처음 사용하는 교사 안내</h2>
          <p>
            아래 순서를 각 교사가 본인 계정에서 진행합니다. 사이트를 직접 다시 배포하지 않고 같은 웹
            주소에서 각자의 프로젝트에 연결할 수 있습니다.
          </p>
          <p className="guide-warning">
            Free 플랜으로 시작하고 본인 Usage/Pricing을 확인하세요. 무료 사용량은 무제한이 아닙니다.
            서비스 비밀키·DB 비밀번호·Google Client Secret은 이 사이트나 채팅에 입력하지 마세요.
          </p>
          <ol className="help-list setup-steps">
            <li>
              <h3>1. Supabase 가입·프로젝트 생성</h3>
              <p>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                  Supabase Dashboard
                </a>{' '}
                → Sign up → 본인 계정 가입 → New project → Free 조직·플랜 → 프로젝트 이름·DB
                비밀번호·가까운 Region → Create new project. DB 비밀번호는 본인만 안전하게
                보관합니다.
              </p>
            </li>
            <li>
              <h3>2. SQL 네 개 순서대로 실행</h3>
              <p>
                아래 파일 전체 내용을 본인 Supabase SQL Editor → New query에 붙여 넣고 Run 합니다. ①
                성공 후 ②, 다음 ③을 실행하세요. 기존 DB는 먼저 백업합니다. 나중에 예전 ①만 다시
                적용하지 마세요.
              </p>
              <div className="detail-actions">
                <button
                  className="button"
                  onClick={() => download('202610220001_monitoring.sql', baseSql)}
                >
                  ① 기본 SQL 다운로드
                </button>
                <button
                  className="button"
                  onClick={() => download('202611040001_teacher_accounts.sql', teacherSql)}
                >
                  ② 교사 회원가입 SQL 다운로드
                </button>
                <button
                  className="button"
                  onClick={() => download('202611040002_personal_project.sql', personalSql)}
                >
                  ③ 개인 프로젝트 SQL 다운로드
                </button>
                <button
                  className="button"
                  onClick={() => download('202611040003_security_hardening.sql', securitySql)}
                >
                  ④ 보안 업데이트 SQL 다운로드
                </button>
              </div>
              <p>
                Storage의 student-captures는 Public이 꺼져 있어야 합니다. ④를 누락하면 데이터 화면
                접근을 중단합니다.
              </p>
            </li>
            <li>
              <h3>3. Google 로그인 연결</h3>
              <p>
                <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
                  Google Cloud Console
                </a>{' '}
                → 본인 프로젝트 생성 → Google Auth Platform → Branding/Audience 설정 →
                External/Testing에서 본인 계정을 Test users에 추가 → Clients → Web application.
                Supabase Authentication → Google의 Callback URL을 Google의 Authorized redirect
                URIs에 넣습니다.
              </p>
              <p>
                발급된 Client ID/Secret은 본인 Supabase Google 제공자 설정에만 넣습니다. Supabase
                URL Configuration의 Site URL·Redirect URLs에는 실제 공통 웹사이트 주소를 넣으세요.
                Callback과 웹사이트 주소는 다릅니다. 아래 전체 가이드 3절에서 상세 메뉴를
                확인하세요.
              </p>
            </li>
            <li>
              <h3>로그인 설정에 복사할 현재 웹 주소</h3>
              <p>
                Supabase의 Site URL과 Redirect URLs에는 아래 주소를 넣으세요. 개인 프로젝트의 Google
                Callback URL과는 다른 값입니다.
              </p>
              <code className="user-id" aria-label="Supabase 로그인 복귀 주소">
                {websiteUrl}
              </code>
              <p>
                Google의 JavaScript origins 입력란에는 <code>{websiteOrigin}</code>를 넣습니다.
              </p>
            </li>
            <li>
              <h3>4. 본인 학생 연결 서버 배포</h3>
              <p>
                PC에 Node.js 24를 설치하고 최신 프로그램 저장소를 내려받아 압축을 풉니다.
                package.json이 있는 폴더에서 터미널을 열고 실행합니다. YOUR_PROJECT_ID는 본인
                Supabase Settings → General의 Reference ID로 바꾸세요.
              </p>
              <pre className="guide-code">
                {
                  'npx --yes supabase@2.121.0 login\nnpx --yes supabase@2.121.0 functions deploy device --project-ref YOUR_PROJECT_ID --no-verify-jwt'
                }
              </pre>
              <p>
                로그인 토큰을 요구하면 본인 터미널에만 입력합니다. Edge Functions → device에서
                배포를 확인합니다.
              </p>
            </li>
            <li>
              <h3>5. 내 연결값 입력</h3>
              <p>
                Supabase Settings → Data API에서 Project URL, API Keys에서 Publishable key를
                복사합니다. 서비스로 돌아가 ‘내 Supabase Project URL’과 ‘내 Supabase 공개
                Publishable key’에 넣고 ‘내 프로젝트에 연결’을 누릅니다. 이 브라우저에만 저장되며
                GitHub 설정·재배포가 필요하지 않습니다. 다른 기기에서는 다시 연결합니다.
              </p>
            </li>
            <li>
              <h3>6. 로그인·소유자 지정·학생 연결</h3>
              <p>
                Google 로그인 후 웹에 표시되는 UUID를 Supabase Authentication → Users에서
                대조합니다. SQL Editor에서 app_admins에 본인 UUID를 지정하는 SQL을 실행하고 교사
                가입을 완료합니다. 정확한 SQL은 아래 전체 가이드 6절과 가입 화면에 있습니다. 학급
                생성 후 본인 프로젝트용 ZIP으로 크롬북 한 대를 검증하세요.
              </p>
            </li>
          </ol>
          <h3>전체 가입·설정·보안 가이드</h3>
          <p>로그인 정보 저장 위치, 보안 책임 분담, 비용, 문제 해결까지 포함했습니다.</p>
          <button
            className="button"
            onClick={() => download('클래스온-개인-Supabase-가이드.md', setupText)}
          >
            전체 가이드 다운로드
          </button>
          <pre className="guide-reference">{setupText}</pre>
        </section>
      )}
    </main>
  )
}
