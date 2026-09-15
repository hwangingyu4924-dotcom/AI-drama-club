const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('app.js', 'utf8');
const service = fs.readFileSync('dataService.js', 'utf8');

assert.match(service, /buildPublicRehearsalImageUrl\(slug, rehearsalPublicId, imagePublicId\)/);
assert.match(service, /functions\/v1\/public-rehearsal-image\?production=/);
assert.ok(!/buildPublicRehearsalImageUrl[\s\S]{0,1200}(?:storage_path|uploaded_by|original_filename)/.test(service), 'public URL builder must use public identifiers only');
assert.match(app, /renderPublicRehearsalImages\(log, images\)/);
assert.match(app, /\.sort\(\(a, b\) => a\.sortOrder - b\.sortOrder/);
assert.match(app, /data-public-image/);
assert.match(app, /data-open-image-dialog/);
assert.match(app, /deliveryStatus = 'failed'/);
assert.match(app, /classList\.add\('has-image-error'\)/);
assert.match(app, /rehearsalImageDialog\.isPublic/);
assert.ok(!/renderPublicRehearsalImages[\s\S]{0,1800}(?:storage_path|original_filename|uploaded_by|data-signed-image-path)/.test(app), 'anonymous gallery must not consume private metadata');

console.log('Anonymous public image gallery, dialog, order and graceful fallback contract passed');
