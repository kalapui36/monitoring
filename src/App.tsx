import { useCallback, useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Camera,
  ChevronDown,
  GraduationCap,
  Hand,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Megaphone,
  Monitor,
  Plus,
  Search,
  ShieldCheck,
  UnlockKeyhole,
  Users,
  Wifi,
} from 'lucide-react'
import { client as configuredClient, createProjectClient, edge, oauthRedirect } from './backend'
import {
  effectiveStatus,
  lockState,
  online,
  statusNames,
  type Classroom,
  type Command,
  type Student,
} from './models'
import { Modal } from './components/Modal'
import { downloadStudentPackage } from './student-package'
import { WelcomeGuide, ChromebookInstallGuide } from './components/WelcomeGuide'
import { RELEASE_LABEL } from './release'
import { ConnectionSetup } from './components/ConnectionSetup'
import { readConnection, removeConnection } from './connection'

type Action = { kind: Command['kind']; ids: string[]; requestId: string }
type Detail = {
  student: Student
  visits: Record<string, unknown>[]
  events: Record<string, unknown>[]
  captures: { command_id: string; path: string; created_at: string }[]
}
export default function App({ client = configuredClient }: { client?: SupabaseClient | null }) {
  const [activeClient, setActiveClient] = useState(client)
  const [activeProjectUrl, setActiveProjectUrl] = useState(() => readConnection()?.url || '')
  const [connectionError, setConnectionError] = useState('')
  const [changing, setChanging] = useState(false)
  const [showGuide, setShowGuide] = useState(() => {
    if (window.location.hash === '#guide') return true
    try {
      return localStorage.getItem('classon-welcome-v4') !== 'seen'
    } catch {
      return true
    }
  })
  if (showGuide)
    return (
      <WelcomeGuide
        initialTab={activeClient ? 'teacher' : 'operator'}
        onClose={() => {
          setShowGuide(false)
          try {
            localStorage.setItem('classon-welcome-v4', 'seen')
          } catch {
            /* guide remains available without storage */
          }
          if (window.location.hash === '#guide')
            history.replaceState(null, '', window.location.pathname + window.location.search)
        }}
      />
    )
  return (
    <>
      <button className="guide-launch button" onClick={() => setShowGuide(true)}>
        처음 사용 · 설정 안내
      </button>
      {activeClient && (
        <button
          className="button project-switch"
          onClick={async () => {
            setConnectionError('')
            setChanging(true)
            try {
              const r = await activeClient.auth.signOut({ scope: 'local' })
              if (r.error) throw r.error
              if (readConnection()?.url === activeProjectUrl) removeConnection()
              setActiveProjectUrl('')
              activeClient.auth.stopAutoRefresh()
              setActiveClient(null)
            } catch {
              setConnectionError(
                '연결 해제에 실패했습니다. 인터넷·브라우저 저장소를 확인하고 다시 시도하세요.',
              )
            } finally {
              setChanging(false)
            }
          }}
          disabled={changing}
        >
          내 Supabase 연결 해제
        </button>
      )}
      {connectionError && (
        <p className="connection-error" role="alert">
          {connectionError}
        </p>
      )}
      {activeClient ? (
        <ConnectedApp
          key={activeProjectUrl || 'test-client'}
          client={activeClient}
          projectUrl={activeProjectUrl}
        />
      ) : (
        <Access title="클래스온 연결 설정">
          <p className="muted">{RELEASE_LABEL}</p>
          <ConnectionSetup
            onGuide={() => setShowGuide(true)}
            onConnect={(connection) => {
              setActiveProjectUrl(connection.url)
              setActiveClient(createProjectClient(connection))
            }}
          />
        </Access>
      )}
    </>
  )
}

