const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');

assert.ok(app.includes("Number(a.sort_order) - Number(b.sort_order)") && app.includes("String(a.created_at || '').localeCompare") && app.includes('String(a.id).localeCompare'), 'Gallery 정렬은 sort_order, created_at, id 순이어야 한다');
assert.ok(app.includes('data-open-image-dialog') && app.includes('class="rehearsal-gallery-thumb"'), '상세 이미지는 클릭 가능한 thumbnail이어야 한다');
assert.ok(app.includes('role="dialog"') && app.includes('aria-modal="true"'), 'Dialog semantics가 필요하다');
assert.ok(app.includes("event.key === 'Escape'") && app.includes("event.key === 'ArrowLeft'") && app.includes("event.key === 'ArrowRight'"), 'Dialog keyboard control이 필요하다');
assert.ok(app.includes("event.target === imageBackdrop"), 'Backdrop 자체 클릭만 닫혀야 한다');
assert.ok(app.includes("imageDialog.querySelectorAll('button:not([disabled])')") && app.includes('event.shiftKey'), 'Focus trap이 필요하다');
assert.ok(app.includes('restoreImageId') && app.includes('?.focus()'), '닫은 뒤 thumbnail focus 복원이 필요하다');
assert.ok(app.includes('Date.parse(image.expiresAt) <= Date.now() + 60000') && app.includes('refreshSignedImageUrl'), 'Dialog open 전 Signed URL 갱신이 필요하다');
assert.ok(app.includes('has-image-error') && app.includes('이미지를 불러오지 못했습니다.'), '개별 이미지 오류 격리가 필요하다');
assert.ok(app.includes('(rehearsalImageDialog.index + direction + images.length) % images.length'), '첫/마지막 이미지 순환이 필요하다');
assert.ok(css.includes('.image-dialog-backdrop') && css.includes('100dvh') && css.includes('object-fit: contain'), 'Viewport 내 Dialog 이미지 배치가 필요하다');
assert.ok(css.includes('body.has-image-dialog') && css.includes('overflow: hidden'), 'Dialog 중 background scroll을 막아야 한다');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)') && css.includes('.rehearsal-image-grid { grid-template-columns: repeat(2'), 'motion/responsive 규칙이 필요하다');
console.log('연습일지 Gallery/Dialog 계약 테스트 통과');
