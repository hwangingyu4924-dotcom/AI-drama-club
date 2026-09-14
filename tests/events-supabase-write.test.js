const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('dataService.js', 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';
const productionId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
const generatedId = '44444444-4444-4444-8444-444444444444';
let operation = '';
let payload = null;

const eventRow = {
  id: eventId, production_id: productionId, legacy_id: `WEB-${generatedId}`,
  title: 'Supabase Event 테스트', event_date: '2026-09-20',
  start_time: '19:00:00', end_time: '21:00:00', type: '연습', part: '연출',
  location: '동아리방', memo: '공유 일정 테스트',
  created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:00:00Z',
};

function terminal(result) {
  return {
    eq() { return this; }, limit() { return this; }, order() { return this; }, select() { return this; },
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
        if (table === 'productions') return terminal({ data: [{ id: productionId }], error: null });
        if (table === 'events') return terminal({ data: [eventRow], error: null });
        throw new Error(`unexpected SELECT ${table}`);
      },
      insert(value) { operation = `insert:${table}`; payload = value; return terminal({ data: eventRow, error: null }); },
      update(value) { operation = `update:${table}`; payload = value; return terminal({ data: { ...eventRow, ...value }, error: null }); },
      delete() { operation = `delete:${table}`; return terminal({ data: { id: eventId }, error: null }); },
    };
  },
};

const browser = {
  console, Error, TypeError,
  crypto: { randomUUID: () => generatedId },
  SupabaseClientProvider: { getClient: async () => client },
};
browser.window = browser;
vm.runInNewContext(source, browser, { filename: 'data-service-browser.js' });
const service = browser.SupabaseDataService;

async function run() {
  const read = await service.getEvents(productionId);
  assert.strictEqual(read.status, 'PASS');
  assert.strictEqual(read.data[0].event_date, '2026-09-20');

  const input = {
    productionId, title: eventRow.title, eventDate: '2026-09-20',
    startTime: '19:00', endTime: '21:00', type: '연습', part: '연출',
    location: '동아리방', memo: '공유 일정 테스트',
  };
  const created = await service.createEvent(input);
  assert.strictEqual(operation, 'insert:events');
  assert.strictEqual(created.id, eventId, '생성된 실제 Event UUID를 반환해야 한다');
  assert.strictEqual(payload.production_id, productionId);
  assert.strictEqual(payload.event_date, '2026-09-20', 'date-only 값을 변환하면 안 된다');
  assert.strictEqual(payload.legacy_id, `WEB-${generatedId}`);

  const updated = await service.updateEvent(eventId, { ...input, title: '수정된 Supabase Event' });
  assert.strictEqual(operation, 'update:events');
  assert.strictEqual(updated.title, '수정된 Supabase Event');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'production_id'), 'UPDATE가 production_id를 바꾸면 안 된다');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'legacy_id'), 'UPDATE가 legacy_id를 바꾸면 안 된다');

  const deleted = await service.deleteEvent(eventId);
  assert.strictEqual(operation, 'delete:events');
  assert.strictEqual(deleted.id, eventId);

  await assert.rejects(
    service.createEvent({ productionId, title: '', eventDate: 'bad', type: '잘못됨' }),
    error => error.code === 'VALIDATION_ERROR',
  );

  const app = fs.readFileSync('app.js', 'utf8');
  assert.ok(app.includes('events: usesSupabaseEvents ? legacyLocalEvents : state.events'), 'localStorage legacy Event 보존 계약이 필요하다');
  assert.ok(app.includes('window.SupabaseDataService.getEvents(production.id)'), 'active production Event READ가 필요하다');
  assert.ok(app.includes('state.events = (result.data || []).map(mapSupabaseEvent)'), 'Supabase 단일 Event source가 필요하다');
  assert.ok(app.includes("date: row.event_date"), 'DB date-only 필드를 그대로 Calendar에 매핑해야 한다');
  assert.ok(!app.includes('id: editingEventId || nextEventId(), title, date'), '공유 Event가 localStorage ID를 사용하면 안 된다');
  console.log('Supabase Event READ/CREATE/UPDATE/DELETE 및 legacy 보존 테스트 통과');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
