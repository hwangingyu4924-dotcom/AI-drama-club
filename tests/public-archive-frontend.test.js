const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const PRIVATE_VALUES = [
  'PRIVATE_LOCAL_TITLE', 'PRIVATE_LOCAL_TASK', 'PRIVATE_ASSIGNEE',
  'PRIVATE_MEMO', 'PRIVATE_LOCATION', 'rehearsal-images/private/path.jpg',
  '7a4057ad-13ac-41d6-a2a7-5ad71158e063',
];
const publicLogId = '33333333-3333-4333-8333-333333333333';
const fixture = {
  production: [{
    public_slug: 'spring-holding-hands-2026', title: '봄, 손을 쥐다',
    performance_date: '2026-10-18', venue: '전일빌딩245', public_venue_info: '',
    project_start_date: '2026-08-24', status: '준비중', parts: ['연출', '무대'],
    public_rehearsal_summary: '',
  }],
  tasks: [
    { public_id: '11111111-1111-4111-8111-111111111111', prerequisite_public_id: null, part: '연출', title: '리허설 준비', deadline: '2026-10-10', status: '진행중', priority: '높음', required: true, pre_show_check: true },
    { public_id: '22222222-2222-4222-8222-222222222222', prerequisite_public_id: null, part: '무대', title: '무대 확인', deadline: '2026-10-10', status: '완료', priority: '보통', required: true, pre_show_check: false },
  ],
  events: [{ public_id: '44444444-4444-4444-8444-444444444444', title: '전체 리허설', event_date: '2026-10-10', start_time: '19:00:00', end_time: '21:00:00', category: '연습', part: '전체', public_location: '대공연장', public_description: '공개 리허설' }],
  logs: [{ public_id: publicLogId, title: '1차 리허설', rehearsal_date: '2026-09-20', author_display_name: '황인규', category: '연출', content: '동선과 호흡을 점검했습니다.', tags: ['동선'], created_date: '2026-09-20', updated_date: '2026-09-21' }],
  images: [{ image_public_id: '55555555-5555-4555-8555-555555555555', rehearsal_public_id: publicLogId, sort_order: 0 }],
};

