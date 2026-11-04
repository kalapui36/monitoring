import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  Megaphone,
  Monitor,
  Plus,
  AlertTriangle,
  Camera,
  Hand,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UnlockKeyhole,
  Users,
  Wifi,
  X,
} from 'lucide-react'
import {
  createClass,
  kindLabels,
  statusLabels,
  type ClassKind,
  type Status,
  type Student,
} from './data'
import { downloadStudentPackage } from './student-package'
import { classValidation, loadClasses, saveClasses } from './class-settings'
import {
  CommandFailure,
  DemoTransport,
  offlineIssue,
  operationLabels,
  withRetry,
  type Command,
} from './commands'

type Action = { type: 'lock' | 'unlock' | 'notice' | 'capture'; ids: string[]; scope: string }
function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = ref.current!
    const elements = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      )
    elements()[0]?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
      if (event.key === 'Tab') {
        const all = elements()
        const first = all[0]
        const last = all[all.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    panel.addEventListener('keydown', keydown)
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      panel.removeEventListener('keydown', keydown)
      document.body.style.overflow = old
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [classes, setClasses] = useState(loadClasses)
  const [classId, setClassId] = useState(() => classes[0].id)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | Status | 'locked'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [issueStudentId, setIssueStudentId] = useState<string | null>(null)
  const [addingClass, setAddingClass] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<ClassKind>('regular')
  const [newCount, setNewCount] = useState(20)
  const [formError, setFormError] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [lockMinutes, setLockMinutes] = useState(5)
  const transport = useRef(new DemoTransport())
  const pending = useRef(
    new Map<string, { classId: string; type: Command['type']; controller: AbortController }>(),
  )
  const lastCommands = useRef(new Map<string, Command>())
  const classesRef = useRef(classes)
  classesRef.current = classes
  const [installGuide, setInstallGuide] = useState(false)
  const [packageError, setPackageError] = useState('')
  const [help, setHelp] = useState(false)
  const classroom = classes.find((item) => item.id === classId)!
  const students = classroom.students
  const detail = students.find((s) => s.id === detailId) || null
  const issueStudent = students.find((s) => s.id === issueStudentId) || null
  function setDetail(student: Student | null) {
    setDetailId(student?.id || null)
  }
  const settingsSignature = JSON.stringify(
    classes.map((c) => [c.id, c.name, c.kind, c.monitoring, c.students.length]),
  )
  useEffect(() => {
    setStorageError(!saveClasses(classes))
  }, [settingsSignature])
  useEffect(
    () => () => {
      pending.current.forEach((p) => p.controller.abort())
      pending.current.clear()
    },
    [],
  )
  const hasLocks = classes.some((c) => c.students.some((s) => s.locked))
  useEffect(() => {
    if (!hasLocks) return
    const timer = setInterval(
      () =>
        setClasses((items) => {
          const now = Date.now()
          if (
            !items.some((c) =>
              c.students.some(
                (s) => s.locked && s.lockExpiresAt !== null && s.lockExpiresAt <= now,
              ),
            )
          )
            return items
          return items.map((c) => ({
            ...c,
            students: c.students.map((s) =>
              s.locked && s.lockExpiresAt !== null && s.lockExpiresAt <= now
                ? { ...s, locked: false, lockMessage: '', lockExpiresAt: null }
                : s,
            ),
          }))
        }),
      1000,
    )
    return () => clearInterval(timer)
  }, [hasLocks])
  const counts = {
    online: students.filter((s) => s.status === 'online').length,
    away: students.filter((s) => s.status === 'away').length,
    offline: students.filter((s) => s.status === 'offline').length,
    locked: students.filter((s) => s.locked).length,
  }
  const visible = students.filter(
    (s) =>
      (filter === 'all' || (filter === 'locked' ? s.locked : s.status === filter)) &&
      `${s.name} ${s.number} ${s.site} ${s.domain}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.includes(s.id))
  function changeClass(id: string) {
    setClassId(id)
    setDetailId(null)
    setIssueStudentId(null)
    setAction(null)
    setSelected([])
    setQuery('')
    setFilter('all')
    setFeedback('')
  }
  function toggle(id: string) {
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    )
  }
  function openAction(
    type: Action['type'],
    ids = selected.length ? selected : students.map((s) => s.id),
    scope = selected.length ? `선택 학생 ${selected.length}명` : '학급 전체',
  ) {
    setMessage(type === 'lock' ? '수업에 집중해 주세요.' : '')
    setAction({ type, ids, scope })
  }
  function updateStudent(targetClass: string, id: string, update: (student: Student) => Student) {
    setClasses((items) =>
      items.map((c) =>
        c.id === targetClass
          ? { ...c, students: c.students.map((s) => (s.id === id ? update(s) : s)) }
          : c,
      ),
    )
  }
  function simulateConnection(id: string) {
    updateStudent(classId, id, (s) => {
      const offline = s.status !== 'offline'
      const issues = { ...s.issues }
      if (offline) issues.connection = offlineIssue('connection')
      else delete issues.connection
      return {
        ...s,
        status: offline ? 'offline' : 'online',
        issues,
        connections: [
          ...s.connections,
          {
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            event: offline ? '가상 연결 종료' : '가상 재연결',
          },
        ],
      }
    })
  }
  function toggleMonitoring() {
    setClasses((items) =>
      items.map((c) => (c.id === classId ? { ...c, monitoring: !c.monitoring } : c)),
    )
    setFeedback(
      classroom.monitoring
        ? '이 학급의 가상 기록을 일시 중지했습니다. 잠금·해제·공지·캡처 기능은 계속 사용할 수 있습니다.'
        : '이 학급의 가상 기록을 다시 시작했습니다.',
    )
  }
  function addClass() {
    const error = classValidation(classes, newName, newCount)
    if (error) {
      setFormError(error)
      return
    }
    const id = `group-${crypto.randomUUID()}`
    setClasses((items) => [...items, createClass(id, newName.trim(), newKind, newCount)])
    changeClass(id)
    setAddingClass(false)
    setNewName('')
    setFormError('')
  }
  async function runCommand(
    targetClass: string,
    id: string,
    command: Command,
    minutes = lockMinutes,
  ) {
    const group = classesRef.current.find((c) => c.id === targetClass)
    const student = group?.students.find((s) => s.id === id)
    if (!group || !student) return
    const running = pending.current.get(id)
    if (running) {
      if (command.type !== 'unlock') return
      running.controller.abort()
    }
    lastCommands.current.set(`${id}:${command.type}`, command)
    if (student.status === 'offline' && command.type !== 'unlock') {
      updateStudent(targetClass, id, (s) => ({
        ...s,
        issues: { ...s.issues, [command.type]: offlineIssue(command.type) },
      }))
      return
    }
    const controller = new AbortController()
    pending.current.set(id, { classId: targetClass, type: command.type, controller })
    updateStudent(targetClass, id, (s) => ({ ...s, pending: '처리 중' }))
    try {
      await withRetry(
        () => transport.current.execute(id, command),
        controller.signal,
        (attempt) =>
          updateStudent(targetClass, id, (s) => ({ ...s, pending: `자동 재시도 ${attempt}/2` })),
      )
      updateStudent(targetClass, id, (s) => {
        if (controller.signal.aborted) return s
        const issues = { ...s.issues }
        delete issues[command.type]
        if (command.type === 'unlock') delete issues.lock
        return {
          ...s,
          issues,
          pending: null,
          ...(command.type === 'lock'
            ? {
                locked: true,
                lockMessage: command.text,
                lockExpiresAt: Date.now() + minutes * 60000,
              }
            : {}),
          ...(command.type === 'unlock'
            ? { locked: false, lockMessage: '', lockExpiresAt: null }
            : {}),
        }
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        const issue =
          error instanceof CommandFailure
            ? error.issue
            : {
                operation: command.type,
                code: 'UNKNOWN',
                cause: '요청을 처리하지 못했습니다.',
                solution: '현재 연결 상태를 확인한 뒤 다시 시도하세요.',
                retryable: false,
              }
        updateStudent(targetClass, id, (s) => ({
          ...s,
          pending: null,
          issues: { ...s.issues, [command.type]: issue },
        }))
      }
    } finally {
      if (pending.current.get(id)?.controller === controller) {
        pending.current.delete(id)
        if (controller.signal.aborted)
          updateStudent(targetClass, id, (s) => ({ ...s, pending: null }))
      }
    }
  }
  function applyAction() {
    if (!action || ((action.type === 'notice' || action.type === 'lock') && !message.trim())) return
    const targetClass = classId
    const command: Command = { id: crypto.randomUUID(), type: action.type, text: message.trim() }
    const excluded = students.filter(
      (s) => action.ids.includes(s.id) && s.status === 'offline' && action.type !== 'unlock',
    ).length
    for (const id of action.ids) void runCommand(targetClass, id, command)
    setFeedback(
      `${action.type === 'notice' ? '공지 미리보기' : operationLabels[action.type]} 시뮬레이션을 요청했습니다${excluded ? ` · 오프라인 ${excluded}명 제외` : ''}. 결과와 오류는 해당 학생 카드에서 확인하세요. 실제 기기에는 전송되지 않았습니다.`,
    )
    setAction(null)
  }
  const targetCount = action
    ? students.filter(
        (s) => action.ids.includes(s.id) && (s.status !== 'offline' || action.type === 'unlock'),
      ).length
    : 0

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#main">
          <span className="brand-icon">
            <Monitor size={23} />
          </span>
          클래스온<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">TEACHER WORKSPACE</div>
        <nav aria-label="주 메뉴">
          <a href="#main" className="nav-item active">
            <LayoutDashboard size={19} />
            대시보드
            <span className="nav-dot" />
          </a>
        </nav>
        <div className="sidebar-section">
          내 학급 <span>{classes.length}</span>
        </div>
        <nav aria-label="학급 목록">
          {classes.map((c) => (
            <button
              key={c.id}
              aria-current={classId === c.id ? 'page' : undefined}
              className={`nav-item class-nav ${classId === c.id ? 'chosen' : ''}`}
              onClick={() => changeClass(c.id)}
            >
              <BookOpen size={18} />
              {c.name}
              <ChevronRight size={15} />
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>안전한 교실의 시작</strong>
          <p>
            학생의 배움에 집중하는
            <br />
            수업을 함께 만들어가요.
          </p>
          <span>가상 데이터로 체험 중</span>
        </div>
        <button className="help-button" onClick={() => setHelp(true)}>
          <CircleHelp size={18} />
          사용 안내
          <ArrowUpRight size={15} />
        </button>
        <div className="profile">
          <div className="avatar">김</div>
          <div>
            <strong>김선생님</strong>
            <small>가상 교사 · 데모 계정</small>
          </div>
          <span className="demo-pill">DEMO</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            내 워크스페이스
            <ChevronRight size={14} />
            <strong>대시보드</strong>
          </div>
          <div className="topbar-right">
            <span className="sandbox">
              <span />
              데모 환경
            </span>
            <button className="icon-button" aria-label="데모 안내" onClick={() => setHelp(true)}>
              <Bell size={19} />
            </button>
            <div className="avatar small">김</div>
          </div>
        </header>
        <main id="main">
          <section className="page-heading">
            <div>
              <div className="eyebrow">CLASSROOM OVERVIEW</div>
              <h1>
                우리 반, 지금 한눈에<span className="heading-dot">.</span>
              </h1>
              <p>학생들의 학습 현황을 살펴보고, 수업의 흐름을 이어가세요.</p>
            </div>
            <div className="heading-controls">
              <button
                className="button"
                onClick={() => {
                  setPackageError('')
                  setInstallGuide(true)
                }}
              >
                학생 설치 안내
              </button>
              <button
                className="button"
                onClick={() => {
                  setNewName('')
                  setFormError('')
                  setAddingClass(true)
                }}
              >
                <Plus size={16} />
                학급 추가
              </button>
              <div className="class-picker">
                <GraduationCap size={19} />
                <select
                  aria-label="학급 선택"
                  value={classId}
                  onChange={(e) => changeClass(e.target.value)}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </div>
            </div>
          </section>

          <div className="demo-banner">
            <span className="demo-banner-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>지금은 가상 교실입니다.</strong> 모든 학생 정보는 예시이며, 잠금과 공지는 이
              화면에서만 시뮬레이션됩니다.
            </div>
            <span className="phase-tag">1단계 · 대시보드</span>
          </div>

          {storageError && (
            <p className="storage-warning" role="alert">
              학급 설정을 브라우저에 저장하지 못했습니다. 현재 화면에서는 계속 사용할 수 있지만
              새로고침하면 설정이 초기화될 수 있습니다.
            </p>
          )}
          <div className="monitoring-bar">
            <div>
              <strong>{kindLabels[classroom.kind]}</strong>
              <span>학급별 기록 ON/OFF · 제어와 별도</span>
            </div>
            <button
              className="monitoring-switch"
              role="switch"
              aria-label={`${classroom.name} 모니터링`}
              aria-checked={classroom.monitoring}
              onClick={toggleMonitoring}
            >
              <span className={classroom.monitoring ? 'switch-track on' : 'switch-track'}>
                <span />
              </span>
              {classroom.monitoring ? 'ON' : 'OFF'}
            </button>
          </div>
          {!classroom.monitoring && (
            <p className="paused-note">
              이 학급의 기록을 일시 중지했습니다. 마지막 가상 상태를 표시하며 잠금·해제·공지·캡처는
              계속 사용할 수 있습니다. 다른 학급의 설정은 유지됩니다.
            </p>
          )}
          <section className="stats-grid" aria-label="학급 통계">
            <Stat
              label="전체 학생"
              value={students.length}
              caption={classroom.name}
              icon={<Users size={21} />}
              color="blue"
            />
            <Stat
              label="접속 중"
              value={counts.online}
              caption={
                classroom.monitoring
                  ? `전체의 ${students.length ? Math.round((counts.online / students.length) * 100) : 0}%가 접속 중`
                  : '모니터링 OFF · 마지막 가상 상태'
              }
              icon={<Wifi size={21} />}
              color="green"
            />
            <Stat
              label="자리 비움"
              value={counts.away}
              caption="가상 유휴 상태"
              icon={<Clock3 size={21} />}
              color="amber"
            />
            <Stat
              label="오프라인"
              value={counts.offline}
              caption="현재 연결되지 않은 학생"
              icon={<Monitor size={21} />}
              color="gray"
            />
          </section>

          <section className="classroom-section" aria-labelledby="classroom-title">
            <div className="section-title">
              <div className="title-row">
                <h2 id="classroom-title">{classroom.name}</h2>
                <span className="count-chip">{students.length}명</span>
                <span className="snapshot-label">
                  <span />
                  가상 상태 스냅샷
                </span>
              </div>
              <div className="section-actions">
                <button
                  className="button"
                  onClick={() =>
                    openAction(
                      'unlock',
                      students.map((s) => s.id),
                      '학급 전체',
                    )
                  }
                >
                  <UnlockKeyhole size={16} />
                  전체 해제
                </button>
                <button
                  className="button lock-button"

                  onClick={() =>
                    openAction(
                      'lock',
                      students.map((s) => s.id),
                      '학급 전체',
                    )
                  }
                >
                  <LockKeyhole size={16} />
                  전체 잠금
                </button>
                <button
                  className="button primary"

                  onClick={() =>
                    openAction(
                      'notice',
                      students.map((s) => s.id),
                      '학급 전체',
                    )
                  }
                >
                  <Megaphone size={17} />
                  전체 공지
                </button>
              </div>
            </div>
            <div className="filter-toolbar">
              <div className="tabs" role="group" aria-label="학생 상태 필터">
                {(
                  [
                    { id: 'all', label: '전체', count: students.length },
                    { id: 'online', label: '접속 중', count: counts.online },
                    { id: 'away', label: '자리 비움', count: counts.away },
                    { id: 'offline', label: '오프라인', count: counts.offline },
                    { id: 'locked', label: '잠금', count: counts.locked },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    aria-pressed={filter === tab.id}
                    className={`tab ${filter === tab.id ? 'selected' : ''}`}
                    onClick={() => setFilter(tab.id)}
                  >
                    {tab.label}
                    <span>{tab.count}</span>
                  </button>
                ))}
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="학생 검색"
                  placeholder="이름, 번호, 사이트 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button aria-label="검색 초기화" onClick={() => setQuery('')}>
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
            <div className="selection-bar">
              <label>
                <input
                  type="checkbox"
                  aria-label="검색 결과 전체 선택"
                  checked={allVisibleSelected}
                  disabled={!visible.length}
                  onChange={() =>
                    setSelected((ids) =>
                      allVisibleSelected
                        ? ids.filter((id) => !visible.some((s) => s.id === id))
                        : Array.from(new Set([...ids, ...visible.map((s) => s.id)])),
                    )
                  }
                />
                <span>{selected.length ? `${selected.length}명 선택됨` : '전체 선택'}</span>
              </label>
              {selected.length > 0 ? (
                <div className="selection-actions">
                  <button onClick={() => openAction('lock')}>선택 잠금</button>
                  <button onClick={() => openAction('unlock')}>선택 해제</button>
                  <button onClick={() => openAction('notice')}>선택 공지</button>
                  <button onClick={() => setSelected([])}>선택 취소</button>
                </div>
              ) : (
                <span className="sort-label">
                  출석번호순
                  <ArrowDown size={13} />
                </span>
              )}
            </div>
            <div role="status" className={feedback ? 'feedback' : 'sr-only'}>
              {feedback}
            </div>
            <div className="student-grid">
              {visible.map((s) => (
                <article
                  key={s.id}
                  className={`student-card ${s.status} ${selected.includes(s.id) ? 'is-selected' : ''}`}
                  aria-label={`${s.name} 학생 카드`}
                >
                  <div className="card-top">
                    <label className="student-identity">
                      <input
                        type="checkbox"
                        aria-label={`${s.name} 선택`}
                        checked={selected.includes(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="student-number">{String(s.number).padStart(2, '0')}</span>
                      <strong>{s.name}</strong>
                    </label>
                    <button
                      className="more-button"
                      aria-label={`${s.name} 상세 보기`}
                      onClick={() => setDetail(s)}
                    >
                      <MoreHorizontal size={19} />
                    </button>
                  </div>
                  <div className="site-preview">
                    {s.locked ? (
                      <>
                        <span className="site-icon locked-icon">
                          <LockKeyhole size={21} />
                        </span>
                        <div>
                          <strong>잠금 시뮬레이션</strong>
                          <small title={s.lockMessage}>{s.lockMessage}</small>
                        </div>
                      </>
                    ) : s.status === 'offline' ? (
                      <>
                        <span className="site-icon offline-icon">
                          <Monitor size={21} />
                        </span>
                        <div>
                          <strong>연결되지 않음</strong>
                          <small>사이트 정보 없음</small>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className={`site-icon site-${s.number % 5}`}>
                          <BookOpen size={21} />
                        </span>
                        <div>
                          <strong>{s.site}</strong>
                          <small>{s.domain}</small>
                        </div>
                      </>
                    )}
                  </div>
                  {(Object.keys(s.issues).length > 0 || s.pending || s.helpRequested) && (
                    <div className="student-signals">
                      {Object.keys(s.issues).length > 0 && (
                        <button
                          className="student-error"
                          aria-label={`${s.name} 오류 ${Object.keys(s.issues).length}건`}
                          onClick={() => setIssueStudentId(s.id)}
                        >
                          <AlertTriangle size={12} />
                          오류 {Object.keys(s.issues).length}
                        </button>
                      )}
                      {s.pending && (
                        <span className="pending-label" role="status">
                          {s.pending}
                        </span>
                      )}
                      {s.helpRequested && (
                        <button
                          className="help-request"
                          aria-label={`${s.name} 도움 요청`}
                          onClick={() => setDetail(s)}
                        >
                          <Hand size={12} />
                          도움 요청
                        </button>
                      )}
                    </div>
                  )}
                  <div className="card-bottom">
                    <span className={`status-badge ${s.status}`}>
                      <span />
                      {statusLabels[s.status]}
                    </span>
                    <span className="duration">
                      {s.status !== 'offline' ? (
                        <>
                          <Clock3 size={12} />
                          {s.minutes}분
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                    <button
                      className="card-lock"
                      disabled={!!s.pending || (!s.locked && s.status === 'offline')}
                      aria-label={`${s.name} ${s.locked ? '해제' : '잠금'}`}
                      onClick={() => openAction(s.locked ? 'unlock' : 'lock', [s.id], s.name)}
                    >
                      {s.locked ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!visible.length && (
              <div className="empty-state">
                <Search size={28} />
                <h3>조건에 맞는 학생이 없습니다</h3>
                <p>검색어나 상태 필터를 변경해 보세요.</p>
                <button
                  className="button"
                  onClick={() => {
                    setQuery('')
                    setFilter('all')
                  }}
                >
                  필터 초기화
                </button>
              </div>
            )}
            <footer className="grid-footer">
              <span>
                {students.length}명 중 {visible.length}명 표시
              </span>
              <span>
                <Activity size={13} />
                사이트·체류시간은 가상 예시입니다
              </span>
            </footer>
          </section>
          <div className="bottom-note">
            <ShieldCheck size={14} />
            <span>
              학생의 개인정보를 소중하게. 실제 서비스 연결 전 학교 정책과 접근 권한을 확인하세요.
            </span>
            <span className="version">클래스온 v0.1</span>
          </div>
        </main>
      </div>
      {action && (
        <Modal
          title={
            action.type === 'notice'
              ? '공지 미리보기'
              : action.type === 'lock'
                ? '화면 잠금 시뮬레이션'
                : action.type === 'capture'
                  ? '학생 화면 캡처 확인'
                  : '화면 해제 시뮬레이션'
          }
          onClose={() => setAction(null)}
        >
          <div className="modal-notice">데모 모드 · 실제 기기로 전송되지 않습니다.</div>
          <p>
            <strong>{action.scope}</strong> 중 접속 가능한 {targetCount}명에게 적용합니다. 오프라인
            학생은 제외합니다.
          </p>
          {action.type === 'lock' && (
            <>
              <label className="field-label" htmlFor="lock-message">
                잠금 화면 문구
              </label>
              <textarea
                id="lock-message"
                maxLength={300}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <label className="field-label" htmlFor="lock-duration">
                자동 해제 시간
              </label>
              <select
                id="lock-duration"
                value={lockMinutes}
                onChange={(e) => setLockMinutes(Number(e.target.value))}
              >
                <option value={1}>1분</option>
                <option value={5}>5분</option>
                <option value={10}>10분</option>
              </select>
              <div className="notice-preview">
                <span>가상 잠금 화면 예시</span>
                <p>{message}</p>
              </div>
            </>
          )}
          {action.type === 'notice' ? (
            <>
              <label className="field-label" htmlFor="notice">
                공지 내용
              </label>
              <textarea
                id="notice"
                autoComplete="off"
                maxLength={300}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="예: 다음 활동을 위해 교과서 32쪽을 펼쳐주세요."
              />
              <small className="character-count">{message.length} / 300</small>
              <div className="notice-preview">
                <span>학생 화면 예시</span>
                <p>{message.trim() || '작성한 공지가 여기에 표시됩니다.'}</p>
              </div>
            </>
          ) : (
            <p className="muted">
              {action.type === 'lock'
                ? '선택한 학생 카드의 상태만 변경됩니다. 개별 해제 또는 전체 해제로 언제든 되돌릴 수 있습니다.'
                : action.type === 'capture'
                  ? '실제 캡처는 미연동 상태입니다. 요청하면 이 학생에게만 원인과 해결 안내를 표시합니다. 성공한 캡처로 표시하지 않습니다.'
                  : '잠금 표시를 해제합니다. 새로고침해도 모든 가상 잠금 상태가 초기화됩니다.'}
            </p>
          )}
          <div className="modal-actions">
            <button className="button" onClick={() => setAction(null)}>
              취소
            </button>
            <button
              className="button primary"
              disabled={
                !targetCount ||
                ((action.type === 'notice' || action.type === 'lock') && !message.trim())
              }
              onClick={applyAction}
            >
              <Check size={16} />
              {action.type === 'notice'
                ? '미리보기 완료'
                : action.type === 'capture'
                  ? '캡처 연결 확인'
                  : '시뮬레이션 적용'}
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={`${detail.name} 학생 요약`} onClose={() => setDetail(null)}>
          <div className="modal-notice">가상 학생 · 현재 예시 정보만 표시합니다.</div>
          <dl className="detail-list">
            <div>
              <dt>학급 / 번호</dt>
              <dd>
                {classroom.name} / {detail.number}번
              </dd>
            </div>
            <div>
              <dt>접속 상태</dt>
              <dd>{statusLabels[detail.status]}</dd>
            </div>
            <div>
              <dt>현재 사이트</dt>
              <dd>{detail.status === 'offline' ? '정보 없음' : detail.site}</dd>
            </div>
            <div>
              <dt>예시 체류시간</dt>
              <dd>{detail.status === 'offline' ? '정보 없음' : `${detail.minutes}분`}</dd>
            </div>
            <div>
              <dt>잠금 시뮬레이션</dt>
              <dd>{detail.locked ? '잠금' : '해제'}</dd>
            </div>
          </dl>
          {detail.locked && (
            <div className="notice-preview">
              <span>잠금 화면 문구 · 가상</span>
              <p>{detail.lockMessage}</p>
            </div>
          )}
          <h3 className="detail-heading">
            방문·체류 기록 <span>가상 예시</span>
          </h3>
          <ul className="record-list">
            {detail.visits.map((visit, i) => (
              <li key={i}>
                <time>{visit.time}</time>
                <span>
                  {visit.site}
                  <small>{visit.domain}</small>
                </span>
                <strong>{visit.minutes}분</strong>
              </li>
            ))}
          </ul>
          <h3 className="detail-heading">
            접속 기록 <span>{classroom.name} 전용 · 가상</span>
          </h3>
          <ul className="record-list">
            {detail.connections.map((entry, i) => (
              <li key={i}>
                <time>{entry.time}</time>
                <span>{entry.event}</span>
              </li>
            ))}
          </ul>
          <div className="detail-actions">
            <button
              className="button"
              disabled={!!detail.pending || detail.status === 'offline'}
              onClick={() => {
                setDetail(null)
                openAction('capture', [detail.id], detail.name)
              }}
            >
              <Camera size={15} />
              화면 캡처 연결 확인
            </button>
            {detail.helpRequested && (
              <button
                className="button"
                onClick={() =>
                  updateStudent(classId, detail.id, (s) => ({ ...s, helpRequested: false }))
                }
              >
                <Check size={15} />
                도움 요청 확인
              </button>
            )}
          </div>
          <details className="demo-scenarios">
            <summary>개발 검증용 가상 시나리오</summary>
            <p>실제 학생 이벤트가 아닙니다.</p>
            <button
              className="button"

              onClick={() =>
                updateStudent(classId, detail.id, (s) => ({ ...s, helpRequested: true }))
              }
            >
              가상 도움 요청 발생
            </button>
            <button
              className="button"

              onClick={() => {
                transport.current.simulateTransient(detail.id)
                setFeedback(
                  `${detail.name}: 다음 잠금·해제·공지 요청에 가상 통신 오류 1회를 적용합니다.`,
                )
              }}
            >
              다음 통신 1회 실패
            </button>
            <button
              className="button"
              disabled={!!detail.pending}
              onClick={() => simulateConnection(detail.id)}
            >
              가상 연결 상태 전환
            </button>
          </details>
          <p className="muted">
            실제 화면 캡처·기록 저장·학생 확장 연결은 아직 구현되지 않았습니다. 기록은 이 학급
            학생의 가상 예시입니다.
          </p>
        </Modal>
      )}
      {addingClass && (
        <Modal title="학급 추가" onClose={() => setAddingClass(false)}>
          <div className="modal-notice">
            가상 학급 설정만 이 브라우저에 저장합니다. 새 학급은 모니터링 OFF로 시작합니다.
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addClass()
            }}
          >
            <label className="field-label" htmlFor="class-name">
              학급 이름
            </label>
            <input
              id="class-name"
              className="text-field"
              maxLength={30}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 외부 코딩 수업"
            />
            <label className="field-label" htmlFor="class-kind">
              그룹 유형
            </label>
            <select
              id="class-kind"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ClassKind)}
            >
              {Object.entries(kindLabels).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="student-count">
              가상 학생 수
            </label>
            <input
              id="student-count"
              className="text-field"
              type="number"
              min={0}
              max={99}
              value={Number.isNaN(newCount) ? '' : newCount}
              onChange={(e) => setNewCount(e.target.value === '' ? NaN : Number(e.target.value))}
            />
            <p className="muted">
              전체 {classes.reduce((n, c) => n + c.students.length, 0)} / 99명 · 빈 학급은 0명으로
              만드세요.
            </p>
            {formError && (
              <p role="alert" className="form-error">
                {formError}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setAddingClass(false)}>
                취소
              </button>
              <button className="button primary" type="submit">
                학급 만들기
              </button>
            </div>
          </form>
        </Modal>
      )}
      {issueStudent && (
        <Modal title={`${issueStudent.name} 오류 상세`} onClose={() => setIssueStudentId(null)}>
          <p className="muted">
            이 학생에게 발생한 오류만 표시합니다. 성공으로 처리하거나 다른 학생에게 오류를 전파하지
            않습니다.
          </p>
          {Object.values(issueStudent.issues).map(
            (issue) =>
              issue && (
                <section className="issue-detail" key={issue.operation}>
                  <h3>{operationLabels[issue.operation]} 오류</h3>
                  <code>{issue.code}</code>
                  <p>
                    <strong>원인:</strong> {issue.cause}
                  </p>
                  <p>
                    <strong>해결:</strong> {issue.solution}
                  </p>
                  {lastCommands.current.has(`${issueStudent.id}:${issue.operation}`) && (
                    <button
                      className="button"
                      disabled={
                        !!issueStudent.pending ||
                        (issueStudent.status === 'offline' && issue.operation !== 'unlock') ||
                        issue.code === 'EXTENSION_NOT_CONNECTED'
                      }
                      onClick={() =>
                        void runCommand(
                          classId,
                          issueStudent.id,
                          lastCommands.current.get(`${issueStudent.id}:${issue.operation}`)!,
                        )
                      }
                    >
                      다시 시도
                    </button>
                  )}
                </section>
              ),
          )}
        </Modal>
      )}
      {installGuide && (
        <Modal title="학생 확장 설치 안내" onClose={() => setInstallGuide(false)}>
          <div className="modal-notice">
            설치 진단용 개발 빌드 · 실제 학생에게 배포하지 마세요. 학생 등록 서버는 미연동입니다.
          </div>
          <p>
            <strong>대상 학급: {classroom.name}</strong>
          </p>
          <ol className="help-list">
            <li>개발용 ZIP을 다운로드하고 내 파일의 새 폴더에 모든 파일을 옮깁니다.</li>
            <li>Chrome 주소창에 chrome://extensions를 입력하고 개발자 모드를 켭니다.</li>
            <li>
              압축해제된 확장 프로그램을 로드합니다를 누르고 manifest.json이 있는 폴더를 선택합니다.
            </li>
            <li>
              설치 확인 창의 대상 학급과 진단 결과를 확인합니다. 설치만으로 교사 화면에 학생이
              등록되지는 않습니다.
            </li>
          </ol>
          <p className="muted">
            새 확장은 기존 확장과 별개입니다. 운영 중인 기존 확장을 삭제하거나 교체하지 마세요. 설치
            폴더를 유지하고 업데이트 시 파일 교체 후 새로고침하는 방식입니다.
          </p>
          {packageError && (
            <p role="alert" className="form-error">
              {packageError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => {
                try {
                  downloadStudentPackage(classroom)
                  setPackageError('')
                } catch {
                  setPackageError(
                    'ZIP을 생성하지 못했습니다. 페이지를 새로고침하고 다시 시도하세요.',
                  )
                }
              }}
            >
              개발용 ZIP 다운로드
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="가상 교실 사용 안내" onClose={() => setHelp(false)}>
          <p>
            클래스온 가상 교사 대시보드입니다. 학급을 추가·전환하고 학급별 모니터링을 관리할 수
            있습니다.
          </p>
          <ul className="help-list">
            <li>잠금·해제는 카드의 가상 상태만 변경합니다.</li>
            <li>공지는 텍스트 미리보기만 제공하며 저장·전송되지 않습니다.</li>
            <li>실시간 접속·사이트 추적·로그인·캡처 기능은 아직 연결되지 않았습니다.</li>
            <li>
              학급 이름·유형·학생 수·ON/OFF 설정만 이 브라우저에 저장합니다. 잠금·공지·기록 등 실행
              상태는 새로고침하면 초기화됩니다. 실제 학생 정보를 입력하지 마세요.
            </li>
          </ul>
        </Modal>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  caption,
  icon,
  color,
}: {
  label: string
  value: number
  caption: string
  icon: ReactNode
  color: string
}) {
  return (
    <article className="stat-card" aria-label={`${label} ${value}명`}>
      <div className="stat-main">
        <div>
          <span className="stat-label">{label}</span>
          <div className="stat-value">
            {value}
            <span>명</span>
          </div>
        </div>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <div className="stat-caption">
        {color === 'green' && <span className="tiny-dot" />}
        {caption}
      </div>
    </article>
  )
}
