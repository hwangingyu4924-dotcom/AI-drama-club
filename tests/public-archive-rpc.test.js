const assert = require('assert');
const fs = require('fs');

const sql = fs.readFileSync('supabase/public_production_archive_migration.sql', 'utf8');

function functionDefinition(name) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} RPC가 필요하다`);
  const end = sql.indexOf('\n$$;', sql.indexOf('as $$', start));
  assert.ok(end > start, `${name} 정의를 읽을 수 있어야 한다`);
  return sql.slice(start, end + 4);
}

const contracts = {
  get_public_archive_production: [
    'public_slug', 'title', 'performance_date', 'venue', 'public_venue_info',
    'project_start_date', 'status', 'parts', 'public_rehearsal_summary',
  ],
  get_public_archive_tasks: [
    'public_id', 'prerequisite_public_id', 'part', 'title', 'deadline',
    'status', 'priority', 'required', 'pre_show_check',
  ],
  get_public_archive_events: [
    'public_id', 'title', 'event_date', 'start_time', 'end_time', 'category',
    'part', 'public_location', 'public_description',
  ],
  get_public_archive_rehearsal_logs: [
    'public_id', 'title', 'rehearsal_date', 'author_display_name', 'category',
    'content', 'tags', 'created_date', 'updated_date',
  ],
  get_public_archive_rehearsal_images: [
    'image_public_id', 'rehearsal_public_id', 'sort_order',
  ],
};

const forbiddenReturnFields = [
  'production_id', 'profile_id', 'author_profile_id', 'uploaded_by',
  'storage_path', 'original_filename', 'created_by', 'assignee', 'role', 'email',
];

for (const [name, expectedFields] of Object.entries(contracts)) {
  const definition = functionDefinition(name);
  const returns = definition.slice(definition.indexOf('returns table ('), definition.indexOf(')\nlanguage'));
  for (const field of expectedFields) assert.match(returns, new RegExp(`\\b${field}\\b`), `${name}: ${field} 반환 필요`);
  for (const field of forbiddenReturnFields) assert.doesNotMatch(returns, new RegExp(`\\b${field}\\b`), `${name}: ${field} 반환 금지`);
  assert.match(definition, /security definer/i);
  assert.match(definition, /set search_path = pg_catalog, public/i);
  assert.match(definition, /\.public_archive = true/);
  assert.match(definition, /\.public_slug = requested_public_slug/);
  assert.doesNotMatch(definition, /execute\s+format|dynamic sql/i);
}

assert.match(sql, /grant execute on function public\.get_public_archive_production\(text\) to anon, authenticated/);
assert.match(sql, /grant execute on function public\.get_public_archive_rehearsal_images\(text, uuid\) to anon, authenticated/);
assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[^;]*on\s+(?:table\s+)?public\.(?:profiles|productions|production_members|tasks|events|rehearsal_logs|rehearsal_log_images)[^;]*to\s+anon/i);

console.log('Public archive RPC explicit-column/privacy contract tests passed');
