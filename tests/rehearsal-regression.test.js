const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const storage = new Map([['ppa-state-v1', JSON.stringify({
  performance: { title: '테스트 공연', date: '2026-09-21', status: '진행중', parts: ['연출'], participants: [{ name: '홍길동', part: '연출' }] },
  tasks: [], events: [],
})]]);
const appRoot = { innerHTML: '' };
const documentStub = {
  getElementById(id) { return id === 'app' ? appRoot : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const authUser = { id: 'user-001', email: 'member@example.com' };
const production = { id: 'production-001', title: '테스트 공연' };
const windowStub = {
  confirm: () => true,
  AuthService: {
    onAuthStateChange: async () => () => {},
    getSession: async () => ({ session: { user: authUser }, user: authUser }),
    getCurrentUser: async () => authUser,
    signOut: async () => {},
  },
  SupabaseReadService: {
    getProfile: async () => ({ status: 'PASS', data: [{ id: authUser.id, display_name: '테스트 부원' }] }),
    probeReads: async () => ({
      client: 'PASS',
      session: { status: 'AUTHENTICATED' },
      reads: Object.fromEntries(['productions', 'tasks', 'events', 'rehearsal_logs', 'production_members', 'profiles'].map(table => [table, { status: 'EMPTY', count: 0 }])),
    }),
  },
  SupabaseDataService: {
    resolveActiveProduction: async () => production,
    getProductionMembers: async () => ({ status: 'PASS', data: [{ production_id: production.id, profile_id: authUser.id, role: 'ADMIN' }] }),
    getRehearsalLogs: async () => ({ status: 'EMPTY', data: [] }),
    getTasks: async () => ({ status: 'EMPTY', data: [] }),
    getEvents: async () => ({ status: 'EMPTY', data: [] }),
  },
};
const context = {
  console,
  Date,
  storage,
  document: documentStub,
  window: windowStub,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
  },
  fetch: async () => { throw new Error('fetch should not run with seeded project state'); },
};

const rules = fs.readFileSync('rules.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const assertions = `
  if (!appRoot.innerHTML.includes('data-view="rehearsal"')) throw new Error('연습일지 내비게이션 누락');
  if (!appRoot.innerHTML.includes('class="top-shell-header"')) throw new Error('Top Navigation Shell 누락');
  if (!appRoot.innerHTML.includes('class="top-shell-wordmark" data-view="home">전대극회</button>')) throw new Error('한글 로고 누락');
  if (!appRoot.innerHTML.includes('data-topnav-toggle')) throw new Error('모바일 메뉴 토글 누락');
  if (!appRoot.innerHTML.includes('class="top-shell-new-task"')) throw new Error('Top Navigation 새 업무 CTA 누락');
  if (appRoot.innerHTML.includes('dashboard-sidebar') || appRoot.innerHTML.includes('sidebar-parts')) throw new Error('기존 Sidebar Shell 잔존');
  if (!appRoot.innerHTML.includes('class="motion-hero"')) throw new Error('HOME Cinematic Hero 누락');
  if (!appRoot.innerHTML.includes('id="motion-hero-video"')) throw new Error('Hero 영상 누락');
  if (!appRoot.innerHTML.includes('data-hero-dashboard')) throw new Error('Hero CTA 누락');
  if (appRoot.innerHTML.indexOf('class="motion-hero"') > appRoot.innerHTML.indexOf('id="home-dashboard"')) throw new Error('Hero와 기존 Dashboard 배치 오류');
  for (const view of ['home', 'performance', 'production', 'tasks', 'calendar', 'rehearsal', 'preshow']) {
    currentView = view;
    const renderedView = renderCurrentView(state.performance, 10, getStage(10), []);
    if (!renderedView.trim()) throw new Error(view + ' 기존 화면 렌더 실패');
    if (view !== 'home' && !renderedView.includes('class="view-page-header"')) throw new Error(view + ' 공통 Page Header 누락');
  }
  currentPartFilter = '전체';
  const taskView = renderTaskTable(state.performance);
  if (!taskView.includes('data-filter-part="전체"') || !taskView.includes('data-filter-part="연출"')) throw new Error('전체 업무 PARTS 필터 누락');
  const offsetDate = days => {
    const date = new Date(todayStr + 'T00:00:00');
    date.setDate(date.getDate() + days);
    return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
  };
  if (formatDday(getDaysUntil(offsetDate(7), todayStr)) !== 'D-7' || formatDday(getDaysUntil(todayStr, todayStr)) !== 'D-DAY' || formatDday(getDaysUntil(offsetDate(-1), todayStr)) !== 'D+1') throw new Error('공연일 변경 D-Day 계산 실패');
  state.performance.parts = ['연출', '무대'];
  state.tasks = [
    { taskId: 'TASK-001', name: '지연 업무', part: '연출', assignee: 'A', deadline: offsetDate(-1), status: '대기', priority: '낮음', required: false },
    { taskId: 'TASK-002', name: '오늘 업무', part: '연출', assignee: 'B', deadline: todayStr, status: '진행중', priority: '높음', required: false },
    { taskId: 'TASK-003', name: '필수 업무', part: '무대', assignee: 'C', deadline: offsetDate(7), status: '대기', priority: '보통', required: true },
    { taskId: 'TASK-004', name: '완료 업무', part: '무대', assignee: 'D', deadline: todayStr, status: '완료', priority: '높음', required: true },
    { taskId: 'TASK-005', name: '장기 업무', part: '연출', assignee: '', deadline: offsetDate(10), status: '보류', priority: '보통', required: false },
  ];
  const dashboardData = getDashboardData(state.performance, getStage(10));
  if (state.tasks.length !== 5 || dashboardData.incomplete.length !== 4) throw new Error('전체/미완료 업무 계산 실패');
  if (dashboardData.today.length !== 1 || dashboardData.today[0].taskId !== 'TASK-002') throw new Error('오늘 할 일 계산 실패');
  if (dashboardData.thisWeek.length !== 2) throw new Error('7일 이내 업무 계산 실패');
  if (dashboardData.upcoming[0].taskId !== 'TASK-001') throw new Error('다가오는 마감 날짜 정렬 실패');
  if (dashboardData.important[0].taskId !== 'TASK-003' || dashboardData.important[1].taskId !== 'TASK-002') throw new Error('중요 업무 우선순위 계산 실패');
  if (dashboardData.byPart['연출'].done !== 0 || dashboardData.byPart['연출'].total !== 3 || dashboardData.byPart['무대'].done !== 1 || dashboardData.byPart['무대'].total !== 2) throw new Error('파트별 진행률 계산 실패');
  const homeDashboard = renderHomeDashboard(state.performance, getDaysUntil(state.performance.date, todayStr), getStage(10), []);
  if (!homeDashboard.includes('오늘 업무') || !homeDashboard.includes('지연') || !homeDashboard.includes('전체 업무 보기')) throw new Error('HOME 실제 데이터 렌더 실패');
  state.tasks.find(task => task.taskId === 'TASK-002').status = '완료';
  const updatedDashboard = getDashboardData(state.performance, getStage(10));
  if (updatedDashboard.incomplete.length !== 3 || updatedDashboard.today.length !== 0 || updatedDashboard.byPart['연출'].done !== 1) throw new Error('상태 변경 즉시 계산 실패');
  state.tasks = state.tasks.filter(task => task.taskId !== 'TASK-005');
  if (getDashboardData(state.performance, getStage(10)).incomplete.length !== 2) throw new Error('업무 삭제 즉시 계산 실패');
  state.tasks.find(task => task.taskId === 'TASK-001').part = '무대';
  if (getDashboardData(state.performance, getStage(10)).byPart['무대'].total !== 3) throw new Error('담당 파트 변경 즉시 계산 실패');
  state.tasks.find(task => task.taskId === 'TASK-003').deadline = offsetDate(10);
  if (getDashboardData(state.performance, getStage(10)).thisWeek.length !== 0) throw new Error('마감일 변경 즉시 계산 실패');
  rehearsalLogs = [
    { id: 'LOG-001', title: '첫 연습', author: '홍길동', date: '2026-09-01', category: '연기', content: '장면 연습', tags: ['장면1'], createdAt: '2026-09-01T10:00:00', updatedAt: '2026-09-01T10:00:00' },
    { id: 'LOG-002', title: '전체 런', author: '김연출', date: '2026-09-10', category: '전체연습', content: '처음부터 끝까지', tags: ['런스루'], createdAt: '2026-09-10T10:00:00', updatedAt: '2026-09-10T10:00:00' },
  ];
  if (getSortedRehearsalLogs()[0].id !== 'LOG-002') throw new Error('최신 연습일 정렬 실패');
  rehearsalCategoryFilter = '연기'; rehearsalSearchQuery = '장면1';
  if (getFilteredRehearsalLogs().length !== 1) throw new Error('분류/태그 검색 실패');
  rehearsalCategoryFilter = '전체'; rehearsalSearchQuery = '김연출';
  if (getFilteredRehearsalLogs()[0].id !== 'LOG-002') throw new Error('작성자 검색 실패');
  if (nextRehearsalLogId() !== 'LOG-003') throw new Error('연습일지 ID 생성 실패');
  rehearsalArchiveMode = 'list'; rehearsalCategoryFilter = '전체'; rehearsalSearchQuery = '';
  if (!renderRehearsalArchive(state.performance).includes('전체 런')) throw new Error('목록 렌더 실패');
  const internalRehearsalId = '043f6790-65ac-4adb-808c-a4346d017bbf';
  rehearsalLogs = [{ id: internalRehearsalId, title: 'UUID 비노출 테스트', author: '황인규', date: '2026-09-15', category: '전체연습', content: '테스트', tags: [] }];
  const privateIdList = renderRehearsalArchive(state.performance);
  if (!privateIdList.includes('data-rehearsal-detail="' + internalRehearsalId + '"')) throw new Error('CRUD용 내부 연습일지 식별자 누락');
  if (privateIdList.includes('<span class="rehearsal-index">' + internalRehearsalId)) throw new Error('내부 연습일지 UUID visible text 노출');
  if (!privateIdList.includes('<span class="rehearsal-index">전체연습</span>')) throw new Error('의미 있는 연습일지 분류 표시 누락');
  rehearsalLogs = [
    { id: 'LOG-001', title: '첫 연습', author: '홍길동', date: '2026-09-01', category: '연기', content: '장면 연습', tags: ['장면1'], createdAt: '2026-09-01T10:00:00', updatedAt: '2026-09-01T10:00:00' },
    { id: 'LOG-002', title: '전체 런', author: '김연출', date: '2026-09-10', category: '전체연습', content: '처음부터 끝까지', tags: ['런스루'], createdAt: '2026-09-10T10:00:00', updatedAt: '2026-09-10T10:00:00' },
  ];
  if (!renderRehearsalDetail({ ...rehearsalLogs[0], content: '<script>bad()</script>' }).includes('&lt;script&gt;')) throw new Error('본문 이스케이프 실패');
  const projectBefore = storage.get(LS_KEY);
  saveRehearsalLogs();
  if (storage.get(LS_KEY) !== projectBefore) throw new Error('기존 프로젝트 저장소 충돌');
  if (JSON.parse(storage.get(REHEARSAL_LOGS_KEY)).length !== 2) throw new Error('연습일지 별도 저장 실패');
`;

async function run() {
  const browserContext = vm.createContext({ ...context, appRoot });
  vm.runInContext(`${rules}\n${app}`, browserContext, { filename: 'browser-bundle.js' });
  await browserContext.window.__APP_INIT_PROMISE__;
  vm.runInContext(assertions, browserContext, { filename: 'browser-assertions.js' });
  assert.ok(true);
  console.log('인증 상태의 연습일지 및 기존 화면 회귀 스모크 테스트 통과');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
