const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('dataService.js', 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';
const productionId = '22222222-2222-4222-8222-222222222222';
let rpcName = '';
const client = {
  auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  from(table) {
    if (table !== 'profiles') throw new Error(`unexpected table ${table}`);
    return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: userId, display_name: '새 부원' }, error: null }) };
  },
  async rpc(name) {
    rpcName = name;
    return { data: [{ production_id: productionId, profile_id: userId, role: 'MEMBER', created: true }], error: null };
  },
};
const browser = { console, Error, TypeError, SupabaseClientProvider: { getClient: async () => client } };
browser.window = browser;
vm.runInNewContext(source, browser);

async function run() {
  const joined = await browser.SupabaseDataService.ensureCurrentProductionMembership();
  assert.strictEqual(rpcName, 'ensure_current_production_membership');
  assert.strictEqual(joined.production_id, productionId);
  assert.strictEqual(joined.profile_id, userId);
  assert.strictEqual(joined.role, 'MEMBER');

  const sql = fs.readFileSync('supabase/auto_join_current_production_migration.sql', 'utf8');
  assert.ok(sql.includes('add column is_current boolean not null default false'), '운영 production 명시 플래그가 필요하다');
  assert.ok(sql.includes('create unique index productions_one_current_idx'), '현재 production은 하나만 허용해야 한다');
  assert.ok(sql.includes('caller_id uuid := auth.uid()'), '현재 인증 사용자만 가입시켜야 한다');
  assert.ok(sql.includes("values (current_production_id, caller_id, caller_name, 'MEMBER')"), '신규 role은 서버에서 MEMBER로 고정해야 한다');
  assert.ok(sql.includes('on conflict on constraint production_members_pkey do nothing'), '중복 membership을 모호성 없이 방지해야 한다');
  assert.ok(sql.includes('select pm.role into existing_role'), '기존 ADMIN/MEMBER role을 재사용해야 한다');
  assert.ok(sql.includes('security definer') && sql.includes('set search_path = pg_catalog, public'), 'SECURITY DEFINER search_path를 고정해야 한다');
  assert.ok(sql.includes('revoke all on function public.ensure_current_production_membership() from public'), 'anonymous execute를 차단해야 한다');
  assert.ok(!sql.includes('join_code') && !sql.includes('production_join_codes'), 'join-code 구조가 남으면 안 된다');

  const app = fs.readFileSync('app.js', 'utf8');
  assert.ok(app.includes('ensureCurrentProductionMembership()'), 'membership 없음 시 Auto Join RPC를 호출해야 한다');
  assert.ok(app.includes('if (!signup.session || !signup.user)'), '실제 signup 세션이 없으면 Auto Join 전에 중단해야 한다');
  assert.ok(!app.includes('confirmationRequired'), '이메일 확인 대기 분기가 남으면 안 된다');
  assert.ok(!app.includes('이메일 인증 후 로그인'), 'Email Confirm 전제 안내가 남으면 안 된다');
  assert.ok(!/join.?code/i.test(app), 'Join Code UI/logic이 남으면 안 된다');
  assert.ok(!app.includes('role:') || !app.includes('ensureCurrentProductionMembership({'), 'Frontend에서 role을 RPC에 전달하면 안 된다');
  console.log('Self-signup / Auto MEMBER Join 보안 계약 테스트 통과');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
