/** Rehearsal image processing and private Supabase Storage service. */
(function createRehearsalImageStorageService(global) {
  'use strict';

  const BUCKET = 'rehearsal-images';
  const MAX_FILE_SIZE = 8 * 1024 * 1024;
  const MAX_SELECTED_FILES = 6;
  const MAX_IMAGES_PER_LOG = 12;
  const MAX_LONG_EDGE = 2400;
  const OUTPUT_QUALITY = 0.82;
  const SIGNED_URL_TTL_SECONDS = 600;
  const ALLOWED_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
  const MIME_EXTENSIONS = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  });
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  const STORAGE_PATH_PATTERN = new RegExp(`^${UUID_SEGMENT}\/${UUID_SEGMENT}\/${UUID_SEGMENT}\/${UUID_SEGMENT}\\.(jpg|jpeg|png|webp)$`, 'i');

  class StorageServiceError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = 'StorageServiceError';
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  function serviceError(code, message, cause) {
    return new StorageServiceError(code, message, cause);
  }

  function assertUuid(value, label) {
    const normalized = String(value || '').trim();
    if (!UUID_PATTERN.test(normalized)) {
      throw serviceError('INVALID_PATH_INPUT', `${label || 'UUID'} 값이 올바르지 않습니다.`);
    }
    return normalized.toLowerCase();
  }

  function validateFileCount(selectedCount, existingCount) {
    const selected = Number(selectedCount);
    const existing = Number(existingCount);
    if (!Number.isInteger(selected) || selected < 0 || !Number.isInteger(existing) || existing < 0) {
      throw serviceError('TOO_MANY_FILES', '이미지 개수를 확인하지 못했습니다.');
    }
    if (selected > MAX_SELECTED_FILES) {
      throw serviceError('TOO_MANY_FILES', `한 번에 최대 ${MAX_SELECTED_FILES}장까지 선택할 수 있습니다.`);
    }
    if (selected + existing > MAX_IMAGES_PER_LOG) {
      throw serviceError('TOO_MANY_FILES', `연습일지에는 최대 ${MAX_IMAGES_PER_LOG}장까지 첨부할 수 있습니다.`);
    }
  }

  function validateImageFile(file) {
    if (!file || typeof file !== 'object') {
      throw serviceError('INVALID_TYPE', '이미지 파일을 확인하지 못했습니다.');
    }
    const type = String(file.type || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(type)) {
      throw serviceError('INVALID_TYPE', 'JPEG, PNG, WebP 이미지만 첨부할 수 있습니다.');
    }
    const size = Number(file.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw serviceError('IMAGE_DECODE_FAILED', '비어 있거나 읽을 수 없는 이미지입니다.');
    }
    if (size > MAX_FILE_SIZE) {
      throw serviceError('FILE_TOO_LARGE', '이미지 한 장의 크기는 8MB 이하여야 합니다.');
    }
    return file;
  }

  function validateSelectedFiles(files, existingCount) {
    const selected = Array.from(files || []);
    validateFileCount(selected.length, existingCount || 0);
    selected.forEach(validateImageFile);
    return selected;
  }

  function calculateTargetSize(width, height) {
    if (!(width > 0) || !(height > 0)) {
      throw serviceError('IMAGE_DECODE_FAILED', '이미지 크기를 확인하지 못했습니다.');
    }
    const longest = Math.max(width, height);
    const scale = longest > MAX_LONG_EDGE ? MAX_LONG_EDGE / longest : 1;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  function createImagePreview(file) {
    validateImageFile(file);
    if (!global.URL || typeof global.URL.createObjectURL !== 'function') {
      throw serviceError('IMAGE_PROCESS_FAILED', '이 브라우저에서는 이미지 미리보기를 만들 수 없습니다.');
    }
    return global.URL.createObjectURL(file);
  }

  function revokeImagePreview(url) {
    if (url && global.URL && typeof global.URL.revokeObjectURL === 'function') {
      global.URL.revokeObjectURL(url);
    }
  }

  async function decodeImage(file) {
    if (typeof global.createImageBitmap === 'function') {
      try {
        const bitmap = await global.createImageBitmap(file);
        return {
          drawable: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => { if (typeof bitmap.close === 'function') bitmap.close(); },
        };
      } catch (error) {
        // Some Safari versions expose createImageBitmap but reject otherwise
        // valid images. Fall through to the Image element decoder when present.
        if (!global.document || typeof global.Image !== 'function') {
          throw serviceError('IMAGE_DECODE_FAILED', '이미지를 읽지 못했습니다.', error);
        }
      }
    }

    if (!global.document || typeof global.Image !== 'function') {
      throw serviceError('IMAGE_DECODE_FAILED', '이 브라우저에서는 이미지를 읽을 수 없습니다.');
    }
    const previewUrl = createImagePreview(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new global.Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(serviceError('IMAGE_DECODE_FAILED', '이미지를 읽지 못했습니다.'));
        element.src = previewUrl;
      });
      return {
        drawable: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        cleanup: () => revokeImagePreview(previewUrl),
      };
    } catch (error) {
      revokeImagePreview(previewUrl);
      throw error && error.code ? error : serviceError('IMAGE_DECODE_FAILED', '이미지를 읽지 못했습니다.', error);
    }
  }

  function canvasToBlob(canvas, contentType) {
    return new Promise((resolve, reject) => {
      // PNG stays PNG to preserve transparency. JPEG and WebP are re-encoded
      // with quality 0.82. No image is enlarged beyond its original dimensions.
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(serviceError('IMAGE_PROCESS_FAILED', '이미지를 압축하지 못했습니다.'));
      }, contentType, contentType === 'image/png' ? undefined : OUTPUT_QUALITY);
    });
  }

  async function processImage(file) {
    validateImageFile(file);
    const decoded = await decodeImage(file);
    try {
      const target = calculateTargetSize(decoded.width, decoded.height);
      if (!global.document || typeof global.document.createElement !== 'function') {
        throw serviceError('IMAGE_PROCESS_FAILED', '이미지 처리 도구를 사용할 수 없습니다.');
      }
      const canvas = global.document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext && canvas.getContext('2d');
      if (!context) throw serviceError('IMAGE_PROCESS_FAILED', '이미지 처리 화면을 만들지 못했습니다.');
      context.drawImage(decoded.drawable, 0, 0, target.width, target.height);
      const contentType = String(file.type).toLowerCase();
      const blob = await canvasToBlob(canvas, contentType);
      if (blob.size > MAX_FILE_SIZE) {
        throw serviceError('FILE_TOO_LARGE', '처리된 이미지가 8MB를 초과합니다.');
      }
      return {
        blob,
        width: target.width,
        height: target.height,
        contentType,
        extension: MIME_EXTENSIONS[contentType],
      };
    } catch (error) {
      if (error && error.code) throw error;
      throw serviceError('IMAGE_PROCESS_FAILED', '이미지를 처리하지 못했습니다.', error);
    } finally {
      decoded.cleanup();
    }
  }

  function buildRehearsalImagePath({ productionId, rehearsalLogId, uploaderId, extension }) {
    const production = assertUuid(productionId, 'Production ID');
    const log = assertUuid(rehearsalLogId, 'Rehearsal Log ID');
    const uploader = assertUuid(uploaderId, 'Uploader ID');
    const ext = String(extension || '').toLowerCase().replace(/^\./, '') === 'jpeg'
      ? 'jpg'
      : String(extension || '').toLowerCase().replace(/^\./, '');
    if (!['jpg', 'png', 'webp'].includes(ext)) {
      throw serviceError('INVALID_TYPE', 'Storage 확장자가 허용되지 않습니다.');
    }
    if (!global.crypto || typeof global.crypto.randomUUID !== 'function') {
      throw serviceError('IMAGE_PROCESS_FAILED', '안전한 이미지 ID를 생성할 수 없습니다.');
    }
    return `${production}/${log}/${uploader}/${global.crypto.randomUUID().toLowerCase()}.${ext}`;
  }

  function assertStoragePath(path) {
    const normalized = String(path || '').trim();
    if (!STORAGE_PATH_PATTERN.test(normalized)) {
      throw serviceError('INVALID_PATH_INPUT', 'Storage 경로 형식이 올바르지 않습니다.');
    }
    return normalized;
  }

  async function getStorageBucket() {
    if (!global.SupabaseClientProvider) {
      throw serviceError('STORAGE_UPLOAD_FAILED', 'Supabase Storage 서비스를 불러오지 못했습니다.');
    }
    const client = await global.SupabaseClientProvider.getClient();
    return client.storage.from(BUCKET);
  }

  async function uploadRehearsalImage({ blob, path, contentType }) {
    validateImageFile(blob);
    const normalizedPath = assertStoragePath(path);
    const normalizedType = String(contentType || blob.type || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(normalizedType) || normalizedType !== String(blob.type || '').toLowerCase()) {
      throw serviceError('INVALID_TYPE', '이미지 MIME 정보가 올바르지 않습니다.');
    }
    try {
      const bucket = await getStorageBucket();
      const { data, error } = await bucket.upload(normalizedPath, blob, {
        contentType: normalizedType,
        upsert: false,
      });
      if (error) throw error;
      return { path: normalizedPath, data: data || null };
    } catch (error) {
      if (error && ['INVALID_TYPE', 'FILE_TOO_LARGE', 'INVALID_PATH_INPUT'].includes(error.code)) throw error;
      throw serviceError('STORAGE_UPLOAD_FAILED', '이미지를 업로드하지 못했습니다.', error);
    }
  }

  async function createSignedImageUrl(storagePath) {
    const path = assertStoragePath(storagePath);
    try {
      const bucket = await getStorageBucket();
      const { data, error } = await bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data || !data.signedUrl) throw error || new Error('Missing signed URL');
      return {
        signedUrl: data.signedUrl,
        expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      };
    } catch (error) {
      throw serviceError('SIGNED_URL_FAILED', '이미지를 표시할 URL을 만들지 못했습니다.', error);
    }
  }

  function refreshSignedImageUrl(storagePath) {
    return createSignedImageUrl(storagePath);
  }

  async function deleteRehearsalImage(storagePath) {
    const path = assertStoragePath(storagePath);
    try {
      const bucket = await getStorageBucket();
      const { data, error } = await bucket.remove([path]);
      if (error) throw error;
      return { path, data: data || null };
    } catch (error) {
      throw serviceError('STORAGE_DELETE_FAILED', '이미지를 삭제하지 못했습니다.', error);
    }
  }

  async function deleteRehearsalImages(storagePaths) {
    const paths = [...new Set(Array.from(storagePaths || []).map(assertStoragePath))];
    const results = [];
    // Delete individually so callers can stop a parent-log delete when even
    // one object fails, while retaining exact paths for a safe retry.
    for (const path of paths) {
      try {
        await deleteRehearsalImage(path);
        results.push({ status: 'success', path });
      } catch (error) {
        results.push({ status: 'failed', path, errorCode: error.code || 'STORAGE_DELETE_FAILED' });
      }
    }
    return results;
  }

  function buildImageMetadataPayload({
    rehearsalLogId,
    productionId,
    uploadedBy,
    storagePath,
    originalFilename,
    mimeType,
    fileSize,
    sortOrder,
  }) {
    const logId = assertUuid(rehearsalLogId, 'Rehearsal Log ID');
    const production = assertUuid(productionId, 'Production ID');
    const uploader = assertUuid(uploadedBy, 'Uploader ID');
    const path = assertStoragePath(storagePath);
    const filename = String(originalFilename || '').trim();
    const type = String(mimeType || '').toLowerCase();
    const size = Number(fileSize);
    const order = Number(sortOrder);
    if (!filename || filename.length > 1024) {
      throw serviceError('IMAGE_PROCESS_FAILED', '원본 파일명이 비어 있거나 너무 깁니다.');
    }
    if (!ALLOWED_MIME_TYPES.includes(type)) throw serviceError('INVALID_TYPE', '이미지 MIME 정보가 올바르지 않습니다.');
    if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_SIZE) {
      throw serviceError(size > MAX_FILE_SIZE ? 'FILE_TOO_LARGE' : 'IMAGE_PROCESS_FAILED', '이미지 크기 정보가 올바르지 않습니다.');
    }
    if (!Number.isInteger(order) || order < 0) {
      throw serviceError('IMAGE_PROCESS_FAILED', '이미지 순서 정보가 올바르지 않습니다.');
    }
    const expectedPrefix = `${production}/${logId}/${uploader}/`;
    if (!path.startsWith(expectedPrefix) || MIME_EXTENSIONS[type] !== path.split('.').pop().replace('jpeg', 'jpg')) {
      throw serviceError('INVALID_PATH_INPUT', 'Metadata와 Storage 경로가 일치하지 않습니다.');
    }
    return {
      rehearsal_log_id: logId,
      production_id: production,
      uploaded_by: uploader,
      storage_path: path,
      original_filename: filename,
      mime_type: type,
      file_size: size,
      sort_order: order,
    };
  }

  async function processAndUploadBatch({
    files,
    existingCount,
    productionId,
    rehearsalLogId,
    uploaderId,
    startSortOrder,
  }) {
    const selected = Array.from(files || []);
    validateFileCount(selected.length, existingCount || 0);
    const baseOrder = Number(startSortOrder || 0);
    if (!Number.isInteger(baseOrder) || baseOrder < 0) {
      throw serviceError('IMAGE_PROCESS_FAILED', '이미지 시작 순서가 올바르지 않습니다.');
    }

    const results = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      try {
        validateImageFile(file);
        const processed = await processImage(file);
        const path = buildRehearsalImagePath({
          productionId,
          rehearsalLogId,
          uploaderId,
          extension: processed.extension,
        });
        // Validate the future DB payload before uploading so a metadata error
        // cannot leave an avoidable orphaned Storage object.
        const metadata = buildImageMetadataPayload({
          rehearsalLogId,
          productionId,
          uploadedBy: uploaderId,
          storagePath: path,
          originalFilename: String(file.name || 'image'),
          mimeType: processed.contentType,
          fileSize: processed.blob.size,
          sortOrder: baseOrder + index,
        });
        await uploadRehearsalImage({ blob: processed.blob, path, contentType: processed.contentType });
        results.push({
          status: 'success',
          originalFilename: String(file.name || ''),
          storagePath: path,
          metadata,
        });
      } catch (error) {
        results.push({
          status: 'failed',
          originalFilename: String(file && file.name || ''),
          errorCode: String(error && error.code || 'IMAGE_PROCESS_FAILED'),
          message: String(error && error.message || '이미지를 처리하지 못했습니다.'),
        });
      }
    }
    return results;
  }

  global.RehearsalImageStorageService = Object.freeze({
    constants: Object.freeze({
      BUCKET,
      MAX_FILE_SIZE,
      MAX_SELECTED_FILES,
      MAX_IMAGES_PER_LOG,
      MAX_LONG_EDGE,
      OUTPUT_QUALITY,
      SIGNED_URL_TTL_SECONDS,
      ALLOWED_MIME_TYPES,
    }),
    StorageServiceError,
    validateImageFile,
    validateSelectedFiles,
    calculateTargetSize,
    processImage,
    createImagePreview,
    revokeImagePreview,
    buildRehearsalImagePath,
    uploadRehearsalImage,
    createSignedImageUrl,
    refreshSignedImageUrl,
    deleteRehearsalImage,
    deleteRehearsalImages,
    buildImageMetadataPayload,
    processAndUploadBatch,
  });
})(window);
