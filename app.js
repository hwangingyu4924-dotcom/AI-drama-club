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
let isPerformanceEditorOpen = false;
let isTaskFormOpen = false;
let currentView = 'home';
let isSidebarOpen = false;

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
      fetch('./performance.json'),
      fetch('./tasks.json'),
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
    <div class="dashboard-shell">
      <button type="button" class="mobile-menu-toggle" data-toggle-sidebar aria-label="메뉴 열기">MENU</button>
      ${renderSidebar(p)}
      <main class="dashboard-main">
        ${renderCurrentView(p, dDay, stage, risks)}
        ${renderFooter()}
      </main>
    </div>
  `;

  bindEvents();
}

function renderSidebar(p) {
  const sidebarDday = getDaysUntil(p.date, todayStr);
  const navigation = [
    ['home', 'HOME'], ['performance', '공연 정보'], ['production', '제작 현황'], ['tasks', '전체 업무'], ['preshow', '공연 전 체크'],
  ];
  return `
  <aside class="dashboard-sidebar ${isSidebarOpen ? 'is-open' : ''}" aria-label="공연 제작 메뉴">
    <div class="sidebar-identity">
      <span>JEONDAE THEATRE</span>
      <strong>${escapeHtml(p.title) || '(작품명 미입력)'}</strong>
      <small>PRODUCTION DESK / ACT II</small>
    </div>
    <div class="sidebar-status" aria-label="공연 상태"><span>● 제작 ${escapeHtml(p.status || '준비중')}</span><strong>공연 ${formatDday(sidebarDday)}</strong></div>
    <nav class="sidebar-nav" aria-label="페이지 탐색">
      ${navigation.map(([view, label]) => `<button type="button" data-view="${view}" class="${currentView === view ? 'is-active' : ''}">${label}</button>`).join('')}
    </nav>
    <div class="sidebar-parts">
      <span class="sidebar-label">PARTS</span>
      ${p.parts.map(part => `<button type="button" data-sidebar-part="${attr(part)}">${escapeHtml(part)}</button>`).join('')}
    </div>
    <div class="sidebar-footer"><button type="button" data-new-task>+ 새 업무 추가</button><p class="sidebar-archive"><span>ARCHIVE NOTE</span>이 데이터는 현재 브라우저에만 저장됩니다.</p></div>
  </aside>`;
}

function renderCurrentView(p, dDay, stage, risks) {
  if (currentView === 'performance') return renderPerformanceForm(p, true);
  if (currentView === 'production') return renderDashboard(p, stage) + renderRisks(risks);
  if (currentView === 'tasks') return renderTaskForm(p) + renderTaskTable(p);
  if (currentView === 'preshow') return renderPreShowChecklist();
  return renderHomeDashboard(p, dDay, stage, risks);
}

function renderHeader(p, dDay, stage) {
  const stageText = stage
    ? (stage.index >= 0 ? `제작 ${stage.index + 1}단계 · ${stage.name}` : stage.name)
    : '미정';
  return `
  <header class="masthead home-project-header" aria-label="공연 제작 데스크 개요">
    <div class="masthead-main">
      <div class="masthead-kicker"><span>JEONDAE THEATRE</span><span class="accent">/</span><span>PRODUCTION DESK</span></div>
      <h1 id="show-title">${escapeHtml(p.title) || '(작품명 미입력)'}</h1>
      <div class="sub">${escapeHtml(p.venue) || '공연장 미정'} · ${formatDisplayDate(p.date) || '공연일 미정'} · 제작 ${escapeHtml(p.status || '준비중')}</div>
    </div>
    <div class="masthead-meta" aria-label="공연 일정">
      <span class="meta-label">PERFORMANCE</span>
      <span class="dday">${formatDday(dDay)}</span>
      <span class="performance-date">${formatDisplayDate(p.date) || 'DATE TBA'}</span>
      <div class="production-status">
        <span class="stage-label">${stageText}</span>
        <span class="current-status">● 제작 ${escapeHtml(p.status || '준비중')}</span>
      </div>
      <div class="save-bar">
        <span id="save-status" class="save-status"></span>
      </div>
    </div>
  </header>
  `;
}

function renderPerformanceForm(p, forceEditorOpen = false) {
  const summaryItems = [
    ['작품', p.title || '미입력'],
    ['공연일', formatDisplayDate(p.date) || '미정'],
    ['공연장', p.venue || '미입력'],
    ['시작일', formatDisplayDate(p.projectStartDate) || '미정'],
    ['상태', p.status || '준비중'],
  ];
  return `
  <section class="section section-performance" id="section-setup">
    <div class="section-heading"><span class="act-label">ACT 01</span><span class="section-caption">PERFORMANCE</span><h2><span class="n">01</span>공연 기본정보</h2></div>
    <div class="performance-summary ${(isPerformanceEditorOpen || forceEditorOpen) ? 'is-hidden' : ''}">
      <dl>
        ${summaryItems.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>
      <button type="button" data-toggle-performance-editor class="editor-toggle">정보 수정</button>
    </div>
    <div class="performance-editor ${(isPerformanceEditorOpen || forceEditorOpen) ? '' : 'is-hidden'}">
    <div class="editor-actions"><span>EDITING PRODUCTION SHEET</span>${forceEditorOpen ? '' : '<button type="button" data-toggle-performance-editor class="small ghost">닫기</button>'}</div>
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
      <label>제작 파트 <span class="field-translation">/ PRODUCTION UNITS</span></label>
      <div class="chip-row">
        ${p.parts.map(part => `<span class="chip">${escapeHtml(part)} <button type="button" data-remove-part="${attr(part)}">×</button></span>`).join('')}
      </div>
      <div class="row" style="margin-top:8px; max-width:320px;">
        <input type="text" id="new-part" placeholder="새 파트 추가">
        <button type="button" id="add-part" class="small">추가</button>
      </div>
    </div>

    <div class="field participant-field">
      <div class="subsection-heading"><span>CAST & CREW /</span><span>참여 인원</span></div>
      <label>참여 인원</label>
      ${p.participants.length ? `
      <div class="table-scroll">
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
      </table>
      </div>` : `<div class="empty">등록된 참여 인원이 없습니다.</div>`}
      <div class="row" style="margin-top:8px;">
        <input type="text" id="p-name" placeholder="이름">
        <select id="p-part">${p.parts.map(part => `<option>${escapeHtml(part)}</option>`).join('')}</select>
        <button type="button" id="add-person" style="flex:0 0 auto;">추가</button>
      </div>
    </div>
    </div>
  </section>
  `;
}

function renderRisks(risks) {
  const hasCritical = risks.some(r => r.level === '오류');
  return `
  <section class="section section-check" id="section-risks">
    <div class="section-heading"><span class="act-label">ACT 02</span><span class="section-caption">PRODUCTION CHECK</span><h2><span class="n">02${hasCritical ? ' !' : ''}</span>제작 검수 노트 <span class="count">(${risks.length})</span></h2></div>
    <div class="check-intro"><span class="check-number">${String(risks.length).padStart(2, '0')}</span><span>${risks.length ? 'ISSUES FOUND' : 'READY FOR THE NEXT CUE'}</span></div>
    <div class="validation-list">
    ${risks.length ? risks.map(r => {
      const isCritical = r.level === '오류';
      return `<div class="validation-row ${isCritical ? 'critical' : 'warning'}">
        <span class="validation-symbol">${isCritical ? '!' : '△'}</span>
        <span class="validation-label">${isCritical ? 'CRITICAL' : 'WARNING'}</span>
        <span class="validation-message">${escapeHtml(r.message)}</span>
      </div>`;
    }).join('') : `<div class="validation-row clear">
      <span class="validation-symbol">✓</span><span class="validation-label">CLEAR</span><span class="validation-message">현재 감지된 위험 항목이 없습니다.</span>
    </div>`}
    </div>
  </section>
  `;
}

function renderTaskForm(p) {
  const names = p.participants.map(x => x.name);
  return `
  <section class="section section-tasks" id="section-task-form">
    <div class="section-heading"><span class="act-label">ACT 04</span><span class="section-caption">TASKS / NEW CALL</span><h2><span class="n">04</span>업무 추가</h2></div>
    <button type="button" data-toggle-task-form class="task-form-toggle ${isTaskFormOpen ? 'is-hidden' : ''}">+ 새 업무 추가</button>
    <div class="task-form-panel ${isTaskFormOpen ? '' : 'is-hidden'}">
    <div class="editor-actions"><span>NEW PRODUCTION CALL</span><button type="button" data-toggle-task-form class="small ghost">닫기</button></div>
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
    </div>
  </section>
  `;
}

function renderTaskTable(p) {
  const parts = ['전체', ...p.parts];
  const filtered = currentPartFilter === '전체' ? state.tasks : state.tasks.filter(t => t.part === currentPartFilter);
  return `
  <section class="section task-ledger" id="section-tasks">
    <h2 class="table-section-title"><span class="table-section-label">PRODUCTION CALL SHEET</span>전체 업무 <span class="count">(${state.tasks.length})</span></h2>
    <div class="chip-row" style="margin-bottom:12px;">
      ${parts.map(part => `<button type="button" class="small ${currentPartFilter === part ? '' : 'ghost'}" data-filter-part="${attr(part)}">${escapeHtml(part)}</button>`).join('')}
    </div>
    ${filtered.length ? `
    <div class="table-scroll">
    <table>
      <thead><tr><th>업무명</th><th>담당 파트</th><th>담당자</th><th>마감일</th><th>상태</th><th>우선순위</th><th>선행업무</th><th>필수</th><th>체크리스트</th><th>ID</th><th></th></tr></thead>
      <tbody>
        ${filtered.map(t => {
          const prereq = getPrereqTask(t, state.tasks);
          return `
          <tr>
            <td>${escapeHtml(t.name)}</td>
            <td>${escapeHtml(t.part)}</td>
            <td>${t.assignee ? escapeHtml(t.assignee) : '<span class="text-faint">미지정</span>'}</td>
            <td class="mono">${t.deadline || '—'}</td>
            <td>
              <select data-status="${attr(t.taskId)}" class="mono-select">
                ${TASK_STATUS.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </td>
            <td><span class="badge ${t.priority}">${t.priority}</span></td>
            <td class="text-faint">${prereq ? escapeHtml(prereq.name) : '—'}</td>
            <td>${t.required ? '✓' : '—'}</td>
            <td>${t.preShowCheck ? '✓' : '—'}</td>
            <td class="mono">${t.taskId}</td>
            <td><button type="button" class="small danger" data-del-task="${attr(t.taskId)}">삭제</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>` : `<div class="empty">${currentPartFilter === '전체' ? '등록된 업무가 없습니다.' : `'${escapeHtml(currentPartFilter)}' 파트에 등록된 업무가 없습니다.`}</div>`}
  </section>
  `;
}

function getDashboardData(p, stage) {
  const thisWeek = state.tasks.filter(t => {
    if (t.status === '완료' || !t.deadline) return false;
    const dd = getDaysUntil(t.deadline, todayStr);
    return dd !== null && dd >= 0 && dd <= 7;
  }).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const upcoming = state.tasks.filter(t => t.deadline && t.status !== '완료')
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const incomplete = state.tasks.filter(t => t.status !== '완료');
  const completedCount = state.tasks.length - incomplete.length;
  const stageNumber = stage && stage.index >= 0 ? String(stage.index + 1).padStart(2, '0') : '—';
  const byPart = {};
  p.parts.forEach(part => { byPart[part] = { total: 0, done: 0 }; });
  state.tasks.forEach(t => { if (byPart[t.part]) { byPart[t.part].total++; if (t.status === '완료') byPart[t.part].done++; } });
  return { thisWeek, upcoming, incomplete, completedCount, stageNumber, byPart };
}

function renderPartStatus(byPart) {
  return Object.entries(byPart).map(([part, v]) => {
    const percent = v.total ? Math.round((v.done / v.total) * 100) : 0;
    return `<div class="check-item part-progress"><span class="part-name">${escapeHtml(part)}</span><span class="mono text-dim">${v.done} / ${v.total}</span><span class="progress-track" aria-hidden="true"><span class="progress-value" style="width:${percent}%"></span></span><span class="part-percent">${percent}%</span></div>`;
  }).join('');
}

function renderHomeDashboard(p, dDay, stage, risks) {
  const data = getDashboardData(p, stage);
  const todayTasks = data.incomplete.filter(t => t.deadline === todayStr);
  const important = data.incomplete.slice().sort((a, b) => {
    if (Boolean(a.required) !== Boolean(b.required)) return a.required ? -1 : 1;
    if ((a.priority === '높음') !== (b.priority === '높음')) return a.priority === '높음' ? -1 : 1;
    return (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
  });
  return `
    ${renderHeader(p, dDay, stage)}
    <section class="section home-kpi" id="home">
      <div class="section-heading"><span class="act-label">HOME</span><span class="section-caption">PRODUCTION CONTROL ROOM</span><h2>오늘의 제작 상황</h2></div>
      <div class="stat-cards">
        <div class="stat"><div class="val">${state.tasks.length}</div><div class="lbl">전체 업무</div></div>
        <div class="stat"><div class="val">${data.incomplete.length}</div><div class="lbl">미완료 업무</div></div>
        <div class="stat"><div class="val">${data.thisWeek.length}</div><div class="lbl">이번 주 업무</div></div>
        <div class="stat"><div class="val">${formatDday(dDay)}</div><div class="lbl">공연</div></div>
      </div>
    </section>
    <section class="section home-lists">
      <div class="grid2">
        <div><h3>오늘 할 일</h3>${renderHomeTaskList(todayTasks.slice(0, 6), '오늘 마감인 업무가 없습니다.', true)}</div>
        <div><h3>다가오는 마감</h3>${renderHomeTaskList(data.upcoming.slice(0, 6), '예정된 마감이 없습니다.')}</div>
      </div>
    </section>
    <section class="section home-status">
      <div class="grid2">
        <div><h3>파트별 진행률</h3>${renderPartStatus(data.byPart)}</div>
        <div><h3>미완료 중요 업무</h3>${renderHomeTaskList(important.slice(0, 6), '미완료 업무가 없습니다.')}</div>
      </div>
    </section>`;
}

function renderHomeTaskList(tasks, emptyMessage, showCheckbox = false) {
  return tasks.length ? tasks.map(t => `<div class="home-task-row">${showCheckbox ? '<span class="task-checkbox" aria-hidden="true">□</span>' : ''}<span class="grow"><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.part)} · ${t.assignee ? escapeHtml(t.assignee) : '미지정'}${t.required ? ' · 필수' : ''}</small></span><span class="mono">${t.deadline || '—'}</span><span class="badge ${t.priority}">${t.priority || ''}</span></div>`).join('') : `<div class="empty">${emptyMessage}</div>`;
}

function renderDashboard(p, stage) {
  const { thisWeek, upcoming, incomplete, completedCount, stageNumber, byPart } = getDashboardData(p, stage);

  return `
  <section class="section section-dashboard" id="section-dashboard">
    <div class="section-heading"><span class="act-label">ACT 03</span><span class="section-caption">PRODUCTION OVERVIEW</span><h2><span class="n">03</span>제작 현황</h2></div>

    <div class="stat-cards">
      <div class="stat"><div class="val">${state.tasks.length}</div><div><div class="lbl">전체 업무</div><div class="stat-detail">${state.tasks.length ? `완료 ${completedCount}건` : '등록된 업무 없음'}</div></div></div>
      <div class="stat"><div class="val">${incomplete.length}</div><div><div class="lbl">미완료 업무</div><div class="stat-detail">${incomplete.length ? '처리 필요 업무' : '대기 업무 없음'}</div></div></div>
      <div class="stat"><div class="val">${thisWeek.length}</div><div><div class="lbl">이번 주 할 일</div><div class="stat-detail">${thisWeek.length ? '7일 내 마감' : '예정 업무 없음'}</div></div></div>
      <div class="stat"><div class="val">${stageNumber}</div><div><div class="lbl">현재 단계</div><div class="stat-detail">${stage ? stage.name : '단계 미정'}</div></div></div>
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
        ${renderPartStatus(byPart)}
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
  <section class="section section-preshow" id="section-checklist">
    <div class="section-heading"><span class="act-label">ACT 05</span><span class="section-caption">PRE-SHOW / HOUSE OPEN</span><h2><span class="n">05</span>공연 전 체크 <span class="count">(${done}/${items.length})</span></h2></div>
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

function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="site-footer-identity">JEONDAE THEATRE <span>/</span> ACT II</div>
    <div class="site-footer-meta">PRODUCTION ARCHIVE · LOCAL FIRST · REV. 01</div>
  </footer>
  `;
}

/* ---------------- 이벤트 바인딩 ---------------- */

function bindEvents() {
  const p = state.performance;

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => { currentView = btn.dataset.view; isSidebarOpen = false; render(); };
  });
  document.querySelectorAll('[data-sidebar-part]').forEach(btn => {
    btn.onclick = () => { currentPartFilter = btn.dataset.sidebarPart; currentView = 'tasks'; isSidebarOpen = false; render(); };
  });
  document.querySelectorAll('[data-new-task]').forEach(btn => {
    btn.onclick = () => { currentView = 'tasks'; isTaskFormOpen = true; isSidebarOpen = false; render(); };
  });
  document.querySelectorAll('[data-toggle-sidebar]').forEach(btn => {
    btn.onclick = () => { isSidebarOpen = !isSidebarOpen; render(); };
  });

  document.querySelectorAll('[data-toggle-performance-editor]').forEach(btn => {
    btn.onclick = () => { isPerformanceEditorOpen = !isPerformanceEditorOpen; render(); };
  });
  document.querySelectorAll('[data-toggle-task-form]').forEach(btn => {
    btn.onclick = () => { isTaskFormOpen = !isTaskFormOpen; render(); };
  });

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
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}. ${match[2]}. ${match[3]}.` : String(dateStr);
}

init();
