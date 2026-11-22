import { useState } from 'react'
import type { ProjectConnection } from '../connection'
import { SetupWizard } from './SetupWizard'

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
  onConnect,
  initialTab = 'operator',
}: {
  onClose: () => void
  onConnect?: (connection: ProjectConnection) => void
  initialTab?: 'teacher' | 'operator'
}) {
  const [tab, setTab] = useState<'teacher' | 'operator' | 'student'>(initialTab)
  return (
    <main className="welcome-guide">
      <header className="guide-header">
        <div>
          <p className="guide-kicker">monitoring 사용 안내</p>
          <h1>처음 오셨나요?</h1>
          <p>처음 설정할 때 필요한 작업을 한 장씩 안내합니다.</p>
        </div>
        <button className="button" onClick={onClose}>
          {onConnect ? '연결 화면으로' : '서비스로 돌아가기'}
        </button>
      </header>
      <nav className="guide-tabs" aria-label="사용 안내 선택">
        <button
          className="button"
          aria-pressed={tab === 'operator'}
          onClick={() => setTab('operator')}
        >
          내 Supabase 설정
        </button>
        <button
          className="button"
          aria-pressed={tab === 'teacher'}
          onClick={() => setTab('teacher')}
        >
          교사 회원가입·시작
        </button>
        <button
          className="button"
          aria-pressed={tab === 'student'}
          onClick={() => setTab('student')}
        >
          학생 크롬북 설치
        </button>
      </nav>
      {tab === 'operator' && <SetupWizard onClose={onClose} onConnect={onConnect} />}
      {tab === 'teacher' && (
        <section className="guide-panel">
          <h2>내 프로젝트로 수업 시작</h2>
          <ol className="help-list">
            <li>‘내 Supabase 설정’을 한 장씩 따라 하며 본인 프로젝트를 연결하세요.</li>
            <li>
              Google로 로그인하고, 교사 회원가입 화면에서 본인을 프로젝트 소유자로 등록하세요.
            </li>
            <li>학급을 만들고 참여 코드와 학생용 ZIP을 전달하세요.</li>
          </ol>
          <p>
            로그인 정보와 학급·학생 기록은 선생님이 연결한 Supabase 프로젝트에 저장됩니다. Chrome이
            탭 정보로 알려 주는 웹사이트와 일부 내부 앱 활동을 확인할 수 있습니다.
          </p>
          <button className="button primary" onClick={() => setTab('operator')}>
            단계별 설정 열기
          </button>
        </section>
      )}
      {tab === 'student' && (
        <section className="guide-panel">
          <h2>학생용 ZIP 설치 — 크롬북 기준</h2>
          <ChromebookInstallGuide />
        </section>
      )}
    </main>
  )
}
