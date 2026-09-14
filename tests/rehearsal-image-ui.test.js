const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');

assert.ok(html.indexOf('storageService.js?v=') < html.indexOf('app.js?v='), 'Storage service가 app.js보다 먼저 로드되어야 한다');
assert.ok(app.includes('accept="image/jpeg,image/png,image/webp" multiple'), '파일 input 형식 제한과 multiple이 필요하다');
assert.ok(app.includes('validateSelectedFiles(files, savedCount + pendingRehearsalImages.length)'), 'Service 누적 개수 검증이 필요하다');
assert.ok(app.includes('createImagePreview(file)') && app.includes('revokeImagePreview'), 'Preview 생성/해제가 필요하다');
assert.ok(app.includes("setPendingImageStatus(item, 'processing')") && app.includes("setPendingImageStatus(item, 'uploading')"), '처리/업로드 상태가 필요하다');
const submitFlow = app.slice(app.indexOf('const row = existing'), app.indexOf('const logData = {', app.indexOf('const row = existing')));
assert.ok(submitFlow.indexOf('createRehearsalLog({ productionId:') < submitFlow.indexOf('uploadPendingRehearsalImages(mapped)'), 'log-first 저장 순서여야 한다');
assert.ok(app.indexOf('uploadRehearsalImage({ blob: processed.blob') < app.indexOf('createRehearsalLogImage(metadata)'), 'Storage 후 metadata 순서여야 한다');
assert.ok(app.includes('orphan cleanup failed') && app.includes('deleteRehearsalImage(uploadedPath)'), 'metadata 실패 시 Storage cleanup이 필요하다');
assert.ok(app.includes('data-retry-image') && app.includes('data-remove-pending-image'), '부분 실패 재시도/제거 UI가 필요하다');
assert.ok(app.includes('data-image-move="saved-prev"') && app.includes('updateRehearsalLogImageOrder'), '저장 이미지 순서 변경이 필요하다');
assert.ok(app.includes('data-delete-saved-image') && app.indexOf('deleteRehearsalImage(image.storage_path)') < app.indexOf('deleteRehearsalLogImage(image.id)'), 'Storage 후 metadata 삭제 순서여야 한다');
assert.ok(app.includes('data-signed-image-path') && app.includes('refreshSignedImageUrl'), 'Signed URL 표시/재발급이 필요하다');
assert.ok(css.includes('.rehearsal-image-grid') && css.includes('repeat(2, minmax(0, 1fr))'), '반응형 이미지 grid가 필요하다');
assert.ok(css.includes('.visually-hidden') && app.includes('aria-label='), '키보드/스크린리더 접근성이 필요하다');
console.log('연습일지 이미지 UI 계약 테스트 통과');
