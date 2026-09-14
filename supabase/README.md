# Supabase SQL 적용 가이드

이 디렉터리는 `SUPABASE_MIGRATION_SPEC.md`의 초기 Database Schema와 RLS 준비물이다. 아직 어떤 Supabase 프로젝트에도 실행되지 않았다.

## 적용 전 원칙

- 먼저 별도의 개발 Supabase Project에서 검증한다.
- SQL Editor에서 service role key를 브라우저 코드에 복사하지 않는다.
- `schema.sql`과 `rls.sql`의 순서를 바꾸지 않는다.
- 운영 데이터와 기존 localStorage migration은 이 단계의 범위가 아니다.

## 적용 순서와 Gate

### 1. Supabase Project 생성

개발용 Project를 생성하고 Database와 Auth가 정상 상태인지 확인한다.

성공 조건: SQL Editor 접속과 테스트 사용자 생성이 가능해야 한다.

### 2. `schema.sql` 실행

`schema.sql` 전체를 한 번 실행한다. 여섯 public 테이블, 관계, constraint, index 및 공통 trigger/function을 생성한다.

성공 조건:

- `profiles`, `productions`, `production_members`, `tasks`, `events`, `rehearsal_logs`만 애플리케이션 테이블로 생성된다.
- FK/CHECK/UNIQUE 생성 오류가 없다.
- `auth.users` 테스트 사용자 생성 시 같은 UUID의 profile이 생성된다.
- 실패하면 `rls.sql`로 진행하지 않는다.

### 3. `rls.sql` 실행

RLS, membership helper, production 생성 RPC와 policy를 적용한다.

성공 조건:

- 여섯 테이블 모두 RLS enabled 상태다.
- unauthenticated/anon 요청이 모든 production 데이터에서 거부된다.
- `create_production` RPC가 호출자 소유 production과 첫 ADMIN membership을 원자적으로 생성한다.

### 4. Schema 관계 확인

production 한 건 아래에 member/task/event/rehearsal log를 테스트 데이터로 연결한다. task prerequisite도 같은 production 안에서 연결한다.

성공 조건:

- 다른 production의 task를 prerequisite로 지정할 수 없다.
- 기존 child 행의 `production_id`를 변경할 수 없다.
- profile 삭제는 Auth 사용자 삭제에 의해 처리되고, production creator가 남아 있으면 RESTRICT로 보호된다.
- production 삭제는 ADMIN에게만 허용되며 실행 시 해당 production의 child만 cascade 된다.

### 5. Auth 확인

ADMIN, MEMBER, production 외부 사용자 계정을 각각 준비한다. 가입 trigger의 profile과 production membership을 확인한다.

성공 조건:

- MEMBER가 자신의 membership role을 ADMIN으로 변경할 수 없다.
- MEMBER가 다른 profile을 수정할 수 없다.
- 마지막 ADMIN을 삭제하거나 MEMBER로 강등할 수 없다.

### 6. RLS 테스트

반드시 클라이언트와 같은 `authenticated` JWT context로 다음을 검증한다.

- 비로그인 사용자의 모든 조회·변경 거부
- MEMBER의 참여 production 조회와 task/event 조회·추가·수정 허용
- MEMBER의 task/event 삭제 거부
- MEMBER의 rehearsal log 작성 및 본인 글 수정·삭제 허용
- 다른 작성자의 rehearsal log 수정·삭제 거부
- ADMIN의 자기 production 관리 허용
- 타 production 조회·변경 거부
- 직접 API로 `production_id`, `role`, `author_profile_id`를 변조하는 요청 거부

성공 조건: 모든 허용 사례는 성공하고 모든 공격·거부 사례는 PostgreSQL/RLS에서 실패해야 한다. UI에서 버튼이 보이는지는 판정 기준이 아니다.

### 7. Frontend 연결

앞 단계가 모두 통과한 뒤 별도 작업으로 Data Layer와 Auth UI를 구현한다.

성공 조건: `SUPABASE_MIGRATION_SPEC.md` Phase 3 완료 조건을 만족하고 기존 localStorage adapter와 동일한 state 계약 및 회귀 테스트를 통과해야 한다.

## 실행하지 않는 항목

이 SQL 준비 단계에서는 Supabase Project 생성, SQL 실행, dependency 설치, Frontend 연결, Auth UI, localStorage 삭제, 기존 데이터 migration을 수행하지 않는다.
