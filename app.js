/**
 * js/app.js
 * 공연 제작 업무자동화 — 화면 렌더링 · 데이터 연결 · 사용자 입력 처리
 *
 * 판단 규칙(제작 단계, 위험 검수 등)은 js/rules.js에 있습니다.
 * 이 파일은 그 규칙을 "화면에 어떻게 보여줄지"만 담당합니다.
 *
 * 데이터 흐름:
 *  1) 브라우저에 저장된 이전 작업(localStorage)이 있으면 그것을 사용한다.
 *  2) 없으면 data/performance.json, data/tasks.json을 불러와 시작값으로 쓴다.
 *  3) 이후 모든 입력·수정은 localStorage에 저장된다 (이 브라우저에만 저장됨).
 */

const LS_KEY = 'ppa-state-v1';
const todayStr = new Date().toISOString().slice(0, 10);

let state = {
  performance: {
    id: '',
    title: '',
    date: '',
    venue: '',
    venueInfo: '',
    projectStartDate: '',
    status: '준비중',
    parts: ['연출', '배우', '무대', '조명', '음향', '기획'],
    participants: [],
    rehearsalAvailability: '',
  },
  tasks: [],
};

let currentPartFilter = '전체';

/* ---------------- 데이터 로드 / 저장 ---------------- */

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    setSaveStatus('저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSaveStatus('저장 실패 — 브라우저 저장공간을 확인하세요');
  }
}

function setSaveStatus(text) {
  const el = document.getElementById('save-status');
  if (el) el.textContent = text;
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.performance && Array.isArray(parsed.tasks)) {
      state = parsed;
      return true;
    }
  } catch (e) { /* 저장된 값이 손상된 경우 무시하고 초기값 사용 */ }
  return false;
}

async function loadFromDataFiles() {
  try {
    const [perfRes, tasksRes] = await Promise.all([
      fetch('./data/performance.json'),
      fetch('./data/tasks.json'),
    ]);
    if (perfRes.ok) {
      const perf = await perfRes.json();
      state.performance = Object.assign({}, state.performance, perf);
    }
    if (tasksRes.ok) {
      const tasks = await tasksRes.json();
      if (Array.isArray(tasks)) state.tasks = tasks;
    }
    return true;
  } catch (e) {
    // file:// 로 직접 열면 fetch가 막힐 수 있음 — README 참고 (로컬 서버 필요)
    return false;
  }
}

/* ---------------- ID 생성 ---------------- */

function nextTaskId() {
  const nums = state.tasks
    .map(t => (t.taskId.match(/^TASK-(\d+)$/) || [])[1])
    .filter(Boolean)
    .map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return 'TASK-' + String(next).padStart(3, '0');
}

/* ---------------- 초기화 ---------------- */

async function init() {
  const fromLocal = loadFromLocalStorage();
  if (!fromLocal) {
    const ok = await loadFromDataFiles();
    if (!ok) {
      setSaveStatus('⚠ data/*.json을 불러오지 못했습니다 (로컬 서버로 실행해 주세요) — 기본값으로 시작합니다');
    }
  }
  render();
}

/* ---------------- 렌더링 ---------------- */

function render() {
  const root = document.getElementById('app');
  const p = state.performance;
  const dDay = getDaysUntil(p.date, todayStr);
  const stage = getStage(dDay);
  const risks = computeRisks(p, state.tasks, todayStr);

  root.innerHTML = `
    ${renderHeader(p, dDay, stage)}
    ${renderPerformanceForm(p)}
    ${renderRisks(risks)}
    ${renderTaskForm(p)}
    ${renderTaskTable(p)}
    ${renderDashboard(p, stage)}
    ${renderPreShowChecklist()}
  `;

  bindEvents();
}

function renderHeader(p, dDay, stage) {
  return `
  <header class="masthead">
    <div class="masthead-main">
      <h1 id="show-title">${escapeHtml(p.title) || '(작품명 미입력)'}</h1>
      <div class="sub">전대극회 · 공연 제작 기록</div>
    </div>
    <div class="masthead-meta">
      <span class="dday">${formatDday(dDay)}</span>
      <span class="stage-label">${stage ? stage.name : '공연일 미입력'}</span>
      <div class="save-bar">
        <span id="save-status" class="save-status"></span>
      </div>
    </div>
  </header>
  <p class="note">이 데이터는 이 브라우저에만 저장됩니다(localStorage). 다른 기기·다른 사람과 공유하려면 data/performance.json, data/tasks.json 파일을 직접 갱신해 GitHub에 커밋하세요.</p>
  `;
}

