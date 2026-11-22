const functionsGuide = 'https://supabase.com/docs/guides/functions/quickstart-dashboard'
const originalImages =
  'https://github.com/supabase/supabase/blob/4ead4b092ee7e5ad4def2cd295b14492db12720b/apps/docs/public/img/'

const captures = {
  project: {
    file: 'project.png',
    width: 688,
    height: 654,
    alt: 'Supabase의 프로젝트 생성 양식. 가운데에 이름과 비밀번호 입력칸, 아래에 생성 버튼이 있습니다.',
    source: originalImages + 'redwoodjs-qs-new-project.png',
    earlier: true,
    marks: [
      { x: 33.5, y: 31, w: 62.5, h: 8.9, label: 'Name 또는 Project name 입력' },
      { x: 33.5, y: 42.6, w: 62.5, h: 8.6, label: 'Database Password 입력' },
      { x: 75.6, y: 91.5, w: 20.5, h: 6.5, label: 'Create new project 누르기' },
    ],
  },
  sql: {
    file: 'sql-editor.png',
    width: 1388,
    height: 907,
    alt: 'Supabase SQL Editor. 위쪽이 SQL 코드 입력 영역이고 결과 영역 오른쪽에 Run 버튼이 있습니다.',
    source: originalImages + 'sql-editor.png',
    earlier: true,
    marks: [
      { x: 7.6, y: 12.2, w: 87.9, h: 11.8, label: '위쪽 편집기에 설치 SQL 붙여 넣기' },
      { x: 91.7, y: 24.5, w: 4, h: 4.1, label: 'Run 누르기' },
    ],
  },
  functionMenu: {
    file: 'function-menu.png',
    width: 2338,
    height: 926,
    alt: 'Supabase Edge Functions의 새 함수 배포 메뉴. Via Editor 항목이 열려 있습니다.',
    source: functionsGuide,
    earlier: false,
    marks: [
      { x: 77.6, y: 10, w: 16.4, h: 7.7, label: 'Deploy a new function 누르기' },
      { x: 63.5, y: 18.6, w: 29.7, h: 11.7, label: 'Via Editor 선택' },
    ],
  },
  functionEditor: {
    file: 'function-editor.png',
    width: 2430,
    height: 1248,
    alt: 'Supabase 함수 편집기. 왼쪽에 index.ts 파일, 아래에 함수 이름 입력칸과 배포 버튼이 있습니다.',
    source: functionsGuide,
    earlier: false,
    marks: [
      { x: 0.7, y: 20.5, w: 22.2, h: 6.4, label: 'index.ts를 열고 예제 코드를 교체' },
      { x: 62.8, y: 90.2, w: 23.3, h: 8.1, label: 'Function name에 device 입력' },
      { x: 86.6, y: 90.6, w: 12.7, h: 7.3, label: 'Deploy function 누르기' },
    ],
  },
}

export function SetupCapture({ name }: { name: keyof typeof captures }) {
  const capture = captures[name]
  const src = import.meta.env.BASE_URL + 'setup-screens/' + capture.file
  return (
    <figure className="setup-capture" data-portrait={name === 'project' ? '' : undefined}>
      <div className="setup-capture-frame">
        <img src={src} alt={capture.alt} width={capture.width} height={capture.height} />
        {capture.marks.map(({ x, y, w, h, label }, index) => (
          <span
            key={label}
            className="setup-capture-mark"
            style={{ left: x + '%', top: y + '%', width: w + '%', height: h + '%' }}
            aria-hidden="true"
          >
            <span>{index + 1}</span>
          </span>
        ))}
      </div>
      <figcaption>
        <ol>
          {capture.marks.map(({ label }) => (
            <li key={label}>{label}</li>
          ))}
        </ol>
        <div className="setup-capture-source">
          <span>{capture.earlier ? 'Supabase 공식 캡처 · 이전 화면' : 'Supabase 공식 캡처'}</span>
          <a href={src} target="_blank" rel="noreferrer">
            원본 크게 보기
          </a>
          <a href={capture.source} target="_blank" rel="noreferrer">
            출처
          </a>
        </div>
      </figcaption>
    </figure>
  )
}
