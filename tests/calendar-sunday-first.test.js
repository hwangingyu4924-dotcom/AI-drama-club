const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const storage = new Map([['ppa-state-v1', JSON.stringify({
  performance: { title: '테스트 공연', date: '', status: '진행중', parts: ['연출'], participants: [] },
  tasks: [], events: [],
})]]);
const root = { innerHTML: '' };
const authUser = { id: 'user-001' };
const context = {
  console,
  Date,
  document: { getElementById: id => id === 'app' ? root : null, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  fetch: async () => { throw new Error('unexpected fetch'); },
  window: {
    AuthService: {
      onAuthStateChange: async () => () => {},
      getSession: async () => ({ session: { user: authUser }, user: authUser }),
      getCurrentUser: async () => authUser,
    },
    SupabaseReadService: {
      getProfile: async () => ({ status: 'PASS', data: [{ id: authUser.id, display_name: '테스터' }] }),
      probeReads: async () => ({ client: 'PASS', session: { status: 'AUTHENTICATED' }, reads: {} }),
    },
  },
};
context.window.window = context.window;

function dateKeys(html) {
  return [...html.matchAll(/class="calendar-day [^"]*" data-calendar-date="([^"]+)"/g)].map(match => match[1]);
}

function cellHtml(html, key) {
  const attribute = html.indexOf(`data-calendar-date="${key}"`);
  const start = html.lastIndexOf('<div class="calendar-day ', attribute);
  const next = html.indexOf('<div class="calendar-day ', attribute + 1);
  return html.slice(start, next < 0 ? undefined : next);
}

async function run() {
  const browser = vm.createContext(context);
  vm.runInContext(`${fs.readFileSync('rules.js', 'utf8')}\n${fs.readFileSync('app.js', 'utf8')}`, browser);
  await browser.window.__APP_INIT_PROMISE__;

  const assertions = `
    const labels = ['일', '월', '화', '수', '목', '금', '토'];
    calendarCursor = new Date(2026, 8, 1);
    state.events = [{ id: 'EVENT-001', title: '9월 13일 일정', date: '2026-09-13', startTime: '', endTime: '', type: '연습', part: '', location: '', memo: '' }];
    state.tasks = [{ taskId: 'TASK-001', name: '9월 20일 마감', deadline: '2026-09-20', part: '연출', status: '대기' }];
    const september = renderCalendar(state.performance);
    ({ labels, september, septemberDates: getCalendarGridDates(2026, 8).map(date => toDateKey(date.getFullYear(), date.getMonth(), date.getDate())),
      octoberDates: getCalendarGridDates(2026, 9).map(date => toDateKey(date.getFullYear(), date.getMonth(), date.getDate())),
      sundayStart: getCalendarGridDates(2026, 10).map(date => toDateKey(date.getFullYear(), date.getMonth(), date.getDate())),
      mondayStart: getCalendarGridDates(2026, 5).map(date => toDateKey(date.getFullYear(), date.getMonth(), date.getDate())),
      saturdayStart: getCalendarGridDates(2026, 7).map(date => toDateKey(date.getFullYear(), date.getMonth(), date.getDate())),
      leapFebruary: getCalendarGridDates(2024, 1).map(date => toDateKey(date.getFullYear(), date.getMonth(), date.getDate())) });
  `;
  const result = vm.runInContext(assertions, browser);
  assert.ok(result.september.includes('<div class="calendar-grid calendar-weekdays"><div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>'));
  assert.strictEqual(result.septemberDates[0], '2026-08-30', '9월 grid는 이전 일요일부터 시작해야 한다');
  assert.strictEqual(result.septemberDates.indexOf('2026-09-01') % 7, 2, '9월 1일은 화요일 column이어야 한다');
  assert.strictEqual(result.septemberDates.indexOf('2026-09-13') % 7, 0, '9월 13일은 일요일 column이어야 한다');
  assert.strictEqual(result.septemberDates.indexOf('2026-09-20') % 7, 0, '9월 20일은 일요일 column이어야 한다');
  assert.ok(cellHtml(result.september, '2026-09-13').includes('9월 13일 일정'), 'Event가 정확한 날짜 cell에 있어야 한다');
  assert.ok(cellHtml(result.september, '2026-09-20').includes('9월 20일 마감'), 'Task deadline이 정확한 날짜 cell에 있어야 한다');
  assert.ok(cellHtml(result.september, '2026-09-13').includes('is-today') || new Date().toISOString().slice(0, 10) !== '2026-09-13', '오늘 강조가 정확해야 한다');
  assert.strictEqual(result.octoberDates[0], '2026-09-27');
  assert.strictEqual(result.octoberDates.indexOf('2026-10-01') % 7, 4, '10월 1일은 목요일 column이어야 한다');
  assert.strictEqual(result.octoberDates.indexOf('2026-10-31') % 7, 6, '10월 31일은 토요일 column이어야 한다');
  assert.strictEqual(result.sundayStart[0], '2026-11-01');
  assert.strictEqual(result.mondayStart.indexOf('2026-06-01') % 7, 1);
  assert.strictEqual(result.saturdayStart.indexOf('2026-08-01') % 7, 6);
  assert.ok(result.leapFebruary.includes('2024-02-29'));
  assert.strictEqual(result.septemberDates.length, 42);
  console.log('Calendar Sunday-first 경계/이벤트 회귀 테스트 통과');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