function renderPerformanceForm(p) {
  return `
  <section class="section" id="section-setup">
    <h2><span class="n">01</span>공연 기본정보</h2>
    <div class="grid2">
      <div class="field"><label for="f-title">작품명</label><input type="text" id="f-title" value="${attr(p.title)}"></div>
      <div class="field"><label for="f-date">공연일</label><input type="date" id="f-date" value="${attr(p.date)}"></div>
      <div class="field"><label for="f-venue">공연장</label><input type="text" id="f-venue" value="${attr(p.venue)}"></div>
      <div class="field"><label for="f-venue-info">공연장 정보</label><input type="text" id="f-venue-info" value="${attr(p.venueInfo)}" placeholder="주소·좌석 수 등"></div>
      <div class="field"><label for="f-start">프로젝트 시작일</label><input type="date" id="f-start" value="${attr(p.projectStartDate)}"></div>
      <div class="field">
        <label for="f-status">현재 상태</label>
        <select id="f-status">
          <option ${p.status === '준비중' ? 'selected' : ''}>준비중</option>
          <option ${p.status === '진행중' ? 'selected' : ''}>진행중</option>
          <option ${p.status === '완료' ? 'selected' : ''}>완료</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label for="f-rehearsal">연습 가능 시간</label>
      <input type="text" id="f-rehearsal" value="${attr(p.rehearsalAvailability)}" placeholder="예: 평일 저녁 7~10시, 주말 오후">
    </div>

    <div class="field">
      <label>제작 파트</label>
      <div class="chip-row">
        ${p.parts.map(part => `<span class="chip">${escapeHtml(part)} <button type="button" data-remove-part="${attr(part)}">×</button></span>`).join('')}
      </div>
      <div class="row" style="margin-top:8px; max-width:320px;">
        <input type="text" id="new-part" placeholder="새 파트 추가">
        <button type="button" id="add-part" class="small">추가</button>
      </div>
    </div>

    <div class="field">
      <label>참여 인원</label>
      ${p.participants.length ? `
      <table>
        <thead><tr><th>이름</th><th>역할(파트)</th><th></th></tr></thead>
        <tbody>
          ${p.participants.map((person, i) => `
            <tr>
              <td>${escapeHtml(person.name)}</td>
              <td>${escapeHtml(person.part)}</td>
              <td><button type="button" class="small danger" data-remove-person="${i}">삭제</button></td>
            </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty">등록된 참여 인원이 없습니다.</div>`}
      <div class="row" style="margin-top:8px;">
        <input type="text" id="p-name" placeholder="이름">
        <select id="p-part">${p.parts.map(part => `<option>${escapeHtml(part)}</option>`).join('')}</select>
        <button type="button" id="add-person" style="flex:0 0 auto;">추가</button>
      </div>
    </div>
  </section>
  `;
}

function renderRisks(risks) {
  return `
  <section class="section" id="section-risks">
    <h2><span class="n">!</span>검수 결과 <span class="count">(${risks.length})</span></h2>
    ${risks.length ? risks.map(r => `
      <div class="risk ${r.level}"><span class="tag">${r.level}</span><span>${escapeHtml(r.message)}</span></div>
    `).join('') : `<div class="empty">현재 감지된 위험 항목이 없습니다.</div>`}
  </section>
  `;
}

function renderTaskForm(p) {
  const names = p.participants.map(x => x.name);
  return `
  <section class="section" id="section-task-form">
    <h2><span class="n">02</span>업무 추가</h2>
    <div class="grid3">
      <div class="field"><label for="t-part">담당 파트</label><select id="t-part">${p.parts.map(part => `<option>${escapeHtml(part)}</option>`).join('')}</select></div>
      <div class="field"><label for="t-name">업무명</label><input type="text" id="t-name" placeholder="예: 오르골 소품 제작"></div>
      <div class="field">
        <label for="t-assignee">담당자</label>
        <select id="t-assignee"><option value="">— 미지정 —</option>${names.map(n => `<option>${escapeHtml(n)}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="t-deadline">마감일</label><input type="date" id="t-deadline"></div>
      <div class="field">
        <label for="t-prereq">선행 업무</label>
        <select id="t-prereq"><option value="">— 없음 —</option>${state.tasks.map(t => `<option value="${attr(t.taskId)}">${escapeHtml(t.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label for="t-priority">우선순위</label>
        <select id="t-priority">${TASK_PRIORITY.map(pr => `<option ${pr === '보통' ? 'selected' : ''}>${pr}</option>`).join('')}</select>
      </div>
    </div>
    <div class="row" style="align-items:center; margin:10px 0;">
      <label class="check-inline"><input type="checkbox" id="t-required"> 필수 업무</label>
      <label class="check-inline"><input type="checkbox" id="t-preshow"> 공연 전 체크리스트에 포함</label>
    </div>
    <button type="button" id="add-task">업무 추가</button>
  </section>
  `;
}

function renderTaskTable(p) {
  const parts = ['전체', ...p.parts];
  const filtered = currentPartFilter === '전체' ? state.tasks : state.tasks.filter(t => t.part === currentPartFilter);
  return `
  <section class="section" id="section-tasks">
    <h2><span class="n">03</span>전체 업무 <span class="count">(${state.tasks.length})</span></h2>
    <div class="chip-row" style="margin-bottom:12px;">
      ${parts.map(part => `<button type="button" class="small ${currentPartFilter === part ? '' : 'ghost'}" data-filter-part="${attr(part)}">${escapeHtml(part)}</button>`).join('')}
    </div>
    ${filtered.length ? `
    <table>
      <thead><tr><th>ID</th><th>파트</th><th>업무명</th><th>담당자</th><th>마감일</th><th>선행업무</th><th>우선순위</th><th>필수</th><th>체크리스트</th><th>상태</th><th></th></tr></thead>
      <tbody>
        ${filtered.map(t => {
          const prereq = getPrereqTask(t, state.tasks);
          return `
          <tr>
            <td class="mono">${t.taskId}</td>
            <td>${escapeHtml(t.part)}</td>
            <td>${escapeHtml(t.name)}</td>
            <td>${t.assignee ? escapeHtml(t.assignee) : '<span class="text-faint">미지정</span>'}</td>
            <td class="mono">${t.deadline || '—'}</td>
            <td class="text-faint">${prereq ? escapeHtml(prereq.name) : '—'}</td>
            <td><span class="badge ${t.priority}">${t.priority}</span></td>
            <td>${t.required ? '✓' : '—'}</td>
            <td>${t.preShowCheck ? '✓' : '—'}</td>
            <td>
              <select data-status="${attr(t.taskId)}" class="mono-select">
                ${TASK_STATUS.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </td>
            <td><button type="button" class="small danger" data-del-task="${attr(t.taskId)}">삭제</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : `<div class="empty">${currentPartFilter === '전체' ? '등록된 업무가 없습니다.' : `'${escapeHtml(currentPartFilter)}' 파트에 등록된 업무가 없습니다.`}</div>`}
  </section>
  `;
}

function renderDashboard(p, stage) {
  const thisWeek = state.tasks.filter(t => {
    if (t.status === '완료' || !t.deadline) return false;
    const dd = getDaysUntil(t.deadline, todayStr);
    return dd !== null && dd >= 0 && dd <= 7;
  }).sort((a, b) => a.deadline.localeCompare(b.deadline));

  const upcoming = state.tasks.filter(t => t.deadline && t.status !== '완료')
    .sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6);

  const incomplete = state.tasks.filter(t => t.status !== '완료');

  const byPart = {};
  p.parts.forEach(part => { byPart[part] = { total: 0, done: 0 }; });
  state.tasks.forEach(t => { if (byPart[t.part]) { byPart[t.part].total++; if (t.status === '완료') byPart[t.part].done++; } });

  return `
  <section class="section" id="section-dashboard">
    <h2><span class="n">04</span>대시보드</h2>

    <div class="stat-cards">
      <div class="stat"><div class="val">${state.tasks.length}</div><div class="lbl">전체 업무</div></div>
      <div class="stat"><div class="val">${incomplete.length}</div><div class="lbl">미완료 업무</div></div>
      <div class="stat"><div class="val">${thisWeek.length}</div><div class="lbl">이번 주 할 일</div></div>
      <div class="stat"><div class="val">${stage ? stage.name.slice(0, 2) : '—'}</div><div class="lbl">${stage ? stage.name : '단계 미정'}</div></div>
    </div>

    <div class="grid2">
      <div>
        <h3>이번 주 할 일</h3>
        ${thisWeek.length ? thisWeek.map(t => `
          <div class="check-item"><span class="badge ${t.status}">${t.status}</span><span class="grow">${escapeHtml(t.name)} <span class="text-faint">· ${t.assignee ? escapeHtml(t.assignee) : '미지정'}</span></span><span class="mono">${t.deadline}</span></div>
        `).join('') : `<div class="empty">이번 주 마감인 업무가 없습니다.</div>`}
      </div>
      <div>
        <h3>다가오는 마감</h3>
        ${upcoming.length ? upcoming.map(t => `
          <div class="check-item"><span class="grow">${escapeHtml(t.name)}</span><span class="mono accent">${t.deadline}</span></div>
        `).join('') : `<div class="empty">예정된 마감이 없습니다.</div>`}
      </div>
    </div>

    <div class="grid2">
      <div>
        <h3>파트별 업무 현황</h3>
        ${Object.entries(byPart).map(([part, v]) => `
          <div class="check-item"><span style="width:70px;">${escapeHtml(part)}</span><span class="mono text-dim">${v.done}/${v.total} 완료</span></div>
        `).join('')}
      </div>
      <div>
        <h3>미완료 업무 (${incomplete.length})</h3>
        ${incomplete.length ? incomplete.slice(0, 8).map(t => `
          <div class="check-item"><span class="grow">${escapeHtml(t.name)}</span><span class="badge ${t.status}">${t.status}</span></div>
        `).join('') : `<div class="empty">모든 업무가 완료되었습니다.</div>`}
      </div>
    </div>
  </section>
  `;
}

function renderPreShowChecklist() {
  const items = state.tasks.filter(t => t.preShowCheck);
  const done = items.filter(t => t.status === '완료').length;
  return `
  <section class="section" id="section-checklist">
    <h2><span class="n">05</span>공연 전 체크리스트 <span class="count">(${done}/${items.length})</span></h2>
    <p class="note">업무 추가 시 "공연 전 체크리스트에 포함"을 체크한 업무만 여기 표시됩니다.</p>
    ${items.length ? items.map(t => `
      <div class="check-item ${t.status === '완료' ? 'checked' : ''}">
        <span class="badge ${t.status}">${t.status}</span>
        <span class="grow">${escapeHtml(t.name)} <span class="text-faint">· ${escapeHtml(t.part)}</span></span>
        ${t.required ? '<span class="tag-required">필수</span>' : ''}
      </div>
    `).join('') : `<div class="empty">공연 전 체크리스트에 포함된 업무가 없습니다.</div>`}
  </section>
  `;
}

/* ---------------- 이벤트 바인딩 ---------------- */

function bindEvents() {
  const p = state.performance;

  const ft = document.getElementById('f-title');
  if (ft) ft.onchange = e => { p.title = e.target.value; render(); saveState(); };
  const fdate = document.getElementById('f-date');
  if (fdate) fdate.onchange = e => { p.date = e.target.value; render(); saveState(); };
  const fvenue = document.getElementById('f-venue');
  if (fvenue) fvenue.onchange = e => { p.venue = e.target.value; saveState(); };
  const fvenueInfo = document.getElementById('f-venue-info');
  if (fvenueInfo) fvenueInfo.onchange = e => { p.venueInfo = e.target.value; saveState(); };
  const fstart = document.getElementById('f-start');
  if (fstart) fstart.onchange = e => { p.projectStartDate = e.target.value; render(); saveState(); };
  const fstatus = document.getElementById('f-status');
  if (fstatus) fstatus.onchange = e => { p.status = e.target.value; saveState(); };
  const frehearsal = document.getElementById('f-rehearsal');
  if (frehearsal) frehearsal.onchange = e => { p.rehearsalAvailability = e.target.value; saveState(); };

  const addPartBtn = document.getElementById('add-part');
  if (addPartBtn) addPartBtn.onclick = () => {
    const inp = document.getElementById('new-part');
    const v = inp.value.trim();
    if (v && !p.parts.includes(v)) { p.parts.push(v); render(); saveState(); }
  };
  document.querySelectorAll('[data-remove-part]').forEach(b => {
    b.onclick = () => { p.parts = p.parts.filter(x => x !== b.dataset.removePart); render(); saveState(); };
  });

  const addPersonBtn = document.getElementById('add-person');
  if (addPersonBtn) addPersonBtn.onclick = () => {
    const name = document.getElementById('p-name').value.trim();
    const part = document.getElementById('p-part').value;
    if (name) { p.participants.push({ name, part }); render(); saveState(); }
  };
  document.querySelectorAll('[data-remove-person]').forEach(b => {
    b.onclick = () => { p.participants.splice(+b.dataset.removePerson, 1); render(); saveState(); };
  });

  const addTaskBtn = document.getElementById('add-task');
  if (addTaskBtn) addTaskBtn.onclick = () => {
    const name = document.getElementById('t-name').value.trim();
    if (!name) return;
    state.tasks.push({
      taskId: nextTaskId(),
      part: document.getElementById('t-part').value,
      name,
      assignee: document.getElementById('t-assignee').value,
      deadline: document.getElementById('t-deadline').value,
      status: '대기',
      priority: document.getElementById('t-priority').value,
      prereqTaskId: document.getElementById('t-prereq').value || null,
      required: document.getElementById('t-required').checked,
      preShowCheck: document.getElementById('t-preshow').checked,
    });
    render(); saveState();
  };
  document.querySelectorAll('[data-del-task]').forEach(b => {
    b.onclick = () => { state.tasks = state.tasks.filter(t => t.taskId !== b.dataset.delTask); render(); saveState(); };
  });
  document.querySelectorAll('[data-status]').forEach(el => {
    el.onchange = () => {
      const t = state.tasks.find(x => x.taskId === el.dataset.status);
      t.status = el.value; render(); saveState();
    };
  });
  document.querySelectorAll('[data-filter-part]').forEach(b => {
    b.onclick = () => { currentPartFilter = b.dataset.filterPart; render(); };
  });
}

/* ---------------- 유틸 ---------------- */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function attr(str) { return escapeHtml(str); }

init();
