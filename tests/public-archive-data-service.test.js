const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const calls = [];
const client = {
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: [{ public_id: '11111111-1111-4111-8111-111111111111' }], error: null };
  },
  from() { throw new Error('public archive reads must not access base tables'); },
  auth: { getUser() { throw new Error('public archive reads must not require auth'); } },
};
const windowStub = {
  AI_DRAMA_CONFIG: { SUPABASE_URL: 'https://project-ref.supabase.co' },
  SupabaseClientProvider: { getClient: async () => client },
};
const context = vm.createContext({ window: windowStub, console });
vm.runInContext(fs.readFileSync('dataService.js', 'utf8'), context);

async function run() {
  const service = windowStub.SupabaseDataService;
  const slug = 'spring-holding-hands-2026';
  const rehearsalPublicId = '22222222-2222-4222-8222-222222222222';
  const results = await Promise.all([
    service.getPublicArchiveProduction(slug),
    service.getPublicArchiveTasks(slug),
    service.getPublicArchiveEvents(slug),
    service.getPublicArchiveRehearsalLogs(slug),
    service.getPublicArchiveRehearsalImages(slug, rehearsalPublicId),
  ]);

  assert.ok(results.every(result => result.status === 'PASS'));
  assert.deepStrictEqual(calls.map(call => call.name), [
    'get_public_archive_production',
    'get_public_archive_tasks',
    'get_public_archive_events',
    'get_public_archive_rehearsal_logs',
    'get_public_archive_rehearsal_images',
  ]);
  calls.slice(0, 4).forEach(call => assert.deepStrictEqual(JSON.parse(JSON.stringify(call.args)), { requested_public_slug: slug }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls[4].args)), {
    requested_public_slug: slug,
    requested_rehearsal_public_id: rehearsalPublicId,
  });

  const imageUrl = service.buildPublicRehearsalImageUrl(slug, rehearsalPublicId, '33333333-3333-4333-8333-333333333333');
  assert.strictEqual(imageUrl, 'https://project-ref.supabase.co/functions/v1/public-rehearsal-image?production=spring-holding-hands-2026&rehearsal=22222222-2222-4222-8222-222222222222&image=33333333-3333-4333-8333-333333333333');
  ['storage_path', 'production_id', 'rehearsal_log_id', 'uploaded_by'].forEach(field => assert.ok(!imageUrl.includes(field)));

  assert.throws(() => service.getPublicArchiveTasks('../private'), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => service.getPublicArchiveRehearsalImages(slug, 'internal-id'), error => error.code === 'VALIDATION_ERROR');
  console.log('Public archive data service RPC-only contract test passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
