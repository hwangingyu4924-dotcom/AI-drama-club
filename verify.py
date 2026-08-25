"""
verify.py
공연 제작 업무자동화 — 데이터 검증 스크립트

일반 Python 환경 또는 Google Colab에서 실행할 수 있습니다.

[일반 Python 환경]
    python verify.py

[Google Colab]
    1) data/performance.json, data/tasks.json 을 Colab에 업로드
    2) 이 파일도 같은 경로 구조(하위 폴더 data/)로 업로드
    3) !python verify.py 실행 (또는 이 파일 내용을 셀에 붙여넣고 실행)

이 스크립트는 데이터 구조와 논리적 일관성만 검사합니다.
데이터 자체의 "정답 여부"(예: 실제로 그 날짜가 맞는지)는 검사하지 않습니다.
"""

import json
import os
import re
from datetime import datetime

# ---- 검증 대상 파일 경로 (이 스크립트 기준 상대경로) ----
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PERFORMANCE_PATH = os.path.join(BASE_DIR, "data", "performance.json")
TASKS_PATH = os.path.join(BASE_DIR, "data", "tasks.json")

# ---- 진행상태 표준값 (js/rules.js와 반드시 동일하게 유지) ----
TASK_STATUS = ["대기", "진행중", "완료", "보류"]

# 마감 임박 기준 (js/rules.js DEADLINE_SOON_DAYS 와 동일)
DEADLINE_SOON_DAYS = 3

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_valid_date(date_str):
    """YYYY-MM-DD 형식이고 실제로 존재하는 날짜인지 확인한다."""
    if not date_str:
        return False
    if not DATE_RE.match(date_str):
        return False
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def days_until(date_str, today):
    """오늘부터 date_str까지 남은 일수. 형식이 잘못되면 None."""
    if not is_valid_date(date_str):
        return None
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return (d - today).days


def report(results, level, message):
    results.append((level, message))


def print_results(results):
    """검사 결과를 사람이 읽기 쉬운 문장으로 출력한다."""
    level_order = {"오류": 0, "경고": 1, "정상": 2}
    for level, message in sorted(results, key=lambda r: level_order.get(r[0], 9)):
        print(f"[{level}] {message}")

    error_count = sum(1 for level, _ in results if level == "오류")
    warn_count = sum(1 for level, _ in results if level == "경고")
    print("\n----------------------------------------")
    print(f"검사 완료: 오류 {error_count}건 · 경고 {warn_count}건")
    if error_count == 0 and warn_count == 0:
        print("모든 항목이 정상입니다.")


