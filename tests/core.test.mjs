import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSROOMS, createDemoStudents, filterStudents, summarizeStudents, updateLocks, validateNotice, sanitizeForDisplay } from '../core.mjs';

test('학급별 명단 크기는 설정에 일치한다', () => {
  for (const c of CLASSROOMS) assert.equal(createDemoStudents(c.id).length, c.size);
});
test('학생 ID가 학급간 충돌하지 않는다', () => {
  const ids = CLASSROOMS.flatMap((c) => createDemoStudents(c.id).map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
});
test('온라인과 오프라인의 합계가 전체 수와 같다', () => {
  for (const c of CLASSROOMS) {
    const s = summarizeStudents(createDemoStudents(c.id));
    assert.equal(s.online + s.offline, s.total);
  }
});
test('검색은 이름, 번호, 사이트를 검색한다', () => {
  const s = createDemoStudents();
  assert.equal(filterStudents(s, { query: '학생 01' }).length, 1);
  assert.ok(filterStudents(s, { query: 'google' }).length > 0);
});
test('상태 필터에 맞는 학생만 반환한다', () => {
  const s = createDemoStudents();
  assert.ok(filterStudents(s, { status: 'offline' }).every((x) => !x.online));
  assert.ok(filterStudents(s, { status: 'attention' }).every((x) => x.attention));
});
test('잠금 처리는 선택된 학생만 영향을 준다', () => {
  const s = createDemoStudents();
  const updated = updateLocks(s, [s[1].id], true);
  assert.equal(updated.filter((x) => x.locked).length, 1);
  assert.equal(s[1].locked, false);
  assert.equal(updated[1].locked, true);
  assert.equal(updated[2].locked, false);
});
test('공지 문구, 표시 시간 유효성 검사', () => {
  assert.deepEqual(validateNotice('  안내  ', 5), { message: '안내', seconds: 5 });
  assert.throws(() => validateNotice('', 5));
  assert.throws(() => validateNotice('테스트', 0));
  assert.throws(() => validateNotice('테스트', 61));
  assert.throws(() => validateNotice('a'.repeat(161), 5));
});
test('HTML에 입력되는 내용은 안전하게 이스케이프한다', () => {
  assert.equal(sanitizeForDisplay('<script>'), '&lt;script&gt;');
  assert.equal(sanitizeForDisplay('"&'), '&quot;&amp;');
});

test('학생 20명 중 경고 상태 수와 표시 페이지가 일관된다', () => {
  const students = createDemoStudents('main');
  const attention = students.filter((s) => s.attention);
  assert.equal(attention.length, 2);
  assert.ok(attention.every((s) => s.domain === 'example-game.test'));
});
test('선택되지 않은 학급에는 다른 학급 잠금 명령이 영향을 주지 않는다', () => {
  const main = createDemoStudents('main');
  const club = createDemoStudents('club');
  const changed = updateLocks(main, [club[0].id], true);
  assert.equal(summarizeStudents(changed).locked, 0);
});
test('잠금 명령은 여러 번 적용해도 결과가 같다', () => {
  const students = createDemoStudents('main');
  const ids = students.map((s) => s.id);
  assert.deepEqual(updateLocks(updateLocks(students, ids, true), ids, true), updateLocks(students, ids, true));
});
test('100개 가상 학생 명령 업데이트 시 데이터 유실이 없다', () => {
  const fake = Array.from({length:100}, (_,i) => ({id:`device-${i}`,locked:false,number:i+1}));
  const locked = updateLocks(fake, fake.map((s)=>s.id), true);
  assert.equal(locked.filter((s)=>s.locked).length, 100);
  assert.equal(fake.filter((s)=>s.locked).length, 0);
  const unlocked = updateLocks(locked,locked.map((s)=>s.id),false);
  assert.ok(unlocked.every((s)=>!s.locked));
});
