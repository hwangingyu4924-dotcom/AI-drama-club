const assert = require('assert');
const fs = require('fs');

const migration = fs.readFileSync('supabase/public_production_archive_migration.sql', 'utf8');
const activation = fs.readFileSync('supabase/public_production_archive_activation.sql', 'utf8');
const rls = fs.readFileSync('supabase/rls.sql', 'utf8');
const autoJoin = fs.readFileSync('supabase/auto_join_current_production_migration.sql', 'utf8');

assert.match(migration, /public_archive boolean/);
assert.match(migration, /alter column public_archive set default false/);
assert.match(migration, /check \(not public_archive or public_slug is not null\)/);
assert.match(migration, /create unique index if not exists productions_public_slug_key/);
assert.doesNotMatch(migration, /set\s+public_archive\s*=\s*true/i, 'migration이 Production을 자동 공개하면 안 된다');

for (const table of ['tasks', 'events', 'rehearsal_logs', 'rehearsal_log_images']) {
  assert.match(migration, new RegExp(`alter table public\\.${table} add column if not exists public_id uuid`));
  assert.match(migration, new RegExp(`create unique index if not exists ${table}_public_id_key`));
}
assert.match(migration, /raise exception 'public_id cannot be changed'/);

for (const table of ['profiles', 'productions', 'production_members', 'tasks', 'events', 'rehearsal_logs', 'rehearsal_log_images']) {
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon`));
}

assert.match(activation, /spring-holding-hands-2026/);
assert.match(activation, /892fa94e-6f56-4ad0-8a93-1d353de77196/);
assert.match(activation, /public_archive = true/);

for (const table of ['tasks', 'events']) {
  for (const operation of ['select', 'insert', 'update']) {
    assert.match(rls, new RegExp(`create policy ${table}_${operation}_member`));
  }
  assert.match(rls, new RegExp(`create policy ${table}_delete_admin`));
}
assert.match(rls, /create policy rehearsal_logs_insert_member/);
assert.match(rls, /author_profile_id = auth\.uid\(\)/);
assert.match(rls, /create policy rehearsal_log_images_insert_member/);
assert.doesNotMatch(rls, /(?:create policy|grant)[^;]*\bto anon\b/i);
assert.match(autoJoin, /revoke all on function public\.ensure_current_production_membership\(\) from public/);
assert.match(autoJoin, /grant execute on function public\.ensure_current_production_membership\(\) to authenticated/);
assert.doesNotMatch(autoJoin, /grant execute[^;]+to anon/i);
assert.match(migration, /revoke execute on function public\.ensure_current_production_membership\(\) from anon/);
assert.match(migration, /revoke execute on function public\.create_production\(text, jsonb\) from anon/);
assert.match(migration, /revoke execute on function public\.rehearsal_image_storage_authorized\(text, text\) from anon/);

console.log('Public archive isolation and anonymous-write security contract tests passed');
