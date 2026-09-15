const assert = require('assert');
const fs = require('fs');

const activation = fs.readFileSync('supabase/public_production_archive_activation.sql', 'utf8');
const rollback = fs.readFileSync('supabase/public_production_archive_rollback.sql', 'utf8');
const review = fs.readFileSync('supabase/public_production_archive_content_review.sql', 'utf8');
const contentUpdate = fs.readFileSync('supabase/public_production_archive_content_update.sql', 'utf8');
const target = '892fa94e-6f56-4ad0-8a93-1d353de77196';
const slug = 'spring-holding-hands-2026';

assert.match(activation, /^-- MANUAL ACTIVATION ONLY/);
assert.match(activation, /begin;[\s\S]*commit;/i);
assert.match(activation, new RegExp(`where id = '${target}'[\\s\\S]*and public_archive = false`));
assert.match(activation, new RegExp(`public_slug = '${slug}'[\\s\\S]*public_archive = true`));
assert.match(activation, /get diagnostics updated_rows = row_count/);
assert.match(activation, /if updated_rows <> 1 then/);
assert.match(activation, /id <> '892fa94e-6f56-4ad0-8a93-1d353de77196'/);

assert.match(rollback, /^-- EMERGENCY MANUAL ROLLBACK/);
assert.match(rollback, new RegExp(`set public_archive = false[\\s\\S]*where id = '${target}'`));
assert.doesNotMatch(rollback, /set\s+public_slug\s*=\s*null/i, 'rollback should retain stable slug');
assert.match(rollback, /public_production_count/);

assert.match(review, /^-- READ-ONLY content review/);
assert.doesNotMatch(review, /\b(?:update|insert|delete|alter|drop|truncate)\b(?![^\n]*--)/i);
for (const table of ['productions', 'tasks', 'events', 'rehearsal_logs', 'rehearsal_log_images', 'profiles', 'production_members']) {
  assert.match(review, new RegExp(`'${table}'`));
}
assert.match(review, /sensitive_pattern_flags/);
assert.match(review, /canonical_fields_missing/);
assert.match(review, /author_display_review/);
assert.match(review, /slug_conflicts/);

assert.match(contentUpdate, /^-- MANUAL APPROVED CONTENT UPDATE ONLY/);
assert.match(contentUpdate, /begin;[\s\S]*commit;/i);
assert.match(contentUpdate, /if target_production\.public_archive is distinct from false/);
assert.match(contentUpdate, /Expected zero public productions/);
assert.match(contentUpdate, /if target_log_count <> 3 then/);
assert.match(contentUpdate, /performance_date = date '2026-10-18'/);
assert.match(contentUpdate, /venue = '전일빌딩245'/);
assert.match(contentUpdate, /project_start_date = date '2026-08-24'/);
assert.match(contentUpdate, /set author_display_name = '황인규'/);
const productionUpdateStart = contentUpdate.indexOf('update public.productions');
const productionUpdate = contentUpdate.slice(productionUpdateStart, contentUpdate.indexOf('\n  where id =', productionUpdateStart));
for (const forbidden of ['public_archive =', 'public_slug =', 'public_venue_info =', 'public_rehearsal_summary =', 'status =', 'parts =']) {
  assert.ok(!productionUpdate.includes(forbidden), `approved content update must preserve ${forbidden}`);
}
assert.match(contentUpdate, /author_profile_id is distinct from original\.author_profile_id/);
assert.match(contentUpdate, /current_log\.created_at is distinct from original\.created_at/);

console.log('Public archive content review, atomic activation and emergency rollback preparation passed');
