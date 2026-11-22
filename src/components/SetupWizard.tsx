import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react'
import type { ProjectConnection } from '../connection'
import { oauthRedirect } from '../backend'
import { ConnectionSetup } from './ConnectionSetup'
import { CopyButton } from './CopyButton'
import { SetupCapture } from './SetupCapture'
import firstGuide from '../../docs/FIRST_SETUP.ko.md?raw'
import fullGuide from '../../docs/SETUP.ko.md?raw'
import installSql from '../../setup-files/monitoring-install.sql?raw'
import deviceCode from '../../setup-files/device-dashboard.txt?raw'
import baseSql from '../../supabase/migrations/202610220001_monitoring.sql?raw'
import teacherSql from '../../supabase/migrations/202611040001_teacher_accounts.sql?raw'
import personalSql from '../../supabase/migrations/202611040002_personal_project.sql?raw'
import securitySql from '../../supabase/migrations/202611040003_security_hardening.sql?raw'

const stepStorage = 'monitoring-setup-step-v1'
const supabase = 'https://supabase.com/dashboard'
const google = 'https://console.cloud.google.com'
const copyFileFallback = '복사 권한을 확인하거나 내려받은 파일에서 전체 내용을 복사하세요.'

function initialStep() {
  try {
    return localStorage.getItem(stepStorage) || 'project'
  } catch {
    return 'project'
  }
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function OpenScreen({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="button" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={15} aria-hidden="true" />
    </a>
  )
}

function DownloadFile({
  name,
  content,
  children,
}: {
  name: string
  content: string
  children: ReactNode
}) {
  return (
    <button className="button" type="button" onClick={() => download(name, content)}>
      {children}
    </button>
  )
}

type SetupStep = {
  id: string
  place: string
  title: string
  task: ReactNode
  capture?: 'project' | 'sql' | 'functionMenu' | 'functionEditor'
  check: ReactNode
}

export function SetupWizard({
  onClose,
  onConnect,
}: {
  onClose: () => void
  onConnect?: (connection: ProjectConnection) => void
}) {
  const [stepId, setStepId] = useState(initialStep)
  const title = useRef<HTMLHeadingElement>(null)
  const stepList = useRef<HTMLDetailsElement>(null)
  const moved = useRef(false)
  const siteUrl = oauthRedirect()
  const siteOrigin = new URL(siteUrl).origin

  function moveTo(id: string) {
    stepList.current?.removeAttribute('open')
    if (id === stepId) {
      title.current?.focus()
      return
    }
    moved.current = true
    setStepId(id)
    try {
      localStorage.setItem(stepStorage, id)
    } catch {
      // The guide also works without browser storage.
    }
  }

  useEffect(() => {
    if (moved.current) {
      moved.current = false
      title.current?.focus()
    }
  }, [stepId])

  const steps: SetupStep[] = [
    {
      id: 'project',
      place: 'Supabase',
      title: '내 학급 저장공간 만들기',
      task: (
        <>
          <p>
            Supabase에서 가입하거나 로그인한 뒤 <strong>New project</strong>를 누르세요.
          </p>
          <div className="setup-actions">
            <OpenScreen href={supabase}>Supabase 관리 화면 열기</OpenScreen>
          </div>
          <dl className="setup-fields">
            <dt>Organization / Pricing plan</dt>
            <dd>본인 조직에서 Free를 선택하세요. 조직이 없으면 먼저 만들어 주세요.</dd>
            <dt>Project name</dt>
            <dd>알아보기 쉬운 이름을 입력하세요. 예를 들어 monitoring-myclass로 만들 수 있어요.</dd>
            <dt>Database Password</dt>
            <dd>새 비밀번호를 만들고 안전하게 보관하세요.</dd>
            <dt>Region</dt>
            <dd>가까운 지역을 선택하세요.</dd>
          </dl>
          <p>
            마지막에 <strong>Create new project</strong>를 누르세요.
          </p>
        </>
      ),
      capture: 'project',
      check: '새 프로젝트의 관리 화면이 열리면 다음으로 넘어가세요.',
    },
    {
      id: 'database',
      place: 'Supabase · SQL Editor',
      title: '학생 기록 저장공간 설치하기',
      task: (
        <>
          <p>새로 만든 빈 프로젝트에 저장공간을 설치합니다.</p>
          <ol className="setup-instructions">
            <li>
              아래 <strong>통합 설치 SQL 복사</strong>를 누르세요.
            </li>
            <li>
              Supabase 왼쪽 <strong>SQL Editor → New query</strong>를 여세요.
            </li>
            <li>
              큰 코드 입력칸에 전체를 붙여 넣고 <strong>Run</strong>을 누르세요.
            </li>
          </ol>
          <div className="setup-actions">
            <CopyButton label="통합 설치 SQL 복사" value={installSql} fallback={copyFileFallback} />
            <DownloadFile name="monitoring-install.sql" content={installSql}>
              SQL 다운로드
            </DownloadFile>
            <OpenScreen href={supabase + '/project/_/sql/new'}>SQL Editor 열기</OpenScreen>
          </div>
          <p className="setup-hint">
            기존 프로젝트를 업데이트한다면 아래 전체 가이드에서 설치 이력에 맞는 SQL을 확인하세요.
          </p>
        </>
      ),
      capture: 'sql',
      check: (
        <>
          결과에 <code>installed_security_version = 4</code>가 보이면 완료입니다.
        </>
      ),
    },
    {
      id: 'google-account',
      place: 'Google Cloud · Google Auth Platform',
      title: '로그인할 Google 계정 정하기',
      task: (
        <>
          <ol className="setup-instructions">
            <li>
              Google Cloud의 위쪽 프로젝트 선택 메뉴에서 <strong>New project</strong>를 눌러
              프로젝트를 만드세요.
            </li>
            <li>
              <strong>Google Auth Platform</strong>을 열어 시작합니다. <strong>Branding</strong>에서
              앱 이름과 본인 이메일을 입력하세요.
            </li>
            <li>
              <strong>Audience → External</strong>을 선택하세요.{' '}
              <strong>Testing → Test users → Add users</strong>에서 교사로 로그인할 본인 Google
              이메일을 추가하세요.
            </li>
          </ol>
          <div className="setup-actions">
            <OpenScreen href={google + '/auth/overview'}>Google Auth Platform 열기</OpenScreen>
          </div>
        </>
      ),
      check: 'Test users 목록에 로그인할 본인 Google 이메일이 보이면 완료입니다.',
    },
    {
      id: 'google-client',
      place: 'Google Cloud · Clients',
      title: 'Google 로그인에 쓸 값 만들기',
      task: (
        <>
          <p>
            <strong>Clients → Create client</strong>를 누르고 <strong>Web application</strong>을
            선택하세요. Name은 알아보기 쉬운 이름으로 지정합니다.
          </p>
          <dl className="setup-fields">
            <dt>Authorized JavaScript origins → Add URI</dt>
            <dd>
              <code>{siteOrigin}</code>
              <CopyButton label="사이트 출처 주소 복사" value={siteOrigin} />
            </dd>
            <dt>Authorized redirect URIs → Add URI</dt>
            <dd>
              Supabase의 <strong>Authentication → Sign In / Providers → Google</strong>에 표시된{' '}
              <strong>Callback URL</strong>을 복사해 넣으세요.
            </dd>
          </dl>
          <div className="setup-actions">
            <OpenScreen href={google + '/auth/clients'}>Google Clients 열기</OpenScreen>
            <OpenScreen href={supabase + '/project/_/auth/providers?provider=Google'}>
              Supabase Callback URL 찾기
            </OpenScreen>
          </div>
          <p>
            <strong>Create</strong>를 누른 뒤 생성된 Client ID와 Client Secret을 다음 장에서
            사용합니다.
          </p>
        </>
      ),
      check: '생성 결과 화면을 열어 둔 채 다음 장으로 넘어가세요.',
    },
    {
      id: 'google-provider',
      place: 'Supabase · Authentication',
      title: 'Supabase에서 Google 로그인 켜기',
      task: (
        <>
          <p>
            <strong>Authentication → Sign In / Providers → Google</strong>을 여세요.
          </p>
          <dl className="setup-fields">
            <dt>Enable Sign in with Google</dt>
            <dd>ON</dd>
            <dt>Client ID</dt>
            <dd>Google Cloud에서 만든 Client ID</dd>
            <dt>Client Secret</dt>
            <dd>Google Cloud에서 만든 Client Secret. 이 Supabase 설정칸에 입력하세요.</dd>
          </dl>
          <p>
            <strong>Save</strong>를 누르고 <strong>Allow new users to sign up</strong>이 켜져 있는지
            확인하세요.
          </p>
          <div className="setup-actions">
            <OpenScreen href={supabase + '/project/_/auth/providers?provider=Google'}>
              Supabase Google 설정 열기
            </OpenScreen>
          </div>
        </>
      ),
      check: 'Google 제공자가 활성화되고 설정이 저장되면 완료입니다.',
    },
    {
      id: 'redirect',
      place: 'Supabase · URL Configuration',
      title: '로그인하고 돌아올 주소 저장하기',
      task: (
        <>
          <p>
            <strong>Authentication → URL Configuration</strong>에 아래 웹 주소를 입력하세요.
          </p>
          <div className="setup-value">
            <code aria-label="Supabase 로그인 복귀 주소">{siteUrl}</code>
            <CopyButton label="로그인 복귀 주소 복사" value={siteUrl} />
          </div>
          <ol className="setup-instructions">
            <li>
              <strong>Site URL</strong>에 붙여 넣고 저장하세요.
            </li>
            <li>
              <strong>Redirect URLs → Add URL</strong>에 같은 주소를 넣고 추가하세요.
            </li>
          </ol>
          <div className="setup-actions">
            <OpenScreen href={supabase + '/project/_/auth/url-configuration'}>
              URL Configuration 열기
            </OpenScreen>
          </div>
        </>
      ),
      check: '위 주소가 Site URL과 Redirect URLs 양쪽에 보이면 완료입니다.',
    },
    {
      id: 'function-editor',
      place: 'Supabase · Edge Functions',
      title: '학생 연결 서버 편집기 열기',
      task: (
        <>
          <ol className="setup-instructions">
            <li>
              Supabase 왼쪽에서 <strong>Edge Functions</strong>를 누르세요.
            </li>
            <li>
              오른쪽 위 <strong>Deploy a new function</strong>에서 <strong>Via Editor</strong>를
              선택하세요.
            </li>
          </ol>
          <div className="setup-actions">
            <OpenScreen href={supabase + '/project/_/functions'}>Edge Functions 열기</OpenScreen>
          </div>
        </>
      ),
      capture: 'functionMenu',
      check: 'index.ts가 보이는 편집기가 열리면 다음 장으로 넘어가세요.',
    },
    {
      id: 'function-deploy',
      place: 'Supabase · Edge Functions 편집기',
      title: '학생 연결 서버 배포하기',
      task: (
        <>
          <ol className="setup-instructions">
            <li>
              <strong>학생 연결 서버 코드 복사</strong>를 누르고, <strong>index.ts</strong>의 예제를
              복사한 코드 전체로 바꾸세요.
            </li>
            <li>
              <strong>Function name</strong>에 <code>device</code>를 넣고{' '}
              <strong>Deploy function</strong>을 누르세요.
            </li>
            <li>
              배포된 <strong>device → Details</strong>에서{' '}
              <strong>Verify JWT with legacy secret</strong>을 이 함수에만 OFF로 저장하세요. 제공한
              서버 코드가 교사와 학생의 인증을 확인합니다.
            </li>
          </ol>
          <div className="setup-actions">
            <CopyButton
              label="학생 연결 서버 코드 복사"
              value={deviceCode}
              fallback={copyFileFallback}
            />
            <DownloadFile name="device-dashboard.txt" content={deviceCode}>
              서버 코드 다운로드
            </DownloadFile>
          </div>
        </>
      ),
      capture: 'functionEditor',
      check: 'Edge Functions 목록에 device가 있고 Details의 설정이 저장되면 완료입니다.',
    },
    {
      id: 'connect',
      place: 'Supabase → 교사용 웹페이지',
      title: '내 프로젝트 주소와 공개 키 연결하기',
      task: (
        <>
          <dl className="setup-fields">
            <dt>Project URL</dt>
            <dd>
              <strong>Connect</strong> 또는 <strong>Project Settings → Data API</strong>에 표시된{' '}
              <code>https://프로젝트ID.supabase.co</code> 형태의 주소를 복사하세요.
            </dd>
            <dt>Publishable key</dt>
            <dd>
              <strong>Project Settings → API Keys</strong>에서 <code>sb_publishable_</code>로
              시작하는 공개 키 값을 복사하세요.
            </dd>
          </dl>
          <div className="setup-actions">
            <OpenScreen href={supabase + '/project/_/settings/api-keys'}>
              Supabase API Keys 열기
            </OpenScreen>
          </div>
          {onConnect ? (
            <ConnectionSetup
              onConnect={(connection) => {
                onConnect(connection)
                moveTo('teacher')
              }}
            />
          ) : (
            <p className="setup-hint">현재 브라우저에는 프로젝트 연결값이 저장되어 있습니다.</p>
          )}
        </>
      ),
      check: '프로젝트 주소와 공개 키를 저장하면 교사 로그인 안내로 이어집니다.',
    },
    {
      id: 'teacher',
      place: '교사용 웹페이지 · 첫 로그인',
      title: 'Google로 로그인하고 교사 등록하기',
      task: (
        <ol className="setup-instructions">
          <li>
            로그인 화면에서 <strong>Google 계정으로 로그인</strong>을 누르고, Test users에 추가한
            이메일로 로그인하세요.
          </li>
          <li>
            <strong>교사 회원가입</strong> 화면의 UUID를 Supabase{' '}
            <strong>Authentication → Users</strong>에서 본인 이메일의 User UID와 확인하세요.
          </li>
          <li>
            <strong>소유자 등록 SQL 복사</strong>를 눌러 본인 프로젝트의{' '}
            <strong>SQL Editor → New query → Run</strong>에서 실행하세요.
          </li>
          <li>
            교사용 웹페이지에서 사용 안내에 체크하고 <strong>교사 회원가입 완료</strong>를 누르세요.
          </li>
        </ol>
      ),
      check: '‘아직 학급이 없습니다’가 보이면 학급을 추가할 수 있습니다.',
    },
  ]
  const index = Math.max(
    steps.findIndex(({ id }) => id === stepId),
    0,
  )
  const step = steps[index]
  const isLast = index === steps.length - 1

  return (
    <section className="setup-wizard" aria-label="Supabase 단계별 설정">
      <div className="setup-progress">
        <div className="setup-progress-row">
          <span>
            <strong>{index + 1}</strong> / {steps.length} 단계
          </span>
          <details className="setup-step-index" ref={stepList}>
            <summary>단계 목록</summary>
            <ol>
              {steps.map(({ id, title: name }) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={id === step.id ? 'step' : undefined}
                    onClick={() => moveTo(id)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ol>
          </details>
        </div>
        <progress value={index + 1} max={steps.length} aria-label="설정 안내 진행 위치" />
      </div>
      <article className="setup-card" aria-labelledby="setup-card-title" key={step.id}>
        <div className="setup-card-header">
          <p className="setup-place">{step.place}</p>
          <h2 id="setup-card-title" ref={title} tabIndex={-1}>
            {step.title}
          </h2>
        </div>
        <div className={step.capture ? 'setup-card-content has-capture' : 'setup-card-content'}>
          <div className="setup-task">{step.task}</div>
          {step.capture && <SetupCapture name={step.capture} />}
        </div>
        <p className="setup-check">
          <CheckCircle2 size={19} aria-hidden="true" />
          <span>{step.check}</span>
        </p>
      </article>
      <nav className="setup-navigation" aria-label="안내 장 넘기기">
        <button
          className="button"
          type="button"
          disabled={index === 0}
          onClick={() => moveTo(steps[index - 1].id)}
        >
          <ArrowLeft size={17} aria-hidden="true" />
          이전
        </button>
        <button
          className="button primary"
          type="button"
          onClick={() => {
            if (!isLast) moveTo(steps[index + 1].id)
            else if (onConnect) moveTo('connect')
            else onClose()
          }}
        >
          {isLast ? (onConnect ? '연결 설정으로 이동' : '교사 로그인 화면 열기') : '다음'}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </nav>
      <SetupReference siteUrl={siteUrl} siteOrigin={siteOrigin} />
    </section>
  )
}

function SetupReference({ siteUrl, siteOrigin }: { siteUrl: string; siteOrigin: string }) {
  function localize(text: string) {
    return text
      .replaceAll('https://kalapui.com/monitoring/', siteUrl)
      .replaceAll('https://kalapui36.github.io/monitoring/', siteUrl)
      .replaceAll('https://kalapui36.github.io', siteOrigin)
      .replaceAll('https://kalapui.com', siteOrigin)
  }
  const quickText = localize(firstGuide)
  const fullText = localize(fullGuide)
  return (
    <details className="setup-reference">
      <summary>전체 설정 안내 펼치기</summary>
      <div className="setup-actions">
        <DownloadFile name="monitoring-설정-안내.md" content={quickText}>
          전체 가이드 다운로드
        </DownloadFile>
      </div>
      <pre className="guide-reference">{quickText}</pre>
      <details>
        <summary>기존 프로젝트 업데이트 · 운영 안내</summary>
        <div className="setup-actions">
          <DownloadFile name="202610220001_monitoring.sql" content={baseSql}>
            ① 기본 SQL 다운로드
          </DownloadFile>
          <DownloadFile name="202611040001_teacher_accounts.sql" content={teacherSql}>
            ② 교사 회원가입 SQL 다운로드
          </DownloadFile>
          <DownloadFile name="202611040002_personal_project.sql" content={personalSql}>
            ③ 개인 프로젝트 SQL 다운로드
          </DownloadFile>
          <DownloadFile name="202611040003_security_hardening.sql" content={securitySql}>
            ④ 보안 업데이트 SQL 다운로드
          </DownloadFile>
          <DownloadFile name="monitoring-운영-가이드.md" content={fullText}>
            전체 운영 가이드 다운로드
          </DownloadFile>
        </div>
        <pre className="guide-reference">{fullText}</pre>
      </details>
    </details>
  )
}
