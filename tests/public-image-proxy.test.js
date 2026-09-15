const assert = require('assert');
const fs = require('fs');

const edge = fs.readFileSync('supabase/functions/public-rehearsal-image/index.ts', 'utf8');
const storageMigration = fs.readFileSync('supabase/rehearsal_images_storage_migration.sql', 'utf8');

assert.match(edge, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/, 'service role must come from server environment');
assert.ok(!/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+['"]/.test(edge), 'service role must not be hardcoded');
assert.match(edge, /\.eq\('public_slug', publicSlug\)[\s\S]*?\.eq\('public_archive', true\)/, 'production must explicitly opt in');
assert.match(edge, /\.eq\('production_id', production\.id\)[\s\S]*?\.eq\('public_id', rehearsalPublicId\)/, 'rehearsal relationship must be validated');
assert.match(edge, /\.eq\('production_id', production\.id\)[\s\S]*?\.eq\('rehearsal_log_id', rehearsal\.id\)[\s\S]*?\.eq\('public_id', imagePublicId\)/, 'image relationship must be validated');
assert.ok(edge.indexOf(".eq('public_archive', true)") < edge.indexOf(".select('storage_path,mime_type')"), 'private path lookup must follow public validation');
assert.ok(edge.indexOf(".select('storage_path,mime_type')") < edge.indexOf('.download(image.storage_path)'), 'storage path must be server-resolved');
assert.match(edge, /new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
assert.match(edge, /binary\.type && binary\.type !== image\.mime_type/);
assert.match(edge, /'Cache-Control': 'public, max-age=300'/);
assert.match(edge, /'X-Content-Type-Options': 'nosniff'/);
assert.match(edge, /'Content-Disposition': 'inline'/);
assert.match(edge, /https:\/\/hwangingyu4924-dotcom\.github\.io/);
assert.match(edge, /localhost\|127\\\.0\\\.0\\\.1/);
assert.match(edge, /Deno\.env\.get\('ALLOW_LOCALHOST_ORIGIN'\) === 'true'/);
assert.ok(!edge.includes("'Access-Control-Allow-Origin': '*'"), 'wildcard CORS must not be used');

const notFoundCalls = (edge.match(/return notFound\(/g) || []).length;
assert.ok(notFoundCalls >= 8, 'invalid/private/mismatched paths must collapse to generic 404');
assert.ok(!edge.includes('original_filename') && !edge.includes('uploaded_by'), 'proxy must not query or return private identity metadata');
assert.match(storageMigration, /insert into storage\.buckets[\s\S]*?false/s, 'private bucket declaration must remain false');
assert.ok(!/to anon[\s\S]*storage\.objects/i.test(storageMigration), 'anonymous Storage read policy must not be added');

console.log('Public image Edge Function trust boundary, CORS, MIME, cache and private bucket contract passed');