def main():
    results = []
    today = datetime.strptime(datetime.now().strftime("%Y-%m-%d"), "%Y-%m-%d")

    # 1. 필수 JSON 파일 존재 여부 ------------------------------------
    if not os.path.exists(PERFORMANCE_PATH):
        report(results, "오류", f"파일이 존재하지 않습니다: {PERFORMANCE_PATH}")
        print_results(results)
        return
    if not os.path.exists(TASKS_PATH):
        report(results, "오류", f"파일이 존재하지 않습니다: {TASKS_PATH}")
        print_results(results)
        return
    report(results, "정상", "performance.json, tasks.json 파일 존재 확인")

    # JSON 파싱
    try:
        with open(PERFORMANCE_PATH, "r", encoding="utf-8") as f:
            performance = json.load(f)
    except json.JSONDecodeError as e:
        report(results, "오류", f"performance.json이 올바른 JSON 형식이 아닙니다: {e}")
        print_results(results)
        return

    try:
        with open(TASKS_PATH, "r", encoding="utf-8") as f:
            tasks = json.load(f)
    except json.JSONDecodeError as e:
        report(results, "오류", f"tasks.json이 올바른 JSON 형식이 아닙니다: {e}")
        print_results(results)
        return

    if not isinstance(tasks, list):
        report(results, "오류", "tasks.json은 배열([]) 형식이어야 합니다.")
        print_results(results)
        return

    # 2. 필수 필드 존재 여부 ------------------------------------------
    required_perf_fields = ["title", "date", "venue", "parts"]
    missing_perf = [f for f in required_perf_fields if f not in performance]
    if missing_perf:
        report(results, "오류", f"performance.json에 필수 필드 누락: {', '.join(missing_perf)}")
    else:
        report(results, "정상", "performance.json 필수 필드 확인")

    required_task_fields = ["taskId", "name", "part", "status", "priority"]
    task_field_errors = 0
    for t in tasks:
        missing = [f for f in required_task_fields if f not in t]
        if missing:
            task_field_errors += 1
            report(results, "오류", f"업무 {t.get('taskId', '(ID 없음)')}에 필수 필드 누락: {', '.join(missing)}")
    if not task_field_errors and tasks:
        report(results, "정상", f"tasks.json 필수 필드 확인 (전체 {len(tasks)}건)")

    # 3. 공연일 형식 -----------------------------------------------
    perf_date = performance.get("date", "")
    if not perf_date:
        report(results, "경고", "공연일이 입력되지 않았습니다.")
    elif is_valid_date(perf_date):
        report(results, "정상", "공연일 형식 확인 (YYYY-MM-DD)")
    else:
        report(results, "오류", f"공연일 형식이 올바르지 않습니다: {perf_date}")

    # 4. 업무 마감일 형식 --------------------------------------------
    bad_deadline_format = [t for t in tasks if t.get("deadline") and not is_valid_date(t["deadline"])]
    if bad_deadline_format:
        report(results, "오류", f"마감일 형식이 올바르지 않은 업무 {len(bad_deadline_format)}건: " +
               ", ".join(t.get("taskId", "?") for t in bad_deadline_format))
    else:
        report(results, "정상", "업무 마감일 형식 확인")

    # 5. 담당자 누락 ---------------------------------------------------
    missing_assignee = [t for t in tasks if not t.get("assignee")]
    if missing_assignee:
        report(results, "경고", f"담당자가 없는 업무 {len(missing_assignee)}건")
    else:
        report(results, "정상", "모든 업무에 담당자가 지정되어 있습니다.")

    # 6. 필수 업무 누락 (파트별로 required=true 업무가 하나도 없는 경우) --
    parts = performance.get("parts", [])
    no_required = [p for p in parts if not any(t.get("part") == p and t.get("required") for t in tasks)]
    if no_required:
        report(results, "경고", f"필수 업무가 하나도 지정되지 않은 파트: {', '.join(no_required)}")
    elif parts:
        report(results, "정상", "모든 파트에 필수 업무가 지정되어 있습니다.")

    # 7. 존재하지 않는 선행 업무 ID 참조 ------------------------------
    task_ids = {t.get("taskId") for t in tasks}
    for t in tasks:
        prereq = t.get("prereqTaskId")
        if prereq and prereq not in task_ids:
            report(results, "오류", f"존재하지 않는 선행 업무 ID: {prereq} (참조한 업무: {t.get('taskId')})")

    # 8. 선행 업무와 후행 업무의 날짜 충돌 가능성 -----------------------
    tasks_by_id = {t.get("taskId"): t for t in tasks}
    for t in tasks:
        prereq_id = t.get("prereqTaskId")
        prereq = tasks_by_id.get(prereq_id) if prereq_id else None
        if prereq and t.get("deadline") and prereq.get("deadline"):
            if is_valid_date(t["deadline"]) and is_valid_date(prereq["deadline"]):
                if t["deadline"] < prereq["deadline"]:
                    report(results, "오류",
                           f"'{t.get('name')}'의 마감일({t['deadline']})이 선행 업무 "
                           f"'{prereq.get('name')}'의 마감일({prereq['deadline']})보다 빠릅니다.")

    # 9. 공연일 이후로 설정된 비정상적인 제작 업무 마감 -------------------
    if is_valid_date(perf_date):
        after_show = [t for t in tasks if t.get("deadline") and is_valid_date(t["deadline"]) and t["deadline"] > perf_date]
        if after_show:
            report(results, "오류", f"마감일이 공연일보다 늦은 업무 {len(after_show)}건: " +
                   ", ".join(t.get("taskId", "?") for t in after_show))
        else:
            report(results, "정상", "모든 업무 마감일이 공연일 이전입니다.")

    # 10. 공연 직전 미완료 필수 업무 -----------------------------------
    if is_valid_date(perf_date):
        d_day = days_until(perf_date, today)
        if d_day is not None and 0 <= d_day <= DEADLINE_SOON_DAYS:
            incomplete_required = [t for t in tasks if t.get("required") and t.get("status") != "완료"]
            if incomplete_required:
                report(results, "오류", f"공연이 {DEADLINE_SOON_DAYS}일 이내로 임박했는데 미완료인 필수 업무 "
                       f"{len(incomplete_required)}건: " + ", ".join(t.get("taskId", "?") for t in incomplete_required))

    # 11. 중복 업무 ID -------------------------------------------------
    id_counts = {}
    for t in tasks:
        tid = t.get("taskId")
        id_counts[tid] = id_counts.get(tid, 0) + 1
    duplicates = [tid for tid, count in id_counts.items() if count > 1]
    if duplicates:
        report(results, "오류", f"중복된 업무 ID: {', '.join(duplicates)}")
    else:
        report(results, "정상", "업무 ID 중복 없음")

    # 12. 잘못된 진행상태 값 --------------------------------------------
    bad_status = [t for t in tasks if t.get("status") not in TASK_STATUS]
    if bad_status:
        report(results, "오류", f"진행상태 값이 표준값이 아닌 업무: " +
               ", ".join(f"{t.get('taskId', '?')}({t.get('status')})" for t in bad_status))
    else:
        report(results, "정상", f"진행상태 값 확인 (표준값: {', '.join(TASK_STATUS)})")

    # 전체 데이터 개수 안내
    report(results, "정상", f"전체 업무 개수: {len(tasks)}건")

    print_results(results)


if __name__ == "__main__":
    main()
