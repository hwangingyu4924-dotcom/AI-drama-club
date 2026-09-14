# Supabase Migration Specification

> Status: Official / Single Source of Truth
> Scope: AI-drama-club의 현재 `localStorage` 데이터를 Supabase Auth + Database로 이전
> 원칙: 데이터 저장 계층만 전환한다. 기존 Vanilla HTML/CSS/JS UI, 화면 구조, 계산 규칙과 사용자 기능은 유지한다.

## 1. 현재 실제 localStorage 구조

현재 앱은 두 개의 키를 사용한다.

### `ppa-state-v1`

`app.js`의 `state`와 같은 JSON 객체다.

```json
{
  "performance": {
    "id": "",
    "title": "봄, 손을 쥐다",
    "date": "",
    "venue": "전일빌딩245",
    "venueInfo": "",
    "projectStartDate": "",
    "status": "준비중",
    "parts": ["연출", "배우", "무대", "조명", "음향", "기획"],
    "participants": [{ "name": "이름", "part": "배우" }],
    "rehearsalAvailability": ""
  },
  "tasks": [],
  "events": []
}
```

- 로딩 조건: `performance`가 존재하고 `tasks`가 배열이어야 한다.
- 과거 저장값에 `events`가 없으면 빈 배열로 보정한다.
- 저장 시 `performance`, `tasks`, `events` 전체를 다시 직렬화한다.
- 저장값이 없으면 `performance.json`, `tasks.json`을 초기값으로 읽는다.
- JSON 파싱 실패 시 저장값을 무시하고 초기 데이터 로딩 경로를 사용한다.

### `rehearsalLogs`

연습일지 객체 배열이며 `ppa-state-v1`과 별도로 저장한다. 키가 없거나 파싱 결과가 배열이 아니면 빈 배열을 사용한다.

```json
[
  {
    "id": "LOG-001",
    "title": "연습 제목",
    "date": "2026-09-12",
    "author": "작성자",
    "category": "전체연습",
    "content": "본문",
    "tags": ["런스루"],
    "createdAt": "2026-09-12T00:00:00.000Z",
    "updatedAt": "2026-09-12T00:00:00.000Z"
  }
]
```

## 2. 현재 데이터 모델

### Performance

| 필드 | 타입 | 의미 |
|---|---|---|
| `id` | string | 공연 식별자. 현재 초기값은 빈 문자열 |
| `title` | string | 작품명 |
| `date` | `YYYY-MM-DD` string | 공연일 |
| `venue` | string | 공연장 |
| `venueInfo` | string | 주소·좌석 등 공연장 정보 |
| `projectStartDate` | `YYYY-MM-DD` string | 프로젝트 시작일 |
| `status` | string | `준비중`, `진행중`, `완료` |
| `parts` | string[] | 제작 파트와 화면 필터의 기준 순서 |
| `participants` | `{name, part}[]` | 참여 인원과 담당 파트 |
| `rehearsalAvailability` | string | 연습 가능 시간 |

### Task

| 필드 | 타입 | 의미 |
|---|---|---|
| `taskId` | string | `TASK-001` 형식 표시 ID |
| `part` | string | 공연의 제작 파트 |
| `name` | string | 업무명 |
| `assignee` | string | 담당자명, 빈 문자열은 미지정 |
| `deadline` | date string | 마감일, 빈 문자열 허용 |
| `status` | string | `대기`, `진행중`, `완료`, `보류` |
| `priority` | string | `높음`, `보통`, `낮음` |
| `prereqTaskId` | string/null | 선행 업무 `taskId` |
| `required` | boolean | 필수 업무 여부 |
| `preShowCheck` | boolean | 공연 전 체크 포함 여부 |

### Event

| 필드 | 타입 | 의미 |
|---|---|---|
| `id` | string | `EVENT-001` 형식 표시 ID |
| `title` | string | 일정명 |
| `date` | date string | 일정 날짜 |
| `startTime`, `endTime` | time string | 시작·종료 시간, 빈 문자열 허용 |
| `type` | string | `연습`, `회의`, `리딩`, `공연`, `설치/기술`, `기타` |
| `part` | string | 관련 파트, 빈 문자열은 전체/미지정 |
| `location` | string | 장소 |
| `memo` | string | 메모 |

