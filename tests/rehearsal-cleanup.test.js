const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('app.js', 'utf8');
const storage = fs.readFileSync('storageService.js', 'utf8');
const data = fs.readFileSync('dataService.js', 'utf8');

const individual = app.slice(app.indexOf('async function deleteSavedRehearsalImage'), app.indexOf('async function deleteSupabaseRehearsalLog'));
assert.ok(individual.indexOf('getRehearsalLogImageById(imageId)') < individual.indexOf('deleteRehearsalImage(image.storage_path)'), '개별 삭제는 metadata를 먼저 확인해야 한다');
assert.ok(individual.indexOf('deleteRehearsalImage(image.storage_path)') < individual.indexOf('deleteRehearsalLogImage(image.id)'), 'Storage 성공 후 metadata를 삭제해야 한다');
assert.ok(individual.includes("metadata.status === 'EMPTY'"), '이미 삭제된 metadata 재시도가 안전해야 한다');
assert.ok(individual.includes('rehearsalDeleteInFlight'), '개별 삭제 중복 요청 잠금이 필요하다');

const wholeLog = app.slice(app.indexOf('async function deleteSupabaseRehearsalLog'), app.indexOf('function renderPreShowChecklist'));
assert.ok(wholeLog.indexOf('getRehearsalLogImages(logId)') < wholeLog.indexOf('deleteRehearsalImages('), '전체 삭제는 image metadata를 먼저 읽어야 한다');
assert.ok(wholeLog.indexOf('deleteRehearsalImages(') < wholeLog.indexOf('deleteRehearsalLog(logId)'), '모든 Storage cleanup 후 log를 삭제해야 한다');
assert.ok(wholeLog.includes("cleanup.filter(result => result.status === 'failed')") && wholeLog.includes('STORAGE_CLEANUP_INCOMPLETE'), '부분 실패 시 log 삭제를 중단해야 한다');
assert.ok(wholeLog.includes("logResult.status === 'EMPTY'") && wholeLog.includes('rehearsalDeleteInFlight'), '전체 삭제 재시도/중복 방지가 필요하다');
assert.ok(wholeLog.includes('metadata cascade verification'), 'DB cascade 결과 확인이 필요하다');
assert.ok(storage.includes('async function deleteRehearsalImages') && storage.includes("results.push({ status: 'failed'"), 'path별 cleanup 결과가 필요하다');
assert.ok(data.includes('function getRehearsalLogImageById'), 'fresh metadata 조회 API가 필요하다');
assert.ok(app.includes('orphan cleanup failed') && app.includes('uploadedPath'), '업로드 metadata 실패 orphan 추적이 유지되어야 한다');
assert.ok(app.includes("btn.textContent = '삭제 중…'") && app.includes('btn.disabled = true'), '삭제 loading/중복 클릭 방지가 필요하다');
console.log('연습일지 이미지 삭제/Cleanup 계약 테스트 통과');
