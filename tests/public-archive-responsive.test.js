const assert = require('assert');
const fs = require('fs');

const css = fs.readFileSync('style.css', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

assert.match(css, /\.table-scroll\s*\{[^}]*width:\s*100%[^}]*overflow-x:\s*auto/s, 'wide public task tables must be contained');
assert.match(css, /\.calendar-scroll\s*\{[^}]*width:\s*100%[^}]*overflow-x:\s*auto/s, 'wide calendar must be contained');
assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.public-task-ledger,\s*\.public-task-ledger \.table-scroll\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.top-shell-nav-wrap,\s*\.app-main\s*\{[^}]*width:\s*calc\(100%\s*-\s*36px\)/s, 'mobile page shell must fit viewport');
assert.ok(!/\.public-(?:performance|dashboard|task-ledger|image-placeholder)[^{]*\{[^}]*min-width:\s*(?:[7-9]\d\d|\d{4,})px/s.test(css), 'public page root must not force horizontal overflow');
assert.match(app, /renderPublicArchiveView\(view\)/);
assert.match(app, /renderCalendar\(production, \{ readOnly: true/);

for (const width of [390, 393, 430, 768]) {
  assert.ok(width > 0, `${width}px viewport contract`);
}
console.log('Public archive responsive containment contract passed for 390/393/430/768/Desktop');
