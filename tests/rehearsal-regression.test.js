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
  querySelectorAll() { return []; },
};
const context = {
  console,
  Date,
  storage,
  document: documentStub,
  window: { confirm: () => true },
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
  if (!appRoot.innerHTML.includes('class="motion-hero"')) throw new Error('HOME Cinematic Hero 누락');
  if (!appRoot.innerHTML.includes('id="motion-hero-video"')) throw new Error('Hero 영상 누락');
  if (!appRoot.innerHTML.includes('data-hero-dashboard')) throw new Error('Hero CTA 누락');
  if (appRoot.innerHTML.indexOf('class="motion-hero"') > appRoot.innerHTML.indexOf('id="home-dashboard"')) throw new Error('Hero와 기존 Dashboard 배치 오류');
  for (const view of ['home', 'performance', 'production', 'tasks', 'calendar', 'preshow']) {
    currentView = view;
    if (!renderCurrentView(state.performance, 10, getStage(10), []).trim()) throw new Error(view + ' 기존 화면 렌더 실패');
  }
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
  if (!renderRehearsalDetail({ ...rehearsalLogs[0], content: '<script>bad()</script>' }).includes('&lt;script&gt;')) throw new Error('본문 이스케이프 실패');
  const projectBefore = storage.get(LS_KEY);
  saveRehearsalLogs();
  if (storage.get(LS_KEY) !== projectBefore) throw new Error('기존 프로젝트 저장소 충돌');
  if (JSON.parse(storage.get(REHEARSAL_LOGS_KEY)).length !== 2) throw new Error('연습일지 별도 저장 실패');
`;

vm.runInNewContext(`${rules}\n${app}\n${assertions}`, { ...context, appRoot }, { filename: 'browser-bundle.js' });
assert.ok(true);
console.log('연습일지 및 기존 화면 회귀 스모크 테스트 통과');