const calls = [];
const privateCall = name => async () => { throw new Error(`anonymous called private loader: ${name}`); };
const appRoot = { innerHTML: '' };
const documentStub = {
  body: { classList: { toggle() {} } },
  getElementById(id) { return id === 'app' ? appRoot : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const privateLocalState = JSON.stringify({
  performance: { title: PRIVATE_VALUES[0], participants: [{ name: 'PRIVATE_PERSON' }] },
  tasks: [{ name: PRIVATE_VALUES[1], assignee: PRIVATE_VALUES[2] }],
  events: [{ memo: PRIVATE_VALUES[3], location: PRIVATE_VALUES[4] }],
});
const storage = new Map([['ppa-state-v1', privateLocalState], ['rehearsalLogs', '[]']]);
const service = {
  getPublicArchiveProduction: async slug => { calls.push(['production', slug]); return { status: 'PASS', data: fixture.production }; },
  getPublicArchiveTasks: async slug => { calls.push(['tasks', slug]); return { status: 'PASS', data: fixture.tasks }; },
  getPublicArchiveEvents: async slug => { calls.push(['events', slug]); return { status: 'PASS', data: fixture.events }; },
  getPublicArchiveRehearsalLogs: async slug => { calls.push(['logs', slug]); return { status: 'PASS', data: fixture.logs }; },
  getPublicArchiveRehearsalImages: async (slug, id) => { calls.push(['images', slug, id]); return { status: 'PASS', data: fixture.images }; },
  buildPublicRehearsalImageUrl: (slug, rehearsalId, imageId) => `https://project-ref.supabase.co/functions/v1/public-rehearsal-image?production=${slug}&rehearsal=${rehearsalId}&image=${imageId}`,
  resolveActiveProduction: privateCall('resolveActiveProduction'),
  getProductionMembers: privateCall('getProductionMembers'),
  getTasks: privateCall('getTasks'), getEvents: privateCall('getEvents'), getRehearsalLogs: privateCall('getRehearsalLogs'),
};
const windowStub = {
  AI_DRAMA_CONFIG: { SUPABASE_URL: 'https://project-ref.supabase.co', PUBLIC_ARCHIVE_SLUG: 'spring-holding-hands-2026' },
  matchMedia: () => ({ matches: true }),
  AuthService: {
    onAuthStateChange: async () => () => {},
    getSession: async () => ({ session: null, user: null }),
    getCurrentUser: privateCall('getCurrentUser'),
  },
  SupabaseReadService: { getProfile: privateCall('getProfile'), probeReads: privateCall('probeReads') },
  SupabaseDataService: service,
};
const context = vm.createContext({
  console, Date, document: documentStub, window: windowStub,
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  fetch: async () => { throw new Error('local fixture should prevent fetch'); },
  setTimeout, clearTimeout,
});

function assertReadOnly(html, view) {
  assert.ok(html.includes(`view-page-${view}`), `${view} public route missing`);
  const forbiddenControls = [
    'data-new-task', 'id="task-form"', 'data-edit-task', 'data-del-task', 'data-status',
    'data-new-event', 'data-edit-event', 'data-delete-event', 'data-new-rehearsal-log',
    'data-edit-rehearsal-log', 'data-delete-rehearsal-log', 'data-rehearsal-images',
    'type="checkbox"', 'data-remove-part', 'id="add-person"',
  ];
  forbiddenControls.forEach(token => assert.ok(!html.includes(token), `${view} exposed write control ${token}`));
  PRIVATE_VALUES.forEach(value => assert.ok(!html.includes(value), `${view} leaked private value`));
}

async function run() {
  vm.runInContext(`${fs.readFileSync('rules.js', 'utf8')}\n${fs.readFileSync('app.js', 'utf8')}`, context);
  await windowStub.__APP_INIT_PROMISE__;
  assert.deepStrictEqual(calls.map(call => call[0]), ['production', 'tasks', 'events', 'logs']);
  assert.ok(appRoot.innerHTML.includes('public-motion-hero') && appRoot.innerHTML.includes('부원 로그인'));

  for (const view of ['performance', 'production', 'tasks', 'calendar', 'rehearsal', 'preshow']) {
    vm.runInContext(`currentView = '${view}'; render();`, context);
    assertReadOnly(appRoot.innerHTML, view);
    assert.strictEqual((appRoot.innerHTML.match(/<h1(?:\s|>)/g) || []).length, 1, `${view} must have one page-level heading`);
    if (view === 'calendar') assert.ok(!appRoot.innerHTML.includes('calendar-heading'), 'public calendar repeated its page heading');
    if (view === 'rehearsal') assert.ok(!appRoot.innerHTML.includes('rehearsal-heading'), 'public rehearsal repeated its page heading');
    if (view === 'preshow') assert.ok(!/<h2[^>]*>[\s\S]*?공연 전 체크/.test(appRoot.innerHTML), 'public pre-show repeated its page heading');
    if (view === 'tasks') assert.ok(appRoot.innerHTML.includes('리허설 준비'), 'public task absent');
  }
  vm.runInContext("currentView = 'performance'; render();", context);
  assert.ok(appRoot.innerHTML.includes('봄, 손을 쥐다'));
  assert.ok(appRoot.innerHTML.includes('2026. 10. 18.') && appRoot.innerHTML.includes('전일빌딩245') && appRoot.innerHTML.includes('2026. 08. 24.'));
  assert.ok(!appRoot.innerHTML.includes('공연장 안내') && !appRoot.innerHTML.includes('연습 안내'));

  vm.runInContext("currentView = 'calendar'; selectedCalendarDate = '2026-10-10'; calendarCursor = new Date(2026, 9, 1); render();", context);
  assertReadOnly(appRoot.innerHTML, 'calendar');
  const weekdayBlock = appRoot.innerHTML.match(/calendar-weekdays">([\s\S]*?)<\/div>\s*<div class="calendar-grid calendar-month/)[1];
  const weekdays = [...weekdayBlock.matchAll(/<div>([^<]+)<\/div>/g)].map(match => match[1]);
  assert.deepStrictEqual(weekdays.slice(0, 7), ['일', '월', '화', '수', '목', '금', '토']);
  assert.ok(appRoot.innerHTML.includes('리허설 준비') && appRoot.innerHTML.includes('전체 리허설'), 'task/event must coexist on date');
  assert.ok(appRoot.innerHTML.includes('대공연장') && appRoot.innerHTML.includes('공개 리허설'));

  await vm.runInContext(`loadPublicArchiveRehearsalImages('${publicLogId}')`, context);
  vm.runInContext(`currentView = 'rehearsal'; rehearsalArchiveMode = 'detail'; selectedRehearsalLogId = '${publicLogId}'; render();`, context);
  assertReadOnly(appRoot.innerHTML, 'rehearsal');
  assert.ok(appRoot.innerHTML.includes('황인규') && appRoot.innerHTML.includes('사진 1장'));
  assert.ok(!appRoot.innerHTML.includes('goodday4924') && !appRoot.innerHTML.includes('author_profile_id'));
  assert.ok(appRoot.innerHTML.includes('data-public-image') && appRoot.innerHTML.includes('/functions/v1/public-rehearsal-image?'));
  assert.ok(!appRoot.innerHTML.includes('signed') && !appRoot.innerHTML.includes('storage_path'));
  assert.strictEqual(storage.get('ppa-state-v1'), privateLocalState, 'anonymous public archive mutated localStorage');
  console.log('Anonymous public archive routing, read-only rendering, privacy, calendar and image metadata test passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
