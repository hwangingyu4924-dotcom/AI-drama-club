/**
 * js/rules.js
 * 공연 제작 업무자동화 — 판단 규칙 전담 파일
 *
 * 이 파일은 DOM을 건드리지 않고, 순수하게 "판단"만 담당합니다.
 * (제작 단계 판정 / 마감 임박 판정 / 선행업무 확인 / 검수 위험 판단)
 *
 * 아래 상수 중 "가정값"이라고 주석이 붙은 것은 요구사항 문서에 명시되지 않아
 * 임시로 정한 기준입니다. 하드코딩된 사실이 아니라 조정 가능한 설정값입니다.
 */

/* ---- 제작 단계 판정 기준 ----
 * 가정값: 일반적인 대학 연극 제작 관행을 참고해 구성한 D-day 구간입니다.
 * 실제 전대극회 제작 일정과 다르면 아래 min/maxDday 값을 직접 수정하세요. */
const STAGES = [
  { name: '기획 단계',                        minDday: 61, maxDday: Infinity },
  { name: '준비 단계 (캐스팅·대본 확정)',      minDday: 31, maxDday: 60 },
  { name: '연습 단계',                        minDday: 15, maxDday: 30 },
  { name: '통합 연습 단계 (기술 요소 결합)',   minDday: 8,  maxDday: 14 },
  { name: '테크·드레스 리허설 단계',           minDday: 1,  maxDday: 7 },
  { name: '공연 당일',                        minDday: 0,  maxDday: 0 },
];

/* ---- 마감 임박 기준 ----
 * 가정값: 마감일 3일 이내를 "임박"으로 판단합니다. */
const DEADLINE_SOON_DAYS = 3;

/* ---- 업무 진행상태 표준값 (확정 — 요구사항 문서 §8) ---- */
const TASK_STATUS = ['대기', '진행중', '완료', '보류'];

/* ---- 업무 우선순위 표준값 (확정) ---- */
const TASK_PRIORITY = ['높음', '보통', '낮음'];

/**
 * 공연일까지 남은 일수(D-day)를 계산한다.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} todayStr - YYYY-MM-DD (기준일)
 * @returns {number|null}
 */
function getDaysUntil(dateStr, todayStr) {
  if (!dateStr) return null;
  const a = new Date(todayStr + 'T00:00:00');
  const b = new Date(dateStr + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** D-day 표시용 라벨 (D-14 / D-DAY / D+3 / 미정) */
function formatDday(dDay) {
  if (dDay === null) return '미정';
  if (dDay === 0) return 'D-DAY';
  if (dDay > 0) return 'D-' + dDay;
  return 'D+' + Math.abs(dDay);
}

/**
 * D-day를 기준으로 현재 제작 단계를 판정한다.
 * @param {number|null} dDay
 * @returns {{name:string, index:number}|null}
 */
function getStage(dDay) {
  if (dDay === null) return null;
  if (dDay < 0) return { name: '공연 종료', index: -1 };
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i];
    if (dDay >= s.minDday && dDay <= s.maxDday) return { name: s.name, index: i };
  }
  return { name: STAGES[0].name, index: 0 };
}

function isDeadlineSoon(dDay) {
  return dDay !== null && dDay >= 0 && dDay <= DEADLINE_SOON_DAYS;
}
function isOverdue(dDay) {
  return dDay !== null && dDay < 0;
}

/** 업무의 선행 업무 객체를 찾는다. 없으면 null. */
function getPrereqTask(task, allTasks) {
  if (!task.prereqTaskId) return null;
  return allTasks.find(t => t.taskId === task.prereqTaskId) || null;
}

/** 선행 업무가 완료되지 않았는데 후행 업무가 진행된 경우 true */
function hasPrereqConflict(task, allTasks) {
  const prereq = getPrereqTask(task, allTasks);
  if (!prereq) return false;
  return prereq.status !== '완료' && task.status !== '대기';
}

/**
 * 검수(위험 판단) — 요구사항 문서 §1 "검수해야 하는 위험 항목" 전체를 다룬다.
 * @param {object} performance - performance.json 구조
 * @param {object[]} tasks - tasks.json 구조
 * @param {string} todayStr - YYYY-MM-DD
 * @returns {{level:'오류'|'경고', message:string}[]}
 */
