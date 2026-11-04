import { useState } from 'react'
import { readConnection, saveConnection, type ProjectConnection } from '../connection'
export function ConnectionSetup({
  onConnect,
  onGuide,
}: {
  onConnect: (c: ProjectConnection) => void
  onGuide: () => void
}) {
  const current = readConnection()
  const [url, setUrl] = useState(current?.url || ''),
    [key, setKey] = useState(current?.key || ''),
    [error, setError] = useState('')
  return (
    <form
      className="connection-form"
      onSubmit={(e) => {
        e.preventDefault()
        setError('')
        try {
          const value = saveConnection({ url, key })
          onConnect(value)
        } catch (e) {
          setError(e instanceof Error ? e.message : '연결 설정을 확인하세요.')
        }
      }}
    >
      <p>학생 정보와 기록은 각 교사가 연결한 본인의 Supabase 프로젝트에 저장됩니다.</p>
      <p>① Supabase 가입·초기 설정 → ② 아래 URL·공개 키 연결 → ③ 교사 Google 로그인 순서입니다.</p>
      <button className="button" type="button" disabled>
        Google 로그인 · 먼저 내 Supabase 연결
      </button>
      <label htmlFor="project-url">내 Supabase Project URL</label>
      <input
        id="project-url"
        type="url"
        required
        autoComplete="off"
        placeholder="https://본인프로젝트.supabase.co"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <label htmlFor="project-key">내 Supabase 공개 Publishable key</label>
      <input
        id="project-key"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder="sb_publishable_…"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <p className="muted">
        연결값은 이 브라우저에 저장합니다. 배포자의 Supabase를 사용하지 않습니다. 서비스 비밀키·DB
        비밀번호·Google Client Secret은 입력하지 마세요.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="detail-actions">
        <button className="button primary" type="submit">
          내 프로젝트에 연결
        </button>
        <button className="button" type="button" onClick={onGuide}>
          Supabase 연동 방법 · 처음 시작
        </button>
      </div>
      <p className="muted">
        연결 저장은 주소·키 형식만 확인합니다. SQL·로그인·서버 배포가 끝났는지는 다음 화면과 학생
        기기로 확인해야 합니다.
      </p>
    </form>
  )
}
