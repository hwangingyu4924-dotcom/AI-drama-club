const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const projectState = JSON.stringify({
  performance: { title: '비공개 공연', date: '2026-10-01', status: '진행중', parts: ['연출'], participants: [] },
  tasks: [{ taskId: 'TASK-001', name: '비공개 업무', status: '대기', part: '연출' }],
  events: [],
});
const storage = new Map([['ppa-state-v1', projectState], ['rehearsalLogs', '[]']]);
const appRoot = { innerHTML: '' };
const documentStub = {
  body: { classList: { toggle() {} } },
  getElementById(id) { return id === 'app' ? appRoot : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const authUser = { id: 'user-001', email: 'member@example.com' };
let authCallback;
const windowStub = {
  matchMedia: () => ({ matches: true }),
  AuthService: {
    onAuthStateChange: async callback => { authCallback = callback; return () => {}; },
    getSession: async () => ({ session: null, user: null }),
    getCurrentUser: async () => authUser,
    signIn: async () => ({ session: { user: authUser }, user: authUser }),
    signOut: async () => {},
  },
  SupabaseReadService: {
    getProfile: async () => ({ status: 'PASS', data: [{ id: authUser.id, display_name: '테스트 부원' }] }),
    probeReads: async () => ({ client: 'PASS', session: { status: 'AUTHENTICATED' }, reads: {} }),
  },
  SupabaseDataService: {
    resolveActiveProduction: async () => ({ id: 'production-001' }),
    getProductionMembers: async () => ({ status: 'PASS', data: [{ production_id: 'production-001', profile_id: authUser.id, role: 'MEMBER' }] }),
    getRehearsalLogs: async () => ({ status: 'EMPTY', data: [] }),
    getTasks: async () => ({ status: 'EMPTY', data: [] }),
    getEvents: async () => ({ status: 'EMPTY', data: [] }),
  },
};
const context = vm.createContext({
  console, Date, document: documentStub, window: windowStub,
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
  },
  fetch: async () => { throw new Error('local state should prevent data fetch'); },
  setTimeout, clearTimeout,
});

async function run() {
  vm.runInContext(`${fs.readFileSync('rules.js', 'utf8')}\n${fs.readFileSync('app.js', 'utf8')}`, context);
  await context.window.__APP_INIT_PROMISE__;

  assert.ok(appRoot.innerHTML.includes('class="motion-hero public-motion-hero"'), '익명 최초 진입은 공개 HOME이어야 한다');
  assert.ok(appRoot.innerHTML.includes('CNU THEATRE') && !appRoot.innerHTML.includes('JEONDAE THEATRE'), '익명 HOME 영문 branding 불일치');
  assert.ok(appRoot.innerHTML.includes('data-auth-login'), '익명 Top Navigation에 로그인 버튼이 있어야 한다');
  assert.ok(!appRoot.innerHTML.includes('비공개 공연') && !appRoot.innerHTML.includes('비공개 업무'), '공개 HOME에 private local data를 렌더하면 안 된다');
  assert.ok(!appRoot.innerHTML.includes('id="home-dashboard"'), '익명 HOME에 Production Dashboard를 노출하면 안 된다');

  vm.runInContext("currentView = 'rehearsal'; render();", context);
  assert.ok(appRoot.innerHTML.includes('현재 공개된 공연 아카이브가 없습니다.'), '비활성 archive는 안전한 empty UI를 표시해야 한다');
  assert.ok(!appRoot.innerHTML.includes('비공개 공연') && !appRoot.innerHTML.includes('비공개 업무'), '익명 사용자에게 localStorage private 콘텐츠를 렌더하면 안 된다');

  vm.runInContext("pendingProtectedView = 'rehearsal'; isLoginViewOpen = true;", context);
  await authCallback('SIGNED_IN', { user: authUser });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(appRoot.innerHTML.includes('data-auth-logout'), '로그인 후 계정 UI가 표시되어야 한다');
  assert.ok(appRoot.innerHTML.includes('view-page-rehearsal'), '로그인 후 원래 보호 View로 복귀해야 한다');
  assert.ok(appRoot.innerHTML.includes('CNU THEATRE') && !appRoot.innerHTML.includes('JEONDAE THEATRE'), '인증 UI 영문 branding 불일치');

  await authCallback('SIGNED_OUT', null);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(appRoot.innerHTML.includes('현재 공개된 공연 아카이브가 없습니다.'), '로그아웃 후 보던 public page를 read-only 상태로 유지해야 한다');
  assert.strictEqual(storage.get('ppa-state-v1'), projectState, '인증 UX 변경이 localStorage를 수정하면 안 된다');
  console.log('Public HOME / 보호 View 인증 UX 테스트 통과');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
