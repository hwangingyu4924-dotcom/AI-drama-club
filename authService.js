/** Supabase Auth Phase 1: Email/Password login, logout, session and user only. */
(function createAuthService(global) {
  'use strict';

  function safeAuthError(error, fallback) {
    const message = String(error && error.message || '').toLowerCase();
    let publicMessage = fallback || '인증 처리 중 문제가 발생했습니다.';
    let code = String(error && error.code || 'AUTH_ERROR');

    if (message.includes('invalid login credentials')) publicMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
    else if (message.includes('email not confirmed')) publicMessage = '이 계정은 현재 로그인할 수 없습니다. 관리자에게 문의해 주세요.';
    else if (message.includes('rate limit')) publicMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    else if (error instanceof TypeError || message.includes('failed to fetch') || message.includes('network')) {
      code = 'NETWORK_ERROR';
      publicMessage = '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    }

    const safe = new Error(publicMessage);
    safe.code = code;
    return safe;
  }

  async function getClient() {
    if (!global.SupabaseClientProvider) throw safeAuthError(null, 'Supabase 인증 서비스를 불러오지 못했습니다.');
    return global.SupabaseClientProvider.getClient();
  }

  async function getSession() {
    try {
      const client = await getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return { session: data.session || null, user: data.session && data.session.user || null };
    } catch (error) {
      throw safeAuthError(error, '로그인 세션을 확인하지 못했습니다.');
    }
  }

  async function getCurrentUser() {
    try {
      const client = await getClient();
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      return data.user || null;
    } catch (error) {
      throw safeAuthError(error, '현재 사용자 정보를 확인하지 못했습니다.');
    }
  }

  async function signIn(email, password) {
    try {
      const client = await getClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { session: data.session || null, user: data.user || null };
    } catch (error) {
      throw safeAuthError(error, '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function signUp(displayName, email, password) {
    try {
      const name = String(displayName || '').trim();
      if (!name) throw Object.assign(new Error('이름을 입력해 주세요.'), { code: 'VALIDATION_ERROR' });
      const client = await getClient();
      const { data, error } = await client.auth.signUp({
        email: String(email || '').trim(),
        password,
        options: { data: { display_name: name } },
      });
      if (error) throw error;
      return { session: data.session || null, user: data.user || null };
    } catch (error) {
      if (error && error.code === 'VALIDATION_ERROR') throw error;
      throw safeAuthError(error, '회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function signOut() {
    try {
      const client = await getClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      throw safeAuthError(error, '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function onAuthStateChange(callback) {
    const client = await getClient();
    const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  }

  global.AuthService = Object.freeze({ getCurrentUser, getSession, signIn, signUp, signOut, onAuthStateChange });
})(window);