### Rehearsal Log

| 필드 | 타입 | 의미 |
|---|---|---|
| `id` | string | `LOG-001` 형식 표시 ID |
| `title` | string | 제목 |
| `date` | date string | 연습일 |
| `author` | string | 작성자 표시명 |
| `category` | string | `전체연습`, `연기`, `연출`, `무대`, `회의`, `기타` |
| `content` | string | 본문 |
| `tags` | string[] | 태그 |
| `createdAt`, `updatedAt` | ISO datetime string | 생성·수정 시각 |

## 3. 최종 Database Schema

현재 적용된 기본 애플리케이션 테이블은 아래 여섯 개이며, 승인된 연습일지 이미지 확장에서 `rehearsal_log_images`를 일곱 번째 테이블로 추가한다. Supabase 관리 테이블 `auth.users`와 `storage.objects`는 별도다. UUID는 관계용이며 기존 `TASK-###`, `EVENT-###`, `LOG-###` 값은 `legacy_id`로 보존한다. 이미지 확장은 기존 여섯 테이블이나 기존 행을 대체하지 않는다.

### `productions`

| column | type | 제약/기본값 |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `title` | text | NOT NULL, default `''` |
| `performance_date` | date | NULL |
| `venue` | text | NOT NULL, default `''` |
| `venue_info` | text | NOT NULL, default `''` |
| `project_start_date` | date | NULL |
| `status` | text | NOT NULL, CHECK `준비중/진행중/완료` |
| `parts` | jsonb | NOT NULL, JSON string array |
| `rehearsal_availability` | text | NOT NULL, default `''` |
| `created_by` | uuid | NOT NULL, FK → `profiles.id` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

### `profiles`

| column | type | 제약/기본값 |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users.id` ON DELETE CASCADE |
| `display_name` | text | NOT NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

이메일과 인증 정보는 복제하지 않고 `auth.users`가 관리한다.

### `production_members`

현재 `performance.participants[]`와 공연별 권한을 표현한다.

| column | type | 제약/기본값 |
|---|---|---|
| `production_id` | uuid | 복합 PK, FK → `productions.id` ON DELETE CASCADE |
| `profile_id` | uuid | 복합 PK, FK → `profiles.id` ON DELETE CASCADE |
| `display_name` | text | NOT NULL; 기존 participant 이름 보존 |
| `part` | text | NOT NULL, default `''` |
| `role` | text | NOT NULL, CHECK `ADMIN/MEMBER` |
| `created_at` | timestamptz | NOT NULL, default `now()` |

### `tasks`

| column | type | 제약/기본값 |
|---|---|---|
| `id` | uuid | PK |
| `production_id` | uuid | NOT NULL, FK → `productions.id` ON DELETE CASCADE |
| `legacy_id` | text | NOT NULL, production 안에서 UNIQUE |
| `part`, `name`, `assignee` | text | `name` NOT NULL; 나머지 default `''` |
| `deadline` | date | NULL |
| `status` | text | CHECK `대기/진행중/완료/보류` |
| `priority` | text | CHECK `높음/보통/낮음` |
| `prerequisite_task_id` | uuid | NULL, self FK ON DELETE SET NULL |
| `required`, `pre_show_check` | boolean | NOT NULL, default `false` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

### `events`

| column | type | 제약/기본값 |
|---|---|---|
| `id` | uuid | PK |
| `production_id` | uuid | NOT NULL, FK → `productions.id` ON DELETE CASCADE |
| `legacy_id` | text | NOT NULL, production 안에서 UNIQUE |
| `title` | text | NOT NULL |
| `event_date` | date | NOT NULL |
| `start_time`, `end_time` | time | NULL |
| `type` | text | CHECK: 현재 `EVENT_TYPES` 값 |
| `part`, `location`, `memo` | text | NOT NULL, default `''` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

### `rehearsal_logs`

| column | type | 제약/기본값 |
|---|---|---|
| `id` | uuid | PK |
| `production_id` | uuid | NOT NULL, FK → `productions.id` ON DELETE CASCADE |
| `legacy_id` | text | NOT NULL, production 안에서 UNIQUE |
| `title`, `author`, `content` | text | NOT NULL |
| `rehearsal_date` | date | NOT NULL |
| `author_profile_id` | uuid | NULL, FK → `profiles.id` ON DELETE SET NULL |
| `category` | text | CHECK: 현재 `REHEARSAL_CATEGORIES` 값 |
| `tags` | jsonb | NOT NULL, JSON string array |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

### `rehearsal_log_images` — 승인된 이미지 확장

이미지 파일은 DB가 아니라 private Supabase Storage bucket `rehearsal-images`에 저장한다. DB에는 object metadata와 `storage_path`만 저장하며 `rehearsal_logs.image_paths` JSONB 방식은 사용하지 않는다.

| column | type | 제약/기본값 |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `rehearsal_log_id` | uuid | NOT NULL, FK → `rehearsal_logs.id` ON DELETE CASCADE |
| `production_id` | uuid | NOT NULL, 연결된 log의 production과 일치 |
| `uploaded_by` | uuid | FK → `profiles.id`; 신규 업로드는 `auth.uid()`와 일치 |
| `storage_path` | text | NOT NULL, UNIQUE, 원본 파일명 사용 금지 |
| `original_filename` | text | NOT NULL, 표시·진단용 metadata |
| `mime_type` | text | NOT NULL, CHECK `image/jpeg`, `image/png`, `image/webp` |
| `file_size` | bigint | NOT NULL, 0 초과 8MB 이하 |
| `sort_order` | integer | NOT NULL, default `0`, 0 이상 |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

- `rehearsal_log_id + production_id`는 log가 실제로 같은 production에 속함을 DB 관계로 보장한다.
- 대표 이미지와 캡션 column은 초기 schema에 넣지 않는다.
- `sort_order`는 앞/뒤 버튼 정렬에 사용하며 Drag & Drop은 초기 범위에서 제외한다.
- 향후 task/event 첨부 가능성은 유지하지만 이번 버전에 polymorphic `attachments` 테이블을 도입하지 않는다. 파일 처리 service만 재사용 가능하게 분리한다.

## 4. productions 중심 데이터 관계

```text
auth.users 1──1 profiles
                  │
                  └──< production_members >── productions
                                               ├──< tasks
                                               │     └── prerequisite_task_id → tasks.id
                                               ├──< events
                                               └──< rehearsal_logs
                                                       └──< rehearsal_log_images
                                                               └── private Storage object
