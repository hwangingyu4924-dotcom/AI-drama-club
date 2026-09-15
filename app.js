/**
 * js/app.js
 * 공연 제작 업무자동화 — 화면 렌더링 · 데이터 연결 · 사용자 입력 처리
 *
 * 판단 규칙(제작 단계, 위험 검수 등)은 js/rules.js에 있습니다.
 * 이 파일은 그 규칙을 "화면에 어떻게 보여줄지"만 담당합니다.
 *
 * 데이터 흐름:
 *  1) 브라우저에 저장된 이전 작업(localStorage)이 있으면 그것을 사용한다.
 *  2) 없으면 data/performance.json, data/tasks.json을 불러와 시작값으로 쓴다.
 *  3) 이후 모든 입력·수정은 localStorage에 저장된다 (이 브라우저에만 저장됨).
 */

const LS_KEY = 'ppa-state-v1';
const REHEARSAL_LOGS_KEY = 'rehearsalLogs';
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

let state = {
  performance: {
    id: '',
    title: '',
    date: '',
    venue: '',
    venueInfo: '',
    projectStartDate: '',
    status: '준비중',
    parts: ['연출', '배우', '무대', '조명', '음향', '기획'],
    participants: [],
    rehearsalAvailability: '',
  },
  tasks: [],
  events: [],
};

let currentPartFilter = '전체';
let isPerformanceEditorOpen = false;
let isTaskFormOpen = false;
let currentView = 'home';
let isTopNavOpen = false;
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = todayStr;
let isEventFormOpen = false;
let editingEventId = null;
let rehearsalLogs = [];
let supabaseRehearsalLogs = [];
let activeSupabaseProduction = null;
let rehearsalSyncMessage = '';
let rehearsalWriteBusy = false;
let pendingRehearsalImages = [];
const rehearsalImagesByLog = new Map();
let rehearsalFormDraft = null;
let rehearsalImageDialog = null;
const rehearsalDeleteInFlight = new Set();
let rehearsalArchiveMode = 'list';
let selectedRehearsalLogId = null;
let rehearsalCategoryFilter = '전체';
let rehearsalSearchQuery = '';
let heroVideoAnimationFrame = null;
let heroVideoRestartTimer = null;
let authReady = false;
let authSession = null;
let authUser = null;
let authProfile = null;
let authProfileStatus = 'UNKNOWN';
let authMessage = '';
let authBusy = false;
let authListenerUnsubscribe = null;
let isLoginViewOpen = false;
let pendingProtectedView = null;
let legacyLocalTasks = [];
let usesSupabaseTasks = false;
let taskSyncMessage = '';
let taskWriteBusy = false;
const taskDeleteInFlight = new Set();
let legacyLocalEvents = [];
let usesSupabaseEvents = false;
let eventSyncMessage = '';
let eventWriteBusy = false;
const eventDeleteInFlight = new Set();
let authMode = 'login';
let productionAccessStatus = 'UNKNOWN';
let currentProductionRole = null;
const PUBLIC_ARCHIVE_SLUG = String(window.AI_DRAMA_CONFIG && window.AI_DRAMA_CONFIG.PUBLIC_ARCHIVE_SLUG || '').trim();
let publicArchiveState = createEmptyPublicArchiveState();

const EVENT_TYPES = ['연습', '회의', '리딩', '공연', '설치/기술', '기타'];
const REHEARSAL_CATEGORIES = ['전체연습', '연기', '연출', '무대', '회의', '기타'];

function createEmptyPublicArchiveState(status = 'UNKNOWN') {
  return {
    status,
    production: null,
    tasks: [],
    events: [],
    rehearsalLogs: [],
    imagesByLog: new Map(),
    error: null,
  };
}

function canWriteProduction() {
  return Boolean(authSession && productionAccessStatus === 'READY');
}

function canCreateTask() { return canWriteProduction(); }
function canEditTask() { return canWriteProduction(); }
function canManageRehearsal() { return canWriteProduction(); }
function canDeleteProductionContent() { return canWriteProduction() && currentProductionRole === 'ADMIN'; }

/* ---------------- 데이터 로드 / 저장 ---------------- */

function saveState() {
  try {
    const persistedState = {
      ...state,
      tasks: usesSupabaseTasks ? legacyLocalTasks : state.tasks,
      events: usesSupabaseEvents ? legacyLocalEvents : state.events,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(persistedState));
    setSaveStatus('저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSaveStatus('저장 실패 — 브라우저 저장공간을 확인하세요');
  }
}

function setSaveStatus(text) {
  const el = document.getElementById('save-status');
  if (el) el.textContent = text;
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.performance && Array.isArray(parsed.tasks)) {
      state = parsed;
      if (!Array.isArray(state.events)) state.events = [];
      return true;
    }
  } catch (e) { /* 저장된 값이 손상된 경우 무시하고 초기값 사용 */ }
  return false;
}

function loadRehearsalLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REHEARSAL_LOGS_KEY) || '[]');
    rehearsalLogs = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    rehearsalLogs = [];
  }
}

