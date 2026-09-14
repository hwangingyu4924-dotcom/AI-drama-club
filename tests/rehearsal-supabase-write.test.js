const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('dataService.js', 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';
const productionId = '22222222-2222-4222-8222-222222222222';
const logId = '33333333-3333-4333-8333-333333333333';
const generatedId = '44444444-4444-4444-8444-444444444444';
const imageId = '55555555-5555-4555-8555-555555555555';
let operation = '';
let payload = null;

const row = {
  id: logId,
  production_id: productionId,
  legacy_id: `WEB-${generatedId}`,
  title: 'Supabase 연습일지 테스트',
  rehearsal_date: '2026-09-13',
  author: '테스트 관리자',
  author_profile_id: userId,
  category: '전체연습',
  content: 'Supabase WRITE 연결 테스트용 기록입니다.',
  tags: ['테스트'],
  created_at: '2026-09-13T00:00:00Z',
  updated_at: '2026-09-13T00:00:00Z',
};
const imageRow = {
  id: imageId, rehearsal_log_id: logId, production_id: productionId, uploaded_by: userId,
  storage_path: `${productionId}/${logId}/${userId}/${generatedId}.jpg`, original_filename: 'test.jpg',
  mime_type: 'image/jpeg', file_size: 1024, sort_order: 0,
  created_at: row.created_at, updated_at: row.updated_at,
};

function terminal(result) {
  return {
    eq() { return this; },
    limit() { return this; },
    order() { return this; },
    select() { return this; },
    single: async () => result,
    then(resolve) { return Promise.resolve(result).then(resolve); },
  };
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  from(table) {
    return {
      select() {
        if (table === 'profiles') return terminal({ data: { id: userId, display_name: '테스트 관리자' }, error: null });
        if (table === 'productions') return terminal({ data: [{ id: productionId, title: '봄, 손을 쥐다' }], error: null });
        if (table === 'rehearsal_logs') return terminal({ data: [row], error: null });
        if (table === 'rehearsal_log_images') return terminal({ data: [imageRow], error: null });
        throw new Error('unexpected SELECT table ' + table);
      },
      insert(value) { operation = `insert:${table}`; payload = value; return terminal({ data: table === 'rehearsal_log_images' ? imageRow : row, error: null }); },
      update(value) { operation = `update:${table}`; payload = value; return terminal({ data: table === 'rehearsal_log_images' ? { ...imageRow, ...value } : { ...row, ...value }, error: null }); },
      delete() { operation = `delete:${table}`; payload = null; return terminal({ data: { id: table === 'rehearsal_log_images' ? imageId : logId }, error: null }); },
    };
  },
};

const browser = {
  console,
  Error,
  TypeError,
  crypto: { randomUUID: () => generatedId },
  SupabaseClientProvider: { getClient: async () => client },
};
browser.window = browser;
vm.runInNewContext(source, browser, { filename: 'data-service-browser.js' });
const service = browser.SupabaseDataService;

async function run() {
  const active = await service.resolveActiveProduction();
  assert.strictEqual(active.id, productionId);

  const read = await service.getRehearsalLogs(productionId);
  assert.strictEqual(read.status, 'PASS');
  assert.strictEqual(read.data[0].id, logId);

  const created = await service.createRehearsalLog({
    productionId,
    title: row.title,
    rehearsalDate: row.rehearsal_date,
    category: row.category,
    content: row.content,
    tags: ['테스트', '테스트'],
    authorProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });
  assert.strictEqual(operation, 'insert:rehearsal_logs');
  assert.strictEqual(created.id, logId, '생성된 DB UUID를 반환해야 한다');
  assert.strictEqual(payload.author_profile_id, userId, '작성자는 현재 Auth UUID여야 한다');
  assert.strictEqual(payload.author, '테스트 관리자');
  assert.strictEqual(payload.production_id, productionId);
  assert.strictEqual(payload.legacy_id, `WEB-${generatedId}`);
  assert.deepStrictEqual(Array.from(payload.tags), ['테스트']);

  const updated = await service.updateRehearsalLog(logId, {
    title: '수정된 연습일지', rehearsalDate: '2026-09-14', category: '연기', content: '수정 본문', tags: [],
    productionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', authorProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });
  assert.strictEqual(operation, 'update:rehearsal_logs');
  assert.strictEqual(updated.title, '수정된 연습일지');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'production_id'));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'author_profile_id'));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'id'));

  const deleted = await service.deleteRehearsalLog(logId);
  assert.strictEqual(operation, 'delete:rehearsal_logs');
  assert.strictEqual(deleted.id, logId);

  const imageRead = await service.getRehearsalLogImages(logId);
  assert.strictEqual(imageRead.status, 'PASS');
  const imageById = await service.getRehearsalLogImageById(imageId);
  assert.strictEqual(imageById.status, 'PASS');
  const createdImage = await service.createRehearsalLogImage({ ...imageRow, uploaded_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  assert.strictEqual(operation, 'insert:rehearsal_log_images');
  assert.strictEqual(payload.uploaded_by, userId, '이미지 uploader 위조를 허용하면 안 된다');
  assert.strictEqual(createdImage.id, imageId);
  const reordered = await service.updateRehearsalLogImageOrder(imageId, 3);
  assert.strictEqual(operation, 'update:rehearsal_log_images');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(payload)), { sort_order: 3 }, '순서 변경은 sort_order만 전송해야 한다');
  assert.strictEqual(reordered.sort_order, 3);
  await service.deleteRehearsalLogImage(imageId);
  assert.strictEqual(operation, 'delete:rehearsal_log_images');

  await assert.rejects(
    service.createRehearsalLog({ productionId, title: '', rehearsalDate: 'bad', category: '잘못됨', content: '', tags: '문자열' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  console.log('Supabase 연습일지 READ/CREATE/UPDATE/DELETE 서비스 테스트 통과');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
