const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('storageService.js', 'utf8');
const uuids = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
];
let uuidIndex = 0;
const revoked = [];
const uploads = [];
const removals = [];
const encodes = [];
let storageFailure = null;
let failedDeletePath = '';
const fakeBucket = {
  async upload(path, blob, options) {
    if (storageFailure === 'upload') return { data: null, error: new Error('upload rejected') };
    uploads.push({ path, blob, options });
    return { data: { path }, error: null };
  },
  async createSignedUrl(path, seconds) {
    if (storageFailure === 'signed') return { data: null, error: new Error('signing rejected') };
    return { data: { signedUrl: 'https://signed.example/' + path + '?ttl=' + seconds }, error: null };
  },
  async remove(paths) {
    if (storageFailure === 'delete' || paths[0] === failedDeletePath) return { data: null, error: new Error('delete rejected') };
    removals.push(paths);
    return { data: paths.map(name => ({ name })), error: null };
  },
};
const browser = {
  console,
  Blob,
  Date,
  Error,
  TypeError,
  URL: {
    createObjectURL: () => 'blob:preview-1',
    revokeObjectURL: url => revoked.push(url),
  },
  crypto: { randomUUID: () => uuids[uuidIndex++ % uuids.length] },
  createImageBitmap: async file => {
    if (file.name === 'broken.jpg') throw new Error('decode failure');
    return { width: 4800, height: 2400, close() {} };
  },
  document: {
    createElement(tag) {
      assert.strictEqual(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(callback, type, quality) {
          encodes.push({ type, quality, width: this.width, height: this.height });
          callback(new Blob(['processed'], { type }));
        },
      };
    },
  },
  SupabaseClientProvider: {
    getClient: async () => ({ storage: { from: name => {
      assert.strictEqual(name, 'rehearsal-images');
      return fakeBucket;
    } } }),
  },
};
browser.window = browser;
vm.runInNewContext(source, browser, { filename: 'storage-service-browser.js' });
const service = browser.RehearsalImageStorageService;

function file(name, type, size = 1024) {
  return { name, type, size };
}

async function run() {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.strictEqual(service.validateImageFile(file('allowed', type)).type, type);
  }
  for (const [name, type] of [['photo.heic', 'image/heic'], ['photo.gif', 'image/gif'], ['shape.svg', 'image/svg+xml']]) {
    assert.throws(() => service.validateImageFile(file(name, type)), error => error.code === 'INVALID_TYPE');
  }
  assert.throws(
    () => service.validateImageFile(file('large.jpg', 'image/jpeg', 8 * 1024 * 1024 + 1)),
    error => error.code === 'FILE_TOO_LARGE',
  );
  assert.throws(
    () => service.validateSelectedFiles(Array.from({ length: 7 }, (_, i) => file(i + '.jpg', 'image/jpeg')), 0),
    error => error.code === 'TOO_MANY_FILES',
  );
  assert.throws(
    () => service.validateSelectedFiles(Array.from({ length: 3 }, (_, i) => file(i + '.png', 'image/png')), 10),
    error => error.code === 'TOO_MANY_FILES',
  );

  const productionId = '11111111-1111-4111-8111-111111111111';
  const logId = '22222222-2222-4222-8222-222222222222';
  const uploaderId = '33333333-3333-4333-8333-333333333333';
  const path = service.buildRehearsalImagePath({ productionId, rehearsalLogId: logId, uploaderId, extension: 'jpg' });
  assert.ok(path.startsWith(productionId + '/' + logId + '/' + uploaderId + '/'));
  assert.ok(!path.includes('original photo.jpg'), '원본 파일명이 path에 들어가면 안 된다');

  const payload = service.buildImageMetadataPayload({
    rehearsalLogId: logId,
    productionId,
    uploadedBy: uploaderId,
    storagePath: path,
    originalFilename: 'original photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1234,
    sortOrder: 2,
  });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(payload)),
    {
      rehearsal_log_id: logId,
      production_id: productionId,
      uploaded_by: uploaderId,
      storage_path: path,
      original_filename: 'original photo.jpg',
      mime_type: 'image/jpeg',
      file_size: 1234,
      sort_order: 2,
    },
  );

  const preview = service.createImagePreview(file('preview.png', 'image/png'));
  assert.strictEqual(preview, 'blob:preview-1');
  service.revokeImagePreview(preview);
  assert.deepStrictEqual(revoked, ['blob:preview-1']);

  const processedPng = await service.processImage(file('transparent.png', 'image/png'));
  assert.strictEqual(processedPng.contentType, 'image/png', 'PNG 투명도를 위해 PNG를 유지해야 한다');
  assert.strictEqual(processedPng.width, 2400);
  assert.strictEqual(processedPng.height, 1200);
  assert.strictEqual(encodes[0].quality, undefined);

  const processedJpeg = await service.processImage(file('photo.jpg', 'image/jpeg'));
  assert.strictEqual(processedJpeg.contentType, 'image/jpeg');
  assert.strictEqual(encodes[1].quality, 0.82);

  await service.uploadRehearsalImage({ blob: processedPng.blob, path: path.replace(/\.jpg$/, '.png'), contentType: 'image/png' });
  assert.strictEqual(uploads[0].options.upsert, false);
  assert.strictEqual(uploads[0].options.contentType, 'image/png');

  const signed = await service.createSignedImageUrl(path);
  assert.ok(signed.signedUrl.includes('ttl=600'));
  assert.ok(Date.parse(signed.expiresAt) > Date.now());
  const refreshed = await service.refreshSignedImageUrl(path);
  assert.ok(refreshed.signedUrl);

  await service.deleteRehearsalImage(path);
  assert.deepStrictEqual(Array.from(removals[0]), [path]);

  storageFailure = 'upload';
  await assert.rejects(
    service.uploadRehearsalImage({ blob: processedJpeg.blob, path, contentType: 'image/jpeg' }),
    error => error.code === 'STORAGE_UPLOAD_FAILED',
  );
  storageFailure = 'signed';
  await assert.rejects(service.createSignedImageUrl(path), error => error.code === 'SIGNED_URL_FAILED');
  storageFailure = 'delete';
  await assert.rejects(service.deleteRehearsalImage(path), error => error.code === 'STORAGE_DELETE_FAILED');
  storageFailure = null;

  failedDeletePath = path.replace('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg');
  const batchDelete = await service.deleteRehearsalImages([path, failedDeletePath]);
  assert.strictEqual(batchDelete[0].status, 'success');
  assert.strictEqual(batchDelete[1].status, 'failed');
  assert.strictEqual(batchDelete[1].errorCode, 'STORAGE_DELETE_FAILED');
  failedDeletePath = '';
  const retryDelete = await service.deleteRehearsalImages([failedDeletePath || path]);
  assert.strictEqual(retryDelete[0].status, 'success', '동일 path 삭제 재시도가 안전해야 한다');

  const batch = await service.processAndUploadBatch({
    files: [file('good.jpg', 'image/jpeg'), file('broken.jpg', 'image/jpeg')],
    existingCount: 0,
    productionId,
    rehearsalLogId: logId,
    uploaderId,
    startSortOrder: 0,
  });
  assert.strictEqual(batch[0].status, 'success');
  assert.strictEqual(batch[1].status, 'failed');
  assert.strictEqual(batch[1].errorCode, 'IMAGE_DECODE_FAILED');

  assert.strictEqual(service.constants.MAX_FILE_SIZE, 8388608);
  assert.strictEqual(service.constants.SIGNED_URL_TTL_SECONDS, 600);
  console.log('Rehearsal image Storage service tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
