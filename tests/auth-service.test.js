const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('authService.js', 'utf8');

async function run() {
  const user = { id: 'user-001', email: 'member@example.com' };
  const session = { access_token: 'test-token', user };
  let listener = null;
  let unsubscribed = false;
  let signedOut = false;
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      signInWithPassword: async credentials => credentials.password === 'correct-password'
        ? { data: { session, user }, error: null }
        : { data: {}, error: new Error('Invalid login credentials') },
      signUp: async options => ({ data: { session, user: { ...user, user_metadata: options.options.data } }, error: null }),
      signOut: async () => { signedOut = true; return { error: null }; },
      onAuthStateChange: callback => {
        listener = callback;
        return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
      },
    },
  };
  const browser = {
    console,
    Error,
    TypeError,
    SupabaseClientProvider: { getClient: async () => client },
  };
  browser.window = browser;
  vm.runInNewContext(source, browser, { filename: 'auth-service-browser.js' });

  const service = browser.AuthService;
  assert.deepStrictEqual(Object.keys(service).sort(), ['getCurrentUser', 'getSession', 'onAuthStateChange', 'signIn', 'signUp', 'signOut'].sort());
  assert.strictEqual((await service.getSession()).user.id, user.id, '세션 복원 실패');
  assert.strictEqual((await service.getCurrentUser()).id, user.id, '현재 사용자 조회 실패');
  assert.strictEqual((await service.signIn('member@example.com', 'correct-password')).user.id, user.id, '정상 로그인 실패');
  await assert.rejects(
    service.signIn('member@example.com', 'wrong-password'),
    error => error.message === '이메일 또는 비밀번호가 올바르지 않습니다.',
    '인증 오류가 안전한 사용자 메시지로 변환되어야 한다',
  );
  const signup = await service.signUp('새 부원', 'new@example.com', 'secure-password');
  assert.strictEqual(signup.session, session, 'Email Confirm OFF 가입은 즉시 세션을 반환해야 한다');
  assert.strictEqual(signup.user.user_metadata.display_name, '새 부원', '이름 metadata가 Auth trigger로 전달되어야 한다');
  let observedEvent = '';
  const unsubscribe = await service.onAuthStateChange(event => { observedEvent = event; });
  listener('SIGNED_IN', session);
  assert.strictEqual(observedEvent, 'SIGNED_IN', 'Auth 상태 변경 감지 실패');
  unsubscribe();
  assert.ok(unsubscribed, 'Auth listener 해제 실패');
  await service.signOut();
  assert.ok(signedOut, '로그아웃 실패');

  console.log('Supabase Auth 서비스 단위 테스트 통과');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
