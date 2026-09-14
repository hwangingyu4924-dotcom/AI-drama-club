const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('dataService.js', 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';
const productionId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const prerequisiteId = '44444444-4444-4444-8444-444444444444';
const generatedId = '55555555-5555-4555-8555-555555555555';
let operation = '';
let payload = null;

const taskRow = {
  id: taskId, production_id: productionId, legacy_id: `WEB-${generatedId}`,
  part: '연출', name: 'Supabase Task 테스트', assignee: '테스트 관리자',
  deadline: '2026-09-20', status: '대기', priority: '높음',
  prerequisite_task_id: prerequisiteId, required: true, pre_show_check: true,
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
        if (table === 'tasks') return terminal({ data: [taskRow], error: null });
        throw new Error(`unexpected SELECT ${table}`);
      },
      insert(value) { operation = `insert:${table}`; payload = value; return terminal({ data: taskRow, error: null }); },
      update(value) { operation = `update:${table}`; payload = value; return terminal({ data: { ...taskRow, ...value }, error: null }); },
      delete() { operation = `delete:${table}`; return terminal({ data: { id: taskId }, error: null }); },
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
  const read = await service.getTasks(productionId);
  assert.strictEqual(read.status, 'PASS');
  assert.strictEqual(read.data.length, 1);

  const input = {
    productionId, part: '연출', name: taskRow.name, assignee: taskRow.assignee,
    deadline: taskRow.deadline, status: '대기', priority: '높음',
    prerequisiteTaskId: prerequisiteId, required: true, preShowCheck: true,
  };
  const created = await service.createTask(input);
  assert.strictEqual(operation, 'insert:tasks');
  assert.strictEqual(created.id, taskId, '생성된 실제 Task UUID를 반환해야 한다');
  assert.strictEqual(payload.production_id, productionId);
  assert.strictEqual(payload.legacy_id, `WEB-${generatedId}`);
  assert.strictEqual(payload.prerequisite_task_id, prerequisiteId);

  const updated = await service.updateTask(taskId, { ...input, status: '완료' });
  assert.strictEqual(operation, 'update:tasks');
  assert.strictEqual(updated.status, '완료');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'production_id'), 'UPDATE가 production_id를 바꾸면 안 된다');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'legacy_id'), 'UPDATE가 legacy_id를 바꾸면 안 된다');

  const deleted = await service.deleteTask(taskId);
  assert.strictEqual(operation, 'delete:tasks');
  assert.strictEqual(deleted.id, taskId);

  await assert.rejects(
    service.createTask({ productionId, name: '', part: '', status: '잘못됨', priority: '잘못됨' }),
    error => error.code === 'VALIDATION_ERROR',
  );

  const app = fs.readFileSync('app.js', 'utf8');
  assert.ok(app.includes('tasks: usesSupabaseTasks ? legacyLocalTasks : state.tasks'), 'localStorage legacy Task 보존 계약이 필요하다');
  assert.ok(app.includes("window.SupabaseDataService.getTasks(production.id)"), 'active production Task READ가 필요하다');
  assert.ok(app.includes('state.tasks = (result.data || []).map(mapSupabaseTask)'), 'Supabase 단일 Task source가 필요하다');
  assert.ok(!app.includes('state.tasks.push({\n      taskId: nextTaskId()'), '로그인 Task CREATE가 localStorage ID를 사용하면 안 된다');
  console.log('Supabase Task READ/CREATE/UPDATE/DELETE 및 legacy 보존 테스트 통과');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
