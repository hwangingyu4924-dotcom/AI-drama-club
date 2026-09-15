/** Supabase Data Access Layer. Tasks and rehearsal logs are shared data; events remain local-first. */
(function createSupabaseReadService(global) {
  'use strict';

  const TABLES = Object.freeze([
    'productions',
    'tasks',
    'events',
    'rehearsal_logs',
    'production_members',
    'profiles',
  ]);
  const REHEARSAL_CATEGORIES = Object.freeze(['전체연습', '연기', '연출', '무대', '회의', '기타']);

  class DataServiceError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = 'DataServiceError';
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  function dataError(code, message, cause) {
    return new DataServiceError(code, message, cause);
  }

  async function getClient() {
    if (!global.SupabaseClientProvider) {
      const error = new Error('Supabase Client provider를 불러오지 못했습니다.');
      error.code = 'SDK_UNAVAILABLE';
      throw error;
    }
    return global.SupabaseClientProvider.getClient();
  }

  function classifyReadError(error) {
    const code = String(error && error.code || '');
    const status = Number(error && (error.status || error.statusCode));
    const message = String(error && error.message || 'Supabase READ 요청에 실패했습니다.');
    const normalized = `${code} ${message}`.toLowerCase();

    if (status === 401 || normalized.includes('jwt') || normalized.includes('not authenticated')) {
      return { status: 'AUTH_REQUIRED', error: { code, message, httpStatus: status || null } };
    }
    if (status === 403 || code === '42501' || normalized.includes('permission denied') || normalized.includes('row-level security')) {
      return { status: 'RLS_BLOCKED', error: { code, message, httpStatus: status || null } };
    }
    if (error instanceof TypeError || normalized.includes('failed to fetch') || normalized.includes('network')) {
      return { status: 'NETWORK_ERROR', error: { code, message, httpStatus: status || null } };
    }
    return { status: 'FAIL', error: { code, message, httpStatus: status || null } };
  }

  async function selectRows(table, columns, configureQuery) {
    try {
      const client = await getClient();
      let query = client.from(table).select(columns);
      if (typeof configureQuery === 'function') query = configureQuery(query);
      const { data, error } = await query;
      if (error) return { table, ...classifyReadError(error), data: null };
      const rows = Array.isArray(data) ? data : [];
      return { table, status: rows.length ? 'PASS' : 'EMPTY', data: rows, error: null };
    } catch (error) {
      return { table, ...classifyReadError(error), data: null };
    }
  }

  function requirePublicSlug(value) {
    const slug = String(value || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw dataError('VALIDATION_ERROR', '공개 아카이브 경로가 올바르지 않습니다.');
    }
    return slug;
  }

  async function callPublicArchiveRpc(rpcName, args) {
    try {
      const client = await getClient();
      const { data, error } = await client.rpc(rpcName, args);
      if (error) return { rpc: rpcName, ...classifyReadError(error), data: null };
      const rows = Array.isArray(data) ? data : (data ? [data] : []);
      return { rpc: rpcName, status: rows.length ? 'PASS' : 'EMPTY', data: rows, error: null };
    } catch (error) {
      return { rpc: rpcName, ...classifyReadError(error), data: null };
    }
  }

  function getPublicArchiveProduction(slug) {
    return callPublicArchiveRpc('get_public_archive_production', {
      requested_public_slug: requirePublicSlug(slug),
    });
  }

  function getPublicArchiveTasks(slug) {
    return callPublicArchiveRpc('get_public_archive_tasks', {
      requested_public_slug: requirePublicSlug(slug),
    });
  }

  function getPublicArchiveEvents(slug) {
    return callPublicArchiveRpc('get_public_archive_events', {
      requested_public_slug: requirePublicSlug(slug),
    });
  }

  function getPublicArchiveRehearsalLogs(slug) {
    return callPublicArchiveRpc('get_public_archive_rehearsal_logs', {
      requested_public_slug: requirePublicSlug(slug),
    });
  }

  function getPublicArchiveRehearsalImages(slug, rehearsalPublicId) {
    return callPublicArchiveRpc('get_public_archive_rehearsal_images', {
      requested_public_slug: requirePublicSlug(slug),
      requested_rehearsal_public_id: requireUuid(rehearsalPublicId, '공개 연습일지 ID'),
    });
  }

  function buildPublicRehearsalImageUrl(slug, rehearsalPublicId, imagePublicId) {
    const config = global.AI_DRAMA_CONFIG || {};
    const baseUrl = String(config.SUPABASE_URL || '').replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl)) {
      throw dataError('CONFIG_ERROR', '공개 이미지 서비스 설정을 확인해 주세요.');
    }
    const productionSlug = requirePublicSlug(slug);
    const rehearsalId = requireUuid(rehearsalPublicId, '공개 연습일지 ID');
    const imageId = requireUuid(imagePublicId, '공개 이미지 ID');
    return `${baseUrl}/functions/v1/public-rehearsal-image?production=${encodeURIComponent(productionSlug)}&rehearsal=${encodeURIComponent(rehearsalId)}&image=${encodeURIComponent(imageId)}`;
  }

  function getProductions() {
    return selectRows('productions', 'id,title,performance_date,venue,venue_info,project_start_date,status,parts,rehearsal_availability,created_by,created_at,updated_at');
  }

  function getCurrentProduction(productionId) {
    if (productionId) {
      return selectRows('productions', 'id,title,performance_date,venue,venue_info,project_start_date,status,parts,rehearsal_availability,created_by,created_at,updated_at', query => query.eq('id', productionId).limit(1));
    }
    return selectRows('productions', 'id,title,performance_date,venue,venue_info,project_start_date,status,parts,rehearsal_availability,created_by,created_at,updated_at', query => query.order('created_at', { ascending: true }).limit(1));
  }

  function getTasks(productionId) {
    return selectRows('tasks', 'id,production_id,legacy_id,part,name,assignee,deadline,status,priority,prerequisite_task_id,required,pre_show_check,created_at,updated_at', query => productionId ? query.eq('production_id', productionId) : query);
  }

  function getEvents(productionId) {
    return selectRows('events', 'id,production_id,legacy_id,title,event_date,start_time,end_time,type,part,location,memo,created_at,updated_at', query => productionId ? query.eq('production_id', productionId) : query);
  }

  const REHEARSAL_AUTHOR_DISPLAY_NAME_MAX_LENGTH = 80;

  function getRehearsalLogs(productionId) {
    return selectRows('rehearsal_logs', 'id,production_id,legacy_id,title,rehearsal_date,author,author_display_name,author_profile_id,category,content,tags,created_at,updated_at', query => {
      const filtered = productionId ? query.eq('production_id', productionId) : query;
      return filtered.order('rehearsal_date', { ascending: false }).order('created_at', { ascending: false });
    });
  }

  function getRehearsalLogById(logId) {
    return selectRows('rehearsal_logs', 'id,production_id,legacy_id,title,rehearsal_date,author,author_display_name,author_profile_id,category,content,tags,created_at,updated_at', query => query.eq('id', requireUuid(logId, '연습일지 ID')).limit(1));
  }

  function getRehearsalLogImages(logId) {
    return selectRows('rehearsal_log_images', 'id,rehearsal_log_id,production_id,uploaded_by,storage_path,original_filename,mime_type,file_size,sort_order,created_at,updated_at', query => query.eq('rehearsal_log_id', requireUuid(logId, '연습일지 ID')).order('sort_order', { ascending: true }).order('created_at', { ascending: true }));
  }

  function getRehearsalLogImageById(imageId) {
    return selectRows('rehearsal_log_images', 'id,rehearsal_log_id,production_id,uploaded_by,storage_path,original_filename,mime_type,file_size,sort_order,created_at,updated_at', query => query.eq('id', requireUuid(imageId, '이미지 ID')).limit(1));
  }

  function getProductionMembers(productionId) {
    return selectRows('production_members', 'production_id,profile_id,display_name,part,role,created_at', query => productionId ? query.eq('production_id', productionId) : query);
  }

  function getProfiles() {
    return selectRows('profiles', 'id,display_name,created_at,updated_at');
  }

  function getProfile(profileId) {
    return selectRows('profiles', 'id,display_name,created_at,updated_at', query => query.eq('id', profileId).limit(1));
  }

  function requireUuid(value, label) {
    const normalized = String(value || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw dataError('VALIDATION_ERROR', `${label || 'UUID'}가 올바르지 않습니다.`);
    }
    return normalized.toLowerCase();
  }

  function normalizeLogInput(input, defaultAuthorDisplayName = '') {
    const title = String(input && input.title || '').trim();
    const rehearsalDate = String(input && input.rehearsalDate || '').trim();
    const category = String(input && input.category || '').trim();
    const content = String(input && input.content || '').trim();
    const authorDisplayName = String(input && input.authorDisplayName || defaultAuthorDisplayName || '').trim();
    const tags = Array.isArray(input && input.tags)
      ? [...new Set(input.tags.map(tag => String(tag || '').trim()).filter(Boolean))]
      : null;
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(rehearsalDate) || !content || !tags || !REHEARSAL_CATEGORIES.includes(category)
      || !authorDisplayName || authorDisplayName.length > REHEARSAL_AUTHOR_DISPLAY_NAME_MAX_LENGTH) {
      throw dataError('VALIDATION_ERROR', '제목, 연습일, 분류, 본문과 태그 형식을 확인해 주세요.');
    }
    return { title, rehearsal_date: rehearsalDate, category, content, tags, author_display_name: authorDisplayName };
  }

  function classifyWriteError(error, operation) {
    if (error instanceof DataServiceError) return error;
    const status = Number(error && (error.status || error.statusCode));
    const detail = `${String(error && error.code || '')} ${String(error && error.message || '')}`.toLowerCase();
    if (status === 401 || detail.includes('jwt') || detail.includes('not authenticated')) {
      return dataError('AUTH_REQUIRED', '로그인 세션을 다시 확인해 주세요.', error);
    }
    if (status === 403 || detail.includes('42501') || detail.includes('permission denied') || detail.includes('row-level security')) {
      return dataError('RLS_BLOCKED', '이 연습일지를 변경할 권한이 없습니다.', error);
    }
    const messages = {
      CREATE: '연습일지를 저장하지 못했습니다.',
      UPDATE: '연습일지를 수정하지 못했습니다.',
      DELETE: '연습일지를 삭제하지 못했습니다.',
    };
    return dataError(`${operation}_FAILED`, messages[operation], error);
  }

  async function requireCurrentIdentity(client) {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData || !userData.user) throw dataError('AUTH_REQUIRED', '로그인이 필요합니다.', userError);
    const userId = requireUuid(userData.user.id, '사용자 ID');
    const { data: profile, error: profileError } = await client
      .from('profiles').select('id,display_name').eq('id', userId).single();
    if (profileError || !profile || profile.id !== userId) {
      throw dataError('AUTH_REQUIRED', '로그인 사용자 프로필을 확인하지 못했습니다.', profileError);
    }
    return { userId, displayName: profile.display_name };
  }

  async function resolveActiveProduction(productionId) {
    if (productionId) {
      const result = await getCurrentProduction(requireUuid(productionId, 'Production ID'));
      if (result.status === 'PASS' && result.data.length === 1) return result.data[0];
      if (result.status === 'RLS_BLOCKED' || result.status === 'AUTH_REQUIRED') throw dataError(result.status, 'Production 접근 권한을 확인해 주세요.');
      throw dataError('NO_ACTIVE_PRODUCTION', '활성 Production을 찾지 못했습니다.');
    }
    const result = await getProductions();
    if (result.status === 'PASS' && result.data.length === 1) return result.data[0];
    if (result.status === 'PASS' && result.data.length > 1) {
      throw dataError('NO_ACTIVE_PRODUCTION', '여러 Production 중 사용할 공연을 먼저 선택해 주세요.');
    }
    if (result.status === 'EMPTY') throw dataError('NO_ACTIVE_PRODUCTION', '활성 Production이 없습니다.');
    throw dataError(result.status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'READ_FAILED', 'Production을 확인하지 못했습니다.', result.error);
  }

  function createLegacyId() {
    if (!global.crypto || typeof global.crypto.randomUUID !== 'function') {
      throw dataError('CREATE_FAILED', '안전한 연습일지 식별자를 만들 수 없습니다.');
    }
    // The current DB requires legacy_id. New rows use a collision-resistant
    // compatibility key; no localStorage LOG-* identifier is created or reused.
    return `WEB-${global.crypto.randomUUID()}`;
  }

  function normalizeTaskInput(input) {
    const name = String(input && input.name || '').trim();
    const part = String(input && input.part || '').trim();
    const assignee = String(input && input.assignee || '').trim();
    const deadline = String(input && input.deadline || '').trim();
    const status = String(input && input.status || '대기').trim();
    const priority = String(input && input.priority || '보통').trim();
    const prerequisiteTaskId = input && input.prerequisiteTaskId
      ? requireUuid(input.prerequisiteTaskId, '선행 업무 ID') : null;
    if (!name || !part || (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline))
      || !['대기', '진행중', '완료', '보류'].includes(status)
      || !['높음', '보통', '낮음'].includes(priority)) {
      throw dataError('VALIDATION_ERROR', '업무명, 담당 파트, 상태, 우선순위와 마감일을 확인해 주세요.');
    }
    return {
      part, name, assignee, deadline: deadline || null, status, priority,
      prerequisite_task_id: prerequisiteTaskId,
      required: Boolean(input && input.required),
      pre_show_check: Boolean(input && input.preShowCheck),
    };
  }

  function classifyTaskWriteError(error, operation) {
    const classified = classifyWriteError(error, operation);
    if (classified.code === 'RLS_BLOCKED') classified.message = '이 업무를 변경할 권한이 없습니다.';
    else if (classified.code === 'CREATE_FAILED') classified.message = '업무를 저장하지 못했습니다.';
    else if (classified.code === 'UPDATE_FAILED') classified.message = '업무를 수정하지 못했습니다.';
    else if (classified.code === 'DELETE_FAILED') classified.message = '업무를 삭제하지 못했습니다.';
    return classified;
  }

  function normalizeEventInput(input) {
    const title = String(input && input.title || '').trim();
    const eventDate = String(input && input.eventDate || '').trim();
    const startTime = String(input && input.startTime || '').trim();
    const endTime = String(input && input.endTime || '').trim();
    const type = String(input && input.type || '연습').trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      || (startTime && !/^\d{2}:\d{2}$/.test(startTime))
      || (endTime && !/^\d{2}:\d{2}$/.test(endTime))
      || !['연습', '회의', '리딩', '공연', '설치/기술', '기타'].includes(type)) {
      throw dataError('VALIDATION_ERROR', '일정명, 날짜, 시간과 종류를 확인해 주세요.');
    }
    return {
      title, event_date: eventDate,
      start_time: startTime || null, end_time: endTime || null, type,
      part: String(input && input.part || '').trim(),
      location: String(input && input.location || '').trim(),
      memo: String(input && input.memo || '').trim(),
    };
  }

  function classifyEventWriteError(error, operation) {
    const classified = classifyWriteError(error, operation);
    if (classified.code === 'RLS_BLOCKED') classified.message = '이 일정을 변경할 권한이 없습니다.';
    else if (classified.code === 'CREATE_FAILED') classified.message = '일정을 저장하지 못했습니다.';
    else if (classified.code === 'UPDATE_FAILED') classified.message = '일정을 수정하지 못했습니다.';
    else if (classified.code === 'DELETE_FAILED') classified.message = '일정을 삭제하지 못했습니다.';
    return classified;
  }

  async function createEvent(input) {
    try {
      const client = await getClient();
      const production = await resolveActiveProduction(input && input.productionId);
      await requireCurrentIdentity(client);
      const payload = { ...normalizeEventInput(input), production_id: production.id, legacy_id: createLegacyId() };
      const { data, error } = await client.from('events').insert(payload)
        .select('id,production_id,legacy_id,title,event_date,start_time,end_time,type,part,location,memo,created_at,updated_at').single();
      if (error || !data || !data.id) throw error || new Error('Missing created event');
      return data;
    } catch (error) {
      throw classifyEventWriteError(error, 'CREATE');
    }
  }

  async function updateEvent(eventId, changes) {
    try {
      const client = await getClient();
      await requireCurrentIdentity(client);
      const payload = normalizeEventInput(changes);
      const { data, error } = await client.from('events').update(payload)
        .eq('id', requireUuid(eventId, '일정 ID'))
        .select('id,production_id,legacy_id,title,event_date,start_time,end_time,type,part,location,memo,created_at,updated_at').single();
      if (error || !data) throw error || new Error('Missing updated event');
      return data;
    } catch (error) {
      throw classifyEventWriteError(error, 'UPDATE');
    }
  }

  async function deleteEvent(eventId) {
    try {
      const client = await getClient();
      await requireCurrentIdentity(client);
      const { data, error } = await client.from('events').delete()
        .eq('id', requireUuid(eventId, '일정 ID')).select('id').single();
      if (error || !data) throw error || new Error('Missing deleted event');
      return data;
    } catch (error) {
      throw classifyEventWriteError(error, 'DELETE');
    }
  }

  async function ensureCurrentProductionMembership() {
    try {
      const client = await getClient();
      await requireCurrentIdentity(client);
      const { data, error } = await client.rpc('ensure_current_production_membership');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.production_id || !row.profile_id || !['MEMBER', 'ADMIN'].includes(row.role)) {
        throw dataError('AUTO_JOIN_FAILED', '공연 참여 정보를 설정하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      return row;
    } catch (error) {
      if (error instanceof DataServiceError) throw error;
      const detail = `${String(error && error.code || '')} ${String(error && error.message || '')}`.toLowerCase();
      if (detail.includes('authentication') || detail.includes('jwt')) throw dataError('AUTH_REQUIRED', '로그인이 필요합니다.', error);
      throw dataError('AUTO_JOIN_FAILED', '공연 참여 정보를 설정하지 못했습니다. 잠시 후 다시 시도해 주세요.', error);
    }
  }

  async function createTask(input) {
    try {
      const client = await getClient();
      const production = await resolveActiveProduction(input && input.productionId);
      await requireCurrentIdentity(client);
      const payload = {
        ...normalizeTaskInput(input),
        production_id: production.id,
        legacy_id: createLegacyId(),
      };
      const { data, error } = await client.from('tasks').insert(payload)
        .select('id,production_id,legacy_id,part,name,assignee,deadline,status,priority,prerequisite_task_id,required,pre_show_check,created_at,updated_at').single();
      if (error || !data || !data.id) throw error || new Error('Missing created task');
      return data;
    } catch (error) {
      throw classifyTaskWriteError(error, 'CREATE');
    }
  }

  async function updateTask(taskId, changes) {
    try {
      const client = await getClient();
      await requireCurrentIdentity(client);
      const payload = normalizeTaskInput(changes);
      const { data, error } = await client.from('tasks').update(payload)
        .eq('id', requireUuid(taskId, '업무 ID'))
        .select('id,production_id,legacy_id,part,name,assignee,deadline,status,priority,prerequisite_task_id,required,pre_show_check,created_at,updated_at').single();
      if (error || !data) throw error || new Error('Missing updated task');
      return data;
    } catch (error) {
      throw classifyTaskWriteError(error, 'UPDATE');
    }
  }

  async function deleteTask(taskId) {
    try {
      const client = await getClient();
      await requireCurrentIdentity(client);
      const { data, error } = await client.from('tasks').delete()
        .eq('id', requireUuid(taskId, '업무 ID')).select('id').single();
      if (error || !data) throw error || new Error('Missing deleted task');
      return data;
    } catch (error) {
      throw classifyTaskWriteError(error, 'DELETE');
    }
  }

  async function createRehearsalLog(input) {
    try {
      const client = await getClient();
      const production = await resolveActiveProduction(input && input.productionId);
      const identity = await requireCurrentIdentity(client);
      const payload = {
        ...normalizeLogInput(input, identity.displayName),
        production_id: production.id,
        author_profile_id: identity.userId,
        author: identity.displayName,
        legacy_id: createLegacyId(),
      };
      const { data, error } = await client.from('rehearsal_logs').insert(payload)
        .select('id,production_id,legacy_id,title,rehearsal_date,author,author_display_name,author_profile_id,category,content,tags,created_at,updated_at').single();
      if (error || !data || !data.id) throw error || new Error('Missing created rehearsal log');
      return data;
    } catch (error) {
      throw classifyWriteError(error, 'CREATE');
    }
  }

  async function updateRehearsalLog(logId, changes) {
    try {
      const client = await getClient();
      const identity = await requireCurrentIdentity(client);
      const payload = normalizeLogInput(changes, identity.displayName);
      const { data, error } = await client.from('rehearsal_logs').update(payload)
        .eq('id', requireUuid(logId, '연습일지 ID'))
        .select('id,production_id,legacy_id,title,rehearsal_date,author,author_display_name,author_profile_id,category,content,tags,created_at,updated_at').single();
      if (error || !data) throw error || new Error('Missing updated rehearsal log');
      return data;
    } catch (error) {
      throw classifyWriteError(error, 'UPDATE');
    }
  }

  async function deleteRehearsalLog(logId) {
    try {
      const client = await getClient();
      await requireCurrentIdentity(client);
      // Phase 8 must delete private Storage objects before this DB delete when
      // image rows exist. DB cascade removes metadata, never Storage objects.
      const { data, error } = await client.from('rehearsal_logs').delete()
        .eq('id', requireUuid(logId, '연습일지 ID')).select('id').single();
      if (error || !data) throw error || new Error('Missing deleted rehearsal log');
      return data;
    } catch (error) {
      throw classifyWriteError(error, 'DELETE');
    }
  }

  async function createRehearsalLogImage(input) {
    try {
      const client = await getClient();
      const identity = await requireCurrentIdentity(client);
      const payload = {
        rehearsal_log_id: requireUuid(input && input.rehearsal_log_id, '연습일지 ID'),
        production_id: requireUuid(input && input.production_id, 'Production ID'),
        uploaded_by: identity.userId,
        storage_path: String(input && input.storage_path || '').trim(),
        original_filename: String(input && input.original_filename || '').trim(),
        mime_type: String(input && input.mime_type || '').trim().toLowerCase(),
        file_size: Number(input && input.file_size),
        sort_order: Number(input && input.sort_order),
      };
      if (!payload.storage_path || !payload.original_filename || !['image/jpeg', 'image/png', 'image/webp'].includes(payload.mime_type)
        || !Number.isInteger(payload.file_size) || payload.file_size <= 0 || payload.file_size > 8388608
        || !Number.isInteger(payload.sort_order) || payload.sort_order < 0) {
        throw dataError('VALIDATION_ERROR', '이미지 정보를 확인해 주세요.');
      }
      const { data, error } = await client.from('rehearsal_log_images').insert(payload)
        .select('id,rehearsal_log_id,production_id,uploaded_by,storage_path,original_filename,mime_type,file_size,sort_order,created_at,updated_at').single();
      if (error || !data) throw error || new Error('Missing created image metadata');
      return data;
    } catch (error) {
      throw classifyWriteError(error, 'CREATE');
    }
  }

  async function updateRehearsalLogImageOrder(imageId, sortOrder) {
    try {
      const order = Number(sortOrder);
      if (!Number.isInteger(order) || order < 0) throw dataError('VALIDATION_ERROR', '이미지 순서를 확인해 주세요.');
      const client = await getClient();
      await requireCurrentIdentity(client);
      const { data, error } = await client.from('rehearsal_log_images').update({ sort_order: order })
        .eq('id', requireUuid(imageId, '이미지 ID'))
        .select('id,rehearsal_log_id,production_id,uploaded_by,storage_path,original_filename,mime_type,file_size,sort_order,created_at,updated_at').single();
      if (error || !data) throw error || new Error('Missing reordered image metadata');
      return data;
    } catch (error) {
      throw classifyWriteError(error, 'UPDATE');
    }
  }

  async function deleteRehearsalLogImage(imageId) {
    try {
      const client = await getClient();
      await requireCurrentIdentity(client);
      const { data, error } = await client.from('rehearsal_log_images').delete()
        .eq('id', requireUuid(imageId, '이미지 ID')).select('id').single();
      if (error || !data) throw error || new Error('Missing deleted image metadata');
      return data;
    } catch (error) {
      throw classifyWriteError(error, 'DELETE');
    }
  }

  async function probeReads() {
    let session = { authenticated: false, status: 'UNKNOWN' };
    try {
      const client = await getClient();
      const { data, error } = await client.auth.getSession();
      session = error
        ? { authenticated: false, status: 'FAIL', error: { code: String(error.code || ''), message: error.message } }
        : { authenticated: Boolean(data && data.session), status: data && data.session ? 'AUTHENTICATED' : 'ANONYMOUS' };
    } catch (error) {
      const failure = classifyReadError(error);
      const reads = Object.fromEntries(TABLES.map(table => [table, { table, ...failure, data: null }]));
      return { client: 'FAIL', session, reads, error: { code: error.code || '', message: error.message } };
    }

    const results = await Promise.all([
      getProductions(),
      getTasks(),
      getEvents(),
      getRehearsalLogs(),
      getProductionMembers(),
      getProfiles(),
    ]);
    return {
      client: 'PASS',
      session,
      reads: Object.fromEntries(results.map(result => [result.table, result])),
      error: null,
    };
  }

  const service = Object.freeze({
    getPublicArchiveProduction,
    getPublicArchiveTasks,
    getPublicArchiveEvents,
    getPublicArchiveRehearsalLogs,
    getPublicArchiveRehearsalImages,
    buildPublicRehearsalImageUrl,
    getProductions,
    getCurrentProduction,
    getTasks,
    getEvents,
    getRehearsalLogs,
    getRehearsalLogById,
    getRehearsalLogImages,
    getRehearsalLogImageById,
    createRehearsalLog,
    updateRehearsalLog,
    deleteRehearsalLog,
    createRehearsalLogImage,
    updateRehearsalLogImageOrder,
    deleteRehearsalLogImage,
    createTask,
    updateTask,
    deleteTask,
    createEvent,
    updateEvent,
    deleteEvent,
    ensureCurrentProductionMembership,
    resolveActiveProduction,
    getProductionMembers,
    getProfiles,
    getProfile,
    probeReads,
  });
  global.SupabaseDataService = service;
  // Compatibility alias for the existing Auth/read probe integration.
  global.SupabaseReadService = service;
})(window);