function ConnectedApp({ client, projectUrl }: { client: SupabaseClient; projectUrl: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking')
  const [error, setError] = useState('')
  const [checkVersion, setCheckVersion] = useState(0)
  const [consent, setConsent] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  useEffect(() => {
    let active = true
    client.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session)
        if (error) setError('로그인 세션을 확인하지 못했습니다. 다시 로그인하세요.')
      }
    })
    const { data } = client.auth.onAuthStateChange((_event, value) => {
      if (active) {
        setAccess('checking')
        setSession(value)
      }
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client])
  useEffect(() => {
    let active = true
    if (!session) {
      setAccess('checking')
      return
    }
    async function verify() {
      try {
        const user = await client.auth.getUser()
        if (user.error || !user.data.user) {
          if (active) setSession(null)
          return
        }
        const r = await client.rpc('app_is_teacher')
        if (r.error) throw r.error
        if (r.data === true) {
          const version = await client.rpc('app_security_version')
          if (version.error || typeof version.data !== 'number' || version.data < 4) {
            if (active) {
              setAccess('error')
              setError(
                '보안 업데이트 SQL(④)이 필요합니다. 내 Supabase 설정 안내에서 최신 SQL을 적용하고 서버 함수를 갱신하세요.',
              )
            }
            return
          }
        }
        if (active) {
          setAccess(r.data === true ? 'allowed' : 'denied')
          setError('')
        }
      } catch {
        if (active) {
          setAccess('error')
          setError(
            '교사 가입 상태를 서버에서 확인하지 못했습니다. 인터넷과 SQL 설치 상태를 확인하세요.',
          )
        }
      }
    }
    void verify()
    const timer = setInterval(verify, 60000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [client, session, checkVersion])
  async function logout() {
    await client.auth.signOut({ scope: 'local' })
    setSession(null)
    setAccess('checking')
  }
  if (session === undefined || (session && access === 'checking'))
    return (
      <Access title="로그인·권한 확인 중">
        <p>서버에서 계정 권한을 확인하고 있습니다.</p>
      </Access>
    )
  if (!session)
    return (
      <Access title="수업에 집중하는 교실, 클래스온">
        <p>
          교사용 Google 계정으로 가입하거나 로그인하세요. 가입 후 본인의 학급과 학생을 관리합니다.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button
          className="button primary"
          onClick={async () => {
            const r = await client.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: oauthRedirect() },
            })
            if (r.error)
              setError('Google 로그인을 시작하지 못했습니다. 인증 제공자 설정을 확인하세요.')
          }}
        >
          Google 계정으로 로그인
        </button>
        <button
          className="button"
          onClick={async () => {
            const r = await client.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: oauthRedirect() },
            })
            if (r.error) setError('Google 회원가입을 시작하지 못했습니다. 잠시 후 다시 시도하세요.')
          }}
        >
          Google 계정으로 회원가입
        </button>
        <p className="muted">
          첫 로그인 뒤 내 프로젝트의 소유자 지정과 교사 회원가입 안내를 확인합니다. 서비스 최고
          관리자 권한은 부여되지 않습니다.
        </p>
      </Access>
    )
  if (access !== 'allowed')
    return (
      <Access title={access === 'denied' ? '교사 회원가입' : '연결을 확인해 주세요'}>
        {access === 'denied' ? (
          <>
            <p>
              Google 로그인이 완료되었습니다. 교사 회원으로 가입하면 본인 학급을 만들고 학생을
              연결할 수 있습니다.
            </p>
            <p>
              담당 학급에서 학교 정책과 적절한 권한에 따라 학생을 등록하고, 학생에게 활동 기록·캡처
              수집 범위와 보관 기준을 안내해 주세요.
            </p>
            <p>
              개인 프로젝트의 SQL Editor에서 본인 UUID를 소유자로 지정한 뒤 가입하세요. 다른 사람의
              프로젝트에서 가입하면 안 됩니다.
            </p>
            <code className="user-id">{session.user.id}</code>
            <pre className="guide-code">{`insert into public.app_admins(user_id) values ('${session.user.id}');`}</pre>
            <label className="signup-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              담당 학급과 허용된 학생 기기에서 사용하며 데이터 사용 안내를 확인했습니다.
            </label>
            <button
              className="button primary"
              disabled={!consent || enrolling}
              onClick={async () => {
                setEnrolling(true)
                setError('')
                try {
                  const r = await client.rpc('app_enroll_teacher')
                  if (r.error || r.data !== true)
                    throw new Error(r.error?.message || '회원가입 결과를 확인하지 못했습니다.')
                  setAccess('checking')
                  setCheckVersion((n) => n + 1)
                } catch (e) {
                  setError(e instanceof Error ? e.message : '회원가입에 실패했습니다.')
                } finally {
                  setEnrolling(false)
                }
              }}
            >
              {enrolling ? '가입 처리 중' : '교사 회원가입 완료'}
            </button>
          </>
        ) : (
          <p>{error}</p>
        )}
        {access === 'denied' && error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="detail-actions">
          <button className="button" onClick={() => setCheckVersion((n) => n + 1)}>
            가입 상태 다시 확인
          </button>
          <button className="button" onClick={logout}>
            로그아웃
          </button>
        </div>
      </Access>
    )
  return (
    <Dashboard
      projectUrl={projectUrl}
      client={client}
      userLabel={session.user.user_metadata.full_name || '교사'}
      logout={logout}
    />
  )
}
function Access({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="access-page">
      <div className="access-card">
        <span className="brand-icon">
          <Monitor />
        </span>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}
function Dashboard({
  projectUrl,
  client,
  userLabel,
  logout,
}: {
  client: SupabaseClient
  projectUrl: string
  userLabel: string
  logout: () => Promise<void>
}) {
  const [classes, setClasses] = useState<Classroom[]>([]),
    [students, setStudents] = useState<Student[]>([]),
    [commands, setCommands] = useState<Command[]>([])
  const [classId, setClassId] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(''),
    [kind, setKind] = useState('regular')
  const [action, setAction] = useState<Action | null>(null),
    [message, setMessage] = useState(''),
    [seconds, setSeconds] = useState(5)
  const [detail, setDetail] = useState<Detail | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [issueStudent, setIssueStudent] = useState<Student | null>(null)
  const [settings, setSettings] = useState(false),
    [retention, setRetention] = useState(7),
    [captureDays, setCaptureDays] = useState(1)
  const [code, setCode] = useState<{ title: string; value: string; description: string } | null>(
      null,
    ),
    [guide, setGuide] = useState(false)
  const [image, setImage] = useState<string | null>(null),
    [now, setNow] = useState(Date.now())
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image)
    },
    [image],
  )
  const group = classes.find((c) => c.id === classId)
  const refresh = useCallback(async () => {
    const result = await Promise.all([
      client.from('app_classes').select('*').order('created_at'),
      client.from('app_students').select('*').neq('approval', 'revoked').order('student_number'),
      client.from('app_latest_commands').select('*'),
    ])
    const failed = result.find((r) => r.error)
    if (failed) {
      setError('데이터를 읽지 못했습니다. 연결·로그인·SQL 설치 상태를 확인하세요.')
      setLoading(false)
      return
    }
    setClasses(result[0].data as Classroom[])
    setStudents(result[1].data as Student[])
    setCommands(result[2].data as Command[])
    setClassId((id) =>
      result[0].data!.some((c) => c.id === id) ? id : result[0].data![0]?.id || '',
    )
    setLoading(false)
    setError('')
  }, [client])
  useEffect(() => {
    void refresh()
    let timer: ReturnType<typeof setTimeout>
    const channel = client
      .channel('teacher-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_students' }, () => {
        clearTimeout(timer)
        timer = setTimeout(refresh, 250)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_commands' }, () => {
        clearTimeout(timer)
        timer = setTimeout(refresh, 250)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_classes' }, () => {
        clearTimeout(timer)
        timer = setTimeout(refresh, 250)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh()
      })
    const interval = setInterval(() => {
      setNow(Date.now())
      void refresh()
    }, 15000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      void client.removeChannel(channel)
    }
  }, [client, refresh])
  const roster = students.filter((s) => s.class_id === classId)
  const shown = roster.filter(
    (s) =>
      `${s.name} ${s.student_number} ${s.active_title} ${s.active_url}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'online' && online(s, now)) ||
        (filter === 'offline' && !online(s, now)) ||
        (filter === 'pending' && s.approval === 'pending') ||
        (filter === 'help' && s.help_requested) ||
        (filter === 'locked' && online(s, now) && lockState(commands, s.id, now))),
  )
  function changeClass(id: string) {
    setClassId(id)
    setSelected([])
    setQuery('')
    setFilter('all')
    setFeedback('')
    setDetail(null)
  }
  async function perform(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }
  async function saveClass(
    id: string | null,
    name: string,
    kind: string,
    monitoring: boolean,
    days = 7,
    captures = 1,
  ) {
    const r = await client.rpc('app_save_class', {
      _id: id,
      _name: name.trim(),
      _kind: kind,
      _monitoring: monitoring,
      _days: days,
      _capture_days: captures,
    })
    if (r.error) throw new Error(r.error.message)
    return r.data as string
  }
  function request(
    kind: Command['kind'],
    ids = selected.length
      ? selected
      : roster.filter((s) => s.approval === 'active').map((s) => s.id),
  ) {
    setAction({ kind, ids, requestId: crypto.randomUUID() })
    setMessage(kind === 'lock' ? '선생님의 안내를 확인해 주세요.' : '')
    setSeconds(kind === 'lock' ? 300 : 5)
  }
  async function send() {
    if (!action) return
    const current = action
    await perform(async () => {
      const r = await client.rpc('app_issue_commands', {
        _class: classId,
        _students: current.ids,
        _kind: current.kind,
        _message: message.trim(),
        _duration: seconds,
        _request: current.requestId,
      })
      if (r.error) throw new Error(r.error.message)
      setAction(null)
      setFeedback(`${r.data.length}명에게 명령을 요청했습니다. 실제 기기 적용 결과를 기다립니다.`)
    })
  }
  async function studentAction(id: string, type: string) {
    await perform(async () => {
      const r = await client.rpc('app_manage_student', { _id: id, _action: type })
      if (r.error) throw new Error(r.error.message)
    })
  }
  async function openDetail(s: Student) {
    setDetailLoading(true)
    await perform(async () => {
      const r = await Promise.all([
        client
          .from('app_visits')
          .select('*')
          .eq('student_id', s.id)
          .order('created_at', { ascending: false })
          .limit(100),
        client
          .from('app_events')
          .select('*')
          .eq('student_id', s.id)
          .order('created_at', { ascending: false })
          .limit(100),
        client
          .from('app_captures')
          .select('command_id,path,created_at')
          .eq('uploaded', true)
          .eq('student_id', s.id)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      if (r.some((x) => x.error)) throw new Error('학생 기록을 읽지 못했습니다.')
      setDetail({
        student: s,
        visits: r[0].data!,
        events: r[1].data!,
        captures: r[2].data! as Detail['captures'],
      })
    })
    setDetailLoading(false)
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#main">
          <span className="brand-icon">
            <Monitor />
          </span>
          클래스온<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">TEACHER WORKSPACE</div>
        <nav aria-label="주 메뉴">
          <a className="nav-item active" href="#main">
            <LayoutDashboard size={18} />
            대시보드
          </a>
        </nav>
        <div className="sidebar-section">
          내 학급 <span>{classes.length}</span>
        </div>
        <nav aria-label="학급 목록">
          {classes.map((c) => (
            <button
              key={c.id}
              className={`nav-item class-nav ${c.id === classId ? 'chosen' : ''}`}
              onClick={() => changeClass(c.id)}
            >
              <BookOpen size={17} />
              {c.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck />
          <strong>나의 교사 워크스페이스</strong>
          <p>
            학생 등록은 교사 승인 후<br />
            연결됩니다.
          </p>
        </div>
        <button className="help-button" onClick={() => setGuide(true)}>
          학생 설치 안내
        </button>
        <div className="profile">
          <div className="avatar">교</div>
          <div>
            <strong>{userLabel}</strong>
            <small>교사 회원</small>
          </div>
          <button className="icon-button" aria-label="로그아웃" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">내 워크스페이스 / 대시보드</div>
          <button className="button" onClick={logout}>
            <LogOut size={15} />
            로그아웃
          </button>
        </header>
        <main id="main">
          <section className="page-heading">
            <div>
              <div className="eyebrow">CLASSROOM OVERVIEW</div>
              <h1>우리 반, 지금 한눈에.</h1>
              <p>기기 적용 확인과 최근 수신 정보를 기준으로 표시합니다.</p>
            </div>
            <div className="heading-controls">
              <button className="button" onClick={() => setGuide(true)}>
                학생 설치·ZIP
              </button>
              <button
                className="button"
                onClick={() => {
                  setName('')
                  setAdding(true)
                }}
              >
                <Plus size={16} />
                학급 추가
              </button>
              {classes.length > 0 && (
                <div className="class-picker">
                  <GraduationCap size={18} />
                  <select
                    aria-label="학급 선택"
                    value={classId}
                    onChange={(e) => changeClass(e.target.value)}
                  >
                    {classes.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              )}
            </div>
          </section>
          {error && (
            <div className="storage-warning" role="alert">
              {error}{' '}
              <button className="button" onClick={() => void refresh()}>
                다시 연결
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty-state" role="status">
              학생 데이터를 불러오는 중입니다.
            </div>
          ) : !group ? (
            <div className="empty-state">
              <Users />
              <h2>아직 학급이 없습니다</h2>
              <p>학급을 만든 뒤 참여 코드를 발급하고 학생 기기를 승인하세요.</p>
              <button className="button primary" onClick={() => setAdding(true)}>
                학급 추가
              </button>
            </div>
          ) : (
            <>
              <div className="monitoring-bar">
                <div>
                  <strong>{group.name}</strong>
                  <span>기록 OFF에서도 기기 제어·연결 확인은 유지됩니다.</span>
                </div>
                <div className="detail-actions">
                  <button
                    className="button"
                    onClick={() => {
                      setName(group.name)
                      setRetention(group.retention_days)
                      setCaptureDays(group.capture_retention_days)
                      setSettings(true)
                    }}
                  >
                    학급 설정
                  </button>
                  <button
                    disabled={busy}
                    role="switch"
                    aria-label={`${group.name} 기록`}
                    aria-checked={group.monitoring}
                    className="monitoring-switch"
                    onClick={() =>
                      perform(async () => {
                        await saveClass(
                          group.id,
                          group.name,
                          group.kind,
                          !group.monitoring,
                          group.retention_days,
                          group.capture_retention_days,
                        )
                      })
                    }
                  >
                    <span className={`switch-track ${group.monitoring ? 'on' : ''}`}>
                      <span />
                    </span>
                    {group.monitoring ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              {!group.monitoring && (
                <p className="paused-note">
                  활동 기록 일시 중지 · 마지막 기록을 표시합니다. 잠금·공지·캡처와 안전한 해제는
                  별도로 작동합니다.
                </p>
              )}
              <p className="muted">
                학생 카드에는 최근 감지한 Chrome 활동을 표시합니다. 기기의 모든 앱 실행 상태를
                확인하는 기능은 아닙니다.
              </p>
              <section className="stats-grid" aria-label="학급 통계">
                {[
                  { label: '전체 학생', value: roster.length, icon: <Users />, color: 'blue' },
                  {
                    label: '접속 중',
                    value: roster.filter((s) => online(s, now)).length,
                    icon: <Wifi />,
                    color: 'green',
                  },
                  {
                    label: '승인 대기',
                    value: roster.filter((s) => s.approval === 'pending').length,
                    icon: <ShieldCheck />,
                    color: 'amber',
                  },
                  {
                    label: '도움 요청',
                    value: roster.filter((s) => s.help_requested).length,
                    icon: <Hand />,
                    color: 'gray',
                  },
                ].map((x) => (
                  <article className="stat-card" key={x.label}>
                    <div className="stat-main">
                      <div>
                        <span className="stat-label">{x.label}</span>
                        <div className="stat-value">
                          {x.value}
                          <span>명</span>
                        </div>
                      </div>
                      <span className={`stat-icon ${x.color}`}>{x.icon}</span>
                    </div>
                  </article>
                ))}
              </section>
              <section className="classroom-section">
                <div className="section-title">
                  <div className="title-row">
                    <h2>{group.name}</h2>
                    <span className="count-chip">{roster.length}명</span>
                  </div>
                  <div className="section-actions">
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        request(
                          'unlock',
                          roster.filter((s) => s.approval === 'active').map((s) => s.id),
                        )
                      }
                    >
                      <UnlockKeyhole size={16} />
                      전체 해제
                    </button>
                    <button
                      className="button lock-button"
                      disabled={busy}
                      onClick={() =>
                        request(
                          'lock',
                          roster.filter((s) => s.approval === 'active').map((s) => s.id),
                        )
                      }
                    >
                      <LockKeyhole size={16} />
                      전체 잠금
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        request(
                          'notice',
                          roster.filter((s) => s.approval === 'active').map((s) => s.id),
                        )
                      }
                    >
                      <Megaphone size={16} />
                      전체 공지
                    </button>
                  </div>
                </div>
                <div className="filter-toolbar">
                  <div className="tabs">
                    {[
                      ['all', '전체'],
                      ['online', '접속 중'],
                      ['offline', '오프라인'],
                      ['pending', '승인 대기'],
                      ['help', '도움 요청'],
                      ['locked', '잠금'],
                    ].map(([id, label]) => (
                      <button
                        className={`tab ${filter === id ? 'selected' : ''}`}
                        aria-pressed={filter === id}
                        key={id}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="학생 검색"
                      placeholder="이름·번호·사이트 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="selection-bar">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="검색 결과 전체 선택"
                      checked={shown.length > 0 && shown.every((s) => selected.includes(s.id))}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? Array.from(new Set([...selected, ...shown.map((s) => s.id)]))
                            : selected.filter((id) => !shown.some((s) => s.id === id)),
                        )
                      }
                    />
                    선택 {selected.length}명
                  </label>
                  {selected.length > 0 && (
                    <div className="selection-actions">
                      {[
                        ['lock', '선택 잠금'],
                        ['unlock', '선택 해제'],
                        ['notice', '선택 공지'],
                      ].map(([k, l]) => (
                        <button key={k} onClick={() => request(k as Command['kind'])}>
                          {l}
                        </button>
                      ))}
                      <button onClick={() => setSelected([])}>선택 취소</button>
                    </div>
                  )}
                </div>
                <div role="status" className={feedback ? 'feedback' : 'sr-only'}>
                  {feedback}
                </div>
                <div className="student-grid">
                  {shown.map((s) => {
                    const own = commands.filter((c) => c.student_id === s.id),
                      issues = own.filter((c) =>
                        ['failed', 'expired'].includes(effectiveStatus(c, now)),
                      ),
                      pending = own.some((c) =>
                        ['queued', 'delivered'].includes(effectiveStatus(c, now)),
                      )
                    const locked = online(s, now) && lockState(commands, s.id, now)
                    return (
                      <article
                        className="student-card"
                        aria-label={`${s.name} 학생 카드`}
                        key={s.id}
                      >
                        <div className="card-top">
                          <label className="student-identity">
                            <input
                              type="checkbox"
                              aria-label={`${s.name} 선택`}
                              checked={selected.includes(s.id)}
                              onChange={() =>
                                setSelected((ids) =>
                                  ids.includes(s.id)
                                    ? ids.filter((id) => id !== s.id)
                                    : [...ids, s.id],
                                )
                              }
                            />
                            <span className="student-number">{s.student_number}</span>
                            <strong>{s.name}</strong>
                          </label>
                          <button
                            className="more-button"
                            aria-label={`${s.name} 상세 보기`}
                            disabled={detailLoading}
                            onClick={() => void openDetail(s)}
                          >
                            •••
                          </button>
                        </div>
                        <div className="site-preview">
                          <span className={`site-icon ${locked ? 'locked-icon' : ''}`}>
                            {locked ? <LockKeyhole size={20} /> : <BookOpen size={20} />}
                          </span>
                          <div>
                            <strong>
                              {locked
                                ? '잠금 적용 확인'
                                : s.active_title || '아직 감지된 Chrome 활동 없음'}
                            </strong>
                            <small title={s.active_url} aria-label="최근 감지한 Chrome 활동 주소">
                              {s.active_url || '—'}
                            </small>
                          </div>
                        </div>
                        {(issues.length > 0 || !!s.last_error || s.help_requested || pending) && (
                          <div className="student-signals">
                            {(issues.length > 0 || !!s.last_error) && (
                              <button
                                className="student-error"
                                aria-label={`${s.name} 오류`}
                                onClick={() => setIssueStudent(s)}
                              >
                                <AlertTriangle size={12} />
                                오류
                              </button>
                            )}
                            {s.help_requested && (
                              <button
                                className="help-request"
                                onClick={() => studentAction(s.id, 'help_ack')}
                              >
                                <Hand size={12} />
                                도움 요청 확인
                              </button>
                            )}
                            {pending && <span className="pending-label">기기 적용 확인 대기</span>}
                          </div>
                        )}
                        <div className="card-bottom">
                          <span className={`status-badge ${online(s, now) ? 'online' : 'offline'}`}>
                            <span />
                            {s.approval === 'pending'
                              ? '승인 대기'
                              : online(s, now)
                                ? '접속 중'
                                : '오프라인'}
                          </span>
                          <span className="duration">{Math.floor(s.duration_seconds / 60)}분</span>
                          {s.approval === 'pending' ? (
                            <button
                              className="button"
                              disabled={busy}
                              onClick={() => studentAction(s.id, 'approve')}
                            >
                              승인
                            </button>
                          ) : (
                            <button
                              className="card-lock"
                              aria-label={`${s.name} ${locked ? '해제' : '잠금'}`}
                              onClick={() => request(locked ? 'unlock' : 'lock', [s.id])}
                            >
                              {locked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}
                            </button>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
                {!shown.length && (
                  <div className="empty-state">
                    <Monitor />
                    <h2>
                      {roster.length ? '조건에 맞는 학생이 없습니다' : '연결된 학생이 없습니다'}
                    </h2>
                    <p>참여 코드를 학생에게 전달하고, 확장 등록 신청이 도착하면 승인하세요.</p>
                    <button
                      className="button"
                      onClick={() =>
                        perform(async () => {
                          const r = await edge<{ code: string; expiresAt: string }>(
                            client,
                            'issue_code',
                            { classId: group.id },
                          )
                          setCode({
                            title: '학생 참여 코드',
                            value: r.code,
                            description: `만료: ${new Date(r.expiresAt).toLocaleString('ko-KR')} · 코드만으로 데이터 열람은 불가능하며 교사 승인이 필요합니다.`,
                          })
                        })
                      }
                    >
                      참여 코드 발급
                    </button>
                  </div>
                )}
                <footer className="grid-footer">
                  <span>
                    {roster.length}명 중 {shown.length}명 표시
                  </span>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        const r = await edge<{ code: string; expiresAt: string }>(
                          client,
                          'issue_code',
                          { classId: group.id },
                        )
                        setCode({
                          title: '학생 참여 코드',
                          value: r.code,
                          description: `1시간 유효 · 최대 20회 등록 신청 · 교사 승인 필요 · 만료 ${new Date(r.expiresAt).toLocaleTimeString('ko-KR')}`,
                        })
                      })
                    }
                  >
                    참여 코드 발급
                  </button>
                </footer>
              </section>
            </>
          )}
          <div className="bottom-note">
            <ShieldCheck size={14} />
            학교 정책 안에서 사용하는 Chrome 브라우저 제어입니다. 운영체제 전체 잠금을 의미하지
            않습니다.
          </div>
        </main>
      </div>
      {adding && (
        <Modal title="학급 추가" onClose={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void perform(async () => {
                const id = await saveClass(null, name, kind, false)
                setClassId(id)
                setAdding(false)
                setName('')
              })
            }}
          >
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <label className="field-label" htmlFor="class-name">
              학급 이름
            </label>
            <input
              id="class-name"
              className="text-field"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="field-label" htmlFor="kind">
              학급 유형
            </label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="regular">정규 학급</option>
              <option value="club">동아리</option>
              <option value="external">외부 수업</option>
            </select>
            <p className="muted">
              새 학급은 기록 OFF로 시작합니다. 학생은 실제 기기 등록 후 표시됩니다.
            </p>
            <div className="modal-actions">
              <button className="button primary" disabled={busy || !name.trim()}>
                학급 만들기
              </button>
            </div>
          </form>
        </Modal>
      )}
      {action && (
        <Modal
          title={`${{ lock: '화면 잠금', unlock: '화면 해제', notice: '공지 전송', capture: '화면 캡처' }[action.kind]} 요청`}
          onClose={() => setAction(null)}
        >
          <p>
            {action.ids.length}명 대상 · 요청과 기기 적용 완료는 다릅니다. 오프라인 기기의 미적용
            명령은 만료됩니다.
          </p>
          {['lock', 'notice'].includes(action.kind) && (
            <>
              <label className="field-label" htmlFor="message">
                {action.kind === 'lock' ? '잠금 화면 문구' : '공지 내용'}
              </label>
              <textarea
                id="message"
                value={message}
                maxLength={500}
                onChange={(e) => setMessage(e.target.value)}
              />
              <label className="field-label" htmlFor="seconds">
                {action.kind === 'lock'
                  ? '자동 해제까지 (초, 최대 600)'
                  : '표시 시간 (초, 최대 60)'}
              </label>
              <input
                className="text-field"
                id="seconds"
                type="number"
                min={1}
                max={action.kind === 'lock' ? 600 : 60}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
              />
            </>
          )}
          {action.kind === 'capture' && (
            <p className="muted">
              학교 정책과 확장 권한이 허용한 활성 웹 탭만 캡처합니다. 잠금 중에는 먼저 해제하세요.
              캡처는 비공개 버킷에 저장합니다.
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button" onClick={() => setAction(null)}>
              취소
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !action.ids.length ||
                (['lock', 'notice'].includes(action.kind) &&
                  (!message.trim() || seconds < 1 || seconds > (action.kind === 'lock' ? 600 : 60)))
              }
              onClick={send}
            >
              {busy ? '요청 중…' : '기기에 요청'}
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={`${detail.student.name} 상세 기록`} onClose={() => setDetail(null)}>
          <p>
            학급: {classes.find((c) => c.id === detail.student.class_id)?.name} · 마지막 수신:{' '}
            {detail.student.last_seen
              ? new Date(detail.student.last_seen).toLocaleString('ko-KR')
              : '없음'}
          </p>
          <div className="detail-actions">
            <button
              className="button"
              onClick={() => {
                setDetail(null)
                request('notice', [detail.student.id])
              }}
            >
              <Bell size={15} />
              개별 공지
            </button>
            <button
              className="button"
              onClick={() => {
                setDetail(null)
                request('capture', [detail.student.id])
              }}
            >
              <Camera size={15} />
              캡처 요청
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void openDetail(detail.student)}
            >
              기록 새로고침
            </button>
          </div>
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              const name = window.prompt('학생 이름', detail.student.name)
              if (name === null) return
              const number = window.prompt('학생 번호', String(detail.student.student_number))
              if (number === null) return
              void perform(async () => {
                const r = await client.rpc('app_edit_student', {
                  _id: detail.student.id,
                  _name: name,
                  _number: Number(number),
                })
                if (r.error) throw new Error(r.error.message)
                setDetail(null)
              })
            }}
          >
            학생 정보 수정
          </button>
          <h3>방문 기록 (최근 100건)</h3>
          <ul className="record-list">
            {detail.visits.map((v) => (
              <li key={String(v.id)}>
                <time>{new Date(String(v.created_at)).toLocaleTimeString('ko-KR')}</time>
                <span>
                  {String(v.title)}
                  <small>{String(v.url)}</small>
                </span>
                <strong>{Math.floor(Number(v.duration_seconds) / 60)}분</strong>
              </li>
            ))}
          </ul>
          {!detail.visits.length && <p className="muted">저장된 방문 기록이 없습니다.</p>}
          <h3>연결·도움 요청 기록</h3>
          <ul className="record-list">
            {detail.events.map((e) => (
              <li key={String(e.id)}>
                <time>{new Date(String(e.created_at)).toLocaleTimeString('ko-KR')}</time>
                <span>
                  {String(e.kind)} {String(e.detail)}
                </span>
              </li>
            ))}
          </ul>
          <h3>화면 캡처</h3>
          {!detail.captures.length && <p className="muted">보관 중인 캡처가 없습니다.</p>}
          {detail.captures.map((c) => (
            <button
              className="button"
              key={c.command_id}
              onClick={() =>
                perform(async () => {
                  const r = await client.storage.from('student-captures').download(c.path)
                  if (r.error) throw new Error('캡처 접근 권한을 확인하세요.')
                  setImage(URL.createObjectURL(r.data))
                })
              }
            >
              {new Date(c.created_at).toLocaleString('ko-KR')} 캡처 열기
            </button>
          ))}
          <p className="muted">
            로그인 권한으로 내려받은 이미지이며 공개 파일 URL을 만들지 않습니다.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  '이 기기의 등록을 폐기할까요? 다시 연결하려면 새 등록 승인이 필요합니다.',
                )
              )
                void studentAction(detail.student.id, 'revoke').then(() => setDetail(null))
            }}
          >
            기기 등록 폐기
          </button>
        </Modal>
      )}
      {image && (
        <Modal title="비공개 화면 캡처" onClose={() => setImage(null)}>
          <img style={{ width: '100%' }} src={image} alt="교사가 요청한 학생 활성 탭 캡처" />
        </Modal>
      )}
      {issueStudent && (
        <Modal title={`${issueStudent.name} 오류 상세`} onClose={() => setIssueStudent(null)}>
          {issueStudent.last_error && (
            <p>기기 연결: {issueStudent.last_error} · 인터넷과 확장 실행 상태를 확인하세요.</p>
          )}
          {commands
            .filter(
              (c) =>
                c.student_id === issueStudent.id &&
                ['failed', 'expired'].includes(effectiveStatus(c, now)),
            )
            .map((c) => (
              <div className="issue-detail" key={c.id}>
                <h3>
                  {c.kind} · {statusNames[effectiveStatus(c, now)]}
                </h3>
                <p>{c.error || '기기의 적용 확인이 기한 내 도착하지 않았습니다.'}</p>
                <p className="muted">
                  기기의 인터넷·확장 상태를 확인하세요. 캡처는 일반 웹 탭을 활성화하고 잠금을
                  해제하세요. 만료된 명령은 자동 실행하지 않습니다. 필요하면 새 명령을 요청하세요.
                </p>
              </div>
            ))}
        </Modal>
      )}
      {settings && group && (
        <Modal title="학급 설정" onClose={() => setSettings(false)}>
          <label className="field-label" htmlFor="edit-class-name">
            학급 이름
          </label>
          <input
            className="text-field"
            id="edit-class-name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <label className="field-label" htmlFor="history-days">
            방문·이벤트 보관 기간 (1~30일)
          </label>
          <input
            className="text-field"
            id="history-days"
            type="number"
            min={1}
            max={30}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
          />
          <label className="field-label" htmlFor="capture-days">
            캡처 보관 기간 (1~7일)
          </label>
          <input
            className="text-field"
            id="capture-days"
            type="number"
            min={1}
            max={7}
            value={captureDays}
            onChange={(e) => setCaptureDays(Number(e.target.value))}
          />
          <p className="muted">
            기간이 지난 캡처는 화면에서 숨깁니다. 실제 파일·기록 삭제는 아래 정리를 실행하세요.
          </p>
          <div className="detail-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await saveClass(
                    group.id,
                    name,
                    group.kind,
                    group.monitoring,
                    retention,
                    captureDays,
                  )
                  setSettings(false)
                })
              }
            >
              저장
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await edge(client, 'cleanup')
                  setFeedback('기간이 지난 기록과 캡처 정리를 실행했습니다.')
                })
              }
            >
              보관 기간 지난 기록 정리
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  const r = await edge<{ code: string }>(client, 'recovery_code', {
                    classId: group.id,
                  })
                  setCode({
                    title: '교사 비상 해제 코드',
                    value: r.code,
                    description:
                      '기기가 서버와 동기화한 뒤 오프라인에서도 사용할 수 있습니다. 재발급하면 이전 코드는 무효입니다. 이 화면을 닫으면 원문은 다시 표시하지 않습니다.',
                  })
                })
              }
            >
              비상 해제 코드 발급
            </button>
          </div>
        </Modal>
      )}
      {code && (
        <Modal title={code.title} onClose={() => setCode(null)}>
          <code className="user-id">{code.value}</code>
          <p>{code.description}</p>
          <button
            className="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(code.value)
                .catch(() => setError('코드를 직접 선택해 복사하세요.'))
            }
          >
            코드 복사
          </button>
        </Modal>
      )}
      {guide && (
        <Modal title="학생 확장 설치" onClose={() => setGuide(false)}>
          <ChromebookInstallGuide />
          <button
            className="button primary"
            onClick={() => {
              try {
                downloadStudentPackage(projectUrl)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'ZIP 생성 실패')
              }
            }}
          >
            학생용 ZIP 다운로드
          </button>
        </Modal>
      )}
    </div>
  )
}