```

- 모든 업무·일정·연습일지는 정확히 하나의 production에 속한다.
- 사용자는 `production_members`를 통해서만 production 데이터에 접근한다.
- 현재 단일 공연 UI는 선택된 production 한 건을 기존 `state.performance` 형태로 매핑한다.
- 필터와 진행률을 보호하기 위해 파트 값과 순서는 `productions.parts`에 유지한다.

## 5. profiles / production_members 구조

- 가입 완료 시 `auth.users.id`와 같은 ID의 profile을 만든다.
- `profiles.display_name`은 계정의 기본 표시명이다.
- 기존 participant의 name/part는 member의 `display_name`/`part`로 이전한다.
- 이름만으로 기존 참여자와 Auth 사용자를 자동 병합하지 않는다. 확인된 계정만 연결한다.
- production 생성자는 첫 `ADMIN` member가 되어야 한다.

## 6. tasks 구조

- 현재 필드를 손실 없이 snake_case column으로 매핑한다.
- 선행 업무는 같은 production의 task UUID만 가리킨다.
- 모든 task를 먼저 insert한 뒤 `legacy_id → uuid` 매핑으로 선행 관계를 설정한다.
- 완료 판단은 계속 `status === '완료'`를 사용한다.
- HOME과 제작 현황은 같은 조회 결과와 기존 계산 helper를 사용한다.

## 7. events 구조

- Calendar Event만 저장한다. 공연일과 Task Deadline은 production/task에서 파생하므로 event로 복제하지 않는다.
- 빈 시간 문자열은 DB `NULL`로, UI 반환 시 `''`로 변환한다.
- `start_time`과 `end_time`의 순서는 DB CHECK로 제한하지 않는다. `23:00 → 01:00`처럼 자정을 넘는 일정도 저장할 수 있으며, 시간 순서에 관한 안내나 검증은 향후 UI/업무 로직에서 처리한다.
- 같은 날짜의 여러 일정은 독립된 행으로 유지한다.

## 8. rehearsal_logs 구조

- 기존 별도 배열을 선택된 production 아래로 이전한다.
- `author`는 과거 표시를 보존하는 snapshot이다.
- 로그인 작성자는 `author_profile_id`에도 연결하며 확인 불가한 과거 작성자는 NULL로 둔다.
- 태그 문자열과 순서는 JSON 배열로 보존한다.

## 9. Auth 구조

- Supabase Auth를 사용한다.
- 브라우저에는 Supabase 관리 session만 유지하며 service role key를 두지 않는다.
- session 복원 → profile 확인 → membership 확인 → production 데이터 로드 순서로 진행한다.
- 비인증 사용자는 production 데이터 CRUD를 수행할 수 없다.

## 10. ADMIN / MEMBER 권한

| 동작 | ADMIN | MEMBER |
|---|---:|---:|
| 참여 production 조회 | 허용 | 허용 |
| 공연 기본정보 수정·production 삭제 | 허용 | 불가 |
| member 조회 | 허용 | 허용 |
| member 추가·역할 변경·삭제 | 허용 | 불가 |
| task/event 조회·추가·수정 | 허용 | 허용 |
| task/event 삭제 | 허용 | 불가 |
| rehearsal log 조회·추가 | 허용 | 허용 |
| rehearsal log 수정·삭제 | 허용 | 본인 작성 행만 허용 |

권한은 전역 profile 속성이 아니라 production별 membership role로 판정한다.

## 11. 테이블별 RLS 정책

모든 public 테이블에 RLS를 활성화한다. 공통 기준은 `auth.uid()`와 membership이다.

- `profiles`: 본인은 SELECT/INSERT/UPDATE 가능. 같은 production 멤버 profile은 필요한 범위에서 SELECT 가능. 클라이언트 DELETE 금지.
- `productions`: member만 SELECT, ADMIN만 UPDATE/DELETE. INSERT와 최초 ADMIN 생성은 안전한 트랜잭션/RPC로 처리.
- `production_members`: 같은 production member만 SELECT, ADMIN만 INSERT/UPDATE/DELETE. 마지막 ADMIN 제거·강등 차단.
- `tasks`: member는 SELECT/INSERT/UPDATE, ADMIN만 DELETE. prerequisite가 같은 production인지 DB에서 검증.
- `events`: member는 SELECT/INSERT/UPDATE, ADMIN만 DELETE.
- `rehearsal_logs`: member는 SELECT/INSERT. ADMIN 또는 `author_profile_id = auth.uid()`인 작성자만 UPDATE/DELETE. 신규 작성 행의 작성자 ID는 `auth.uid()`로 검증.
- `rehearsal_log_images`: production member만 SELECT/INSERT한다. INSERT의 `uploaded_by`와 path uploader segment는 `auth.uid()`여야 한다. ADMIN은 해당 production 이미지를 모두 관리하고, MEMBER는 자신이 업로드했거나 자신이 작성한 log의 이미지만 관리한다.
- Storage `rehearsal-images`: private bucket으로 유지하고 anonymous policy를 만들지 않는다. object path만 신뢰하지 않고 production membership과 log-production 관계를 함께 검증한다.

## 12. Frontend Data Layer 구조

Vanilla 구조를 유지하면서 DOM/render와 I/O를 분리한다.

```text
UI event / render
       ↓
