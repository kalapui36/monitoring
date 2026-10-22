export const CLASSROOMS = [
  { id: 'main', name: '6학년 2반', subtitle: '정규 수업', size: 20 },
  { id: 'club', name: '미디어 동아리', subtitle: '동아리', size: 8 },
  { id: 'special', name: '방과후 창작반', subtitle: '외부 수업', size: 6 },
];

const onlinePages = [
  ['국립중앙박물관', 'museum.go.kr', 'learning'],
  ['Google Classroom', 'classroom.google.com', 'learning'],
  ['EBS 초등', 'primary.ebs.co.kr', 'learning'],
  ['Google Docs', 'docs.google.com', 'learning'],
  ['YouTube - 수학 개념', 'youtube.com', 'media'],
  ['문서 작성', 'docs.google.com', 'learning'],
  ['Scratch', 'scratch.mit.edu', 'learning'],
  ['퀴즈 활동', 'quiz.example.edu', 'learning'],
];

export function createDemoStudents(groupId = 'main') {
  const group = CLASSROOMS.find((c) => c.id === groupId) ?? CLASSROOMS[0];
  return Array.from({ length: group.size }, (_, n) => {
    const id = n + 1;
    const isOffline = id === 7 || (groupId === 'main' && id === 18);
    const needsAttention = id === 11 || (groupId === 'main' && id === 15);
    const page = onlinePages[(n + (groupId === 'club' ? 2 : 0)) % onlinePages.length];
    return {
      id: `${groupId}-${id}`,
      number: id,
      name: `학생 ${String(id).padStart(2, '0')}`,
      classId: groupId,
      online: !isOffline,
      attention: needsAttention,
      locked: false,
      help: groupId === 'main' && id === 4,
      page: isOffline ? '연결 대기 중' : needsAttention ? '주의 사이트 감지' : page[0],
      domain: isOffline ? '—' : needsAttention ? 'example-game.test' : page[1],
      category: needsAttention ? 'attention' : page[2],
      elapsedMinutes: isOffline ? 0 : 3 + ((id * 7) % 37),
      lastSeen: isOffline ? '6분 전' : id % 3 === 0 ? '방금' : '12초 전',
    };
  });
}

export function filterStudents(students, { query = '', status = 'all' } = {}) {
  const needle = query.trim().toLocaleLowerCase('ko-KR');
  return students.filter((student) => {
    const matchesText = !needle || [student.name, String(student.number), student.page, student.domain].some((field) => String(field).toLocaleLowerCase('ko-KR').includes(needle));
    const matchesStatus = status === 'all' || (status === 'online' && student.online) || (status === 'offline' && !student.online) || (status === 'attention' && student.attention) || (status === 'locked' && student.locked);
    return matchesText && matchesStatus;
  });
}

export function summarizeStudents(students) {
  return {
    total: students.length,
    online: students.filter((s) => s.online).length,
    offline: students.filter((s) => !s.online).length,
    attention: students.filter((s) => s.attention).length,
    locked: students.filter((s) => s.locked).length,
    help: students.filter((s) => s.help).length,
  };
}

export function updateLocks(students, ids, locked) {
  const targetIds = new Set(ids);
  return students.map((student) => targetIds.has(student.id) ? { ...student, locked: Boolean(locked) } : student);
}

export function validateNotice(text, seconds) {
  const message = String(text ?? '').trim();
  const duration = Number(seconds);
  if (!message || message.length > 160) throw new Error('공지 문구는 1~160자로 입력해 주세요.');
  if (!Number.isInteger(duration) || duration < 1 || duration > 60) throw new Error('표시 시간은 1~60초 사이로 선택해 주세요.');
  return { message, seconds: duration };
}

export function sanitizeForDisplay(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
