import type { Operation, StudentIssue } from './commands'

export type Status = 'online' | 'away' | 'offline'
export type Student = {
  id: string
  number: number
  name: string
  status: Status
  site: string
  domain: string
  minutes: number
  locked: boolean
  lockMessage: string
  lockExpiresAt: number | null
  issues: Partial<Record<Operation, StudentIssue>>
  pending: string | null
  helpRequested: boolean
  visits: { site: string; domain: string; minutes: number; time: string }[]
  connections: { time: string; event: string }[]
}
export type ClassKind = 'regular' | 'club' | 'external'
export const kindLabels: Record<ClassKind, string> = {
  regular: '정규 학급',
  club: '동아리',
  external: '외부 수업',
}
export type Classroom = {
  id: string
  name: string
  subject: string
  kind: ClassKind
  monitoring: boolean
  students: Student[]
}
const names = [
  '김하늘',
  '이서준',
  '박지우',
  '최서연',
  '정도윤',
  '강수빈',
  '조민재',
  '윤예린',
  '장시우',
  '임채원',
  '한지호',
  '오다은',
  '서준우',
  '신유나',
  '권도현',
  '황소율',
  '안현우',
  '송지민',
  '류태오',
  '홍예서',
]
const sites = [
  ['Google 클래스룸', 'classroom.google.com'],
  ['EBS 중학', 'mid.ebs.co.kr'],
  ['네이버 지식백과', 'terms.naver.com'],
  ['Google 문서', 'docs.google.com'],
  ['Canva', 'canva.com'],
]
function students(prefix: string, count: number): Student[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    number: i + 1,
    name: names[i] || `가상학생${i + 1}`,
    status: i === 8 || i === 17 ? 'offline' : i === 5 || i === 12 ? 'away' : 'online',
    site: sites[i % sites.length][0],
    domain: sites[i % sites.length][1],
    minutes: 3 + ((i * 7) % 24),
    locked: false,
    lockMessage: '',
    lockExpiresAt: null,
    issues: {},
    pending: null,
    helpRequested: false,
    visits: [
      {
        site: sites[i % sites.length][0],
        domain: sites[i % sites.length][1],
        minutes: 3 + ((i * 7) % 24),
        time: '09:10',
      },
      { site: 'Google 클래스룸', domain: 'classroom.google.com', minutes: 5, time: '09:00' },
    ],
    connections: [
      { time: '09:00', event: '가상 접속' },
      ...(i === 8 || i === 17 ? [{ time: '09:10', event: '가상 연결 종료' }] : []),
    ],
  }))
}
export function createClasses(): Classroom[] {
  return [
    {
      id: 'class-1',
      name: '1학년 3반',
      kind: 'regular',
      monitoring: true,
      subject: '함께 배우는 우리 교실',
      students: students('c1', 20),
    },
    {
      id: 'club-1',
      name: '코딩 동아리',
      kind: 'club',
      monitoring: true,
      subject: '아이디어를 코드로 만드는 시간',
      students: students('c2', 12),
    },
  ]
}
export const statusLabels: Record<Status, string> = {
  online: '접속 중',
  away: '자리 비움',
  offline: '오프라인',
}

export function createClass(id: string, name: string, kind: ClassKind, count: number): Classroom {
  return {
    id,
    name,
    kind,
    monitoring: false,
    subject: kindLabels[kind],
    students: students(id === 'class-1' ? 'c1' : id === 'club-1' ? 'c2' : id, count),
  }
}
