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
const REHEARSAL_LOGS_KEY = 'rehearsalLogs';
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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
  events: [],
};

let currentPartFilter = '전체';
let isPerformanceEditorOpen = false;
let isTaskFormOpen = false;
let currentView = 'home';
let isTopNavOpen = false;
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = todayStr;
let isEventFormOpen = false;
let editingEventId = null;
let rehearsalLogs = [];
let rehearsalArchiveMode = 'list';
let selectedRehearsalLogId = null;
let rehearsalCategoryFilter = '전체';
let rehearsalSearchQuery = '';
let heroVideoAnimationFrame = null;
let heroVideoRestartTimer = null;

const EVENT_TYPES = ['연습', '회의', '리딩', '공연', '설치/기술', '기타'];
const REHEARSAL_CATEGORIES = ['전체연습', '연기', '연출', '무대', '회의', '기타'];

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
      if (!Array.isArray(state.events)) state.events = [];
      return true;
    }
  } catch (e) { /* 저장된 값이 손상된 경우 무시하고 초기값 사용 */ }
  return false;
}

function loadRehearsalLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REHEARSAL_LOGS_KEY) || '[]');
    rehearsalLogs = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    rehearsalLogs = [];
  }
}

function saveRehearsalLogs() {
  try {
    localStorage.setItem(REHEARSAL_LOGS_KEY, JSON.stringify(rehearsalLogs));
    setSaveStatus('저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSaveStatus('저장 실패 — 브라우저 저장공간을 확인하세요');
  }
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

function nextEventId() {
  const nums = state.events
    .map(event => (String(event.id || '').match(/^EVENT-(\d+)$/) || [])[1])
    .filter(Boolean)
    .map(Number);
  return 'EVENT-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

function nextRehearsalLogId() {
  const nums = rehearsalLogs
    .map(log => (String(log.id || '').match(/^LOG-(\d+)$/) || [])[1])
    .filter(Boolean).map(Number);
  return 'LOG-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

/* ---------------- 초기화 ---------------- */

async function init() {
  loadRehearsalLogs();
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
  destroyHeroVideoLoop();
  const root = document.getElementById('app');
  const p = state.performance;
  const dDay = getDaysUntil(p.date, todayStr);
  const stage = getStage(dDay);
  const risks = computeRisks(p, state.tasks, todayStr);

  root.innerHTML = `
    <div class="app-shell">
      ${renderTopNavigation()}
      <main class="app-main">
        ${renderCurrentView(p, dDay, stage, risks)}
        ${renderFooter()}
      </main>
    </div>
  `;

  bindEvents();
  if (currentView === 'home') initHeroVideoLoop();
}

function renderTopNavigation() {
  const navigation = [
    ['home', 'HOME'], ['performance', '공연 정보'], ['production', '제작 현황'], ['tasks', '전체 업무'], ['calendar', '일정'], ['rehearsal', '연습일지'], ['preshow', '공연 전 체크'],
  ];
  return `<header class="top-shell-header">
    <div class="top-shell-nav-wrap">
      <button type="button" class="top-shell-wordmark" data-view="home">전대극회</button>
      <button type="button" class="top-shell-menu-toggle" data-topnav-toggle aria-expanded="${isTopNavOpen}" aria-controls="top-shell-navigation"><span>MENU</span><i aria-hidden="true"></i></button>
      <nav id="top-shell-navigation" class="top-shell-navigation ${isTopNavOpen ? 'is-open' : ''}" aria-label="주요 메뉴">
        ${navigation.map(([view, label]) => `<button type="button" data-view="${view}" class="${currentView === view ? 'is-active' : ''}" ${currentView === view ? 'aria-current="page"' : ''}>${label}</button>`).join('')}
      </nav>
      <button type="button" class="top-shell-new-task" data-new-task>+ 새 업무</button>
    </div>
  </header>`;
}

function renderCurrentView(p, dDay, stage, risks) {
  if (currentView === 'performance') return renderViewPage('performance', renderPerformanceForm(p, true));
  if (currentView === 'production') return renderViewPage('production', renderDashboard(p, stage) + renderRisks(risks));
  if (currentView === 'tasks') return renderViewPage('tasks', renderTaskForm(p) + renderTaskTable(p));
  if (currentView === 'calendar') return renderViewPage('calendar', renderCalendar(p));
  if (currentView === 'rehearsal') return renderViewPage('rehearsal', renderRehearsalArchive(p));
  if (currentView === 'preshow') return renderViewPage('preshow', renderPreShowChecklist());
  return renderHomeDashboard(p, dDay, stage, risks);
}

function renderViewPage(view, content) {
  const headers = {
    performance: ['ACT 01', 'PERFORMANCE', '공연 기본정보'],
    production: ['ACT 02', 'PRODUCTION', '제작 현황'],
    tasks: ['ACT 03', 'TASKS', '전체 업무'],
    calendar: ['ACT 04', 'CALENDAR', '일정'],
    rehearsal: ['ACT 05', 'REHEARSAL ARCHIVE', '연습일지'],
    preshow: ['ACT 06', 'PRE-SHOW', '공연 전 체크'],
  };
  const [act, label, title] = headers[view];
  return `<div class="view-page view-page-${view}">
    <header class="view-page-header">
      <p><span>${act}</span><i aria-hidden="true">/</i>${label}</p>
      <h1>${title}</h1>
    </header>
    <div class="view-page-content">${content}</div>
  </div>`;
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

function renderMotionHero(p, dDay) {
  return `<section class="motion-hero" aria-labelledby="motion-hero-title">
    <div class="hero-video-stage" aria-hidden="true">
      <video id="motion-hero-video" class="motion-hero-video" muted playsinline preload="metadata" poster="">
        <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4" type="video/mp4">
      </video>
      <div class="hero-video-overlay"></div>
    </div>
    <div class="motion-hero-foreground">
      <div class="motion-hero-copy">
        <span class="hero-production-label fade-rise">PERFORMANCE PRODUCTION / ${escapeHtml(p.status || '준비중')}</span>
        <h1 id="motion-hero-title" class="fade-rise-delay"><span>${escapeHtml(p.title) || '우리의 공연'}</span><em>무대에 오르기 전부터.</em></h1>
        <p class="hero-description fade-rise-delay-2">공연일까지의 모든 제작 과정과 기록을<br>하나의 Production Desk에서 관리합니다.</p>
        <div class="hero-actions fade-rise-delay-2">
          <button type="button" class="hero-dashboard-cta" data-hero-dashboard>오늘의 제작 현황 보기</button>
          <span><b>${formatDday(dDay)}</b>${formatDisplayDate(p.date) || 'DATE TBA'}</span>
        </div>
      </div>
      <div class="hero-footnote fade-rise-delay-2"><span>JEONDAE THEATRE ARCHIVE</span><span>SCROLL TO PRODUCTION DESK ↓</span></div>
    </div>
  </section>`;
}

function destroyHeroVideoLoop() {
  if (heroVideoAnimationFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(heroVideoAnimationFrame);
  if (heroVideoRestartTimer !== null) clearTimeout(heroVideoRestartTimer);
  heroVideoAnimationFrame = null;
  heroVideoRestartTimer = null;
}

function initHeroVideoLoop() {
  const video = document.getElementById('motion-hero-video');
  if (!video) return;
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const playVideo = () => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  };
  const updateOpacity = () => {
    if (!video.isConnected) return;
    if (reducedMotion) {
      video.style.opacity = video.readyState >= 2 ? '1' : '0';
    } else if (Number.isFinite(video.duration) && video.duration > 0) {
      const fadeIn = Math.min(1, video.currentTime / .5);
      const fadeOut = Math.min(1, Math.max(0, (video.duration - video.currentTime) / .5));
      video.style.opacity = String(Math.min(fadeIn, fadeOut));
    }
    if (typeof requestAnimationFrame === 'function') heroVideoAnimationFrame = requestAnimationFrame(updateOpacity);
  };
  video.addEventListener('loadeddata', () => { video.style.opacity = reducedMotion ? '1' : '0'; playVideo(); }, { once: true });
  video.addEventListener('ended', () => {
    video.style.opacity = '0';
    heroVideoRestartTimer = setTimeout(() => {
      if (!video.isConnected) return;
      video.currentTime = 0;
      playVideo();
    }, 100);
  });
  if (video.readyState >= 2) playVideo();
  if (typeof requestAnimationFrame === 'function') heroVideoAnimationFrame = requestAnimationFrame(updateOpacity);
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
    ${renderMotionHero(p, dDay)}
    <section class="section home-kpi" id="home-dashboard">
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

/* ---------------- Production Calendar ---------------- */

function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getCalendarItems(p) {
  const taskItems = state.tasks.filter(task => task.deadline).map(task => ({
    source: 'task', id: task.taskId, date: task.deadline, title: task.name,
    time: '', type: 'TASK', meta: `${task.part || '파트 미정'} · 마감`, status: task.status,
  }));
  const eventItems = state.events.filter(event => event.date).map(event => ({
    source: 'event', id: event.id, date: event.date, title: event.title,
    time: event.startTime || '', endTime: event.endTime || '', type: event.type || '기타',
    meta: [event.part, event.location].filter(Boolean).join(' · '), event,
  }));
  const performanceItems = p.date ? [{
    source: 'performance', id: 'performance-date', date: p.date,
    title: p.title || '공연', time: '', type: 'PERFORMANCE', meta: `${p.venue || '공연장 미정'} · D-DAY`,
  }] : [];
  return [...taskItems, ...eventItems, ...performanceItems].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title, 'ko')
  );
}

function renderCalendarItem(item, compact = false) {
  const content = `<span class="calendar-item-label">${escapeHtml(item.type)}</span><span class="calendar-item-title">${item.time ? `${escapeHtml(item.time)} ` : ''}${escapeHtml(item.title)}</span>`;
  if (item.source === 'event') {
    return `<button type="button" class="calendar-item event-item ${compact ? 'is-compact' : ''}" data-event-detail="${attr(item.id)}">${content}</button>`;
  }
  return `<div class="calendar-item ${item.source}-item ${compact ? 'is-compact' : ''}">${content}</div>`;
}

function renderCalendar(p) {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset);
  const allItems = getCalendarItems(p);
  const itemsByDate = {};
  allItems.forEach(item => { (itemsByDate[item.date] ||= []).push(item); });
  const weekdayLabels = ['월', '화', '수', '목', '금', '토', '일'];
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const key = toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
    const items = itemsByDate[key] || [];
    const visibleItems = items.slice(0, 3);
    const classes = [date.getMonth() !== month ? 'is-outside' : '', key === todayStr ? 'is-today' : '', key === selectedCalendarDate ? 'is-selected' : ''].filter(Boolean).join(' ');
    return `<div class="calendar-day ${classes}" data-calendar-date="${key}">
      <button type="button" class="calendar-date-button" data-select-date="${key}" aria-label="${key} 일정 보기">
        <span class="calendar-date-number">${date.getDate()}</span>${key === todayStr ? '<span class="today-label">TODAY</span>' : ''}
      </button>
      <div class="calendar-day-items">${visibleItems.map(item => renderCalendarItem(item, true)).join('')}${items.length > 3 ? `<button type="button" class="calendar-more" data-select-date="${key}">+${items.length - 3} MORE</button>` : ''}</div>
    </div>`;
  }).join('');
  const selectedItems = itemsByDate[selectedCalendarDate] || [];
  const upcoming = allItems.filter(item => item.date >= todayStr).slice(0, 12);

  return `<section class="section section-calendar" id="section-calendar">
    <div class="section-heading calendar-heading"><span class="act-label">ACT 06</span><span class="section-caption">PRODUCTION CALENDAR</span><h2><span class="n">06</span>일정</h2></div>
    <div class="calendar-toolbar">
      <button type="button" class="calendar-nav" data-calendar-prev aria-label="이전 달">←</button>
      <h3>${year}년 ${month + 1}월</h3>
      <button type="button" class="calendar-nav" data-calendar-next aria-label="다음 달">→</button>
      <button type="button" class="small ghost calendar-today" data-calendar-today>오늘</button>
      <button type="button" class="calendar-add" data-new-event>+ 새 일정 추가</button>
    </div>
    ${renderEventForm(p)}
    <div class="calendar-scroll" aria-label="${year}년 ${month + 1}월 제작 일정표">
      <div class="calendar-grid calendar-weekdays">${weekdayLabels.map(day => `<div>${day}</div>`).join('')}</div>
      <div class="calendar-grid calendar-month">${cells}</div>
    </div>
    <div class="calendar-below">
      <div class="selected-date-panel">
        <span class="calendar-eyebrow">SELECTED DATE</span>
        <h3>${formatDisplayDate(selectedCalendarDate)}</h3>
        ${selectedItems.length ? selectedItems.map(item => renderScheduleRow(item, true)).join('') : '<div class="empty">선택한 날짜에 일정이 없습니다.</div>'}
      </div>
      <div class="upcoming-panel">
        <span class="calendar-eyebrow">UPCOMING SCHEDULE</span>
        <h3>다가오는 일정</h3>
        ${upcoming.length ? upcoming.map(item => renderScheduleRow(item)).join('') : '<div class="empty">예정된 일정이 없습니다.</div>'}
      </div>
    </div>
  </section>`;
}

function renderScheduleRow(item, showActions = false) {
  const timeText = item.time ? `${item.time}${item.endTime ? `–${item.endTime}` : ''}` : 'ALL DAY';
  const detail = item.event && item.event.memo ? `${item.meta ? `${item.meta} · ` : ''}${item.event.memo}` : (item.meta || item.type);
  return `<div class="schedule-row ${item.source}-schedule">
    <span class="schedule-date">${item.date.slice(5).replace('-', '.')}</span>
    <span class="schedule-time">${escapeHtml(timeText)}</span>
    <span class="schedule-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(detail)}</small></span>
    <span class="schedule-kind">${escapeHtml(item.type)}</span>
    ${showActions && item.source === 'event' ? `<span class="schedule-actions"><button type="button" class="small ghost" data-edit-event="${attr(item.id)}">수정</button><button type="button" class="small danger" data-delete-event="${attr(item.id)}">삭제</button></span>` : ''}
  </div>`;
}

function renderEventForm(p) {
  if (!isEventFormOpen) return '';
  const event = editingEventId ? state.events.find(item => item.id === editingEventId) : null;
  const value = (key, fallback = '') => event && event[key] !== undefined ? event[key] : fallback;
  return `<div class="event-form-panel">
    <div class="editor-actions"><span>${event ? 'EDIT PRODUCTION SCHEDULE' : 'NEW PRODUCTION SCHEDULE'}</span><button type="button" class="small ghost" data-close-event-form>닫기</button></div>
    <div class="grid3 event-form-grid">
      <div class="field"><label for="e-title">일정명 *</label><input id="e-title" type="text" value="${attr(value('title'))}" placeholder="예: 전체연습"></div>
      <div class="field"><label for="e-date">날짜 *</label><input id="e-date" type="date" value="${attr(value('date', selectedCalendarDate))}"></div>
      <div class="field"><label for="e-type">종류</label><select id="e-type">${EVENT_TYPES.map(type => `<option ${value('type', '연습') === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
      <div class="field"><label for="e-start">시작 시간</label><input id="e-start" type="time" value="${attr(value('startTime'))}"></div>
      <div class="field"><label for="e-end">종료 시간</label><input id="e-end" type="time" value="${attr(value('endTime'))}"></div>
      <div class="field"><label for="e-part">관련 파트</label><select id="e-part"><option value="">전체 / 미지정</option>${p.parts.map(part => `<option ${value('part') === part ? 'selected' : ''}>${escapeHtml(part)}</option>`).join('')}</select></div>
      <div class="field"><label for="e-location">장소</label><input id="e-location" type="text" value="${attr(value('location'))}" placeholder="예: 동아리방"></div>
      <div class="field event-memo"><label for="e-memo">메모</label><textarea id="e-memo" rows="2" placeholder="연결 장면, 준비물 등">${escapeHtml(value('memo'))}</textarea></div>
    </div>
    <div class="event-form-actions"><button type="button" id="save-event">${event ? '일정 수정' : '일정 저장'}</button></div>
  </div>`;
}

/* ---------------- Rehearsal Archive ---------------- */

function getSortedRehearsalLogs() {
  return rehearsalLogs.slice().sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

function getFilteredRehearsalLogs() {
  const query = rehearsalSearchQuery.trim().toLocaleLowerCase('ko-KR');
  return getSortedRehearsalLogs().filter(log => {
    if (rehearsalCategoryFilter !== '전체' && log.category !== rehearsalCategoryFilter) return false;
    if (!query) return true;
    return [log.title, log.content, log.author, ...(Array.isArray(log.tags) ? log.tags : [])]
      .some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(query));
  });
}

function renderRehearsalArchive(p) {
  const selected = rehearsalLogs.find(log => log.id === selectedRehearsalLogId);
  if (rehearsalArchiveMode === 'detail' && selected) return renderRehearsalDetail(selected);
  if (rehearsalArchiveMode === 'create' || (rehearsalArchiveMode === 'edit' && selected)) {
    return renderRehearsalForm(p, rehearsalArchiveMode === 'edit' ? selected : null);
  }
  rehearsalArchiveMode = 'list';
  return renderRehearsalList();
}

function renderRehearsalHeading(title, caption = 'REHEARSAL ARCHIVE') {
  return `<div class="section-heading rehearsal-heading"><span class="act-label">ACT 05</span><span class="section-caption">${caption}</span><h2><span class="n">05</span>${title}</h2></div>`;
}

function renderRehearsalList() {
  const logs = getFilteredRehearsalLogs();
  const hasFilter = rehearsalCategoryFilter !== '전체' || rehearsalSearchQuery.trim();
  return `<section class="section section-rehearsal" id="section-rehearsal">
    ${renderRehearsalHeading('연습일지')}
    <div class="rehearsal-list-toolbar">
      <p><span class="archive-count">${String(rehearsalLogs.length).padStart(2, '0')}</span> NOTES IN ARCHIVE</p>
      <button type="button" data-new-rehearsal-log>+ 글쓰기</button>
    </div>
    <form class="rehearsal-search" id="rehearsal-search-form" role="search">
      <label for="rehearsal-search-input">연습일지 검색</label>
      <div><input id="rehearsal-search-input" type="search" value="${attr(rehearsalSearchQuery)}" placeholder="제목, 본문, 작성자, 태그 검색"><button type="submit" class="ghost">검색</button></div>
    </form>
    <div class="rehearsal-filters" aria-label="연습일지 분류">
      ${['전체', ...REHEARSAL_CATEGORIES].map(category => `<button type="button" data-rehearsal-category="${attr(category)}" class="${rehearsalCategoryFilter === category ? 'is-active' : ''}" aria-pressed="${rehearsalCategoryFilter === category}">${category}</button>`).join('')}
    </div>
    <div class="rehearsal-list" aria-live="polite">
      ${logs.length ? logs.map(log => `<article class="rehearsal-list-item">
        <button type="button" data-rehearsal-detail="${attr(log.id)}" aria-label="${attr(log.title)} 연습일지 읽기">
          <span class="rehearsal-index">${escapeHtml(String(log.id || '').replace('LOG-', ''))} / ${escapeHtml(log.category || '기타')}</span>
          <strong>${escapeHtml(log.title)}</strong>
          <span class="rehearsal-list-meta">${escapeHtml(log.author)} · ${formatDisplayDate(log.date)}</span>
          ${Array.isArray(log.tags) && log.tags.length ? `<span class="rehearsal-list-tags">${log.tags.slice(0, 3).map(tag => `#${escapeHtml(tag)}`).join(' ')}</span>` : ''}
        </button>
      </article>`).join('') : `<div class="rehearsal-empty"><strong>${hasFilter ? '조건에 맞는 연습일지가 없습니다.' : '아직 작성된 연습일지가 없습니다.'}</strong>${hasFilter ? '<button type="button" class="ghost" data-clear-rehearsal-filter>검색과 분류 초기화</button>' : '<p>첫 연습 기록을 남겨보세요.</p><button type="button" data-new-rehearsal-log>+ 연습일지 작성</button>'}</div>`}
    </div>
  </section>`;
}

function renderRehearsalDetail(log) {
  const tags = Array.isArray(log.tags) ? log.tags : [];
  return `<section class="section section-rehearsal rehearsal-detail" id="section-rehearsal">
    <button type="button" class="rehearsal-back" data-rehearsal-list>← 목록으로</button>
    <header class="rehearsal-note-header">
      <span class="rehearsal-index">REHEARSAL NOTE / ${escapeHtml(String(log.id || '').replace('LOG-', ''))}</span>
      <h2>${escapeHtml(log.title)}</h2>
      <dl><div><dt>DATE</dt><dd>${formatDisplayDate(log.date)}</dd></div><div><dt>AUTHOR</dt><dd>${escapeHtml(log.author)}</dd></div><div><dt>CATEGORY</dt><dd>${escapeHtml(log.category || '기타')}</dd></div></dl>
    </header>
    <div class="rehearsal-content">${escapeHtml(log.content).replace(/\n/g, '<br>')}</div>
    ${tags.length ? `<div class="rehearsal-detail-tags">${tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <div class="rehearsal-detail-actions"><button type="button" class="ghost" data-edit-rehearsal-log="${attr(log.id)}">수정</button><button type="button" class="danger" data-delete-rehearsal-log="${attr(log.id)}">삭제</button></div>
  </section>`;
}

function renderRehearsalForm(p, log = null) {
  const value = (key, fallback = '') => log && log[key] !== undefined ? log[key] : fallback;
  const tags = Array.isArray(value('tags', [])) ? value('tags', []).map(tag => `#${tag}`).join(' ') : '';
  const authors = [...new Set((p.participants || []).map(person => person.name).filter(Boolean))];
  return `<section class="section section-rehearsal rehearsal-editor" id="section-rehearsal">
    ${renderRehearsalHeading(log ? '연습일지 수정' : '새 연습 기록', log ? 'EDIT REHEARSAL NOTE' : 'NEW REHEARSAL NOTE')}
    <form id="rehearsal-log-form">
      <div class="field rehearsal-title-field"><label for="r-title">제목 *</label><input id="r-title" type="text" value="${attr(value('title'))}" required placeholder="오늘의 연습을 한 문장으로 기록하세요"></div>
      <div class="grid2">
        <div class="field"><label for="r-author">작성자 *</label><input id="r-author" type="text" list="rehearsal-authors" value="${attr(value('author'))}" required autocomplete="name"><datalist id="rehearsal-authors">${authors.map(name => `<option value="${attr(name)}"></option>`).join('')}</datalist></div>
        <div class="field"><label for="r-date">연습일 *</label><input id="r-date" type="date" value="${attr(value('date', todayStr))}" required></div>
      </div>
      <fieldset class="rehearsal-category-field"><legend>분류</legend><div>${REHEARSAL_CATEGORIES.map(category => `<label><input type="radio" name="rehearsal-category" value="${attr(category)}" ${value('category', '전체연습') === category ? 'checked' : ''}><span>${category}</span></label>`).join('')}</div></fieldset>
      <div class="field"><label for="r-content">내용 *</label><textarea id="r-content" rows="12" required placeholder="오늘 연습에서는...">${escapeHtml(value('content'))}</textarea></div>
      <div class="field"><label for="r-tags">태그 <span class="field-translation">/ 띄어쓰기 또는 쉼표로 구분</span></label><input id="r-tags" type="text" value="${attr(tags)}" placeholder="#전체연습 #런스루"></div>
      <div class="rehearsal-form-actions"><button type="button" class="ghost" data-rehearsal-cancel>취소</button><button type="submit">${log ? '수정 완료' : '등록하기'}</button></div>
    </form>
  </section>`;
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
    btn.onclick = () => { currentView = btn.dataset.view; isTopNavOpen = false; render(); };
  });
  document.querySelectorAll('[data-new-task]').forEach(btn => {
    btn.onclick = () => { currentView = 'tasks'; isTaskFormOpen = true; isTopNavOpen = false; render(); };
  });
  document.querySelectorAll('[data-topnav-toggle]').forEach(btn => {
    btn.onclick = () => { isTopNavOpen = !isTopNavOpen; render(); };
  });

  document.querySelectorAll('[data-toggle-performance-editor]').forEach(btn => {
    btn.onclick = () => { isPerformanceEditorOpen = !isPerformanceEditorOpen; render(); };
  });
  document.querySelectorAll('[data-toggle-task-form]').forEach(btn => {
    btn.onclick = () => { isTaskFormOpen = !isTaskFormOpen; render(); };
  });
  document.querySelectorAll('[data-hero-dashboard]').forEach(btn => {
    btn.onclick = () => {
      const dashboard = document.getElementById('home-dashboard');
      if (dashboard) dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  document.querySelectorAll('[data-new-rehearsal-log]').forEach(btn => {
    btn.onclick = () => { selectedRehearsalLogId = null; rehearsalArchiveMode = 'create'; render(); };
  });
  document.querySelectorAll('[data-rehearsal-list], [data-rehearsal-cancel]').forEach(btn => {
    btn.onclick = () => { rehearsalArchiveMode = 'list'; selectedRehearsalLogId = null; render(); };
  });
  document.querySelectorAll('[data-rehearsal-detail]').forEach(btn => {
    btn.onclick = () => { selectedRehearsalLogId = btn.dataset.rehearsalDetail; rehearsalArchiveMode = 'detail'; render(); };
  });
  document.querySelectorAll('[data-edit-rehearsal-log]').forEach(btn => {
    btn.onclick = () => { selectedRehearsalLogId = btn.dataset.editRehearsalLog; rehearsalArchiveMode = 'edit'; render(); };
  });
  document.querySelectorAll('[data-delete-rehearsal-log]').forEach(btn => {
    btn.onclick = () => {
      if (!window.confirm('이 연습일지를 삭제하시겠습니까?\n삭제된 글은 복구할 수 없습니다.')) return;
      rehearsalLogs = rehearsalLogs.filter(log => log.id !== btn.dataset.deleteRehearsalLog);
      selectedRehearsalLogId = null; rehearsalArchiveMode = 'list';
      saveRehearsalLogs(); render();
    };
  });
  document.querySelectorAll('[data-rehearsal-category]').forEach(btn => {
    btn.onclick = () => { rehearsalCategoryFilter = btn.dataset.rehearsalCategory; render(); };
  });
  document.querySelectorAll('[data-clear-rehearsal-filter]').forEach(btn => {
    btn.onclick = () => { rehearsalCategoryFilter = '전체'; rehearsalSearchQuery = ''; render(); };
  });
  const rehearsalSearchForm = document.getElementById('rehearsal-search-form');
  if (rehearsalSearchForm) rehearsalSearchForm.onsubmit = event => {
    event.preventDefault();
    rehearsalSearchQuery = document.getElementById('rehearsal-search-input').value;
    render();
  };
  const rehearsalLogForm = document.getElementById('rehearsal-log-form');
  if (rehearsalLogForm) rehearsalLogForm.onsubmit = event => {
    event.preventDefault();
    if (!rehearsalLogForm.reportValidity()) return;
    const titleInput = document.getElementById('r-title');
    const authorInput = document.getElementById('r-author');
    const contentInput = document.getElementById('r-content');
    if (!titleInput.value.trim()) { titleInput.focus(); return; }
    if (!authorInput.value.trim()) { authorInput.focus(); return; }
    if (!contentInput.value.trim()) { contentInput.focus(); return; }
    const existing = rehearsalLogs.find(log => log.id === selectedRehearsalLogId);
    const timestamp = new Date().toISOString();
    const rawTags = document.getElementById('r-tags').value;
    const tags = [...new Set(rawTags.split(/[\s,]+/).map(tag => tag.replace(/^#+/, '').trim()).filter(Boolean))];
    const logData = {
      id: existing ? existing.id : nextRehearsalLogId(),
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      date: document.getElementById('r-date').value,
      category: rehearsalLogForm.querySelector('[name="rehearsal-category"]:checked').value,
      content: contentInput.value.trim(),
      tags,
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp,
    };
    if (existing) rehearsalLogs[rehearsalLogs.indexOf(existing)] = logData;
    else rehearsalLogs.push(logData);
    selectedRehearsalLogId = logData.id; rehearsalArchiveMode = 'detail';
    saveRehearsalLogs(); render();
  };

  document.querySelectorAll('[data-calendar-prev]').forEach(btn => {
    btn.onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); render(); };
  });
  document.querySelectorAll('[data-calendar-next]').forEach(btn => {
    btn.onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); render(); };
  });
  document.querySelectorAll('[data-calendar-today]').forEach(btn => {
    btn.onclick = () => { calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); selectedCalendarDate = todayStr; render(); };
  });
  document.querySelectorAll('[data-select-date]').forEach(btn => {
    btn.onclick = event => { event.stopPropagation(); selectedCalendarDate = btn.dataset.selectDate; render(); };
  });
  document.querySelectorAll('[data-calendar-date]').forEach(cell => {
    cell.onclick = () => { selectedCalendarDate = cell.dataset.calendarDate; render(); };
  });
  document.querySelectorAll('[data-event-detail]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const item = state.events.find(entry => entry.id === btn.dataset.eventDetail);
      if (item) selectedCalendarDate = item.date;
      render();
    };
  });
  document.querySelectorAll('[data-new-event]').forEach(btn => {
    btn.onclick = () => { editingEventId = null; isEventFormOpen = true; render(); };
  });
  document.querySelectorAll('[data-close-event-form]').forEach(btn => {
    btn.onclick = () => { editingEventId = null; isEventFormOpen = false; render(); };
  });
  document.querySelectorAll('[data-edit-event]').forEach(btn => {
    btn.onclick = () => { editingEventId = btn.dataset.editEvent; isEventFormOpen = true; render(); };
  });
  document.querySelectorAll('[data-delete-event]').forEach(btn => {
    btn.onclick = () => {
      state.events = state.events.filter(event => event.id !== btn.dataset.deleteEvent);
      if (editingEventId === btn.dataset.deleteEvent) { editingEventId = null; isEventFormOpen = false; }
      render(); saveState();
    };
  });

  const saveEventBtn = document.getElementById('save-event');
  if (saveEventBtn) saveEventBtn.onclick = () => {
    const titleInput = document.getElementById('e-title');
    const dateInput = document.getElementById('e-date');
    const title = titleInput.value.trim();
    const date = dateInput.value;
    if (!title) { titleInput.focus(); return; }
    if (!date) { dateInput.focus(); return; }
    const eventData = {
      id: editingEventId || nextEventId(), title, date,
      startTime: document.getElementById('e-start').value,
      endTime: document.getElementById('e-end').value,
      type: document.getElementById('e-type').value,
      part: document.getElementById('e-part').value,
      location: document.getElementById('e-location').value.trim(),
      memo: document.getElementById('e-memo').value.trim(),
    };
    const index = state.events.findIndex(event => event.id === editingEventId);
    if (index >= 0) state.events[index] = eventData;
    else state.events.push(eventData);
    selectedCalendarDate = date;
    calendarCursor = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);
    editingEventId = null; isEventFormOpen = false;
    render(); saveState();
  };

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
