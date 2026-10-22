import { CLASSROOMS, createDemoStudents, filterStudents, summarizeStudents, updateLocks, validateNotice, sanitizeForDisplay } from './core.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const storageKey = 'classroom-pulse-demo-v01';
const state = {
  classId: 'main',
  studentsByClass: Object.fromEntries(CLASSROOMS.map((c) => [c.id, createDemoStudents(c.id)])),
  query: '', filter: 'all', view: 'grid', selected: new Set(),
  logs: [
    { kind: 'green', icon: '✓', title: '데모 학급이 준비되었습니다', detail: '가상 학생 데이터를 불러왔습니다.', time: '방금' },
    { kind: 'purple', icon: '♡', title: '학생 04 · 도움 요청', detail: '시연용 도움 요청 상태입니다.', time: '3분 전' },
    { kind: 'warn', icon: '!', title: '학생 11 · 주의 사이트', detail: '주의 사이트 활동이 감지된 상황의 예시입니다.', time: '8분 전' },
    { kind: 'green', icon: '↗', title: '수업 시작', detail: '학급 대시보드 시연이 시작되었습니다.', time: '12분 전' }
  ]
};

function currentStudents() { return state.studentsByClass[state.classId]; }
function currentClass() { return CLASSROOMS.find((c) => c.id === state.classId); }
function addLog(title, detail, kind = 'green', icon = '✓') {
  state.logs.unshift({ title, detail, kind, icon, time: '방금' });
  state.logs = state.logs.slice(0, 20);
  renderTimeline();
}
function notice(message, title = '데모 알림') {
  const host = $('#toastHost');
  const el = document.createElement('div');
  el.className = 'toast';
  const strong = document.createElement('strong'); strong.textContent = title;
  const body = document.createElement('div'); body.textContent = message;
  el.append(strong, body); host.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
function renderClasses() {
  $('#sidebarClasses').innerHTML = CLASSROOMS.map((group) => `<button class="class-link ${group.id === state.classId ? 'selected' : ''}" data-class="${group.id}"><span class="class-dot"></span><span>${sanitizeForDisplay(group.name)}</span><span class="class-num">${group.size}</span></button>`).join('');
  $$('[data-class]').forEach((button) => button.addEventListener('click', () => switchClass(button.dataset.class)));
}
function renderStats() {
  const summary = summarizeStudents(currentStudents());
  $('#statTotal').innerHTML = `${summary.total}<span>명</span>`;
  $('#statOnline').innerHTML = `${summary.online}<span>명</span>`;
  $('#statAttention').innerHTML = `${summary.attention}<span>명</span>`;
  $('#statHelp').innerHTML = `${summary.help}<span>건</span>`;
  $('#studentCountLabel').textContent = summary.total;
  $('.nav-count').textContent = summary.total;
  const group = currentClass();
  $('#currentClassName').textContent = group.name;
  $('#breadcrumbClass').textContent = group.name;
  $('#classDescription').textContent = `총 ${summary.total}명의 학생 · 가상 현황`;
  $('.academic-badge').textContent = group.subtitle;
  $('#lockAll').innerHTML = summary.locked === summary.total ? '<span class="button-icon">♧</span> 전체 잠금 해제' : '<span class="button-icon">▣</span> 전체 화면 잠금';
}
function studentMarkup(student) {
  const isChosen = state.selected.has(student.id);
  const flags = [student.locked ? '<span class="flag locked">잠금</span>' : '', student.help ? '<span class="flag help">도움 요청</span>' : '', student.attention ? '<span class="flag attention">주의</span>' : ''].join('');
  return `<article class="student-card ${isChosen ? 'chosen' : ''} ${student.attention ? 'needs-attention' : ''}" data-student-id="${student.id}">
    <div class="student-card-top"><input type="checkbox" class="student-checkbox" aria-label="${sanitizeForDisplay(student.name)} 선택" ${isChosen ? 'checked' : ''} /><span class="student-avatar">${String(student.number).padStart(2, '0')}</span><div class="student-meta"><span class="student-name">${sanitizeForDisplay(student.name)}</span><span class="student-no">${student.number}번 학생</span></div><span class="connection-dot ${student.online ? '' : 'offline'}" title="${student.online ? '온라인' : '오프라인'}"></span></div>
    <div class="student-page"><span class="page-glyph">${student.online ? '◈' : '○'}</span><span title="${sanitizeForDisplay(student.page)}">${sanitizeForDisplay(student.page)}</span></div>
    <div class="student-domain">${sanitizeForDisplay(student.domain)}</div>
    <div class="student-bottom"><div class="student-flags">${flags || `<span>${student.online ? student.elapsedMinutes + '분 이용 중' : '오프라인'}</span>`}</div><div style="display:flex;align-items:center;gap:5px"><span>${sanitizeForDisplay(student.lastSeen)}</span><button type="button" class="capture-btn" data-capture="${student.id}" aria-label="${sanitizeForDisplay(student.name)} 캡처 미리보기">▣</button></div></div>
  </article>`;
}
function renderStudents() {
  const students = filterStudents(currentStudents(), { query: state.query, status: state.filter });
  const container = $('#studentsContainer');
  container.className = state.view === 'list' ? 'student-grid list-view' : 'student-grid';
  container.innerHTML = students.length ? students.map(studentMarkup).join('') : '<div class="empty-state">조건에 맞는 학생이 없습니다. 다른 검색어를 입력해 보세요.</div>';
  $$('.student-card').forEach((card) => {
    const cb = card.querySelector('.student-checkbox');
    cb.addEventListener('change', () => {
      const id = card.dataset.studentId;
      if (cb.checked) state.selected.add(id); else state.selected.delete(id);
      renderStudents();
    });
    card.querySelector('[data-capture]').addEventListener('click', () => {
      const s = currentStudents().find((x) => x.id === card.dataset.studentId);
      notice(`${s.name}의 실제 화면에 접근하지 않았습니다. 실제 캡처 기능은 별도 권한·서버 연동 후 개발합니다.`, '화면 캡처 데모');
      addLog(`${s.name} · 캡처 데모`, '실제 이미지 수집 없이 버튼 반응만 시험했습니다.', 'purple', '▣');
    });
  });
  renderSelection();
}
function renderSelection() {
  $('#selectionBar').classList.toggle('hidden', state.selected.size === 0);
  $('#selectedCount').textContent = state.selected.size;
}
function renderTimeline() {
  $('#activityTimeline').innerHTML = state.logs.slice(0, 5).map((log) => `<div class="timeline-entry"><span class="timeline-icon ${log.kind}">${sanitizeForDisplay(log.icon)}</span><div><strong>${sanitizeForDisplay(log.title)}</strong><p>${sanitizeForDisplay(log.detail)}</p><time>${sanitizeForDisplay(log.time)}</time></div></div>`).join('');
}
function renderAll() { renderClasses(); renderStats(); renderStudents(); renderTimeline(); }
function switchClass(classId) {
  if (!CLASSROOMS.some((c) => c.id === classId)) return;
  state.classId = classId; state.selected.clear(); state.query = ''; state.filter = 'all';
  $('#studentSearch').value = '';
  $$('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all'));
  renderAll();
}
let pendingConfirm = null;
function requestLock(ids, locked) {
  if (!ids.length) { notice('학생을 먼저 선택해 주세요.'); return; }
  pendingConfirm = () => {
    state.studentsByClass[state.classId] = updateLocks(currentStudents(), ids, locked);
    state.selected.clear();
    renderStats(); renderStudents();
    addLog(`${ids.length}명 · ${locked ? '잠금' : '잠금 해제'} 데모`, '데모 상태만 변경했습니다. 학생 기기에는 영향을 주지 않습니다.', locked ? 'purple' : 'green', locked ? '▣' : '✓');
    notice(`${ids.length}명의 ${locked ? '잠금' : '잠금 해제'} 상태를 데모에서 변경했습니다.`);
  };
  $('#confirmTitle').textContent = locked ? '화면 잠금 시연' : '화면 잠금 해제 시연';
  $('#confirmDescription').textContent = `${ids.length}명의 학생에게 ${locked ? '화면 잠금' : '잠금 해제'} 명령을 보내는 상황을 시연합니다.`;
  $('#confirmDialog').showModal();
}
function downloadCsv() {
  const rows = [['번호','이름','접속 상태','현재 페이지','도메인','잠금 상태'], ...currentStudents().map((s) => [s.number,s.name,s.online?'온라인':'오프라인',s.page,s.domain,s.locked?'잠금':'해제'])];
  const csv = '\ufeff' + rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  const a = document.createElement('a'); a.href = url; a.download = `classroom-pulse-demo-${state.classId}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  addLog('CSV 내보내기', '가상 데이터가 CSV 파일로 생성되었습니다.', 'green', '↧');
}
function updateClock() {
  $('#currentClock').textContent = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'}).format(new Date());
}
function setupEvents() {
  $('#studentSearch').addEventListener('input',(e)=>{state.query=e.target.value;renderStudents();});
  $$('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{
    state.filter=button.dataset.filter;
    $$('[data-filter]').forEach((b)=>b.classList.toggle('active',b===button));
    renderStudents();
  }));
  $('#gridView').addEventListener('click',()=>{state.view='grid';$('#gridView').classList.add('active');$('#listView').classList.remove('active');renderStudents();});
  $('#listView').addEventListener('click',()=>{state.view='list';$('#listView').classList.add('active');$('#gridView').classList.remove('active');renderStudents();});
  $('#clearSelection').addEventListener('click',()=>{state.selected.clear();renderStudents();});
  $('#lockSelected').addEventListener('click',()=>requestLock([...state.selected],true));
  $('#unlockSelected').addEventListener('click',()=>requestLock([...state.selected],false));
  $('#lockAll').addEventListener('click',()=>{const all=currentStudents();const alreadyLocked=all.every((s)=>s.locked);requestLock(all.map((s)=>s.id),!alreadyLocked);});
  $('#quickUnlock').addEventListener('click',()=>requestLock(currentStudents().map((s)=>s.id),false));
  for (const id of ['openNotice','quickNotice']) $("#"+id).addEventListener('click',()=>$('#noticeDialog').showModal());
  $('#noticeForm').addEventListener('submit',(e)=>{
    e.preventDefault();
    try {
      const result=validateNotice($('#noticeText').value,$('#noticeSeconds').value);
      $('#noticeDialog').close();$('#noticeText').value='';
      notice(`공지: ${result.message} (${result.seconds}초 표시 시연)`, '가상 공지 전송');
      addLog('전체 공지 데모', `${result.seconds}초 · ${result.message}`, 'green', '✉');
    } catch(err){notice(err.message,'입력 확인');}
  });
  $$('[data-close-dialog]').forEach((button)=>button.addEventListener('click',()=>button.closest('dialog').close()));
  $('#confirmAction').addEventListener('click',()=>{if(pendingConfirm)pendingConfirm();pendingConfirm=null;$('#confirmDialog').close();});
  $('#confirmDialog').addEventListener('close',()=>{pendingConfirm=null;});
  $('#quickExport').addEventListener('click',downloadCsv);
  $('#showAllLogs').addEventListener('click',()=>notice('실시간 로그 화면은 다음 개발 단계에서 Supabase와 연결합니다.', '활동 기록 설계 중'));
  $('#helpGuide').addEventListener('click',()=>notice('가상 학생을 선택하거나 전체 공지, 잠금 기능을 시연할 수 있습니다. 학생 기기와 연결되지는 않습니다.', '대시보드 사용 안내'));
  $$('[data-nav]').forEach((button)=>button.addEventListener('click',()=>{
    const tab=button.dataset.nav;
    if(tab==='capture'){notice('실제 화면 캡처는 연결하지 않았습니다. 학생 카드의 ▣ 버튼으로 시연 흐름을 확인할 수 있습니다.','화면 캡처');return;}
    if(tab==='settings'){notice('인증, Supabase URL, 초대코드는 개발자 설정 단계에서 연결합니다.','백엔드 준비 중');return;}
    $$('.navigation .nav-item').forEach((link)=>link.classList.toggle('active',link===button));
    $('#breadcrumbPage').textContent=({dashboard:'대시보드',students:'학생 관리',activity:'활동 기록'})[tab]??'대시보드';
    if(tab==='activity')$('.activity-panel').scrollIntoView({behavior:'smooth',block:'center'});
    else if(tab==='students')$('#studentSearch').focus();
    else window.scrollTo({top:0,behavior:'smooth'});
  }));
}
setupEvents();renderAll();updateClock();setInterval(updateClock,60000);
