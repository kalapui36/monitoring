import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import App from './App'
import * as studentPackage from './student-package'
beforeEach(() => {
  localStorage.setItem('classon-welcome-v4', 'seen')
})
const uid = '11111111-1111-4111-8111-111111111111'
function backend(approved = false, loggedIn = true, initial = false) {
  const user = { id: uid, email: 'test@example.com', user_metadata: { full_name: '테스트 교사' } }
  const session = loggedIn ? { user, access_token: 'test-session' } : null
  const datasets: Record<string, any[]> = {
    app_classes: initial
      ? [
          {
            id: 'c1',
            name: '테스트 학급',
            kind: 'regular',
            monitoring: true,
            retention_days: 7,
            capture_retention_days: 1,
          },
        ]
      : [],
    app_students: initial
      ? [
          {
            id: 's1',
            class_id: 'c1',
            student_number: 1,
            name: '테스트 학생',
            approval: 'active',
            last_seen: new Date().toISOString(),
            duration_seconds: 0,
            active_title: '',
            active_url: '',
            help_requested: false,
          },
        ]
      : [],
    app_latest_commands: [],
  }
  const changeListeners: (() => void)[] = []
  const channel = {
    on: vi.fn((_event, _filter, cb) => {
      changeListeners.push(cb)
      return channel
    }),
    subscribe: vi.fn(() => channel),
  }
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    stopAutoRefresh: vi.fn(),
  }
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      order: () => query,
      neq: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: structuredClone(datasets[table] || []), error: null }).then(
          resolve,
        ),
    }
    return query
  })
  const rpc = vi.fn(async (name: string, args?: Record<string, any>) => {
    if (name === 'app_security_version') return { data: 4, error: null }
    if (name === 'app_is_teacher') return { data: approved, error: null }
    if (name === 'app_enroll_teacher') {
      approved = true
      return { data: true, error: null }
    }
    if (name === 'app_save_class') {
      const id = 'new-class'
      datasets.app_classes.push({
        id,
        name: args!._name,
        kind: args!._kind,
        monitoring: false,
        retention_days: 7,
        capture_retention_days: 1,
      })
      return { data: id, error: null }
    }
    if (name === 'app_issue_commands') {
      const cmd = {
        id: 'command-id',
        student_id: 's1',
        kind: args!._kind,
        status: 'queued',
        revision: 1,
        expires_at: new Date(Date.now() + 300000).toISOString(),
        created_at: new Date().toISOString(),
      }
      datasets.app_latest_commands = [cmd]
      return { data: [cmd], error: null }
    }
    return { data: null, error: null }
  })
  return {
    client: {
      auth,
      from,
      rpc,
      channel: () => channel,
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as unknown as SupabaseClient,
    auth,
    from,
    rpc,
    datasets,
    change: () => changeListeners.forEach((cb) => cb()),
  }
}
describe('운영 화면의 로그인·관리자 경계와 실제 데이터 흐름', () => {
  it('처음 방문에는 Supabase 설정 안내가 자동으로 열리고 닫은 뒤 재방문하면 반복하지 않는다', async () => {
    localStorage.removeItem('classon-welcome-v4')
    const user = userEvent.setup(),
      view = render(<App client={null} />)
    expect(
      screen.getByRole('heading', { name: 'Supabase를 처음 사용하는 교사 안내' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '서비스로 돌아가기' }))
    expect(localStorage.getItem('classon-welcome-v4')).toBe('seen')
    view.unmount()
    render(<App client={null} />)
    expect(screen.getByText('클래스온 연결 설정')).toBeInTheDocument()
  })
  it('연결 미설정에서는 가상 학생을 표시하지 않는다', () => {
    render(<App client={null} />)
    expect(screen.getByText('클래스온 연결 설정')).toBeInTheDocument()
    expect(screen.queryByText('김하늘')).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
  it('로그인하지 않으면 대시보드를 읽지 않고 Google OAuth를 시작한다', async () => {
    const db = backend(false, false),
      user = userEvent.setup()
    render(<App client={db.client} />)
    await user.click(await screen.findByRole('button', { name: 'Google 계정으로 로그인' }))
    expect(db.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    )
    expect(db.from).not.toHaveBeenCalled()
  })
  it('첫 로그인에는 교사 가입 안내를 표시하고 가입 전에는 학생을 조회하지 않는다', async () => {
    const db = backend()
    render(<App client={db.client} />)
    expect(await screen.findByRole('heading', { name: '교사 회원가입' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '교사 회원가입 완료' })).toBeDisabled()
    expect(db.from).not.toHaveBeenCalled()
  })
  it('안내 확인 후 가입 RPC를 실행하면 자기 빈 대시보드에 진입한다', async () => {
    const db = backend(),
      user = userEvent.setup()
    render(<App client={db.client} />)
    await user.click(await screen.findByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '교사 회원가입 완료' }))
    expect(await screen.findByText('아직 학급이 없습니다')).toBeInTheDocument()
    expect(db.rpc).toHaveBeenCalledWith('app_enroll_teacher')
  })
  it('공개 안내에서 Supabase 절차와 크롬북 ZIP 설치를 로그인 없이 볼 수 있다', async () => {
    const user = userEvent.setup()
    render(<App client={null} />)
    await user.click(screen.getByRole('button', { name: 'Supabase 연동 방법 · 처음 시작' }))
    await user.click(screen.getByRole('button', { name: '내 Supabase 설정' }))
    expect(screen.getByRole('button', { name: '② 교사 회원가입 SQL 다운로드' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '3. Google 로그인 연결' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '학생 크롬북 설치' }))
    expect(screen.getByText(/크롬북 운영체제의 개발자 모드로 전환/)).toBeInTheDocument()
    expect(screen.getByText(/학교 정책으로 개발자 모드나/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '서비스로 돌아가기' }))
    expect(screen.getByText('클래스온 연결 설정')).toBeInTheDocument()
  })
  it('가입된 교사라도 DB가 비어 있으면 학급·학생을 생성해 보여주지 않는다', async () => {
    const db = backend(true)
    render(<App client={db.client} />)
    expect(await screen.findByText('아직 학급이 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(db.rpc).toHaveBeenCalledWith('app_is_teacher')
  })
  it('학급 추가는 서버 RPC를 호출하고 실제 연결 학생이 없으면 빈 상태를 유지한다', async () => {
    const db = backend(true),
      user = userEvent.setup()
    render(<App client={db.client} />)
    await screen.findByText('아직 학급이 없습니다')
    await user.click(screen.getAllByRole('button', { name: '학급 추가' })[0])
    await user.type(screen.getByRole('textbox', { name: '학급 이름' }), '새 학급')
    await user.click(screen.getByRole('button', { name: '학급 만들기' }))
    expect(await screen.findByText('연결된 학생이 없습니다')).toBeInTheDocument()
    expect(db.rpc).toHaveBeenCalledWith(
      'app_save_class',
      expect.objectContaining({ _name: '새 학급', _monitoring: false }),
    )
    expect(screen.queryByRole('article', { name: /학생 카드/ })).not.toBeInTheDocument()
  })
  it('명령을 요청한 것만으로 성공하지 않고 서버 ACK 갱신 후에만 잠금으로 표시한다', async () => {
    const db = backend(true, true, true),
      user = userEvent.setup()
    render(<App client={db.client} />)
    await user.click(await screen.findByRole('button', { name: '전체 잠금' }))
    await user.click(screen.getByRole('button', { name: '기기에 요청' }))
    const card = await screen.findByRole('article', { name: '테스트 학생 학생 카드' })
    expect(within(card).queryByText('잠금 적용 확인')).not.toBeInTheDocument()
    expect(within(card).getByText('기기 적용 확인 대기')).toBeInTheDocument()
    db.datasets.app_latest_commands[0].status = 'applied'
    await act(async () => {
      db.change()
    })
    expect(await within(card).findByText('잠금 적용 확인')).toBeInTheDocument()
  })
  it('다른 탭에서 연결 설정을 바꿔도 현재 수업의 ZIP 주소는 바뀌지 않는다', async () => {
    const db = backend(true, true, true),
      user = userEvent.setup()
    const save = (name: string) =>
      localStorage.setItem(
        'classon-personal-project-v1',
        JSON.stringify({
          url: `https://${name}.supabase.co`,
          key: 'sb_publishable_' + 'a'.repeat(25),
        }),
      )
    save('teacher-a')
    const download = vi.spyOn(studentPackage, 'downloadStudentPackage').mockImplementation(() => {})
    render(<App client={db.client} />)
    await screen.findByRole('article', { name: '테스트 학생 학생 카드' })
    save('teacher-b')
    await user.click(screen.getByRole('button', { name: '학생 설치·ZIP' }))
    await user.click(screen.getByRole('button', { name: '학생용 ZIP 다운로드' }))
    expect(download).toHaveBeenCalledWith('https://teacher-a.supabase.co')
  })
  it('프로젝트 연결 해제는 현재 로그인을 먼저 해제하고 데이터 화면과 연결 설정을 지운다', async () => {
    const db = backend(true, true, true),
      user = userEvent.setup()
    localStorage.setItem(
      'classon-personal-project-v1',
      JSON.stringify({
        url: 'https://teacher.supabase.co',
        key: 'sb_publishable_' + 'a'.repeat(25),
      }),
    )
    render(<App client={db.client} />)
    await screen.findByRole('article', { name: '테스트 학생 학생 카드' })
    await user.click(screen.getByRole('button', { name: '내 Supabase 연결 해제' }))
    expect(await screen.findByText('클래스온 연결 설정')).toBeInTheDocument()
    expect(localStorage.getItem('classon-personal-project-v1')).toBeNull()
    expect(db.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(db.auth.stopAutoRefresh).toHaveBeenCalled()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
  it('소유자라도 최신 보안 SQL이 없으면 학생 데이터를 읽지 않는다', async () => {
    const db = backend(true)
    const original = db.rpc.getMockImplementation()!
    db.rpc.mockImplementation(async (name, args) =>
      name === 'app_security_version'
        ? ({ data: null, error: { message: 'missing function' } } as any)
        : original(name, args),
    )
    render(<App client={db.client} />)
    expect(await screen.findByText(/보안 업데이트 SQL/)).toBeInTheDocument()
    expect(db.from).not.toHaveBeenCalled()
  })
  it('학생 이름·제목에 스크립트를 저장해도 HTML로 실행하지 않는다', async () => {
    const db = backend(true, true, true)
    db.datasets.app_students[0].name = '<img src=x onerror="globalThis.studentAttack=true">'
    db.datasets.app_students[0].active_title = '<svg onload="globalThis.studentAttack=true">'
    render(<App client={db.client} />)
    expect(await screen.findByRole('article', { name: /학생 카드/ })).toBeInTheDocument()
    expect(
      screen.getByText('<img src=x onerror="globalThis.studentAttack=true">'),
    ).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg[onload]')).toBeNull()
    expect((globalThis as any).studentAttack).toBeUndefined()
  })
  it('Supabase 안내는 예시 도메인이 아니라 현재 사이트의 로그인 복귀 주소를 표시한다', async () => {
    const user = userEvent.setup()
    render(<App client={null} />)
    await user.click(screen.getByRole('button', { name: 'Supabase 연동 방법 · 처음 시작' }))
    expect(screen.getByLabelText('Supabase 로그인 복귀 주소')).toHaveTextContent(
      window.location.origin + '/',
    )
    expect(document.querySelector('.guide-reference')!.textContent).not.toContain(
      'https://kalapui.com',
    )
  })
  it('잘못된 세션은 다시 로그인을 요구하며 데이터에 접근하지 않는다', async () => {
    const db = backend(true)
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })
    render(<App client={db.client} />)
    expect(
      await screen.findByRole('button', { name: 'Google 계정으로 로그인' }),
    ).toBeInTheDocument()
    expect(db.from).not.toHaveBeenCalled()
  })
})