function saveRehearsalLogs() {
  try {
    localStorage.setItem(REHEARSAL_LOGS_KEY, JSON.stringify(rehearsalLogs));
    setSaveStatus('저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSaveStatus('저장 실패 — 브라우저 저장공간을 확인하세요');
  }
}

async function loadFromDataFiles() {
  try {
    const [perfRes, tasksRes] = await Promise.all([
      fetch('./performance.json'),
      fetch('./tasks.json'),
    ]);
    if (perfRes.ok) {
      const perf = await perfRes.json();
      state.performance = Object.assign({}, state.performance, perf);
    }
    if (tasksRes.ok) {
      const tasks = await tasksRes.json();
      if (Array.isArray(tasks)) state.tasks = tasks;
    }
    return true;
  } catch (e) {
    // file:// 로 직접 열면 fetch가 막힐 수 있음 — README 참고 (로컬 서버 필요)
    return false;
  }
}

/* ---------------- ID 생성 ---------------- */

function nextTaskId() {
  const nums = state.tasks
    .map(t => (t.taskId.match(/^TASK-(\d+)$/) || [])[1])
    .filter(Boolean)
    .map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return 'TASK-' + String(next).padStart(3, '0');
}

function nextEventId() {
  const nums = state.events
    .map(event => (String(event.id || '').match(/^EVENT-(\d+)$/) || [])[1])
    .filter(Boolean)
    .map(Number);
  return 'EVENT-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

function nextRehearsalLogId() {
  const nums = rehearsalLogs
    .map(log => (String(log.id || '').match(/^LOG-(\d+)$/) || [])[1])
    .filter(Boolean).map(Number);
  return 'LOG-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

/* ---------------- 초기화 ---------------- */

async function init() {
  renderAuthLoading();
  loadRehearsalLogs();
  const fromLocal = loadFromLocalStorage();
  if (!fromLocal) {
    const ok = await loadFromDataFiles();
    if (!ok) {
      setSaveStatus('⚠ data/*.json을 불러오지 못했습니다 (로컬 서버로 실행해 주세요) — 기본값으로 시작합니다');
    }
  }
  legacyLocalTasks = state.tasks.map(task => ({ ...task }));
  legacyLocalEvents = state.events.map(event => ({ ...event }));
  await initializeAuth();
  if (authSession) {
    await loadSupabaseRehearsalContext();
    await loadSupabaseTaskContext();
    await loadSupabaseEventContext();
  } else await loadPublicArchiveContext();
  authReady = true;
  render();
  if (authSession) startSupabaseReadProbe();
}

function renderAuthLoading() {
  const root = document.getElementById('app');
  root.innerHTML = `<main class="auth-shell"><div class="auth-panel"><span class="auth-kicker">JEONDAE THEATRE / PRODUCTION DESK</span><strong class="auth-wordmark">전대극회</strong><p class="auth-loading" role="status">세션을 확인하고 있습니다.</p></div></main>`;
}

async function initializeAuth() {
  if (!window.AuthService) {
    authMessage = '로그인 서비스를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    return;
  }
  try {
    if (!authListenerUnsubscribe) {
      authListenerUnsubscribe = await window.AuthService.onAuthStateChange((event, session) => {
        Promise.resolve().then(() => applyAuthSession(session, event));
      });
    }
    const restored = await window.AuthService.getSession();
    authSession = restored.session;
    authUser = restored.user;
    if (authSession) {
      authUser = await window.AuthService.getCurrentUser();
      await loadCurrentProfile();
    }
  } catch (error) {
    authSession = null;
    authUser = null;
    authProfile = null;
    authProfileStatus = 'FAIL';
    authMessage = error.message || '세션을 확인하지 못했습니다. 다시 로그인해 주세요.';
  }
}

async function applyAuthSession(session, event) {
  const wasSignedIn = Boolean(authSession);
  authSession = session || null;
  authUser = session && session.user || null;
  authMessage = '';
  if (authSession) {
    publicArchiveState = createEmptyPublicArchiveState();
    rehearsalArchiveMode = 'list';
    selectedRehearsalLogId = null;
    await loadCurrentProfile();
    await loadSupabaseRehearsalContext();
    await loadSupabaseTaskContext();
    await loadSupabaseEventContext();
    if (pendingProtectedView) currentView = pendingProtectedView;
    pendingProtectedView = null;
    isLoginViewOpen = false;
  } else {
    authProfile = null; authProfileStatus = 'UNKNOWN';
    activeSupabaseProduction = null; supabaseRehearsalLogs = [];
    usesSupabaseTasks = false; state.tasks = legacyLocalTasks.map(task => ({ ...task })); taskSyncMessage = '';
    usesSupabaseEvents = false; state.events = legacyLocalEvents.map(event => ({ ...event })); eventSyncMessage = '';
    rehearsalImagesByLog.clear();
    clearPendingRehearsalImages();
    rehearsalImageDialog = null;
    rehearsalArchiveMode = 'list';
    selectedRehearsalLogId = null;
    currentPartFilter = '전체';
    await loadPublicArchiveContext();
    pendingProtectedView = null;
    isLoginViewOpen = false;
  }
  if (!authReady) return;
  render();
  if (authSession && (!wasSignedIn || event === 'SIGNED_IN')) startSupabaseReadProbe();
}

async function loadCurrentProfile() {
  authProfile = null;
  if (!authUser || !window.SupabaseReadService) { authProfileStatus = 'FAIL'; return; }
  const result = await window.SupabaseReadService.getProfile(authUser.id);
  if (result.status === 'PASS' && result.data[0] && result.data[0].id === authUser.id) {
    authProfile = result.data[0];
    authProfileStatus = 'PASS';
  } else if (result.status === 'EMPTY') authProfileStatus = 'MISSING';
  else authProfileStatus = 'FAIL';
  console.info('[Supabase Auth] profile link:', authProfileStatus);
}

function mapSupabaseRehearsalLog(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author_display_name || row.author,
    authorDisplayName: row.author_display_name || row.author,
    date: row.rehearsal_date,
    category: row.category,
    content: row.content,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    productionId: row.production_id,
    authorProfileId: row.author_profile_id,
    source: 'supabase',
  };
}

function mapPublicArchiveProduction(row) {
  return {
    publicSlug: row.public_slug,
    title: row.title || '',
    date: row.performance_date || '',
    venue: row.venue || '',
    venueInfo: row.public_venue_info || '',
    projectStartDate: row.project_start_date || '',
    status: row.status || '준비중',
    parts: Array.isArray(row.parts) ? row.parts : [],
    rehearsalAvailability: row.public_rehearsal_summary || '',
  };
}

function mapPublicArchiveTask(row) {
  return {
    publicId: row.public_id,
    prerequisitePublicId: row.prerequisite_public_id || null,
    part: row.part || '',
    name: row.title || '',
    deadline: row.deadline || '',
    status: row.status || '대기',
    priority: row.priority || '보통',
    required: Boolean(row.required),
    preShowCheck: Boolean(row.pre_show_check),
  };
}

function mapPublicArchiveEvent(row) {
  const shortTime = value => value ? String(value).slice(0, 5) : '';
  return {
    publicId: row.public_id,
    title: row.title || '',
    date: row.event_date || '',
    startTime: shortTime(row.start_time),
    endTime: shortTime(row.end_time),
    type: row.category || '기타',
    part: row.part || '',
    publicLocation: row.public_location || '',
    publicDescription: row.public_description || '',
  };
}

function mapPublicArchiveRehearsalLog(row) {
  return {
    publicId: row.public_id,
    title: row.title || '',
    author: row.author_display_name || '전대극회 부원',
    date: row.rehearsal_date || '',
    category: row.category || '기타',
    content: row.content || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdDate: row.created_date || '',
    updatedDate: row.updated_date || '',
  };
}

async function loadPublicArchiveContext() {
  publicArchiveState = createEmptyPublicArchiveState('LOADING');
  const service = window.SupabaseDataService;
  if (!PUBLIC_ARCHIVE_SLUG || !service || typeof service.getPublicArchiveProduction !== 'function') {
    publicArchiveState = createEmptyPublicArchiveState('ERROR');
    publicArchiveState.error = 'PUBLIC_ARCHIVE_UNAVAILABLE';
    return;
  }
  try {
    const productionResult = await service.getPublicArchiveProduction(PUBLIC_ARCHIVE_SLUG);
    if (productionResult.status === 'EMPTY') {
      publicArchiveState = createEmptyPublicArchiveState('EMPTY');
      return;
    }
    if (productionResult.status !== 'PASS' || !productionResult.data || productionResult.data.length !== 1) {
      throw Object.assign(new Error('PUBLIC_ARCHIVE_READ_FAILED'), { code: productionResult.status });
    }
    const [taskResult, eventResult, rehearsalResult] = await Promise.all([
      service.getPublicArchiveTasks(PUBLIC_ARCHIVE_SLUG),
      service.getPublicArchiveEvents(PUBLIC_ARCHIVE_SLUG),
      service.getPublicArchiveRehearsalLogs(PUBLIC_ARCHIVE_SLUG),
    ]);
    for (const result of [taskResult, eventResult, rehearsalResult]) {
      if (!['PASS', 'EMPTY'].includes(result.status)) throw Object.assign(new Error('PUBLIC_ARCHIVE_READ_FAILED'), { code: result.status });
    }
    publicArchiveState = {
      status: 'READY',
      production: mapPublicArchiveProduction(productionResult.data[0]),
      tasks: (taskResult.data || []).map(mapPublicArchiveTask),
      events: (eventResult.data || []).map(mapPublicArchiveEvent),
      rehearsalLogs: (rehearsalResult.data || []).map(mapPublicArchiveRehearsalLog),
      imagesByLog: new Map(),
      error: null,
    };
  } catch (error) {
    publicArchiveState = createEmptyPublicArchiveState('ERROR');
    publicArchiveState.error = error.code || 'PUBLIC_ARCHIVE_READ_FAILED';
    console.warn('[Public Archive]', publicArchiveState.error);
  }
}

async function loadPublicArchiveRehearsalImages(rehearsalPublicId) {
  if (publicArchiveState.status !== 'READY' || !window.SupabaseDataService) return [];
  const result = await window.SupabaseDataService.getPublicArchiveRehearsalImages(PUBLIC_ARCHIVE_SLUG, rehearsalPublicId);
  if (!['PASS', 'EMPTY'].includes(result.status)) return [];
  const images = (result.data || []).map(row => ({
    publicId: row.image_public_id,
    rehearsalPublicId: row.rehearsal_public_id,
    sortOrder: Number(row.sort_order) || 0,
    deliveryUrl: window.SupabaseDataService.buildPublicRehearsalImageUrl(
      PUBLIC_ARCHIVE_SLUG,
      row.rehearsal_public_id,
      row.image_public_id
    ),
    deliveryStatus: 'ready',
  }));
  publicArchiveState.imagesByLog.set(rehearsalPublicId, images);
  return images;
}

function clearPendingRehearsalImages() {
  if (window.RehearsalImageStorageService) {
    pendingRehearsalImages.forEach(item => window.RehearsalImageStorageService.revokeImagePreview(item.previewUrl));
  }
  pendingRehearsalImages = [];
}

function captureRehearsalFormDraft() {
  const form = document.getElementById('rehearsal-log-form');
  if (!form) return;
  rehearsalFormDraft = {
    title: document.getElementById('r-title').value,
    author: document.getElementById('r-author').value,
    authorDisplayName: document.getElementById('r-author').value,
    date: document.getElementById('r-date').value,
    category: form.querySelector('[name="rehearsal-category"]:checked').value,
    content: document.getElementById('r-content').value,
    tags: document.getElementById('r-tags').value.split(/[\s,]+/).map(tag => tag.replace(/^#+/, '').trim()).filter(Boolean),
  };
}

function imageStatusLabel(status) {
  return ({ ready: '준비', processing: '처리 중', uploading: '업로드 중', complete: '완료', failed: '실패' })[status] || '준비';
}

async function loadRehearsalImages(logId) {
  if (!window.SupabaseDataService || !window.RehearsalImageStorageService) return [];
  const result = await window.SupabaseDataService.getRehearsalLogImages(logId);
  if (result.status !== 'PASS' && result.status !== 'EMPTY') {
    rehearsalSyncMessage = '첨부 이미지를 불러오지 못했습니다.';
    return [];
  }
  const orderedRows = (result.data || []).slice().sort((a, b) =>
    Number(a.sort_order) - Number(b.sort_order)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id))
  );
  const images = await Promise.all(orderedRows.map(async image => {
    try {
      return { ...image, ...(await window.RehearsalImageStorageService.createSignedImageUrl(image.storage_path)), signedStatus: 'ready' };
    } catch (error) {
      console.warn('[Rehearsal Image] signed URL failed', image.id, error.code || 'SIGNED_URL_FAILED');
      return { ...image, signedUrl: '', expiresAt: '', signedStatus: 'failed' };
    }
  }));
  rehearsalImagesByLog.set(logId, images);
  return images;
}

function rehearsalImageAlt(log, index) {
  return `${log.title || '연습일지'} 이미지 ${index + 1}`;
}

async function ensureFreshRehearsalImageUrl(image) {
  const expiresSoon = !image.signedUrl || !image.expiresAt || Date.parse(image.expiresAt) <= Date.now() + 60000;
  if (!expiresSoon) return image;
  try {
    Object.assign(image, await window.RehearsalImageStorageService.refreshSignedImageUrl(image.storage_path), { signedStatus: 'ready' });
  } catch (error) {
    image.signedStatus = 'failed';
    console.warn('[Rehearsal Image] signed URL refresh failed', image.id, error.code || 'SIGNED_URL_FAILED');
  }
  return image;
}

function renderRehearsalImageItems(log, editable) {
  const saved = log && log.source === 'supabase' ? (rehearsalImagesByLog.get(log.id) || []) : [];
  const pending = editable ? pendingRehearsalImages : [];
  if (!saved.length && !pending.length) return '';
  const savedMarkup = saved.map((image, index) => `<figure class="rehearsal-image-item" data-saved-image="${attr(image.id)}">
    ${image.signedUrl ? (editable ? `<img src="${attr(image.signedUrl)}" data-signed-image-path="${attr(image.storage_path)}" alt="${attr(rehearsalImageAlt(log, index))}" loading="lazy">` : `<button type="button" class="rehearsal-gallery-thumb" data-open-image-dialog="${attr(image.id)}" aria-label="${attr(rehearsalImageAlt(log, index))} 크게 보기"><img src="${attr(image.signedUrl)}" data-signed-image-path="${attr(image.storage_path)}" alt="${attr(rehearsalImageAlt(log, index))}" loading="lazy"></button>`) : '<div class="rehearsal-image-unavailable">이미지를 불러오지 못했습니다.</div>'}
    ${editable ? `<figcaption><span class="rehearsal-image-name">${escapeHtml(image.original_filename)}</span><span class="rehearsal-image-status">저장됨</span><span class="rehearsal-image-actions"><button type="button" class="ghost" data-image-move="saved-prev" data-image-id="${attr(image.id)}" aria-label="${attr(image.original_filename)} 앞으로 이동" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" class="ghost" data-image-move="saved-next" data-image-id="${attr(image.id)}" aria-label="${attr(image.original_filename)} 뒤로 이동" ${index === saved.length - 1 ? 'disabled' : ''}>→</button><button type="button" class="danger" data-delete-saved-image="${attr(image.id)}" aria-label="${attr(image.original_filename)} 삭제">삭제</button></span></figcaption>` : ''}
  </figure>`).join('');
  const pendingMarkup = pending.map((item, index) => `<figure class="rehearsal-image-item is-${attr(item.status)}" data-pending-image="${attr(item.localId)}">
    <img src="${attr(item.previewUrl)}" alt="업로드 전 미리보기: ${attr(item.file.name)}">
    <figcaption><span class="rehearsal-image-name">${escapeHtml(item.file.name)}</span><span class="rehearsal-image-status" role="status">${imageStatusLabel(item.status)}${item.message ? ` · ${escapeHtml(item.message)}` : ''}</span><span class="rehearsal-image-actions"><button type="button" class="ghost" data-image-move="pending-prev" data-image-id="${attr(item.localId)}" aria-label="${attr(item.file.name)} 앞으로 이동" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" class="ghost" data-image-move="pending-next" data-image-id="${attr(item.localId)}" aria-label="${attr(item.file.name)} 뒤로 이동" ${index === pending.length - 1 ? 'disabled' : ''}>→</button>${item.status === 'failed' && log ? `<button type="button" class="ghost" data-retry-image="${attr(item.localId)}">다시 시도</button>` : ''}<button type="button" class="danger" data-remove-pending-image="${attr(item.localId)}" aria-label="${attr(item.file.name)} 제거">제거</button></span></figcaption>
  </figure>`).join('');
  return `<div class="rehearsal-image-grid">${savedMarkup}${pendingMarkup}</div>`;
}

function renderRehearsalImageDialog() {
  if (!rehearsalImageDialog) return '';
  const isPublic = Boolean(rehearsalImageDialog.isPublic && !authSession);
  const log = isPublic ? findPublicRehearsalLog(rehearsalImageDialog.logId) : findRehearsalLogById(rehearsalImageDialog.logId);
  const images = isPublic
    ? (publicArchiveState.imagesByLog.get(rehearsalImageDialog.logId) || [])
    : (rehearsalImagesByLog.get(rehearsalImageDialog.logId) || []);
  if (!log || !images.length) return '';
  const index = Math.max(0, Math.min(rehearsalImageDialog.index, images.length - 1));
  const image = images[index];
  const imageUrl = isPublic ? image.deliveryUrl : image.signedUrl;
  const imageFailed = isPublic ? image.deliveryStatus === 'failed' : image.signedStatus === 'failed';
  return `<div class="image-dialog-backdrop" data-image-dialog-backdrop>
    <section class="image-dialog" role="dialog" aria-modal="true" aria-label="${attr(log.title)} 이미지 확대 보기" tabindex="-1">
      <header class="image-dialog-header"><span aria-live="polite">${index + 1} / ${images.length}</span><button type="button" data-image-dialog-close aria-label="이미지 확대 보기 닫기">닫기 ×</button></header>
      <div class="image-dialog-stage">
        ${imageUrl && !imageFailed ? `<img src="${attr(imageUrl)}" data-dialog-image ${isPublic ? `data-public-image data-public-image-id="${attr(image.publicId)}"` : `data-signed-image-path="${attr(image.storage_path)}"`} alt="${attr(rehearsalImageAlt(log, index))}">` : '<p class="image-dialog-error" role="status">이미지를 불러오지 못했습니다.</p>'}
      </div>
      <footer class="image-dialog-controls">
        <button type="button" data-image-dialog-prev aria-label="이전 이미지" ${images.length === 1 ? 'disabled' : ''}>← 이전</button>
        <button type="button" data-image-dialog-next aria-label="다음 이미지" ${images.length === 1 ? 'disabled' : ''}>다음 →</button>
      </footer>
    </section>
  </div>`;
}

async function showRehearsalImageDialog(logId, imageId) {
  const isPublic = !authSession;
  const images = isPublic ? (publicArchiveState.imagesByLog.get(logId) || []) : (rehearsalImagesByLog.get(logId) || []);
  const index = images.findIndex(image => (isPublic ? image.publicId : image.id) === imageId);
  if (index < 0) return;
  if (!isPublic) await ensureFreshRehearsalImageUrl(images[index]);
  rehearsalImageDialog = { logId, index, restoreImageId: imageId, isPublic };
  render();
}

function closeRehearsalImageDialog() {
  if (!rehearsalImageDialog) return;
  const restoreImageId = rehearsalImageDialog.restoreImageId;
  rehearsalImageDialog = null;
  render();
  document.querySelector(`[data-open-image-dialog="${restoreImageId}"]`)?.focus();
}

async function stepRehearsalImageDialog(direction) {
  if (!rehearsalImageDialog) return;
  const isPublic = Boolean(rehearsalImageDialog.isPublic && !authSession);
  const images = isPublic
    ? (publicArchiveState.imagesByLog.get(rehearsalImageDialog.logId) || [])
    : (rehearsalImagesByLog.get(rehearsalImageDialog.logId) || []);
  if (images.length < 2) return;
  rehearsalImageDialog.index = (rehearsalImageDialog.index + direction + images.length) % images.length;
  if (!isPublic) await ensureFreshRehearsalImageUrl(images[rehearsalImageDialog.index]);
  render();
}

async function loadSupabaseRehearsalContext() {
  if (!window.SupabaseDataService || !authSession) return;
  try {
    try {
      activeSupabaseProduction = await window.SupabaseDataService.resolveActiveProduction();
    } catch (error) {
      if (error.code !== 'NO_ACTIVE_PRODUCTION') throw error;
      await window.SupabaseDataService.ensureCurrentProductionMembership();
      activeSupabaseProduction = await window.SupabaseDataService.resolveActiveProduction();
    }
    const membershipResult = await window.SupabaseDataService.getProductionMembers(activeSupabaseProduction.id);
    const membership = (membershipResult.data || []).find(member => member.profile_id === authUser.id);
    if (!membership) throw Object.assign(new Error('NO_ACTIVE_PRODUCTION'), { code: 'NO_ACTIVE_PRODUCTION' });
    currentProductionRole = membership.role;
    productionAccessStatus = 'READY';
    const result = await window.SupabaseDataService.getRehearsalLogs(activeSupabaseProduction.id);
    if (result.status !== 'PASS' && result.status !== 'EMPTY') throw Object.assign(new Error('READ_FAILED'), { code: result.status });
    supabaseRehearsalLogs = (result.data || []).map(mapSupabaseRehearsalLog);
    rehearsalSyncMessage = '';
  } catch (error) {
    activeSupabaseProduction = null;
    currentProductionRole = null;
    productionAccessStatus = 'ERROR';
    supabaseRehearsalLogs = [];
    rehearsalSyncMessage = error.code === 'NO_ACTIVE_PRODUCTION'
      ? '연결된 Production을 확인해 주세요.'
      : '공유 연습일지를 불러오지 못했습니다. 기존 로컬 기록은 그대로 유지됩니다.';
    console.warn('[Supabase Rehearsal]', error.code || 'READ_FAILED');
  }
}

function mapSupabaseTask(row) {
  return {
    taskId: row.id,
    legacyId: row.legacy_id,
    productionId: row.production_id,
    part: row.part,
    name: row.name,
    assignee: row.assignee || '',
    deadline: row.deadline || '',
    status: row.status,
    priority: row.priority,
    prereqTaskId: row.prerequisite_task_id || null,
    required: Boolean(row.required),
    preShowCheck: Boolean(row.pre_show_check),
    source: 'supabase',
  };
}

async function loadSupabaseTaskContext() {
  if (!window.SupabaseDataService || !authSession) return;
  try {
    const production = activeSupabaseProduction || await window.SupabaseDataService.resolveActiveProduction();
    activeSupabaseProduction = production;
    const result = await window.SupabaseDataService.getTasks(production.id);
    if (result.status !== 'PASS' && result.status !== 'EMPTY') throw Object.assign(new Error('READ_FAILED'), { code: result.status });
    state.tasks = (result.data || []).map(mapSupabaseTask);
    usesSupabaseTasks = true;
    taskSyncMessage = '';
  } catch (error) {
    usesSupabaseTasks = true;
    state.tasks = [];
    taskSyncMessage = '공유 업무를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    console.warn('[Supabase Tasks]', error.code || 'READ_FAILED');
  }
}

function mapSupabaseEvent(row) {
  const shortTime = value => value ? String(value).slice(0, 5) : '';
  return {
    id: row.id,
    legacyId: row.legacy_id,
    productionId: row.production_id,
    title: row.title,
    date: row.event_date,
    startTime: shortTime(row.start_time),
    endTime: shortTime(row.end_time),
    type: row.type,
    part: row.part || '',
    location: row.location || '',
    memo: row.memo || '',
    source: 'supabase',
  };
}

async function loadSupabaseEventContext() {
  if (!window.SupabaseDataService || !authSession) return;
  try {
    const production = activeSupabaseProduction || await window.SupabaseDataService.resolveActiveProduction();
    activeSupabaseProduction = production;
    const result = await window.SupabaseDataService.getEvents(production.id);
    if (result.status !== 'PASS' && result.status !== 'EMPTY') throw Object.assign(new Error('READ_FAILED'), { code: result.status });
    state.events = (result.data || []).map(mapSupabaseEvent);
    usesSupabaseEvents = true;
    eventSyncMessage = '';
  } catch (error) {
    usesSupabaseEvents = true;
    state.events = [];
    eventSyncMessage = '공유 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    console.warn('[Supabase Events]', error.code || 'READ_FAILED');
  }
}

/* Phase 1: Supabase는 READ 연결만 검증한다. UI state와 저장은 localStorage가 계속 담당한다. */
function startSupabaseReadProbe() {
  if (!window.SupabaseReadService || typeof window.SupabaseReadService.probeReads !== 'function') return;
  window.SupabaseReadService.probeReads().then(result => {
    window.__SUPABASE_READ_RESULT__ = result;
    const summary = Object.fromEntries(Object.entries(result.reads || {}).map(([table, read]) => [table, read.status]));
    console.info('[Supabase READ]', { client: result.client, session: result.session.status, tables: summary });
  }).catch(error => {
    window.__SUPABASE_READ_RESULT__ = { client: 'FAIL', error: { code: error.code || '', message: error.message } };
    console.warn('[Supabase READ] 연결 검증 실패 — localStorage UI는 계속 동작합니다.', error.message);
  });
}

/* ---------------- 렌더링 ---------------- */

function render() {
  destroyHeroVideoLoop();
  const root = document.getElementById('app');
  if (!authReady) { renderAuthLoading(); return; }
  const p = state.performance;
  const dDay = getDaysUntil(p.date, todayStr);
  const stage = getStage(dDay);
  const risks = computeRisks(p, state.tasks, todayStr);

  root.innerHTML = `
    <div class="app-shell">
      ${renderTopNavigation()}
      <main class="app-main">
        ${isLoginViewOpen && !authSession ? renderLoginView() : renderCurrentView(p, dDay, stage, risks)}
        ${renderFooter()}
      </main>
      ${renderRehearsalImageDialog()}
    </div>
  `;

  document.body?.classList.toggle('has-image-dialog', Boolean(rehearsalImageDialog));
  bindEvents();
  if (isLoginViewOpen && !authSession) bindLoginEvents();
  if (currentView === 'home' && !isLoginViewOpen) initHeroVideoLoop();
  if (rehearsalImageDialog) document.querySelector('[data-image-dialog-close]')?.focus();
}

function renderLoginView() {
  const isSignup = authMode === 'signup';
  return `<section class="auth-shell auth-view-shell">
    <section class="auth-panel" aria-labelledby="auth-title">
      <span class="auth-kicker">JEONDAE THEATRE / PRODUCTION DESK</span>
      <h1 id="auth-title" class="auth-wordmark">전대극회</h1>
      <p class="auth-intro">${isSignup ? '부원 계정을 만들고 현재 공연 제작에 참여하세요.' : '공연 제작 기록을 관리하려면 부원 계정으로 로그인하세요.'}</p>
      <form id="auth-login-form" class="auth-form">
        ${isSignup ? '<div class="field"><label for="auth-name">이름</label><input id="auth-name" name="displayName" type="text" autocomplete="name" required></div>' : ''}
        <div class="field"><label for="auth-email">이메일</label><input id="auth-email" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" autocomplete="current-password" required></div>
        ${isSignup ? '<div class="field"><label for="auth-password-confirm">비밀번호 확인</label><input id="auth-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" required></div>' : ''}
        <p id="auth-error" class="auth-error" role="alert" aria-live="polite">${escapeHtml(authMessage)}</p>
        <button type="submit" class="auth-submit" ${authBusy ? 'disabled' : ''}>${authBusy ? '확인 중…' : (isSignup ? '회원가입' : '로그인')}</button>
      </form>
      <button type="button" class="auth-mode-toggle" data-auth-mode="${isSignup ? 'login' : 'signup'}">${isSignup ? '이미 계정이 있습니다 · 로그인' : '처음 오셨나요? · 회원가입'}</button>
    </section>
  </section>`;
}

function bindLoginEvents() {
  const form = document.getElementById('auth-login-form');
  if (!form) return;
  form.onsubmit = async event => {
    event.preventDefault();
    if (authBusy) return;
    const email = form.email.value.trim();
    const password = form.password.value;
    authBusy = true; authMessage = ''; render();
    try {
      if (authMode === 'signup') {
        if (password !== form.passwordConfirm.value) throw Object.assign(new Error('비밀번호가 일치하지 않습니다.'), { code: 'VALIDATION_ERROR' });
        const signup = await window.AuthService.signUp(form.displayName.value, email, password);
        if (!signup.session || !signup.user) {
          authMode = 'login'; authBusy = false;
          authMessage = '회원가입은 처리되었지만 로그인 세션이 생성되지 않아 자동 참여를 진행하지 않았습니다.';
          render(); return;
        }
        authSession = signup.session; authUser = signup.user;
      } else {
        const result = await window.AuthService.signIn(email, password);
        authSession = result.session; authUser = result.user;
      }
      await loadCurrentProfile();
      await loadSupabaseRehearsalContext();
      await loadSupabaseTaskContext();
      await loadSupabaseEventContext();
      if (pendingProtectedView) currentView = pendingProtectedView;
      pendingProtectedView = null;
      isLoginViewOpen = false;
      authBusy = false; render(); startSupabaseReadProbe();
    } catch (error) {
      authBusy = false;
      authMessage = error.message || '로그인하지 못했습니다.';
      render();
      document.getElementById('auth-email')?.focus();
    }
  };
  document.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.onclick = () => { authMode = button.dataset.authMode; authMessage = ''; render(); document.getElementById(authMode === 'signup' ? 'auth-name' : 'auth-email')?.focus(); };
  });
}

function renderTopNavigation() {
  const navigation = [
    ['home', 'HOME'], ['performance', '공연 정보'], ['production', '제작 현황'], ['tasks', '전체 업무'], ['calendar', '일정'], ['rehearsal', '연습일지'], ['preshow', '공연 전 체크'],
  ];
  return `<header class="top-shell-header">
    <div class="top-shell-nav-wrap">
      <button type="button" class="top-shell-wordmark" data-view="home">전대극회</button>
      <button type="button" class="top-shell-menu-toggle" data-topnav-toggle aria-expanded="${isTopNavOpen}" aria-controls="top-shell-navigation"><span>MENU</span><i aria-hidden="true"></i></button>
      <nav id="top-shell-navigation" class="top-shell-navigation ${isTopNavOpen ? 'is-open' : ''}" aria-label="주요 메뉴">
        ${navigation.map(([view, label]) => `<button type="button" data-view="${view}" class="${currentView === view ? 'is-active' : ''}" ${currentView === view ? 'aria-current="page"' : ''}>${label}</button>`).join('')}
      </nav>
      <div class="top-shell-actions">
        ${authSession ? `${canCreateTask() ? '<button type="button" class="top-shell-new-task" data-new-task>+ 새 업무</button>' : ''}
        <div class="top-shell-account">
          <span class="top-shell-account-name" title="${attr(authUser && authUser.email || '')}">${escapeHtml(authProfile && authProfile.display_name || (authUser && authUser.email ? authUser.email.split('@')[0] : 'Account'))}${currentProductionRole ? ` · ${escapeHtml(currentProductionRole)}` : ''}</span>
          <button type="button" class="top-shell-logout" data-auth-logout>로그아웃</button>
        </div>` : `<button type="button" class="top-shell-login" data-auth-login>로그인</button>`}
      </div>
    </div>
  </header>`;
}

function renderCurrentView(p, dDay, stage, risks) {
  if (!authSession) {
    if (currentView === 'home') return renderPublicHome();
    if (publicArchiveState.status !== 'READY') return renderPublicArchiveUnavailable();
    return renderPublicArchiveView(currentView);
  }
  if (authSession && productionAccessStatus === 'ERROR' && currentView !== 'home') return renderMembershipErrorView();
  if (currentView === 'performance') return renderViewPage('performance', renderPerformanceForm(p, true));
  if (currentView === 'production') return renderViewPage('production', renderDashboard(p, stage) + renderRisks(risks));
  if (currentView === 'tasks') return renderViewPage('tasks', renderTaskForm(p) + renderTaskTable(p));
  if (currentView === 'calendar') return renderViewPage('calendar', renderCalendar(p));
  if (currentView === 'rehearsal') return renderViewPage('rehearsal', renderRehearsalArchive(p));
  if (currentView === 'preshow') return renderViewPage('preshow', renderPreShowChecklist());
  return authSession && productionAccessStatus === 'READY' ? renderHomeDashboard(p, dDay, stage, risks) : renderPublicHome();
}

function renderPublicHome() {
  return `<section class="motion-hero public-motion-hero" aria-labelledby="motion-hero-title">
    <div class="hero-video-stage" aria-hidden="true">
      <video id="motion-hero-video" class="motion-hero-video" muted playsinline preload="metadata"><source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4" type="video/mp4"></video>
      <div class="hero-video-overlay"></div>
    </div>
    <div class="motion-hero-foreground">
      <div class="motion-hero-copy">
        <span class="hero-production-label fade-rise">JEONDAE THEATRE / PRODUCTION ARCHIVE</span>
        <h1 id="motion-hero-title" class="fade-rise-delay"><span>전대극회</span><em>무대에 오르기 전부터.</em></h1>
        <p class="hero-description fade-rise-delay-2">공연 제작 과정은 누구나 열람할 수 있고,<br>부원은 로그인 후 기록과 업무를 관리합니다.</p>
        <div class="hero-actions fade-rise-delay-2"><button type="button" class="hero-dashboard-cta" data-auth-login>부원 로그인</button></div>
      </div>
      <div class="hero-footnote fade-rise-delay-2"><span>JEONDAE THEATRE ARCHIVE</span><span>EST. 1980</span></div>
    </div>
  </section>`;
}

function renderPublicArchiveUnavailable() {
  const isError = publicArchiveState.status === 'ERROR';
  return `<section class="protected-view public-archive-unavailable" aria-labelledby="public-archive-unavailable-title">
    <p class="auth-kicker">PUBLIC PRODUCTION ARCHIVE</p>
    <h1 id="public-archive-unavailable-title">현재 공개된 공연 아카이브가 없습니다.</h1>
    <p>${isError ? '아카이브를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.' : '공개 준비가 완료되면 이 곳에서 제작 과정과 기록을 볼 수 있습니다.'}</p>
  </section>`;
}

function renderReadOnlyLabel() {
  return '<p class="public-read-only"><span aria-hidden="true">●</span> 읽기 전용 · PUBLIC ARCHIVE</p>';
}

function renderPublicArchiveView(view) {
  const production = publicArchiveState.production;
  if (view === 'performance') return renderViewPage('performance', renderReadOnlyLabel() + renderPublicPerformance(production));
  if (view === 'production') return renderViewPage('production', renderReadOnlyLabel() + renderPublicDashboard(production, publicArchiveState.tasks));
  if (view === 'tasks') return renderViewPage('tasks', renderReadOnlyLabel() + renderPublicTaskTable(production, publicArchiveState.tasks));
  if (view === 'calendar') return renderViewPage('calendar', renderReadOnlyLabel() + renderCalendar(production, { readOnly: true, tasks: publicArchiveState.tasks, events: publicArchiveState.events }));
  if (view === 'rehearsal') return renderViewPage('rehearsal', renderReadOnlyLabel() + renderPublicRehearsalArchive());
  if (view === 'preshow') return renderViewPage('preshow', renderReadOnlyLabel() + renderPublicPreShowChecklist(publicArchiveState.tasks));
  return renderPublicHome();
}

function renderPublicPerformance(p) {
  const fields = [
    ['작품', p.title || '미정'], ['공연일', formatDisplayDate(p.date) || '미정'],
    ['공연장', p.venue || '미정'], ['프로젝트 시작일', formatDisplayDate(p.projectStartDate) || '미정'],
    ['현재 상태', p.status || '준비중'],
  ];
  if (p.venueInfo) fields.push(['공연장 안내', p.venueInfo]);
  if (p.rehearsalAvailability) fields.push(['연습 안내', p.rehearsalAvailability]);
  return `<section class="section section-performance public-performance" id="section-setup">
    <div class="performance-summary"><dl>${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></div>
    <div class="public-production-parts"><h3>제작 파트</h3><div class="chip-row">${p.parts.length ? p.parts.map(part => `<span class="chip">${escapeHtml(part)}</span>`).join('') : '<span class="text-faint">공개된 파트가 없습니다.</span>'}</div></div>
  </section>`;
}

function getPublicDashboardData(p, tasks) {
  const incomplete = tasks.filter(task => task.status !== '완료');
  const completed = tasks.length - incomplete.length;
  const byPart = Object.fromEntries((p.parts || []).map(part => [part, { total: 0, done: 0 }]));
  tasks.forEach(task => {
    const part = task.part || '기타';
    if (!byPart[part]) byPart[part] = { total: 0, done: 0 };
    byPart[part].total += 1;
    if (task.status === '완료') byPart[part].done += 1;
  });
  const statusCounts = Object.fromEntries(TASK_STATUS.map(status => [status, tasks.filter(task => task.status === status).length]));
  return { incomplete, completed, byPart, statusCounts };
}

function renderPublicDashboard(p, tasks) {
  const summary = getPublicDashboardData(p, tasks);
  const progress = tasks.length ? Math.round((summary.completed / tasks.length) * 100) : 0;
  return `<section class="section section-dashboard public-dashboard" id="section-dashboard">
    <div class="stat-cards">
      <div class="stat"><div class="val">${tasks.length}</div><div class="lbl">전체 업무</div></div>
      <div class="stat"><div class="val">${summary.completed}</div><div class="lbl">완료</div></div>
      <div class="stat"><div class="val">${summary.incomplete.length}</div><div class="lbl">미완료</div></div>
      <div class="stat"><div class="val">${progress}%</div><div class="lbl">전체 진행률</div></div>
    </div>
    <div class="grid2"><div><h3>파트별 진행률</h3>${renderPartStatus(summary.byPart)}</div>
    <div><h3>상태별 업무</h3>${Object.entries(summary.statusCounts).map(([status, count]) => `<div class="check-item"><span class="badge ${attr(status)}">${escapeHtml(status)}</span><span class="grow">${count}건</span></div>`).join('')}</div></div>
  </section>`;
}

function renderPublicTaskTable(p, tasks) {
  const parts = ['전체', ...(p.parts || [])];
  const filtered = currentPartFilter === '전체' ? tasks : tasks.filter(task => task.part === currentPartFilter);
  return `<section class="section task-ledger public-task-ledger" id="section-tasks">
    <div class="chip-row public-task-filters">${parts.map(part => `<button type="button" class="small ${currentPartFilter === part ? '' : 'ghost'}" data-filter-part="${attr(part)}">${escapeHtml(part)}</button>`).join('')}</div>
    ${filtered.length ? `<div class="table-scroll"><table><thead><tr><th>업무명</th><th>담당 파트</th><th>마감일</th><th>상태</th><th>우선순위</th><th>필수</th><th>공연 전 체크</th></tr></thead><tbody>
      ${filtered.map(task => `<tr><td>${escapeHtml(task.name)}</td><td>${escapeHtml(task.part)}</td><td class="mono">${escapeHtml(task.deadline || '—')}</td><td><span class="badge ${attr(task.status)}">${escapeHtml(task.status)}</span></td><td>${escapeHtml(task.priority)}</td><td>${task.required ? '✓' : '—'}</td><td>${task.preShowCheck ? '✓' : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">공개된 업무가 없습니다.</div>'}
  </section>`;
}

function renderAuthRequiredView(view) {
  const titles = { performance: '공연 정보', production: '제작 현황', tasks: '전체 업무', calendar: '일정', rehearsal: '연습일지', preshow: '공연 전 체크' };
  return `<section class="protected-view" aria-labelledby="protected-view-title">
    <p class="auth-kicker">MEMBERS ONLY / PRODUCTION DESK</p>
    <h1 id="protected-view-title">부원 전용 페이지입니다.</h1>
    <p>${escapeHtml(titles[view] || '이 페이지')}는 로그인 후 이용할 수 있습니다.</p>
    <button type="button" data-auth-login>로그인</button>
  </section>`;
}

function renderMembershipErrorView() {
  return `<section class="membership-error-view" aria-labelledby="membership-error-title">
    <p class="auth-kicker">PRODUCTION MEMBERSHIP</p>
    <h1 id="membership-error-title">공연 참여 정보를 설정하지 못했습니다.</h1>
    <p>잠시 후 다시 시도해 주세요. HOME은 계속 이용할 수 있습니다.</p>
    <button type="button" data-retry-auto-join>다시 시도</button>
  </section>`;
}

function renderViewPage(view, content) {
  const headers = {
    performance: ['ACT 01', 'PERFORMANCE', '공연 기본정보'],
    production: ['ACT 02', 'PRODUCTION', '제작 현황'],
    tasks: ['ACT 03', 'TASKS', '전체 업무'],
    calendar: ['ACT 04', 'CALENDAR', '일정'],
    rehearsal: ['ACT 05', 'REHEARSAL ARCHIVE', '연습일지'],
    preshow: ['ACT 06', 'PRE-SHOW', '공연 전 체크'],
  };
  const [act, label, title] = headers[view];
  return `<div class="view-page view-page-${view}">
    <header class="view-page-header">
      <p><span>${act}</span><i aria-hidden="true">/</i>${label}</p>
      <h1>${title}</h1>
    </header>
    <div class="view-page-content">${content}</div>
  </div>`;
}

function renderHeader(p, dDay, stage) {
  const stageText = stage
    ? (stage.index >= 0 ? `제작 ${stage.index + 1}단계 · ${stage.name}` : stage.name)
    : '미정';
  return `
  <header class="masthead home-project-header" aria-label="공연 제작 데스크 개요">
    <div class="masthead-main">
      <div class="masthead-kicker"><span>JEONDAE THEATRE</span><span class="accent">/</span><span>PRODUCTION DESK</span></div>
      <h1 id="show-title">${escapeHtml(p.title) || '(작품명 미입력)'}</h1>
      <div class="sub">${escapeHtml(p.venue) || '공연장 미정'} · ${formatDisplayDate(p.date) || '공연일 미정'} · 제작 ${escapeHtml(p.status || '준비중')}</div>
    </div>
    <div class="masthead-meta" aria-label="공연 일정">
      <span class="meta-label">PERFORMANCE</span>
      <span class="dday">${formatDday(dDay)}</span>
      <span class="performance-date">${formatDisplayDate(p.date) || 'DATE TBA'}</span>
      <div class="production-status">
        <span class="stage-label">${stageText}</span>
        <span class="current-status">● 제작 ${escapeHtml(p.status || '준비중')}</span>
      </div>
      <div class="save-bar">
        <span id="save-status" class="save-status"></span>
      </div>
    </div>
  </header>
  `;
}

function renderPerformanceForm(p, forceEditorOpen = false) {
  const summaryItems = [
    ['작품', p.title || '미입력'],
    ['공연일', formatDisplayDate(p.date) || '미정'],
    ['공연장', p.venue || '미입력'],
    ['시작일', formatDisplayDate(p.projectStartDate) || '미정'],
    ['상태', p.status || '준비중'],
  ];
  return `
  <section class="section section-performance" id="section-setup">
    <div class="section-heading"><span class="act-label">ACT 01</span><span class="section-caption">PERFORMANCE</span><h2><span class="n">01</span>공연 기본정보</h2></div>
    <div class="performance-summary ${(isPerformanceEditorOpen || forceEditorOpen) ? 'is-hidden' : ''}">
      <dl>
        ${summaryItems.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>
      <button type="button" data-toggle-performance-editor class="editor-toggle">정보 수정</button>
    </div>
    <div class="performance-editor ${(isPerformanceEditorOpen || forceEditorOpen) ? '' : 'is-hidden'}">
    <div class="editor-actions"><span>EDITING PRODUCTION SHEET</span>${forceEditorOpen ? '' : '<button type="button" data-toggle-performance-editor class="small ghost">닫기</button>'}</div>
    <div class="grid2">
      <div class="field"><label for="f-title">작품명</label><input type="text" id="f-title" value="${attr(p.title)}"></div>
      <div class="field"><label for="f-date">공연일</label><input type="date" id="f-date" value="${attr(p.date)}"></div>
      <div class="field"><label for="f-venue">공연장</label><input type="text" id="f-venue" value="${attr(p.venue)}"></div>
      <div class="field"><label for="f-venue-info">공연장 정보</label><input type="text" id="f-venue-info" value="${attr(p.venueInfo)}" placeholder="주소·좌석 수 등"></div>
      <div class="field"><label for="f-start">프로젝트 시작일</label><input type="date" id="f-start" value="${attr(p.projectStartDate)}"></div>
      <div class="field">
        <label for="f-status">현재 상태</label>
        <select id="f-status">
          <option ${p.status === '준비중' ? 'selected' : ''}>준비중</option>
          <option ${p.status === '진행중' ? 'selected' : ''}>진행중</option>
          <option ${p.status === '완료' ? 'selected' : ''}>완료</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label for="f-rehearsal">연습 가능 시간</label>
      <input type="text" id="f-rehearsal" value="${attr(p.rehearsalAvailability)}" placeholder="예: 평일 저녁 7~10시, 주말 오후">
    </div>

    <div class="field">
      <label>제작 파트 <span class="field-translation">/ PRODUCTION UNITS</span></label>
      <div class="chip-row">
        ${p.parts.map(part => `<span class="chip">${escapeHtml(part)} <button type="button" data-remove-part="${attr(part)}">×</button></span>`).join('')}
      </div>
      <div class="row" style="margin-top:8px; max-width:320px;">
        <input type="text" id="new-part" placeholder="새 파트 추가">
        <button type="button" id="add-part" class="small">추가</button>
      </div>
    </div>

    <div class="field participant-field">
      <div class="subsection-heading"><span>CAST & CREW /</span><span>참여 인원</span></div>
      <label>참여 인원</label>
      ${p.participants.length ? `
      <div class="table-scroll">
      <table>
        <thead><tr><th>이름</th><th>역할(파트)</th><th></th></tr></thead>
        <tbody>
          ${p.participants.map((person, i) => `
            <tr>
              <td>${escapeHtml(person.name)}</td>
              <td>${escapeHtml(person.part)}</td>
              <td><button type="button" class="small danger" data-remove-person="${i}">삭제</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>` : `<div class="empty">등록된 참여 인원이 없습니다.</div>`}
      <div class="row" style="margin-top:8px;">
        <input type="text" id="p-name" placeholder="이름">
        <select id="p-part">${p.parts.map(part => `<option>${escapeHtml(part)}</option>`).join('')}</select>
        <button type="button" id="add-person" style="flex:0 0 auto;">추가</button>
      </div>
    </div>
    </div>
  </section>
  `;
}

function renderRisks(risks) {
  const hasCritical = risks.some(r => r.level === '오류');
  return `
  <section class="section section-check" id="section-risks">
    <div class="section-heading"><span class="act-label">ACT 02</span><span class="section-caption">PRODUCTION CHECK</span><h2><span class="n">02${hasCritical ? ' !' : ''}</span>제작 검수 노트 <span class="count">(${risks.length})</span></h2></div>
    <div class="check-intro"><span class="check-number">${String(risks.length).padStart(2, '0')}</span><span>${risks.length ? 'ISSUES FOUND' : 'READY FOR THE NEXT CUE'}</span></div>
    <div class="validation-list">
    ${risks.length ? risks.map(r => {
      const isCritical = r.level === '오류';
      return `<div class="validation-row ${isCritical ? 'critical' : 'warning'}">
        <span class="validation-symbol">${isCritical ? '!' : '△'}</span>
        <span class="validation-label">${isCritical ? 'CRITICAL' : 'WARNING'}</span>
        <span class="validation-message">${escapeHtml(r.message)}</span>
      </div>`;
    }).join('') : `<div class="validation-row clear">
      <span class="validation-symbol">✓</span><span class="validation-label">CLEAR</span><span class="validation-message">현재 감지된 위험 항목이 없습니다.</span>
    </div>`}
    </div>
  </section>
  `;
}

function renderTaskForm(p) {
  const names = p.participants.map(x => x.name);
  return `
  <section class="section section-tasks" id="section-task-form">
    <div class="section-heading"><span class="act-label">ACT 04</span><span class="section-caption">TASKS / NEW CALL</span><h2><span class="n">04</span>업무 추가</h2></div>
    <button type="button" data-toggle-task-form class="task-form-toggle ${isTaskFormOpen ? 'is-hidden' : ''}">+ 새 업무 추가</button>
    <div class="task-form-panel ${isTaskFormOpen ? '' : 'is-hidden'}">
    <div class="editor-actions"><span>NEW PRODUCTION CALL</span><button type="button" data-toggle-task-form class="small ghost">닫기</button></div>
    <div class="grid3">
      <div class="field"><label for="t-part">담당 파트</label><select id="t-part">${p.parts.map(part => `<option>${escapeHtml(part)}</option>`).join('')}</select></div>
      <div class="field"><label for="t-name">업무명</label><input type="text" id="t-name" placeholder="예: 오르골 소품 제작"></div>
      <div class="field">
        <label for="t-assignee">담당자</label>
        <select id="t-assignee"><option value="">— 미지정 —</option>${names.map(n => `<option>${escapeHtml(n)}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="t-deadline">마감일</label><input type="date" id="t-deadline"></div>
      <div class="field">
        <label for="t-prereq">선행 업무</label>
        <select id="t-prereq"><option value="">— 없음 —</option>${state.tasks.map(t => `<option value="${attr(t.taskId)}">${escapeHtml(t.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label for="t-priority">우선순위</label>
        <select id="t-priority">${TASK_PRIORITY.map(pr => `<option ${pr === '보통' ? 'selected' : ''}>${pr}</option>`).join('')}</select>
      </div>
    </div>
    <div class="row" style="align-items:center; margin:10px 0;">
      <label class="check-inline"><input type="checkbox" id="t-required"> 필수 업무</label>
      <label class="check-inline"><input type="checkbox" id="t-preshow"> 공연 전 체크리스트에 포함</label>
    </div>
    <p class="note task-sync-message" role="status">${escapeHtml(taskSyncMessage)}</p>
    <button type="button" id="add-task" ${taskWriteBusy ? 'disabled' : ''}>${taskWriteBusy ? '저장 중…' : '업무 추가'}</button>
    </div>
  </section>
  `;
}

function renderTaskTable(p) {
  const parts = ['전체', ...p.parts];
  const filtered = currentPartFilter === '전체' ? state.tasks : state.tasks.filter(t => t.part === currentPartFilter);
  return `
  <section class="section task-ledger" id="section-tasks">
    <h2 class="table-section-title"><span class="table-section-label">PRODUCTION CALL SHEET</span>전체 업무 <span class="count">(${state.tasks.length})</span></h2>
    <p class="note task-sync-message" role="status">${escapeHtml(taskSyncMessage)}</p>
    <div class="chip-row" style="margin-bottom:12px;">
      ${parts.map(part => `<button type="button" class="small ${currentPartFilter === part ? '' : 'ghost'}" data-filter-part="${attr(part)}">${escapeHtml(part)}</button>`).join('')}
    </div>
    ${filtered.length ? `
    <div class="table-scroll">
    <table>
      <thead><tr><th>업무명</th><th>담당 파트</th><th>담당자</th><th>마감일</th><th>상태</th><th>우선순위</th><th>선행업무</th><th>필수</th><th>체크리스트</th><th>ID</th><th></th></tr></thead>
      <tbody>
        ${filtered.map(t => {
          const prereq = getPrereqTask(t, state.tasks);
          return `
          <tr>
            <td>${escapeHtml(t.name)}</td>
            <td>${escapeHtml(t.part)}</td>
            <td>${t.assignee ? escapeHtml(t.assignee) : '<span class="text-faint">미지정</span>'}</td>
            <td class="mono">${t.deadline || '—'}</td>
            <td>
              <select data-status="${attr(t.taskId)}" class="mono-select">
                ${TASK_STATUS.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </td>
            <td><span class="badge ${t.priority}">${t.priority}</span></td>
            <td class="text-faint">${prereq ? escapeHtml(prereq.name) : '—'}</td>
            <td>${t.required ? '✓' : '—'}</td>
            <td>${t.preShowCheck ? '✓' : '—'}</td>
            <td class="mono">${t.taskId}</td>
            <td>${canDeleteProductionContent() ? `<button type="button" class="small danger" data-del-task="${attr(t.taskId)}" ${taskDeleteInFlight.has(t.taskId) ? 'disabled' : ''}>${taskDeleteInFlight.has(t.taskId) ? '삭제 중…' : '삭제'}</button>` : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>` : `<div class="empty">${currentPartFilter === '전체' ? '등록된 업무가 없습니다.' : `'${escapeHtml(currentPartFilter)}' 파트에 등록된 업무가 없습니다.`}</div>`}
  </section>
  `;
}

function getIncompleteTasks(tasks = state.tasks) {
  return tasks.filter(task => task.status !== '완료');
}

function getTasksDueThisWeek(tasks = state.tasks) {
  return getIncompleteTasks(tasks).filter(task => {
    if (!task.deadline) return false;
    const dd = getDaysUntil(task.deadline, todayStr);
    return dd !== null && dd >= 0 && dd <= 7;
  }).sort((a, b) => a.deadline.localeCompare(b.deadline));
}

function getUpcomingDeadlines(tasks = state.tasks) {
  return getIncompleteTasks(tasks).filter(task => task.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

function getPartProgress(parts, tasks = state.tasks) {
  const byPart = {};
  parts.forEach(part => { byPart[part] = { total: 0, done: 0 }; });
  tasks.forEach(task => {
    if (!byPart[task.part]) return;
    byPart[task.part].total++;
    if (task.status === '완료') byPart[task.part].done++;
  });
  return byPart;
}

function getImportantIncompleteTasks(tasks = state.tasks) {
  return getIncompleteTasks(tasks).slice().sort((a, b) => {
    const rank = task => {
      const dDay = task.deadline ? getDaysUntil(task.deadline, todayStr) : null;
      return [
        task.required ? 0 : 1,
        task.priority === '높음' ? 0 : 1,
        dDay !== null && dDay >= 0 && dDay <= 7 ? 0 : 1,
        dDay !== null && dDay < 0 ? 0 : 1,
        task.deadline || '9999-12-31',
      ];
    };
    const aRank = rank(a);
    const bRank = rank(b);
    for (let index = 0; index < aRank.length; index++) {
      if (aRank[index] < bRank[index]) return -1;
      if (aRank[index] > bRank[index]) return 1;
    }
    return String(a.taskId || '').localeCompare(String(b.taskId || ''));
  });
}

function getDashboardData(p, stage) {
  const thisWeek = getTasksDueThisWeek();
  const upcoming = getUpcomingDeadlines();
  const incomplete = getIncompleteTasks();
  const today = incomplete.filter(task => task.deadline === todayStr);
  const important = getImportantIncompleteTasks();
  const completedCount = state.tasks.length - incomplete.length;
  const stageNumber = stage && stage.index >= 0 ? String(stage.index + 1).padStart(2, '0') : '—';
  const byPart = getPartProgress(p.parts || []);
  return { thisWeek, upcoming, incomplete, today, important, completedCount, stageNumber, byPart };
}

function renderPartStatus(byPart) {
  return Object.entries(byPart).map(([part, v]) => {
    const percent = v.total ? Math.round((v.done / v.total) * 100) : 0;
    return `<div class="check-item part-progress"><span class="part-name">${escapeHtml(part)}</span><span class="mono text-dim">${v.done} / ${v.total}</span><span class="progress-track" aria-hidden="true"><span class="progress-value" style="width:${percent}%"></span></span><span class="part-percent">${percent}%</span></div>`;
  }).join('');
}

function renderMotionHero(p, dDay) {
  return `<section class="motion-hero" aria-labelledby="motion-hero-title">
    <div class="hero-video-stage" aria-hidden="true">
      <video id="motion-hero-video" class="motion-hero-video" muted playsinline preload="metadata" poster="">
        <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4" type="video/mp4">
      </video>
      <div class="hero-video-overlay"></div>
    </div>
    <div class="motion-hero-foreground">
      <div class="motion-hero-copy">
        <span class="hero-production-label fade-rise">PERFORMANCE PRODUCTION / ${escapeHtml(p.status || '준비중')}</span>
        <h1 id="motion-hero-title" class="fade-rise-delay"><span>${escapeHtml(p.title) || '우리의 공연'}</span><em>무대에 오르기 전부터.</em></h1>
        <p class="hero-description fade-rise-delay-2">공연일까지의 모든 제작 과정과 기록을<br>하나의 Production Desk에서 관리합니다.</p>
        <div class="hero-actions fade-rise-delay-2">
          <button type="button" class="hero-dashboard-cta" data-hero-dashboard>오늘의 제작 현황 보기</button>
          <span><b>${formatDday(dDay)}</b>${formatDisplayDate(p.date) || 'DATE TBA'}</span>
        </div>
      </div>
      <div class="hero-footnote fade-rise-delay-2"><span>JEONDAE THEATRE ARCHIVE</span><span>SCROLL TO PRODUCTION DESK ↓</span></div>
    </div>
  </section>`;
}

function destroyHeroVideoLoop() {
  if (heroVideoAnimationFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(heroVideoAnimationFrame);
  if (heroVideoRestartTimer !== null) clearTimeout(heroVideoRestartTimer);
  heroVideoAnimationFrame = null;
  heroVideoRestartTimer = null;
}

function initHeroVideoLoop() {
  const video = document.getElementById('motion-hero-video');
  if (!video) return;
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const playVideo = () => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  };
  const updateOpacity = () => {
    if (!video.isConnected) return;
    if (reducedMotion) {
      video.style.opacity = video.readyState >= 2 ? '1' : '0';
    } else if (Number.isFinite(video.duration) && video.duration > 0) {
      const fadeIn = Math.min(1, video.currentTime / .5);
      const fadeOut = Math.min(1, Math.max(0, (video.duration - video.currentTime) / .5));
      video.style.opacity = String(Math.min(fadeIn, fadeOut));
    }
    if (typeof requestAnimationFrame === 'function') heroVideoAnimationFrame = requestAnimationFrame(updateOpacity);
  };
  video.addEventListener('loadeddata', () => { video.style.opacity = reducedMotion ? '1' : '0'; playVideo(); }, { once: true });
  video.addEventListener('ended', () => {
    video.style.opacity = '0';
    heroVideoRestartTimer = setTimeout(() => {
      if (!video.isConnected) return;
      video.currentTime = 0;
      playVideo();
    }, 100);
  });
  if (video.readyState >= 2) playVideo();
  if (typeof requestAnimationFrame === 'function') heroVideoAnimationFrame = requestAnimationFrame(updateOpacity);
}

function renderHomeDashboard(p, dDay, stage, risks) {
  const data = getDashboardData(p, stage);
  return `
    ${renderMotionHero(p, dDay)}
    <section class="section home-kpi" id="home-dashboard">
      <div class="section-heading"><span class="act-label">HOME</span><span class="section-caption">PRODUCTION CONTROL ROOM</span><h2>오늘의 제작 상황</h2></div>
      <div class="stat-cards">
        <div class="stat"><div class="val">${state.tasks.length}</div><div class="lbl">전체 업무</div></div>
        <div class="stat"><div class="val">${data.incomplete.length}</div><div class="lbl">미완료 업무</div></div>
        <div class="stat"><div class="val">${data.thisWeek.length}</div><div class="lbl">이번 주 업무</div></div>
        <div class="stat"><div class="val">${formatDday(dDay)}</div><div class="lbl">공연</div></div>
      </div>
    </section>
    <section class="section home-lists">
      <div class="grid2">
        <div><h3>오늘 할 일</h3>${renderHomeTaskList(data.today.slice(0, 6), '오늘 마감인 업무가 없습니다.', { showCheckbox: true })}</div>
        <div><h3>다가오는 마감</h3>${renderHomeTaskList(data.upcoming.slice(0, 6), '예정된 마감이 없습니다.', { markOverdue: true })}<button type="button" class="home-view-all" data-view="tasks">전체 업무 보기 →</button></div>
      </div>
    </section>
    <section class="section home-status">
      <div class="grid2">
        <div><h3>파트별 진행률</h3>${renderPartStatus(data.byPart)}</div>
        <div><h3>미완료 중요 업무</h3>${renderHomeTaskList(data.important.slice(0, 6), '미완료 업무가 없습니다.', { markOverdue: true })}</div>
      </div>
    </section>`;
}

function renderHomeTaskList(tasks, emptyMessage, options = {}) {
  const { showCheckbox = false, markOverdue = false } = options;
  return tasks.length ? tasks.map(task => {
    const overdue = markOverdue && task.deadline && getDaysUntil(task.deadline, todayStr) < 0;
    return `<div class="home-task-row ${overdue ? 'is-overdue' : ''}">
      ${showCheckbox ? '<span class="task-checkbox" aria-hidden="true">□</span>' : ''}
      <span class="grow"><strong>${escapeHtml(task.name)}</strong><small>${escapeHtml(task.part)} · ${task.assignee ? escapeHtml(task.assignee) : '미지정'}${task.required ? ' · 필수' : ''}</small></span>
      ${overdue ? '<span class="home-overdue-label">지연</span>' : ''}
      <span class="badge ${task.status}">${escapeHtml(task.status)}</span>
      <span class="mono">${task.deadline || '—'}</span>
    </div>`;
  }).join('') : `<div class="empty">${emptyMessage}</div>`;
}

function renderDashboard(p, stage) {
  const { thisWeek, upcoming, incomplete, completedCount, stageNumber, byPart } = getDashboardData(p, stage);

  return `
  <section class="section section-dashboard" id="section-dashboard">
    <div class="section-heading"><span class="act-label">ACT 03</span><span class="section-caption">PRODUCTION OVERVIEW</span><h2><span class="n">03</span>제작 현황</h2></div>

    <div class="stat-cards">
      <div class="stat"><div class="val">${state.tasks.length}</div><div><div class="lbl">전체 업무</div><div class="stat-detail">${state.tasks.length ? `완료 ${completedCount}건` : '등록된 업무 없음'}</div></div></div>
      <div class="stat"><div class="val">${incomplete.length}</div><div><div class="lbl">미완료 업무</div><div class="stat-detail">${incomplete.length ? '처리 필요 업무' : '대기 업무 없음'}</div></div></div>
      <div class="stat"><div class="val">${thisWeek.length}</div><div><div class="lbl">이번 주 할 일</div><div class="stat-detail">${thisWeek.length ? '7일 내 마감' : '예정 업무 없음'}</div></div></div>
      <div class="stat"><div class="val">${stageNumber}</div><div><div class="lbl">현재 단계</div><div class="stat-detail">${stage ? stage.name : '단계 미정'}</div></div></div>
    </div>

    <div class="grid2">
      <div>
        <h3>이번 주 할 일</h3>
        ${thisWeek.length ? thisWeek.map(t => `
          <div class="check-item"><span class="badge ${t.status}">${t.status}</span><span class="grow">${escapeHtml(t.name)} <span class="text-faint">· ${t.assignee ? escapeHtml(t.assignee) : '미지정'}</span></span><span class="mono">${t.deadline}</span></div>
        `).join('') : `<div class="empty">이번 주 마감인 업무가 없습니다.</div>`}
      </div>
      <div>
        <h3>다가오는 마감</h3>
        ${upcoming.length ? upcoming.map(t => `
          <div class="check-item"><span class="grow">${escapeHtml(t.name)}</span><span class="mono accent">${t.deadline}</span></div>
        `).join('') : `<div class="empty">예정된 마감이 없습니다.</div>`}
      </div>
    </div>

    <div class="grid2">
      <div>
        <h3>파트별 업무 현황</h3>
        ${renderPartStatus(byPart)}
      </div>
      <div>
        <h3>미완료 업무 (${incomplete.length})</h3>
        ${incomplete.length ? incomplete.slice(0, 8).map(t => `
          <div class="check-item"><span class="grow">${escapeHtml(t.name)}</span><span class="badge ${t.status}">${t.status}</span></div>
        `).join('') : `<div class="empty">모든 업무가 완료되었습니다.</div>`}
      </div>
    </div>
  </section>
  `;
}

/* ---------------- Production Calendar ---------------- */

function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getCalendarItems(p, tasks = state.tasks, events = state.events, readOnly = false) {
  const taskItems = tasks.filter(task => task.deadline).map(task => ({
    source: 'task', id: task.publicId || task.taskId, date: task.deadline, title: task.name,
    time: '', type: 'TASK', meta: `${task.part || '파트 미정'} · 마감`, status: task.status,
  }));
  const eventItems = events.filter(event => event.date).map(event => ({
    source: 'event', id: event.publicId || event.id, date: event.date, title: event.title,
    time: event.startTime || '', endTime: event.endTime || '', type: event.type || '기타',
    meta: [event.part, readOnly ? event.publicLocation : event.location].filter(Boolean).join(' · '), event, readOnly,
  }));
  const performanceItems = p.date ? [{
    source: 'performance', id: 'performance-date', date: p.date,
    title: p.title || '공연', time: '', type: 'PERFORMANCE', meta: `${p.venue || '공연장 미정'} · D-DAY`,
  }] : [];
  return [...taskItems, ...eventItems, ...performanceItems].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title, 'ko')
  );
}

function renderCalendarItem(item, compact = false) {
  const content = `<span class="calendar-item-label">${escapeHtml(item.type)}</span><span class="calendar-item-title">${item.time ? `${escapeHtml(item.time)} ` : ''}${escapeHtml(item.title)}</span>`;
  if (item.source === 'event') {
    return `<button type="button" class="calendar-item event-item ${compact ? 'is-compact' : ''}" data-event-detail="${attr(item.id)}">${content}</button>`;
  }
  return `<div class="calendar-item ${item.source}-item ${compact ? 'is-compact' : ''}">${content}</div>`;
}

function getCalendarGridDates(year, month) {
  const firstDay = new Date(year, month, 1);
  const sundayOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - sundayOffset);
  return Array.from({ length: 42 }, (_, index) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  );
}

function renderCalendar(p, options = {}) {
  const { readOnly = false, tasks = state.tasks, events = state.events } = options;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const allItems = getCalendarItems(p, tasks, events, readOnly);
  const itemsByDate = {};
  allItems.forEach(item => { (itemsByDate[item.date] ||= []).push(item); });
  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const cells = getCalendarGridDates(year, month).map(date => {
    const key = toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
    const items = itemsByDate[key] || [];
    const visibleItems = items.slice(0, 3);
    const classes = [date.getMonth() !== month ? 'is-outside' : '', key === todayStr ? 'is-today' : '', key === selectedCalendarDate ? 'is-selected' : ''].filter(Boolean).join(' ');
    return `<div class="calendar-day ${classes}" data-calendar-date="${key}">
      <button type="button" class="calendar-date-button" data-select-date="${key}" aria-label="${key} 일정 보기">
        <span class="calendar-date-number">${date.getDate()}</span>${key === todayStr ? '<span class="today-label">TODAY</span>' : ''}
      </button>
      <div class="calendar-day-items">${visibleItems.map(item => renderCalendarItem(item, true)).join('')}${items.length > 3 ? `<button type="button" class="calendar-more" data-select-date="${key}">+${items.length - 3} MORE</button>` : ''}</div>
    </div>`;
  }).join('');
  const selectedItems = itemsByDate[selectedCalendarDate] || [];
  const upcoming = allItems.filter(item => item.date >= todayStr).slice(0, 12);

  return `<section class="section section-calendar" id="section-calendar">
    ${readOnly ? '' : '<div class="section-heading calendar-heading"><span class="act-label">ACT 06</span><span class="section-caption">PRODUCTION CALENDAR</span><h2><span class="n">06</span>일정</h2></div>'}
    <div class="calendar-toolbar">
      <button type="button" class="calendar-nav" data-calendar-prev aria-label="이전 달">←</button>
      <h3>${year}년 ${month + 1}월</h3>
      <button type="button" class="calendar-nav" data-calendar-next aria-label="다음 달">→</button>
      <button type="button" class="small ghost calendar-today" data-calendar-today>오늘</button>
      ${readOnly ? '' : '<button type="button" class="calendar-add" data-new-event>+ 새 일정 추가</button>'}
    </div>
    ${eventSyncMessage && !isEventFormOpen ? `<p class="note event-sync-message" role="status">${escapeHtml(eventSyncMessage)}</p>` : ''}
    ${readOnly ? '' : renderEventForm(p)}
    <div class="calendar-scroll" aria-label="${year}년 ${month + 1}월 제작 일정표">
      <div class="calendar-grid calendar-weekdays">${weekdayLabels.map(day => `<div>${day}</div>`).join('')}</div>
      <div class="calendar-grid calendar-month">${cells}</div>
    </div>
    <div class="calendar-below">
      <div class="selected-date-panel">
        <span class="calendar-eyebrow">SELECTED DATE</span>
        <h3>${formatDisplayDate(selectedCalendarDate)}</h3>
        ${selectedItems.length ? selectedItems.map(item => renderScheduleRow(item, !readOnly)).join('') : '<div class="empty">선택한 날짜에 일정이 없습니다.</div>'}
      </div>
      <div class="upcoming-panel">
        <span class="calendar-eyebrow">UPCOMING SCHEDULE</span>
        <h3>다가오는 일정</h3>
        ${upcoming.length ? upcoming.map(item => renderScheduleRow(item)).join('') : '<div class="empty">예정된 일정이 없습니다.</div>'}
      </div>
    </div>
  </section>`;
}

function renderScheduleRow(item, showActions = false) {
  const timeText = item.time ? `${item.time}${item.endTime ? `–${item.endTime}` : ''}` : 'ALL DAY';
  const description = item.readOnly ? item.event && item.event.publicDescription : item.event && item.event.memo;
  const detail = description ? `${item.meta ? `${item.meta} · ` : ''}${description}` : (item.meta || item.type);
  return `<div class="schedule-row ${item.source}-schedule">
    <span class="schedule-date">${item.date.slice(5).replace('-', '.')}</span>
    <span class="schedule-time">${escapeHtml(timeText)}</span>
    <span class="schedule-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(detail)}</small></span>
    <span class="schedule-kind">${escapeHtml(item.type)}</span>
    ${showActions && item.source === 'event' && canWriteProduction() ? `<span class="schedule-actions"><button type="button" class="small ghost" data-edit-event="${attr(item.id)}">수정</button>${canDeleteProductionContent() ? `<button type="button" class="small danger" data-delete-event="${attr(item.id)}" ${eventDeleteInFlight.has(item.id) ? 'disabled' : ''}>${eventDeleteInFlight.has(item.id) ? '삭제 중…' : '삭제'}</button>` : ''}</span>` : ''}
  </div>`;
}

function renderEventForm(p) {
  if (!isEventFormOpen) return '';
  const event = editingEventId ? state.events.find(item => item.id === editingEventId) : null;
  const value = (key, fallback = '') => event && event[key] !== undefined ? event[key] : fallback;
  return `<div class="event-form-panel">
    <div class="editor-actions"><span>${event ? 'EDIT PRODUCTION SCHEDULE' : 'NEW PRODUCTION SCHEDULE'}</span><button type="button" class="small ghost" data-close-event-form>닫기</button></div>
    <div class="grid3 event-form-grid">
      <div class="field"><label for="e-title">일정명 *</label><input id="e-title" type="text" value="${attr(value('title'))}" placeholder="예: 전체연습"></div>
      <div class="field"><label for="e-date">날짜 *</label><input id="e-date" type="date" value="${attr(value('date', selectedCalendarDate))}"></div>
      <div class="field"><label for="e-type">종류</label><select id="e-type">${EVENT_TYPES.map(type => `<option ${value('type', '연습') === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
      <div class="field"><label for="e-start">시작 시간</label><input id="e-start" type="time" value="${attr(value('startTime'))}"></div>
      <div class="field"><label for="e-end">종료 시간</label><input id="e-end" type="time" value="${attr(value('endTime'))}"></div>
      <div class="field"><label for="e-part">관련 파트</label><select id="e-part"><option value="">전체 / 미지정</option>${p.parts.map(part => `<option ${value('part') === part ? 'selected' : ''}>${escapeHtml(part)}</option>`).join('')}</select></div>
      <div class="field"><label for="e-location">장소</label><input id="e-location" type="text" value="${attr(value('location'))}" placeholder="예: 동아리방"></div>
      <div class="field event-memo"><label for="e-memo">메모</label><textarea id="e-memo" rows="2" placeholder="연결 장면, 준비물 등">${escapeHtml(value('memo'))}</textarea></div>
    </div>
    <p class="note event-sync-message" role="status">${escapeHtml(eventSyncMessage)}</p>
    <div class="event-form-actions"><button type="button" id="save-event" ${eventWriteBusy ? 'disabled' : ''}>${eventWriteBusy ? '저장 중…' : (event ? '일정 수정' : '일정 저장')}</button></div>
  </div>`;
}

/* ---------------- Rehearsal Archive ---------------- */

function getFilteredPublicRehearsalLogs() {
  const query = rehearsalSearchQuery.trim().toLocaleLowerCase('ko-KR');
  return [...publicArchiveState.rehearsalLogs]
    .filter(log => {
      if (rehearsalCategoryFilter !== '전체' && log.category !== rehearsalCategoryFilter) return false;
      if (!query) return true;
      return [log.title, log.content, log.author, ...(log.tags || [])]
        .some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(query));
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdDate).localeCompare(String(a.createdDate)));
}

function findPublicRehearsalLog(publicId) {
  return publicArchiveState.rehearsalLogs.find(log => log.publicId === publicId);
}

function renderPublicRehearsalArchive() {
  const selected = findPublicRehearsalLog(selectedRehearsalLogId);
  if (rehearsalArchiveMode === 'detail' && selected) return renderPublicRehearsalDetail(selected);
  rehearsalArchiveMode = 'list';
  return renderPublicRehearsalList();
}

function renderPublicRehearsalList() {
  const logs = getFilteredPublicRehearsalLogs();
  return `<section class="section section-rehearsal public-rehearsal-list" id="section-rehearsal">
    <div class="rehearsal-list-toolbar"><p><span class="archive-count">${String(publicArchiveState.rehearsalLogs.length).padStart(2, '0')}</span> NOTES IN ARCHIVE</p></div>
    <form class="rehearsal-search" id="rehearsal-search-form" role="search"><label for="rehearsal-search-input">연습일지 검색</label><div><input id="rehearsal-search-input" type="search" value="${attr(rehearsalSearchQuery)}" placeholder="제목, 본문, 작성자, 태그 검색"><button type="submit" class="ghost">검색</button></div></form>
    <div class="rehearsal-filters" aria-label="연습일지 분류">${['전체', ...REHEARSAL_CATEGORIES].map(category => `<button type="button" data-rehearsal-category="${attr(category)}" class="${rehearsalCategoryFilter === category ? 'is-active' : ''}" aria-pressed="${rehearsalCategoryFilter === category}">${escapeHtml(category)}</button>`).join('')}</div>
    <div class="rehearsal-list" aria-live="polite">${logs.length ? logs.map(log => `<article class="rehearsal-list-item"><button type="button" data-rehearsal-detail="${attr(log.publicId)}" aria-label="${attr(log.title)} 연습일지 읽기"><span class="rehearsal-index">${escapeHtml(log.category)}</span><strong>${escapeHtml(log.title)}</strong><span class="rehearsal-list-meta">${escapeHtml(log.author)} · ${formatDisplayDate(log.date)}</span>${log.tags.length ? `<span class="rehearsal-list-tags">${log.tags.slice(0, 3).map(tag => `#${escapeHtml(tag)}`).join(' ')}</span>` : ''}</button></article>`).join('') : '<div class="rehearsal-empty"><strong>공개된 연습일지가 없습니다.</strong></div>'}</div>
  </section>`;
}

function renderPublicRehearsalDetail(log) {
  const images = publicArchiveState.imagesByLog.get(log.publicId) || [];
  return `<section class="section section-rehearsal rehearsal-detail public-rehearsal-detail" id="section-rehearsal">
    <button type="button" class="rehearsal-back" data-rehearsal-list>← 목록으로</button>
    <header class="rehearsal-note-header"><span class="rehearsal-index">PUBLIC REHEARSAL NOTE</span><h2>${escapeHtml(log.title)}</h2><dl><div><dt>DATE</dt><dd>${formatDisplayDate(log.date)}</dd></div><div><dt>AUTHOR</dt><dd>${escapeHtml(log.author)}</dd></div><div><dt>CATEGORY</dt><dd>${escapeHtml(log.category)}</dd></div></dl></header>
    <div class="rehearsal-content">${escapeHtml(log.content).replace(/\n/g, '<br>')}</div>
    ${renderPublicRehearsalImages(log, images)}
    ${log.tags.length ? `<div class="rehearsal-detail-tags">${log.tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <p class="public-rehearsal-dates">공개 기록 ${formatDisplayDate(log.createdDate) || '—'} · 최종 수정 ${formatDisplayDate(log.updatedDate) || '—'}</p>
  </section>`;
}

function renderPublicRehearsalImages(log, images) {
  if (!images.length) return '';
  const ordered = [...images].sort((a, b) => a.sortOrder - b.sortOrder || a.publicId.localeCompare(b.publicId));
  return `<div class="rehearsal-image-grid public-rehearsal-image-grid" aria-label="연습일지 사진 ${ordered.length}장">${ordered.map((image, index) => `<figure class="rehearsal-image-item" data-public-image-item>
    ${image.deliveryUrl && image.deliveryStatus !== 'failed' ? `<button type="button" class="rehearsal-gallery-thumb" data-open-image-dialog="${attr(image.publicId)}" aria-label="${attr(rehearsalImageAlt(log, index))} 크게 보기"><img src="${attr(image.deliveryUrl)}" data-public-image data-public-image-id="${attr(image.publicId)}" alt="${attr(rehearsalImageAlt(log, index))}" loading="lazy"></button>` : '<div class="rehearsal-image-unavailable">이미지를 불러올 수 없습니다.</div>'}
  </figure>`).join('')}</div>`;
}

function renderPublicPreShowChecklist(tasks) {
  const items = tasks.filter(task => task.preShowCheck);
  return `<section class="section section-preshow public-preshow" id="section-checklist">
    ${items.length ? items.map(task => `<div class="check-item ${task.status === '완료' ? 'checked' : ''}"><span class="badge ${attr(task.status)}">${escapeHtml(task.status)}</span><span class="grow">${escapeHtml(task.name)} <span class="text-faint">· ${escapeHtml(task.part)}</span></span>${task.required ? '<span class="tag-required">필수</span>' : ''}</div>`).join('') : '<div class="empty">공개된 공연 전 체크 항목이 없습니다.</div>'}
  </section>`;
}

function getSortedRehearsalLogs() {
  return [...rehearsalLogs, ...supabaseRehearsalLogs].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

function findRehearsalLogById(logId) {
  return [...rehearsalLogs, ...supabaseRehearsalLogs].find(log => log.id === logId);
}

function getFilteredRehearsalLogs() {
  const query = rehearsalSearchQuery.trim().toLocaleLowerCase('ko-KR');
  return getSortedRehearsalLogs().filter(log => {
    if (rehearsalCategoryFilter !== '전체' && log.category !== rehearsalCategoryFilter) return false;
    if (!query) return true;
    return [log.title, log.content, log.author, ...(Array.isArray(log.tags) ? log.tags : [])]
      .some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(query));
  });
}

function renderRehearsalArchive(p) {
  const selected = findRehearsalLogById(selectedRehearsalLogId);
  if (rehearsalArchiveMode === 'detail' && selected) return renderRehearsalDetail(selected);
  if (rehearsalArchiveMode === 'create' || (rehearsalArchiveMode === 'edit' && selected)) {
    return renderRehearsalForm(p, rehearsalArchiveMode === 'edit' ? selected : null);
  }
  rehearsalArchiveMode = 'list';
  return renderRehearsalList();
}

function renderRehearsalHeading(title, caption = 'REHEARSAL ARCHIVE') {
  return `<div class="section-heading rehearsal-heading"><span class="act-label">ACT 05</span><span class="section-caption">${caption}</span><h2><span class="n">05</span>${title}</h2></div>`;
}

function renderRehearsalList() {
  const logs = getFilteredRehearsalLogs();
  const total = rehearsalLogs.length + supabaseRehearsalLogs.length;
  const hasFilter = rehearsalCategoryFilter !== '전체' || rehearsalSearchQuery.trim();
  return `<section class="section section-rehearsal" id="section-rehearsal">
    ${renderRehearsalHeading('연습일지')}
    <div class="rehearsal-list-toolbar">
      <p><span class="archive-count">${String(total).padStart(2, '0')}</span> NOTES IN ARCHIVE</p>
      <button type="button" data-new-rehearsal-log>+ 글쓰기</button>
    </div>
    <form class="rehearsal-search" id="rehearsal-search-form" role="search">
      <label for="rehearsal-search-input">연습일지 검색</label>
      <div><input id="rehearsal-search-input" type="search" value="${attr(rehearsalSearchQuery)}" placeholder="제목, 본문, 작성자, 태그 검색"><button type="submit" class="ghost">검색</button></div>
    </form>
    <div class="rehearsal-filters" aria-label="연습일지 분류">
      ${['전체', ...REHEARSAL_CATEGORIES].map(category => `<button type="button" data-rehearsal-category="${attr(category)}" class="${rehearsalCategoryFilter === category ? 'is-active' : ''}" aria-pressed="${rehearsalCategoryFilter === category}">${category}</button>`).join('')}
    </div>
    <div class="rehearsal-list" aria-live="polite">
      ${logs.length ? logs.map(log => `<article class="rehearsal-list-item">
        <button type="button" data-rehearsal-detail="${attr(log.id)}" aria-label="${attr(log.title)} 연습일지 읽기">
          <span class="rehearsal-index">${escapeHtml(log.category || '기타')}</span>
          <strong>${escapeHtml(log.title)}</strong>
          <span class="rehearsal-list-meta">${escapeHtml(log.author)} · ${formatDisplayDate(log.date)}</span>
          ${Array.isArray(log.tags) && log.tags.length ? `<span class="rehearsal-list-tags">${log.tags.slice(0, 3).map(tag => `#${escapeHtml(tag)}`).join(' ')}</span>` : ''}
        </button>
      </article>`).join('') : `<div class="rehearsal-empty"><strong>${hasFilter ? '조건에 맞는 연습일지가 없습니다.' : '아직 작성된 연습일지가 없습니다.'}</strong>${hasFilter ? '<button type="button" class="ghost" data-clear-rehearsal-filter>검색과 분류 초기화</button>' : '<p>첫 연습 기록을 남겨보세요.</p><button type="button" data-new-rehearsal-log>+ 연습일지 작성</button>'}</div>`}
    </div>
  </section>`;
}

function renderRehearsalDetail(log) {
  const tags = Array.isArray(log.tags) ? log.tags : [];
  return `<section class="section section-rehearsal rehearsal-detail" id="section-rehearsal">
    <button type="button" class="rehearsal-back" data-rehearsal-list>← 목록으로</button>
    <header class="rehearsal-note-header">
      <span class="rehearsal-index">REHEARSAL NOTE / ${escapeHtml(String(log.id || '').replace('LOG-', ''))}</span>
      <h2>${escapeHtml(log.title)}</h2>
      <dl><div><dt>DATE</dt><dd>${formatDisplayDate(log.date)}</dd></div><div><dt>AUTHOR</dt><dd>${escapeHtml(log.author)}</dd></div><div><dt>CATEGORY</dt><dd>${escapeHtml(log.category || '기타')}</dd></div></dl>
    </header>
    <div class="rehearsal-content">${escapeHtml(log.content).replace(/\n/g, '<br>')}</div>
    ${renderRehearsalImageItems(log, false)}
    ${tags.length ? `<div class="rehearsal-detail-tags">${tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <div class="rehearsal-detail-actions"><button type="button" class="ghost" data-edit-rehearsal-log="${attr(log.id)}">수정</button><button type="button" class="danger" data-delete-rehearsal-log="${attr(log.id)}">삭제</button></div>
  </section>`;
}

function renderRehearsalForm(p, log = null) {
  const draft = rehearsalFormDraft;
  const value = (key, fallback = '') => draft && draft[key] !== undefined ? draft[key] : (log && log[key] !== undefined ? log[key] : fallback);
  const tags = Array.isArray(value('tags', [])) ? value('tags', []).map(tag => `#${tag}`).join(' ') : '';
  const authors = [...new Set((p.participants || []).map(person => person.name).filter(Boolean))];
  const usesSupabaseStorage = !log || log.source === 'supabase';
  const authorValue = log
    ? value('authorDisplayName', value('author'))
    : (authProfile && authProfile.display_name || '');
  return `<section class="section section-rehearsal rehearsal-editor" id="section-rehearsal">
    ${renderRehearsalHeading(log ? '연습일지 수정' : '새 연습 기록', log ? 'EDIT REHEARSAL NOTE' : 'NEW REHEARSAL NOTE')}
    <form id="rehearsal-log-form">
      <div class="field rehearsal-title-field"><label for="r-title">제목 *</label><input id="r-title" type="text" value="${attr(value('title'))}" required placeholder="오늘의 연습을 한 문장으로 기록하세요"></div>
      <div class="grid2">
        <div class="field"><label for="r-author">작성자명 *</label><input id="r-author" type="text" list="rehearsal-authors" value="${attr(authorValue)}" required maxlength="80" autocomplete="name"><datalist id="rehearsal-authors">${authors.map(name => `<option value="${attr(name)}"></option>`).join('')}</datalist></div>
        <div class="field"><label for="r-date">연습일 *</label><input id="r-date" type="date" value="${attr(value('date', todayStr))}" required></div>
      </div>
      <fieldset class="rehearsal-category-field"><legend>분류</legend><div>${REHEARSAL_CATEGORIES.map(category => `<label><input type="radio" name="rehearsal-category" value="${attr(category)}" ${value('category', '전체연습') === category ? 'checked' : ''}><span>${category}</span></label>`).join('')}</div></fieldset>
      <div class="field"><label for="r-content">내용 *</label><textarea id="r-content" rows="12" required placeholder="오늘 연습에서는...">${escapeHtml(value('content'))}</textarea></div>
      <div class="field"><label for="r-tags">태그 <span class="field-translation">/ 띄어쓰기 또는 쉼표로 구분</span></label><input id="r-tags" type="text" value="${attr(tags)}" placeholder="#전체연습 #런스루"></div>
      ${usesSupabaseStorage ? `<section class="rehearsal-image-editor" aria-labelledby="rehearsal-image-heading">
        <div class="rehearsal-image-editor-head"><div><h3 id="rehearsal-image-heading">이미지 첨부</h3><p>JPEG, PNG, WebP · 장당 8MB 이하 · 최대 12장</p></div><label class="button-like" for="rehearsal-image-input">+ 사진 추가</label></div>
        <input class="visually-hidden" id="rehearsal-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple>
        ${renderRehearsalImageItems(log, true)}
      </section>` : ''}
      ${rehearsalSyncMessage ? `<p class="note" role="status">${escapeHtml(rehearsalSyncMessage)}</p>` : ''}
      <div class="rehearsal-form-actions"><button type="button" class="ghost" data-rehearsal-cancel>취소</button><button type="submit" ${rehearsalWriteBusy ? 'disabled' : ''}>${rehearsalWriteBusy ? '저장 중…' : (log ? '수정 완료' : '등록하기')}</button></div>
    </form>
  </section>`;
}

function setPendingImageStatus(item, status, message = '') {
  item.status = status;
  item.message = message;
  const element = document.querySelector(`[data-pending-image="${item.localId}"] .rehearsal-image-status`);
  if (element) element.textContent = `${imageStatusLabel(status)}${message ? ` · ${message}` : ''}`;
}

async function uploadPendingRehearsalImage(item, log, sortOrder) {
  const storage = window.RehearsalImageStorageService;
  let uploadedPath = '';
  try {
    setPendingImageStatus(item, 'processing');
    const processed = await storage.processImage(item.file);
    const path = storage.buildRehearsalImagePath({
      productionId: log.productionId,
      rehearsalLogId: log.id,
      uploaderId: authUser.id,
      extension: processed.extension,
    });
    const metadata = storage.buildImageMetadataPayload({
      rehearsalLogId: log.id,
      productionId: log.productionId,
      uploadedBy: authUser.id,
      storagePath: path,
      originalFilename: item.file.name,
      mimeType: processed.contentType,
      fileSize: processed.blob.size,
      sortOrder,
    });
    setPendingImageStatus(item, 'uploading');
    await storage.uploadRehearsalImage({ blob: processed.blob, path, contentType: processed.contentType });
    uploadedPath = path;
    const saved = await window.SupabaseDataService.createRehearsalLogImage(metadata);
    try {
      Object.assign(saved, await storage.createSignedImageUrl(saved.storage_path), { signedStatus: 'ready' });
    } catch (error) {
      Object.assign(saved, { signedUrl: '', expiresAt: '', signedStatus: 'failed' });
      console.warn('[Rehearsal Image] signed URL failed after upload', saved.id, error.code || 'SIGNED_URL_FAILED');
    }
    setPendingImageStatus(item, 'complete');
    return { status: 'success', item, saved };
  } catch (error) {
    if (uploadedPath) {
      try {
        await storage.deleteRehearsalImage(uploadedPath);
      } catch (cleanupError) {
        console.error('[Rehearsal Image] orphan cleanup failed', uploadedPath, cleanupError.code || 'STORAGE_DELETE_FAILED');
      }
    }
    setPendingImageStatus(item, 'failed', error.message || '이미지를 처리하지 못했습니다.');
    return { status: 'failed', item, errorCode: error.code || 'IMAGE_PROCESS_FAILED' };
  }
}

async function uploadPendingRehearsalImages(log) {
  const existing = rehearsalImagesByLog.get(log.id) || [];
  const results = [];
  for (let index = 0; index < pendingRehearsalImages.length; index += 1) {
    results.push(await uploadPendingRehearsalImage(pendingRehearsalImages[index], log, existing.length + index));
  }
  const successful = results.filter(result => result.status === 'success');
  rehearsalImagesByLog.set(log.id, [...existing, ...successful.map(result => result.saved)]);
  successful.forEach(result => window.RehearsalImageStorageService.revokeImagePreview(result.item.previewUrl));
  pendingRehearsalImages = results.filter(result => result.status === 'failed').map(result => result.item);
  return { successCount: successful.length, failedCount: pendingRehearsalImages.length };
}

async function moveSavedRehearsalImage(logId, imageId, direction) {
  const images = rehearsalImagesByLog.get(logId) || [];
  const from = images.findIndex(image => image.id === imageId);
  const to = direction === 'prev' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= images.length) return;
  [images[from], images[to]] = [images[to], images[from]];
  try {
    await Promise.all([
      window.SupabaseDataService.updateRehearsalLogImageOrder(images[from].id, from),
      window.SupabaseDataService.updateRehearsalLogImageOrder(images[to].id, to),
    ]);
    images.forEach((image, index) => { image.sort_order = index; });
    rehearsalSyncMessage = '';
  } catch (error) {
    rehearsalSyncMessage = error.message || '이미지 순서를 변경하지 못했습니다.';
    await loadRehearsalImages(logId);
  }
  render();
}

async function deleteSavedRehearsalImage(logId, imageId) {
  const requestKey = `image:${imageId}`;
  if (rehearsalDeleteInFlight.has(requestKey)) return;
  rehearsalDeleteInFlight.add(requestKey);
  const cachedImages = rehearsalImagesByLog.get(logId) || [];
  try {
    const metadata = await window.SupabaseDataService.getRehearsalLogImageById(imageId);
    if (metadata.status === 'EMPTY') {
      rehearsalImagesByLog.set(logId, cachedImages.filter(entry => entry.id !== imageId));
      rehearsalSyncMessage = '';
      return;
    }
    if (metadata.status !== 'PASS' || !metadata.data[0]) throw new Error('IMAGE_METADATA_READ_FAILED');
    const image = metadata.data[0];
    await window.RehearsalImageStorageService.deleteRehearsalImage(image.storage_path);
    await window.SupabaseDataService.deleteRehearsalLogImage(image.id);
    rehearsalImagesByLog.set(logId, cachedImages.filter(entry => entry.id !== image.id));
    rehearsalSyncMessage = '';
  } catch (error) {
    rehearsalSyncMessage = error.code === 'STORAGE_DELETE_FAILED'
      ? '이미지 파일을 삭제하지 못했습니다. 다시 시도해 주세요.'
      : '이미지 삭제 상태를 확인하지 못했습니다. 다시 시도해 주세요.';
    console.error('[Rehearsal Image] delete incomplete', imageId, error.code || error.message || 'DELETE_FAILED');
    await loadRehearsalImages(logId);
  } finally {
    rehearsalDeleteInFlight.delete(requestKey);
    render();
  }
}

async function deleteSupabaseRehearsalLog(logId) {
  const requestKey = `log:${logId}`;
  if (rehearsalDeleteInFlight.has(requestKey)) return false;
  rehearsalDeleteInFlight.add(requestKey);
  try {
    const logResult = await window.SupabaseDataService.getRehearsalLogById(logId);
    if (logResult.status === 'EMPTY') {
      supabaseRehearsalLogs = supabaseRehearsalLogs.filter(log => log.id !== logId);
      rehearsalImagesByLog.delete(logId);
      return true;
    }
    if (logResult.status !== 'PASS') throw new Error('LOG_READ_FAILED');
    const imageResult = await window.SupabaseDataService.getRehearsalLogImages(logId);
    if (imageResult.status !== 'PASS' && imageResult.status !== 'EMPTY') throw new Error('IMAGE_METADATA_READ_FAILED');
    const images = imageResult.data || [];
    const cleanup = await window.RehearsalImageStorageService.deleteRehearsalImages(images.map(image => image.storage_path));
    const failed = cleanup.filter(result => result.status === 'failed');
    if (failed.length) {
      console.warn('[Rehearsal Log] Storage cleanup incomplete', { logId, failedPaths: failed.map(result => result.path) });
      throw Object.assign(new Error('STORAGE_CLEANUP_INCOMPLETE'), { code: 'STORAGE_DELETE_FAILED' });
    }
    await window.SupabaseDataService.deleteRehearsalLog(logId);
    const cascadeCheck = await window.SupabaseDataService.getRehearsalLogImages(logId);
    if (cascadeCheck.status !== 'EMPTY') console.warn('[Rehearsal Log] metadata cascade verification', cascadeCheck.status);
    supabaseRehearsalLogs = supabaseRehearsalLogs.filter(log => log.id !== logId);
    rehearsalImagesByLog.delete(logId);
    rehearsalSyncMessage = '';
    return true;
  } catch (error) {
    rehearsalSyncMessage = error.code === 'STORAGE_DELETE_FAILED'
      ? '일부 이미지 파일을 삭제하지 못해 연습일지 삭제를 중단했습니다. 다시 시도해 주세요.'
      : '연습일지를 삭제하지 못했습니다. 다시 시도해 주세요.';
    console.error('[Rehearsal Log] delete incomplete', logId, error.code || error.message || 'DELETE_FAILED');
    await loadRehearsalImages(logId);
    return false;
  } finally {
    rehearsalDeleteInFlight.delete(requestKey);
  }
}

function renderPreShowChecklist() {
  const items = state.tasks.filter(t => t.preShowCheck);
  const done = items.filter(t => t.status === '완료').length;
  return `
  <section class="section section-preshow" id="section-checklist">
    <div class="section-heading"><span class="act-label">ACT 05</span><span class="section-caption">PRE-SHOW / HOUSE OPEN</span><h2><span class="n">05</span>공연 전 체크 <span class="count">(${done}/${items.length})</span></h2></div>
    <p class="note">업무 추가 시 "공연 전 체크리스트에 포함"을 체크한 업무만 여기 표시됩니다.</p>
    ${items.length ? items.map(t => `
      <div class="check-item ${t.status === '완료' ? 'checked' : ''}">
        <span class="badge ${t.status}">${t.status}</span>
        <span class="grow">${escapeHtml(t.name)} <span class="text-faint">· ${escapeHtml(t.part)}</span></span>
        ${t.required ? '<span class="tag-required">필수</span>' : ''}
      </div>
    `).join('') : `<div class="empty">공연 전 체크리스트에 포함된 업무가 없습니다.</div>`}
  </section>
  `;
}

function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="site-footer-identity">JEONDAE THEATRE <span>/</span> ACT II</div>
    <div class="site-footer-meta">PRODUCTION ARCHIVE · LOCAL FIRST · REV. 01</div>
  </footer>
  `;
}

/* ---------------- 이벤트 바인딩 ---------------- */

function bindEvents() {
  const logoutButton = document.querySelector('[data-auth-logout]');
  if (logoutButton) logoutButton.onclick = async () => {
    if (authBusy) return;
    authBusy = true;
    try {
      await window.AuthService.signOut();
      authSession = null; authUser = null; authProfile = null; authProfileStatus = 'UNKNOWN'; authMessage = '';
      activeSupabaseProduction = null; supabaseRehearsalLogs = []; rehearsalImagesByLog.clear();
      usesSupabaseTasks = false; state.tasks = legacyLocalTasks.map(task => ({ ...task })); taskSyncMessage = '';
      usesSupabaseEvents = false; state.events = legacyLocalEvents.map(event => ({ ...event })); eventSyncMessage = '';
      clearPendingRehearsalImages(); rehearsalImageDialog = null; rehearsalArchiveMode = 'list';
      selectedRehearsalLogId = null; pendingProtectedView = null; isLoginViewOpen = false;
      productionAccessStatus = 'UNKNOWN'; currentProductionRole = null; authMode = 'login';
      await loadPublicArchiveContext();
    } catch (error) {
      authMessage = error.message || '로그아웃하지 못했습니다.';
    } finally {
      authBusy = false; render();
    }
  };
  const p = state.performance;

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.view !== 'rehearsal' && pendingRehearsalImages.length) clearPendingRehearsalImages();
      currentView = btn.dataset.view; isLoginViewOpen = false; isTopNavOpen = false; render();
    };
  });
  document.querySelectorAll('[data-new-task]').forEach(btn => {
    btn.onclick = () => {
      if (!authSession) { pendingProtectedView = 'tasks'; isLoginViewOpen = true; isTopNavOpen = false; render(); return; }
      currentView = 'tasks'; isTaskFormOpen = true; isTopNavOpen = false; render();
    };
  });
  document.querySelectorAll('[data-auth-login]').forEach(btn => {
    btn.onclick = () => {
      if (currentView !== 'home') pendingProtectedView = currentView;
      isLoginViewOpen = true; isTopNavOpen = false; authMessage = ''; render();
      document.getElementById('auth-email')?.focus();
    };
  });
  document.querySelectorAll('[data-retry-auto-join]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true; button.textContent = '확인 중…';
      await loadSupabaseRehearsalContext();
      if (productionAccessStatus === 'READY') {
        await loadSupabaseTaskContext(); await loadSupabaseEventContext();
      }
      render();
    };
  });
  document.querySelectorAll('[data-topnav-toggle]').forEach(btn => {
    btn.onclick = () => { isTopNavOpen = !isTopNavOpen; render(); };
  });

  document.querySelectorAll('[data-toggle-performance-editor]').forEach(btn => {
    btn.onclick = () => { isPerformanceEditorOpen = !isPerformanceEditorOpen; render(); };
  });
  document.querySelectorAll('[data-toggle-task-form]').forEach(btn => {
    btn.onclick = () => { isTaskFormOpen = !isTaskFormOpen; render(); };
  });
  document.querySelectorAll('[data-hero-dashboard]').forEach(btn => {
    btn.onclick = () => {
      const dashboard = document.getElementById('home-dashboard');
      if (dashboard) dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  document.querySelectorAll('[data-new-rehearsal-log]').forEach(btn => {
    btn.onclick = () => { clearPendingRehearsalImages(); rehearsalFormDraft = null; rehearsalSyncMessage = ''; selectedRehearsalLogId = null; rehearsalArchiveMode = 'create'; render(); };
  });
  document.querySelectorAll('[data-rehearsal-list], [data-rehearsal-cancel]').forEach(btn => {
    btn.onclick = () => { clearPendingRehearsalImages(); rehearsalFormDraft = null; rehearsalArchiveMode = 'list'; selectedRehearsalLogId = null; render(); };
  });
  document.querySelectorAll('[data-rehearsal-detail]').forEach(btn => {
    btn.onclick = async () => {
      if (!authSession) {
        const publicLog = findPublicRehearsalLog(btn.dataset.rehearsalDetail);
        if (publicLog) await loadPublicArchiveRehearsalImages(publicLog.publicId);
        selectedRehearsalLogId = btn.dataset.rehearsalDetail; rehearsalArchiveMode = 'detail'; render();
        return;
      }
      const target = findRehearsalLogById(btn.dataset.rehearsalDetail);
      if (target && target.source === 'supabase') await loadRehearsalImages(target.id);
      selectedRehearsalLogId = btn.dataset.rehearsalDetail; rehearsalArchiveMode = 'detail'; render();
    };
  });
  document.querySelectorAll('[data-edit-rehearsal-log]').forEach(btn => {
    btn.onclick = async () => {
      clearPendingRehearsalImages(); rehearsalFormDraft = null; rehearsalSyncMessage = '';
      const target = findRehearsalLogById(btn.dataset.editRehearsalLog);
      if (target && target.source === 'supabase') await loadRehearsalImages(target.id);
      selectedRehearsalLogId = btn.dataset.editRehearsalLog; rehearsalArchiveMode = 'edit'; render();
    };
  });
  document.querySelectorAll('[data-delete-rehearsal-log]').forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm('이 연습일지를 삭제하시겠습니까?\n삭제된 글은 복구할 수 없습니다.')) return;
      const target = findRehearsalLogById(btn.dataset.deleteRehearsalLog);
      if (target && target.source === 'supabase') {
        if (rehearsalDeleteInFlight.has(`log:${target.id}`)) return;
        btn.disabled = true; btn.textContent = '삭제 중…';
        const deleted = await deleteSupabaseRehearsalLog(target.id);
        if (deleted) { selectedRehearsalLogId = null; rehearsalArchiveMode = 'list'; }
        render();
        return;
      }
      rehearsalLogs = rehearsalLogs.filter(log => log.id !== btn.dataset.deleteRehearsalLog);
      selectedRehearsalLogId = null; rehearsalArchiveMode = 'list';
      saveRehearsalLogs(); render();
    };
  });
  document.querySelectorAll('[data-rehearsal-category]').forEach(btn => {
    btn.onclick = () => { rehearsalCategoryFilter = btn.dataset.rehearsalCategory; render(); };
  });
  document.querySelectorAll('[data-clear-rehearsal-filter]').forEach(btn => {
    btn.onclick = () => { rehearsalCategoryFilter = '전체'; rehearsalSearchQuery = ''; render(); };
  });
  const rehearsalSearchForm = document.getElementById('rehearsal-search-form');
  if (rehearsalSearchForm) rehearsalSearchForm.onsubmit = event => {
    event.preventDefault();
    rehearsalSearchQuery = document.getElementById('rehearsal-search-input').value;
    render();
  };
  const imageInput = document.getElementById('rehearsal-image-input');
  if (imageInput) imageInput.onchange = event => {
    const files = Array.from(event.target.files || []);
    const selectedLog = findRehearsalLogById(selectedRehearsalLogId);
    const savedCount = selectedLog ? (rehearsalImagesByLog.get(selectedLog.id) || []).length : 0;
    try {
      window.RehearsalImageStorageService.validateSelectedFiles(files, savedCount + pendingRehearsalImages.length);
      captureRehearsalFormDraft();
      files.forEach(file => pendingRehearsalImages.push({
        localId: crypto.randomUUID(), file,
        previewUrl: window.RehearsalImageStorageService.createImagePreview(file),
        status: 'ready', message: '',
      }));
      rehearsalSyncMessage = '';
    } catch (error) {
      rehearsalSyncMessage = error.message || '이미지를 추가하지 못했습니다.';
    }
    event.target.value = '';
    render();
  };
  document.querySelectorAll('[data-remove-pending-image]').forEach(btn => {
    btn.onclick = () => {
      captureRehearsalFormDraft();
      const item = pendingRehearsalImages.find(entry => entry.localId === btn.dataset.removePendingImage);
      if (item) window.RehearsalImageStorageService.revokeImagePreview(item.previewUrl);
      pendingRehearsalImages = pendingRehearsalImages.filter(entry => entry.localId !== btn.dataset.removePendingImage);
      render();
    };
  });
  document.querySelectorAll('[data-image-move]').forEach(btn => {
    btn.onclick = async () => {
      const [scope, direction] = btn.dataset.imageMove.split('-');
      if (scope === 'saved') {
        await moveSavedRehearsalImage(selectedRehearsalLogId, btn.dataset.imageId, direction);
        return;
      }
      captureRehearsalFormDraft();
      const from = pendingRehearsalImages.findIndex(item => item.localId === btn.dataset.imageId);
      const to = direction === 'prev' ? from - 1 : from + 1;
      if (from >= 0 && to >= 0 && to < pendingRehearsalImages.length) {
        [pendingRehearsalImages[from], pendingRehearsalImages[to]] = [pendingRehearsalImages[to], pendingRehearsalImages[from]];
      }
      render();
    };
  });
  document.querySelectorAll('[data-delete-saved-image]').forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm('이 이미지를 삭제하시겠습니까?')) return;
      if (rehearsalDeleteInFlight.has(`image:${btn.dataset.deleteSavedImage}`)) return;
      btn.disabled = true; btn.textContent = '삭제 중…';
      await deleteSavedRehearsalImage(selectedRehearsalLogId, btn.dataset.deleteSavedImage);
    };
  });
  document.querySelectorAll('[data-retry-image]').forEach(btn => {
    btn.onclick = async () => {
      const log = findRehearsalLogById(selectedRehearsalLogId);
      const item = pendingRehearsalImages.find(entry => entry.localId === btn.dataset.retryImage);
      if (!log || !item) return;
      const result = await uploadPendingRehearsalImage(item, log, (rehearsalImagesByLog.get(log.id) || []).length);
      if (result.status === 'success') {
        rehearsalImagesByLog.set(log.id, [...(rehearsalImagesByLog.get(log.id) || []), result.saved]);
        window.RehearsalImageStorageService.revokeImagePreview(item.previewUrl);
        pendingRehearsalImages = pendingRehearsalImages.filter(entry => entry !== item);
        rehearsalSyncMessage = '이미지 업로드가 완료되었습니다.';
      }
      render();
    };
  });
  document.querySelectorAll('[data-open-image-dialog]').forEach(btn => {
    btn.onclick = () => showRehearsalImageDialog(selectedRehearsalLogId, btn.dataset.openImageDialog);
  });
  const imageDialog = document.querySelector('.image-dialog');
  const imageBackdrop = document.querySelector('[data-image-dialog-backdrop]');
  const closeImageDialogButton = document.querySelector('[data-image-dialog-close]');
  if (closeImageDialogButton) closeImageDialogButton.onclick = closeRehearsalImageDialog;
  if (imageBackdrop) imageBackdrop.onclick = event => {
    if (event.target === imageBackdrop) closeRehearsalImageDialog();
  };
  const previousImageButton = document.querySelector('[data-image-dialog-prev]');
  const nextImageButton = document.querySelector('[data-image-dialog-next]');
  if (previousImageButton) previousImageButton.onclick = () => stepRehearsalImageDialog(-1);
  if (nextImageButton) nextImageButton.onclick = () => stepRehearsalImageDialog(1);
  if (imageDialog) imageDialog.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); closeRehearsalImageDialog(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); stepRehearsalImageDialog(-1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); stepRehearsalImageDialog(1); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...imageDialog.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) { event.preventDefault(); imageDialog.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.querySelectorAll('[data-public-image]').forEach(image => {
    image.onerror = () => {
      const imageId = image.dataset.publicImageId;
      const images = publicArchiveState.imagesByLog.get(selectedRehearsalLogId) || [];
      const metadata = images.find(item => item.publicId === imageId);
      if (metadata) metadata.deliveryStatus = 'failed';
      image.hidden = true;
      image.closest('.rehearsal-gallery-thumb, .image-dialog-stage')?.classList.add('has-image-error');
    };
  });
  document.querySelectorAll('[data-signed-image-path]').forEach(image => {
    image.onerror = async () => {
      const attempts = Number(image.dataset.signedRefreshAttempts || 0);
      if (image.dataset.refreshingSignedUrl === 'true') return;
      if (attempts >= 1) {
        image.hidden = true;
        image.closest('.rehearsal-gallery-thumb, .image-dialog-stage')?.classList.add('has-image-error');
        return;
      }
      image.dataset.refreshingSignedUrl = 'true';
      image.dataset.signedRefreshAttempts = String(attempts + 1);
      try {
        const refreshed = await window.RehearsalImageStorageService.refreshSignedImageUrl(image.dataset.signedImagePath);
        image.src = refreshed.signedUrl;
      } catch (error) {
        console.warn('[Rehearsal Image] signed URL refresh failed', error.code || 'SIGNED_URL_FAILED');
        image.hidden = true;
        image.closest('.rehearsal-gallery-thumb, .image-dialog-stage')?.classList.add('has-image-error');
      } finally {
        image.dataset.refreshingSignedUrl = 'false';
      }
    };
  });
  const rehearsalLogForm = document.getElementById('rehearsal-log-form');
  if (rehearsalLogForm) rehearsalLogForm.onsubmit = async event => {
    event.preventDefault();
    if (!rehearsalLogForm.reportValidity()) return;
    const titleInput = document.getElementById('r-title');
    const authorInput = document.getElementById('r-author');
    const contentInput = document.getElementById('r-content');
    if (!titleInput.value.trim()) { titleInput.focus(); return; }
    if (!authorInput.value.trim()) { authorInput.focus(); return; }
    if (!contentInput.value.trim()) { contentInput.focus(); return; }
    const existing = findRehearsalLogById(selectedRehearsalLogId);
    const timestamp = new Date().toISOString();
    const rawTags = document.getElementById('r-tags').value;
    const tags = [...new Set(rawTags.split(/[\s,]+/).map(tag => tag.replace(/^#+/, '').trim()).filter(Boolean))];
    const fields = {
      title: titleInput.value.trim(),
      authorDisplayName: authorInput.value.trim(),
      rehearsalDate: document.getElementById('r-date').value,
      category: rehearsalLogForm.querySelector('[name="rehearsal-category"]:checked').value,
      content: contentInput.value.trim(),
      tags,
    };
    if (!existing || existing.source === 'supabase') {
      if (!window.SupabaseDataService || !activeSupabaseProduction) {
        rehearsalSyncMessage = '활성 Production을 확인한 뒤 다시 시도해 주세요.';
        render();
        return;
      }
      rehearsalWriteBusy = true; rehearsalSyncMessage = '';
      const submitButton = rehearsalLogForm.querySelector('[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = '저장 중…'; }
      try {
        const row = existing
          ? await window.SupabaseDataService.updateRehearsalLog(existing.id, fields)
          : await window.SupabaseDataService.createRehearsalLog({ productionId: activeSupabaseProduction.id, ...fields });
        const mapped = mapSupabaseRehearsalLog(row);
        const index = supabaseRehearsalLogs.findIndex(log => log.id === mapped.id);
        if (index >= 0) supabaseRehearsalLogs[index] = mapped;
        else supabaseRehearsalLogs.push(mapped);
        selectedRehearsalLogId = mapped.id;
        const uploadResult = await uploadPendingRehearsalImages(mapped);
        rehearsalFormDraft = null;
        if (uploadResult.failedCount) {
          rehearsalSyncMessage = `사진 ${uploadResult.successCount}장은 저장되었지만 ${uploadResult.failedCount}장 업로드에 실패했습니다.`;
          rehearsalArchiveMode = 'edit';
        } else {
          rehearsalSyncMessage = uploadResult.successCount ? `사진 ${uploadResult.successCount}장과 연습일지가 저장되었습니다.` : '';
          rehearsalArchiveMode = 'detail';
        }
        setSaveStatus('Supabase에 저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      } catch (error) {
        rehearsalSyncMessage = error.message || '연습일지를 저장하지 못했습니다.';
      } finally {
        rehearsalWriteBusy = false; render();
      }
      return;
    }
    const logData = {
      id: existing ? existing.id : nextRehearsalLogId(),
      title: fields.title,
      author: authorInput.value.trim(),
      date: fields.rehearsalDate,
      category: fields.category,
      content: fields.content,
      tags,
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp,
    };
    if (existing) rehearsalLogs[rehearsalLogs.indexOf(existing)] = logData;
    else rehearsalLogs.push(logData);
    selectedRehearsalLogId = logData.id; rehearsalArchiveMode = 'detail';
    saveRehearsalLogs(); render();
  };

  document.querySelectorAll('[data-calendar-prev]').forEach(btn => {
    btn.onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); render(); };
  });
  document.querySelectorAll('[data-calendar-next]').forEach(btn => {
    btn.onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); render(); };
  });
  document.querySelectorAll('[data-calendar-today]').forEach(btn => {
    btn.onclick = () => { calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); selectedCalendarDate = todayStr; render(); };
  });
  document.querySelectorAll('[data-select-date]').forEach(btn => {
    btn.onclick = event => { event.stopPropagation(); selectedCalendarDate = btn.dataset.selectDate; render(); };
  });
  document.querySelectorAll('[data-calendar-date]').forEach(cell => {
    cell.onclick = () => { selectedCalendarDate = cell.dataset.calendarDate; render(); };
  });
  document.querySelectorAll('[data-event-detail]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const item = authSession
        ? state.events.find(entry => entry.id === btn.dataset.eventDetail)
        : publicArchiveState.events.find(entry => entry.publicId === btn.dataset.eventDetail);
      if (item) selectedCalendarDate = item.date;
      render();
    };
  });
  document.querySelectorAll('[data-new-event]').forEach(btn => {
    btn.onclick = () => { editingEventId = null; isEventFormOpen = true; render(); };
  });
  document.querySelectorAll('[data-close-event-form]').forEach(btn => {
    btn.onclick = () => { editingEventId = null; isEventFormOpen = false; render(); };
  });
  document.querySelectorAll('[data-edit-event]').forEach(btn => {
    btn.onclick = () => { editingEventId = btn.dataset.editEvent; isEventFormOpen = true; render(); };
  });
  document.querySelectorAll('[data-delete-event]').forEach(btn => {
    btn.onclick = async () => {
      const eventId = btn.dataset.deleteEvent;
      if (eventDeleteInFlight.has(eventId)) return;
      eventDeleteInFlight.add(eventId); eventSyncMessage = ''; render();
      try {
        await window.SupabaseDataService.deleteEvent(eventId);
        state.events = state.events.filter(event => event.id !== eventId);
        if (editingEventId === eventId) { editingEventId = null; isEventFormOpen = false; }
      } catch (error) {
        eventSyncMessage = error.message || '일정을 삭제하지 못했습니다.';
        console.warn('[Supabase Events] delete failed', error.code || 'DELETE_FAILED');
      } finally {
        eventDeleteInFlight.delete(eventId); render();
      }
    };
  });

  const saveEventBtn = document.getElementById('save-event');
  if (saveEventBtn) saveEventBtn.onclick = async () => {
    if (eventWriteBusy || !usesSupabaseEvents || !activeSupabaseProduction) return;
    const titleInput = document.getElementById('e-title');
    const dateInput = document.getElementById('e-date');
    const title = titleInput.value.trim();
    const date = dateInput.value;
    if (!title) { titleInput.focus(); return; }
    if (!date) { dateInput.focus(); return; }
    const eventData = {
      title, eventDate: date,
      startTime: document.getElementById('e-start').value,
      endTime: document.getElementById('e-end').value,
      type: document.getElementById('e-type').value,
      part: document.getElementById('e-part').value,
      location: document.getElementById('e-location').value.trim(),
      memo: document.getElementById('e-memo').value.trim(),
    };
    eventWriteBusy = true; eventSyncMessage = '';
    saveEventBtn.disabled = true; saveEventBtn.textContent = '저장 중…';
    let savedSuccessfully = false;
    try {
      const row = editingEventId
        ? await window.SupabaseDataService.updateEvent(editingEventId, eventData)
        : await window.SupabaseDataService.createEvent({ productionId: activeSupabaseProduction.id, ...eventData });
      const mapped = mapSupabaseEvent(row);
      const index = state.events.findIndex(event => event.id === mapped.id);
      if (index >= 0) state.events[index] = mapped;
      else state.events.push(mapped);
      selectedCalendarDate = date;
      calendarCursor = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);
      editingEventId = null; isEventFormOpen = false;
      savedSuccessfully = true;
    } catch (error) {
      eventSyncMessage = error.message || '일정을 저장하지 못했습니다.';
      console.warn('[Supabase Events] save failed', error.code || 'CREATE_FAILED');
    } finally {
      eventWriteBusy = false;
      if (savedSuccessfully) render();
      else {
        saveEventBtn.disabled = false;
        saveEventBtn.textContent = editingEventId ? '일정 수정' : '일정 저장';
        document.querySelectorAll('.event-sync-message').forEach(message => { message.textContent = eventSyncMessage; });
      }
    }
  };

  const ft = document.getElementById('f-title');
  if (ft) ft.onchange = e => { p.title = e.target.value; render(); saveState(); };
  const fdate = document.getElementById('f-date');
  if (fdate) fdate.onchange = e => { p.date = e.target.value; render(); saveState(); };
  const fvenue = document.getElementById('f-venue');
  if (fvenue) fvenue.onchange = e => { p.venue = e.target.value; saveState(); };
  const fvenueInfo = document.getElementById('f-venue-info');
  if (fvenueInfo) fvenueInfo.onchange = e => { p.venueInfo = e.target.value; saveState(); };
  const fstart = document.getElementById('f-start');
  if (fstart) fstart.onchange = e => { p.projectStartDate = e.target.value; render(); saveState(); };
  const fstatus = document.getElementById('f-status');
  if (fstatus) fstatus.onchange = e => { p.status = e.target.value; saveState(); };
  const frehearsal = document.getElementById('f-rehearsal');
  if (frehearsal) frehearsal.onchange = e => { p.rehearsalAvailability = e.target.value; saveState(); };

  const addPartBtn = document.getElementById('add-part');
  if (addPartBtn) addPartBtn.onclick = () => {
    const inp = document.getElementById('new-part');
    const v = inp.value.trim();
    if (v && !p.parts.includes(v)) { p.parts.push(v); render(); saveState(); }
  };
  document.querySelectorAll('[data-remove-part]').forEach(b => {
    b.onclick = () => { p.parts = p.parts.filter(x => x !== b.dataset.removePart); render(); saveState(); };
  });

  const addPersonBtn = document.getElementById('add-person');
  if (addPersonBtn) addPersonBtn.onclick = () => {
    const name = document.getElementById('p-name').value.trim();
    const part = document.getElementById('p-part').value;
    if (name) { p.participants.push({ name, part }); render(); saveState(); }
  };
  document.querySelectorAll('[data-remove-person]').forEach(b => {
    b.onclick = () => { p.participants.splice(+b.dataset.removePerson, 1); render(); saveState(); };
  });

  const addTaskBtn = document.getElementById('add-task');
  if (addTaskBtn) addTaskBtn.onclick = async () => {
    if (taskWriteBusy || !usesSupabaseTasks || !activeSupabaseProduction) return;
    const name = document.getElementById('t-name').value.trim();
    if (!name) return;
    const input = {
      productionId: activeSupabaseProduction.id,
      part: document.getElementById('t-part').value, name,
      assignee: document.getElementById('t-assignee').value,
      deadline: document.getElementById('t-deadline').value,
      status: '대기', priority: document.getElementById('t-priority').value,
      prerequisiteTaskId: document.getElementById('t-prereq').value || null,
      required: document.getElementById('t-required').checked,
      preShowCheck: document.getElementById('t-preshow').checked,
    };
    taskWriteBusy = true; taskSyncMessage = '';
    addTaskBtn.disabled = true; addTaskBtn.textContent = '저장 중…';
    let createdSuccessfully = false;
    try {
      const created = await window.SupabaseDataService.createTask(input);
      state.tasks.push(mapSupabaseTask(created));
      isTaskFormOpen = false;
      createdSuccessfully = true;
    } catch (error) {
      taskSyncMessage = error.message || '업무를 저장하지 못했습니다.';
      console.warn('[Supabase Tasks] create failed', error.code || 'CREATE_FAILED');
    } finally {
      taskWriteBusy = false;
      if (createdSuccessfully) render();
      else {
        addTaskBtn.disabled = false; addTaskBtn.textContent = '업무 추가';
        document.querySelectorAll('.task-sync-message').forEach(message => { message.textContent = taskSyncMessage; });
      }
    }
  };
  document.querySelectorAll('[data-del-task]').forEach(b => {
    b.onclick = async () => {
      const taskId = b.dataset.delTask;
      if (taskDeleteInFlight.has(taskId)) return;
      taskDeleteInFlight.add(taskId); taskSyncMessage = ''; render();
      try {
        await window.SupabaseDataService.deleteTask(taskId);
        state.tasks = state.tasks.filter(task => task.taskId !== taskId);
      } catch (error) {
        taskSyncMessage = error.message || '업무를 삭제하지 못했습니다.';
        console.warn('[Supabase Tasks] delete failed', error.code || 'DELETE_FAILED');
      } finally {
        taskDeleteInFlight.delete(taskId); render();
      }
    };
  });
  document.querySelectorAll('[data-status]').forEach(el => {
    el.onchange = async () => {
      const t = state.tasks.find(x => x.taskId === el.dataset.status);
      if (!t || taskWriteBusy) return;
      const previousStatus = t.status;
      taskWriteBusy = true; taskSyncMessage = ''; el.disabled = true;
      try {
        const updated = await window.SupabaseDataService.updateTask(t.taskId, {
          ...t, status: el.value, prerequisiteTaskId: t.prereqTaskId,
        });
        Object.assign(t, mapSupabaseTask(updated));
      } catch (error) {
        t.status = previousStatus;
        taskSyncMessage = error.message || '업무를 수정하지 못했습니다.';
        console.warn('[Supabase Tasks] update failed', error.code || 'UPDATE_FAILED');
      } finally {
        taskWriteBusy = false; render();
      }
    };
  });
  document.querySelectorAll('[data-filter-part]').forEach(b => {
    b.onclick = () => { currentPartFilter = b.dataset.filterPart; render(); };
  });
}

/* ---------------- 유틸 ---------------- */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function attr(str) { return escapeHtml(str); }
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}. ${match[2]}. ${match[3]}.` : String(dateStr);
}

window.__APP_INIT_PROMISE__ = init();
