const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const serviceSource = fs.readFileSync('dataService.js', 'utf8');

async function run() {
  const browser = {
    URL,
    TypeError,
    Error,
    console,
  };
  browser.window = browser;
  browser.SupabaseClientProvider = { getClient: async () => { const error = new Error('missing'); error.code = 'CONFIG_MISSING'; throw error; } };
  vm.runInNewContext(serviceSource, browser, { filename: 'supabase-read-browser.js' });

  const service = browser.SupabaseReadService;
  assert.ok(service, 'READ service가 전역에 생성되어야 한다');
  for (const method of ['getCurrentProduction', 'getEvents', 'getProductionMembers', 'getProductions', 'getProfile', 'getProfiles', 'getRehearsalLogs', 'getTasks', 'probeReads']) {
    assert.strictEqual(typeof service[method], 'function', `${method} READ API가 필요하다`);
  }
  assert.strictEqual(browser.SupabaseDataService, service, 'Data service compatibility alias가 일치해야 한다');

  const result = await service.probeReads();
  assert.strictEqual(result.client, 'FAIL');
  assert.strictEqual(result.error.code, 'CONFIG_MISSING');
  for (const table of ['productions', 'tasks', 'events', 'rehearsal_logs', 'production_members', 'profiles']) {
    assert.strictEqual(result.reads[table].status, 'FAIL');
  }
}

run().then(() => console.log('Supabase READ 설정/fallback 테스트 통과'));