application actions
       ↓
data adapter interface
       ├── localStorage adapter (전환·복구 기간)
       └── Supabase adapter (최종 기본값)
                    ↓
             Supabase Auth / DB
```

Data Layer의 최소 책임:

- session/profile/membership 및 production 조회
- production members 관리
- tasks/events/rehearsal logs CRUD
- rehearsal log image metadata와 private Storage object 접근
- DB 행을 기존 UI state shape으로 변환
- date NULL ↔ 빈 문자열, snake_case ↔ camelCase 변환

`render()`, Dashboard helper, `rules.js`는 저장소 구현을 몰라야 한다. 원격 저장 성공 후 canonical state를 갱신하며 실패를 성공처럼 화면에 확정하지 않는다.

## 13. localStorage Migration 전략

1. 로그인과 production membership 확정 후 migration 여부를 검사한다.
2. 두 localStorage 키를 읽되 수정하거나 삭제하지 않는다.
3. JSON, 배열, 필수 필드와 enum을 검증한다.
4. 사용자 확인 후 신규 production을 만든다. 재시도 시 중복 생성하지 않도록 production ID와 완료 표식을 보존한다.
5. performance scalar와 parts를 이전한다.
6. participants를 members로 옮기되 이름만으로 Auth 계정과 임의 연결하지 않는다.
7. tasks를 먼저 이전하고 legacy ID mapping으로 선행 관계를 연결한다.
8. events를 이전하며 파생 공연일/마감일은 복제하지 않는다.
9. rehearsal logs와 작성자 snapshot을 이전한다.
10. 서버에서 건수와 핵심 필드를 다시 읽어 원본과 대조한다.
11. 전체 검증 성공 후 Supabase를 기본 읽기 대상으로 전환한다.
12. localStorage 원본은 사용자 요청 전까지 rollback source로 유지한다.

가능하면 all-or-nothing 트랜잭션으로 수행한다. 불가능하면 모든 단계와 검증이 끝나기 전에는 migration 완료로 표시하지 않는다.

## 14. 보안 원칙

- 브라우저에는 anon key만 허용하고 service role key는 절대 노출하지 않는다.
- 버튼 숨김은 권한 통제가 아니며 모든 접근을 RLS가 최종 차단한다.
- 쿼리는 membership이 확인된 `production_id`로 제한한다.
- 클라이언트가 보낸 ID, role, author identity를 그대로 신뢰하지 않는다.
- 출력 escaping과 DB 관계·허용값 검증을 모두 유지한다.
- 인증 토큰·이메일을 console이나 migration log에 기록하지 않는다.
- RLS 비활성화나 브라우저 service role 사용으로 CRUD를 우회하지 않는다.
- Storage object는 private bucket에 두고 public URL을 저장하지 않는다. 상세 조회용 Signed URL은 10분 동안 유효하며 만료 시 재발급한다.
- Storage path는 `<production_uuid>/<log_uuid>/<uploader_uuid>/<file_uuid>.<ext>` 규칙을 사용하고 원본 파일명을 포함하지 않는다.

## 15. 단계별 구현 순서

1. **Phase 0 — 기준선 고정:** localStorage fixture, JSON fallback, CRUD와 `rules.js` 결과를 회귀 테스트로 고정.
2. **Phase 1 — Supabase 기반 구성:** 여섯 테이블, 관계·제약·index·timestamp와 RLS 정책 준비.
3. **Phase 2 — Auth와 Membership:** session, profiles, production_members 및 production 선택 연결.
4. **Phase 3 — Frontend Data Layer:** 공통 adapter 계약, mapper, 로딩·오류 처리 구현.
5. **Phase 4 — 데이터 도메인 전환:** production/member → task → event → rehearsal log 순서로 CRUD 연결.
6. **Phase 5 — localStorage Migration:** 사용자 확인 import, ID 변환, 검증과 안전한 재시도 구현.
7. **Phase 6 — 전환 및 안정화:** Supabase를 기본 adapter로 전환하고 전체 회귀·권한 테스트.

## 16. 각 Phase 완료 조건

| Phase | 완료 조건 |
|---|---|
| 0 | 두 localStorage fixture와 JSON fallback 재현, 기존 회귀 테스트 통과 |
| 1 | 관계·제약 적용, 비회원/타 production/역할별 RLS 허용·거부 테스트 통과 |
| 2 | 로그인, session 복원, profile과 production별 role 판정이 새로고침 후 정확 |
| 3 | 두 adapter가 같은 state 계약을 만족하고 date/enum/ID mapping과 실패 처리 검증 |
| 4 | 기존 performance/member/task/event/log CRUD와 파생 화면이 Supabase 데이터로 동작 |
| 5 | 중복 없이 이전, 원본과 DB 건수·핵심 값 일치, localStorage 원본 보존 |
| 6 | 기능·권한·반응형 회귀 통과, runtime error 없음, rollback 확인 후 전환 승인 |

## 17. 기존 기능 Regression 보호 항목

- Top Navigation과 모든 `currentView` 이동
- HOME Cinematic Hero와 Production Dashboard
- 공연일 변경 시 D-Day 즉시 갱신
- 전체·미완료·7일 이내·오늘 업무 계산
- 다가오는 마감 정렬, 지연 표시, 중요 업무 중복 제거
- 파트별 완료/전체 수와 진행률
- 공연 정보 필드, 제작 파트와 참여 인원
- Task CRUD와 모든 현재 task 필드
- PARTS 필터와 `performance.parts` 순서
- Calendar Event CRUD, 월 이동, 공연일·Task Deadline 파생 표시와 중복 방지
- Rehearsal Log 목록·상세·작성·수정·삭제·검색·분류·태그
- 공연 전 체크리스트와 task 완료 상태 연동
- `rules.js` 제작 단계·위험 검수·허용 상태값
- `performance.json`, `tasks.json` 초기 로딩 계약
- 새로고침 복원, 저장 실패 처리, 출력 escaping과 반응형 UI

## 18. Rehearsal Image Upload 확정 사양

### Storage와 파일 제한

- private bucket: `rehearsal-images`
- path: `<production_uuid>/<log_uuid>/<uploader_uuid>/<file_uuid>.<ext>`
- Signed URL: 10분 유효, 만료 시 재발급
- 허용 형식: JPEG, PNG, WebP
- HEIC 및 HEIC 변환: 초기 버전 미지원
- 파일당 최대 크기: 8MB
- 글당 최대 이미지: 12장
- 1회 선택·업로드 최대: 6장
- 업로드 전 브라우저에서 최대 긴 변 2400px로 축소하고 약 0.82 품질로 압축

### 초기 버전 범위

포함:

- 여러 이미지 첨부와 local preview
- 개별 이미지 삭제
- 앞/뒤 버튼 방식 순서 변경
- 부분 실패 시 성공 이미지 유지 및 실패 항목만 재시도
- 상세 gallery와 키보드 접근 가능한 확대 dialog
- Signed URL 만료 시 재발급

제외:

- 대표 이미지
- 캡션
- Drag & Drop 정렬
- HEIC 변환
- task/event용 범용 `attachments` 테이블

### 이미지 업로드 구현 Phase

1. **Phase 1 — 명세 갱신:** 두 공식 명세에 승인된 Storage, DB, 권한, 제한과 UI 범위를 반영한다.
2. **Phase 2 — Database SQL 준비:** `rehearsal_log_images`와 관계, CHECK, index, timestamp SQL을 작성하되 실행하지 않는다.
3. **Phase 3 — RLS + Storage 정책 준비:** image row RLS, private bucket, `storage.objects` 정책과 안전한 path 검증 helper를 준비한다.
4. **Phase 4 — 이미지 처리 Service:** 검증, 축소·압축, UUID path, preview, upload/delete, Signed URL과 cleanup을 UI에서 분리한다.
5. **Phase 5 — Rehearsal Log Supabase WRITE 연결:** log-first 방식으로 DB UUID를 확보한다. 기존 localStorage migration은 별도 승인 전까지 금지한다.
6. **Phase 6 — 글쓰기 이미지 UI:** 선택·미리보기·개별 삭제·앞뒤 정렬·부분 실패 재시도를 구현한다.
7. **Phase 7 — Gallery + Dialog:** 반응형 gallery, 확대 dialog, 키보드·focus 및 Signed URL 재발급을 구현한다.
8. **Phase 8 — 삭제 / Cleanup:** image/log 삭제 시 DB row와 Storage object의 분리된 실패를 보상하고 orphan 정리 절차를 검증한다.
9. **Phase 9 — Regression / Responsive QA:** 파일 경계, 권한, 실패 복구, 360–1440px, 기존 기능과 localStorage 보존을 검증한다.

이미지 확장 구현 전까지 현재 여섯 테이블, 기존 Auth/RLS, `rehearsal_logs`와 두 localStorage key를 그대로 유지한다.

---

이 문서와 migration 구현이 충돌하면 구현을 이 문서에 맞춘다. 실제 앱 데이터 필드가 변경될 경우 먼저 이 문서를 갱신하고 승인한 뒤 schema와 adapter를 변경한다.
