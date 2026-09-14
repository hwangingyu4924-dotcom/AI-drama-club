/** Shared singleton Supabase browser client. Public/publishable credentials only. */
(function createSupabaseClientProvider(global) {
  'use strict';

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  let clientPromise = null;

  function clientError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function getPublicConfig() {
    const config = global.AI_DRAMA_CONFIG || {};
    return {
      url: String(config.SUPABASE_URL || '').trim(),
      key: String(config.SUPABASE_PUBLISHABLE_KEY || '').trim(),
    };
  }

  function isForbiddenBrowserKey(key) {
    if (/^sb_secret_/i.test(key) || /service_role/i.test(key)) return true;
    if (!key.startsWith('eyJ') || typeof global.atob !== 'function') return false;
    try {
      const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(global.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
      return decoded && decoded.role === 'service_role';
    } catch (_error) {
      return false;
    }
  }

  function validateConfig() {
    const config = getPublicConfig();
    if (!config.url || !config.key) throw clientError('CONFIG_MISSING', 'Supabase 공개 설정이 필요합니다.');
    let parsedUrl;
    try { parsedUrl = new URL(config.url); } catch (_error) {
      throw clientError('CONFIG_INVALID', 'Supabase Project URL 형식이 올바르지 않습니다.');
    }
    if (parsedUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
      throw clientError('CONFIG_INVALID', '원격 Supabase Project URL은 HTTPS여야 합니다.');
    }
    if (isForbiddenBrowserKey(config.key)) {
      throw clientError('FORBIDDEN_SECRET', '브라우저에는 secret/service_role key를 사용할 수 없습니다.');
    }
    return config;
  }

  function getClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const config = validateConfig();
        let sdk;
        try { sdk = await import(SDK_URL); } catch (error) {
          throw clientError('SDK_UNAVAILABLE', 'Supabase Client를 불러오지 못했습니다.', error);
        }
        if (!sdk || typeof sdk.createClient !== 'function') {
          throw clientError('SDK_UNAVAILABLE', 'Supabase Client 생성 함수를 찾지 못했습니다.');
        }
        return sdk.createClient(config.url, config.key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
      })();
    }
    return clientPromise;
  }

  global.SupabaseClientProvider = Object.freeze({ getClient });
})(window);