function computeRisks(performance, tasks, todayStr) {
  const risks = [];
  const dDay = getDaysUntil(performance.date, todayStr);

  // 1. 공연일 오류
  if (!performance.date) {
    risks.push({ level: '경고', message: '공연일이 입력되지 않아 제작 단계를 판단할 수 없습니다.' });
  } else if (dDay < 0) {
    risks.push({ level: '오류', message: `공연일(${performance.date})이 이미 지났습니다.` });
  }

  // 2. 연습(프로젝트) 일정 오류 — 시작일이 공연일보다 늦은 경우
  if (performance.projectStartDate && performance.date && performance.projectStartDate > performance.date) {
    risks.push({ level: '오류', message: '프로젝트 시작일이 공연일보다 늦게 설정되어 있습니다.' });
  }

  // 3. 담당자 누락
  const missingAssignee = tasks.filter(t => !t.assignee);
  if (missingAssignee.length) {
    risks.push({ level: '경고', message: `담당자가 없는 업무 ${missingAssignee.length}건: ${missingAssignee.map(t => t.name).join(', ')}` });
  }

  // 4. 필수 업무 누락 — 파트별로 required=true인 업무가 하나도 없는 경우
  const noRequiredTask = (performance.parts || []).filter(
    p => !tasks.some(t => t.part === p && t.required)
  );
  if (noRequiredTask.length) {
    risks.push({ level: '경고', message: `필수 업무가 하나도 지정되지 않은 파트: ${noRequiredTask.join(', ')}` });
  }

  // 5. 마감일이 공연일보다 늦게 설정된 업무
  if (performance.date) {
    const badDeadline = tasks.filter(t => t.deadline && t.deadline > performance.date);
    if (badDeadline.length) {
      risks.push({ level: '오류', message: `마감일이 공연일보다 늦게 설정된 업무: ${badDeadline.map(t => t.name).join(', ')}` });
    }
  }

  // 6. 업무 간 선후관계 충돌 + 존재하지 않는 선행 업무 ID
  tasks.forEach(t => {
    if (t.prereqTaskId && !getPrereqTask(t, tasks)) {
      risks.push({ level: '오류', message: `'${t.name}'의 선행 업무 ID(${t.prereqTaskId})가 존재하지 않습니다.` });
    } else if (hasPrereqConflict(t, tasks)) {
      const prereq = getPrereqTask(t, tasks);
      risks.push({ level: '오류', message: `'${t.name}'이(가) 선행 업무 '${prereq.name}'(${prereq.status}) 완료 전에 ${t.status} 상태입니다.` });
    }
  });

  // 7. 마감 임박·초과 미완료 업무
  tasks.forEach(t => {
    if (t.status === '완료' || !t.deadline) return;
    const dd = getDaysUntil(t.deadline, todayStr);
    if (isOverdue(dd)) {
      risks.push({ level: '오류', message: `마감일이 지났는데 미완료인 업무: ${t.name}` });
    } else if (isDeadlineSoon(dd)) {
      risks.push({ level: '경고', message: `마감 ${DEADLINE_SOON_DAYS}일 이내인데 미완료인 업무: ${t.name}` });
    }
  });

  // 8. 공연 직전 미완료 필수 업무
  const incompleteRequired = tasks.filter(t => t.required && t.status !== '완료');
  if (dDay !== null && dDay >= 0 && dDay <= DEADLINE_SOON_DAYS && incompleteRequired.length) {
    risks.push({ level: '오류', message: `공연이 임박했는데 미완료인 필수 업무: ${incompleteRequired.map(t => t.name).join(', ')}` });
  }

  // 9. 중복 업무 ID
  const idCounts = {};
  tasks.forEach(t => { idCounts[t.taskId] = (idCounts[t.taskId] || 0) + 1; });
  Object.entries(idCounts).forEach(([id, count]) => {
    if (count > 1) risks.push({ level: '오류', message: `중복된 업무 ID: ${id} (${count}건)` });
  });

  // 10. 잘못된 진행상태 값
  tasks.forEach(t => {
    if (!TASK_STATUS.includes(t.status)) {
      risks.push({ level: '오류', message: `'${t.name}'의 진행상태 값이 표준값이 아닙니다: ${t.status}` });
    }
  });

  return risks;
}
