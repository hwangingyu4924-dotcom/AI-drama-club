const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('dataService.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const migration = fs.readFileSync('supabase/public_production_archive_migration.sql', 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';
const productionId = '22222222-2222-4222-8222-222222222222';
const logId = '33333333-3333-4333-8333-333333333333';
let payload;

const row = {
  id: logId, production_id: productionId, legacy_id: 'WEB-test', title: '연습',
  rehearsal_date: '2026-09-15', author: '김지우', author_display_name: '연출 김지우',
  author_profile_id: userId, category: '연출', content: '본문', tags: [],
  created_at: '2026-09-15T00:00:00Z', updated_at: '2026-09-15T00:00:00Z',
};

function terminal(data) {
  return {
    eq() { return this; }, limit() { return this; }, order() { return this; }, select() { return this; },
    single: async () => ({ data, error: null }),
    then(resolve) { return Promise.resolve({ data: Array.isArray(data) ? data : [data], error: null }).then(resolve); },
  };
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  from(table) {
    return {
      select() {
        if (table === 'profiles') return terminal({ id: userId, display_name: '김지우' });
        if (table === 'productions') return terminal([{ id: productionId, title: '공연' }]);
        if (table === 'rehearsal_logs') return terminal([row]);
        throw new Error(`unexpected table ${table}`);
      },
      insert(value) { payload = value; return terminal({ ...row, ...value }); },
      update(value) { payload = value; return terminal({ ...row, ...value }); },
    };
  },
};

const browser = { console, Error, TypeError, crypto: { randomUUID: () => logId }, SupabaseClientProvider: { getClient: async () => client } };
browser.window = browser;
vm.runInNewContext(source, browser);

async function run() {
  await browser.SupabaseDataService.createRehearsalLog({
    productionId, title: '연습', rehearsalDate: '2026-09-15', category: '연출', content: '본문', tags: [],
  });
  assert.strictEqual(payload.author_display_name, '김지우', 'profile display_name이 기본값이어야 한다');
  assert.strictEqual(payload.author_profile_id, userId);

  await browser.SupabaseDataService.updateRehearsalLog(logId, {
    title: '수정', rehearsalDate: '2026-09-15', category: '연출', content: '본문', tags: [],
    authorDisplayName: '  21기 김지우  ', authorProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });
  assert.strictEqual(payload.author_display_name, '21기 김지우');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'author_profile_id'), 'ownership UUID를 수정 payload에 넣으면 안 된다');

  await assert.rejects(
    browser.SupabaseDataService.updateRehearsalLog(logId, {
      title: '수정', rehearsalDate: '2026-09-15', category: '연출', content: '본문', tags: [],
      authorDisplayName: 'x'.repeat(81),
    }),
    error => error.code === 'VALIDATION_ERROR',
  );

  assert.match(migration, /nullif\(btrim\(profile\.display_name\), ''\)[\s\S]*nullif\(btrim\(rl\.author\), ''\)[\s\S]*'전대극회 부원'/);
  assert.match(migration, /author_profile_id cannot be changed/);
  assert.match(migration, /char_length\(author_display_name\) between 1 and 80/);
  assert.match(app, /maxlength="80"/);
  assert.match(app, /authorDisplayName: document\.getElementById\('r-author'\)\.value/);
  assert.match(app, /authorDisplayName: authorInput\.value\.trim\(\)/);
  assert.match(app, /author: row\.author_display_name \|\| row\.author/);
  assert.match(app, /escapeHtml\(log\.author\)/, 'display name은 HTML escape 후 렌더되어야 한다');
  console.log('Public rehearsal author display-name service/UI contract tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
