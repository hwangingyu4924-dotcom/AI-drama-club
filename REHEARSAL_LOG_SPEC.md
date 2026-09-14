# REHEARSAL_LOG_SPEC.md

> 대상 프로젝트: `AI-drama-club`  
> 기능명: 연습일지 / Rehearsal Archive  
> 목적: 전대극회 공연 제작 과정에서 매 회차 연습 후 작성하는 자유 형식의 연습일지를 기록·조회·수정·삭제할 수 있는 내부 게시판형 기능을 추가한다.  
> 디자인 기준: `DESIGN_SYSTEM.md`

## 1. 기능 목적

이 기능은 일반적인 업무 메모가 아니라, 공연 준비 과정에서 축적되는 **연습 기록 아카이브**다.

연습일지는 다음카페의 게시판처럼 다음 흐름을 가져야 한다.

```text
연습일지 목록
→ 글 선택
→ 상세 읽기
→ 새 글 작성
→ 수정 / 삭제
```

연습일지는 자유 형식의 일기처럼 작성할 수 있어야 한다. 강제 입력 항목을 지나치게 늘리지 않는다.

## 2. Sidebar 메뉴 추가

현재 Sidebar 메뉴에 다음 항목을 추가한다.

```text
HOME
공연 정보
제작 현황
전체 업무
일정
연습일지
공연 전 체크
```

`연습일지`를 클릭하면 Single Page 구조 안에서 Rehearsal Archive 화면으로 전환한다. 새 HTML 페이지나 새로운 프레임워크를 만들지 않는다.

## 3. 연습일지 메인 화면

기본 화면은 글쓰기 폼이 아니라 **글 목록**이다.

```text
ACT 05 / REHEARSAL ARCHIVE

연습일지                                      + 글쓰기

전체  |  전체연습  |  연기  |  연출  |  무대  |  회의  |  기타

────────────────────────────────────────────────────────
NO.    제목                         작성자      날짜
────────────────────────────────────────────────────────
18     공연까지 한 달                황인규      09.10
17     오늘 처음으로 전체 런을 했다   김OO        09.08
16     장면 8 연습                    박OO        09.06
15     첫 합 맞추기                   이OO        09.04
────────────────────────────────────────────────────────
```

목록에서 보여줄 항목:
- 글 번호
- 제목
- 작성자
- 작성일 또는 연습일
- 분류
- 필요 시 태그 일부

Desktop에서는 표 또는 editorial list 형태를 사용할 수 있다. Mobile에서는 stacked list 형태로 전환 가능하다.

## 4. 글 상세 화면

목록에서 글을 클릭하면 해당 연습일지를 읽을 수 있어야 한다.

```text
REHEARSAL NOTE / 018

공연까지 한 달

2026.09.10
작성자 황인규

──────────────────────────────────

오늘은 처음으로 전체 장면을 이어서 연습했다.

처음에는 각 장면이 따로 노는 느낌이 있었는데
배우들이 서로의 호흡을 조금씩 보기 시작하면서...

──────────────────────────────────

#전체연습  #장면8  #런스루

                         수정   삭제
```

원칙:
- 본문 가독성 우선
- 작성자 / 날짜 / 분류는 보조 정보
- 태그는 metadata 스타일
- 수정 / 삭제 제공
- `목록으로` 이동 가능

## 5. 글쓰기 화면

`+ 글쓰기`를 누르면 새 연습일지를 작성할 수 있어야 한다.

필드:
- 제목
- 작성자
- 연습일
- 분류
- 내용
- 태그
- 이미지 첨부(선택, 최대 12장)

```text
NEW REHEARSAL NOTE

제목
────────────────────────────────

작성자              연습일
──────────────      ──────────────

분류
[전체연습] [연기] [연출] [무대] [회의] [기타]

내용

┌───────────────────────────────────────┐
│                                       │
│ 오늘 연습에서는...                    │
│                                       │
└───────────────────────────────────────┘

태그
#전체연습 #런스루

                              [등록하기]
```

연습일지는 일기처럼 자유롭게 작성하는 것이 핵심이다. `잘한 점`, `개선할 점`, `다음 목표` 등을 필수 템플릿으로 강제하지 않는다.

## 6. 데이터 구조

Task 데이터와 연습일지 데이터를 섞지 않는다.

예시:

```json
{
  "id": "LOG-018",
  "title": "공연까지 한 달",
  "author": "황인규",
  "date": "2026-09-10",
  "category": "전체연습",
  "content": "오늘은 처음으로 전체 장면을 이어서 연습했다...",
  "tags": ["전체연습", "장면8", "런스루"],
  "createdAt": "2026-09-10T22:30:00",
  "updatedAt": "2026-09-10T22:30:00"
}
```

필드:
- `id`: 중복되지 않는 글 ID
- `title`: 제목
- `author`: 작성자
- `date`: 연습일
- `category`: 분류
- `content`: 본문
- `tags`: 태그 배열
- `createdAt`: 최초 작성 시각
- `updatedAt`: 마지막 수정 시각

## 7. 저장 방식 — Phase 1

현재 프로젝트가 GitHub Pages + localStorage 중심 구조이므로 1차 버전은 **localStorage**를 사용한다.

별도 key 예:

```text
rehearsalLogs
```

기존 프로젝트 상태 데이터와 충돌하지 않도록 한다.

Phase 1 목표:
- 글 작성
- 글 목록
- 글 상세
- 글 수정
- 글 삭제
- 새로고침 후 유지
- 분류 필터
- 기본 검색

## 8. 저장 방식 — Supabase 확장

공유 연습일지는 확정된 Supabase Auth, `profiles`, `production_members`, `rehearsal_logs` 구조를 사용한다. 이미지 파일은 DB나 localStorage에 넣지 않고 private Supabase Storage bucket `rehearsal-images`에 저장한다.

- DB: `rehearsal_log_images`에 metadata와 `storage_path` 저장
- Storage: 실제 JPEG, PNG, WebP object 저장
- 기존 `rehearsalLogs` localStorage는 migration 승인 전까지 삭제하거나 변경하지 않는다.
- 기존 localStorage 연습일지에 image path를 임의로 추가하지 않는다.
- 이미지 기능은 Rehearsal Log Supabase WRITE 연결과 DB log UUID 확보 이후 활성화한다.

## 9. 검색 및 필터

분류:
- 전체
- 전체연습
- 연기
- 연출
- 무대
- 회의
- 기타

검색 범위:
- 제목
- 본문
- 작성자
- 태그

client-side filter로 구현한다.

## 10. 정렬

기본 정렬은 **최신 연습일 우선**으로 한다.

필요 시 작성 시각을 보조 기준으로 사용한다.

## 11. 작성자

Phase 1에서는 로그인 시스템이 없으므로 작성자를 직접 입력하거나 선택할 수 있다.

가능하면 현재 공연 참여 인원 데이터가 있다면 작성자 select에 자동 표시한다.

## 12. Calendar 연동

`CALENDAR_SPEC.md`의 일정 기능과 연결 가능한 구조를 준비한다.

향후 예:

```text
09.10 전체연습
19:00 - 22:00

관련 업무
• 장면 8 동선 확정
• 오르골 소품 테스트

연습일지
• 공연까지 한 달 — 황인규
• 오늘의 장면 8 — 김OO

[연습일지 작성]
```

Phase 1에서는 Calendar와 강제 연결하지 않는다.

향후 Event ID 연결을 고려할 수 있다.

```json
"eventId": "EVENT-024"
```

## 13. HOME 연동

HOME 화면에는 연습일지 전체를 표시하지 않는다.

필요 시 작은 요약만 제공한다.

```text
RECENT REHEARSAL NOTES

09.10  공연까지 한 달
09.08  오늘 처음으로 전체 런을 했다

[연습일지 전체 보기]
```

HOME의 핵심 Production Dashboard를 방해하지 않도록 한다.

## 14. 디자인 방향

`DESIGN_SYSTEM.md`를 최우선 디자인 기준으로 사용한다.

강조 키워드:

```text
Theatre Archive
Rehearsal Journal
Production Notebook
Editorial Document
```

권장:
- Warm Ivory / Paper Beige
- Dark Brown
- Terracotta Accent
- Serif 제목
- Sans-serif 본문/metadata
- 얇은 divider
- 넓은 본문 line-height
- 작은 REV / DATE / AUTHOR 라벨
- 기록 문서 느낌

금지:
- 일반 커뮤니티 포털 스타일 복제
- 파란색 게시판
- 과도한 둥근 카드
- 과도한 그림자
- Material Design
- 화려한 SNS Feed 스타일

기능 구조는 다음카페 게시판을 참고하지만, 시각 디자인은 현재 전대극회 사이트의 세계관을 유지한다.

## 15. 글 목록 디자인

권장:

```text
REHEARSAL ARCHIVE                                    + NEW NOTE

018 / 전체연습

공연까지 한 달
황인규 · 2026.09.10

──────────────────────────────────────────────────

017 / 연기

오늘 처음으로 전체 런을 했다
김OO · 2026.09.08

──────────────────────────────────────────────────
```

목표는 `게시판 + 공연 아카이브` 사이의 디자인이다.

## 16. 글 상세 디자인

본문 최대 너비 권장:

```css
max-width: 760px;
line-height: 1.8;
```

긴 글 읽기 편한 구조를 우선한다.

## 17. 글쓰기 UX

- 폼 필드는 최소화
- 본문 textarea는 충분히 크게
- 제목과 본문 시각적 우선순위 강화
- 등록 버튼은 명확하게
- 취소 또는 목록 이동 가능
- 과도한 패널 금지

## 18. 삭제 UX

즉시 삭제하지 않는다.

최소한 확인 UI를 사용한다.

```text
이 연습일지를 삭제하시겠습니까?
삭제된 글은 복구할 수 없습니다.
```

## 19. Empty State

글이 없을 경우:

```text
아직 작성된 연습일지가 없습니다.

첫 연습 기록을 남겨보세요.

+ 연습일지 작성
```

검색 결과가 없을 경우:

```text
조건에 맞는 연습일지가 없습니다.
```

## 20. Mobile

Mobile에서도 다음 기능이 가능해야 한다.

- 글 목록
- 글 상세
- 글쓰기
- 수정
- 삭제
- 검색
- 분류 필터

표는 stacked list로 전환한다.

## 21. 접근성

- textarea label 제공
- semantic button 사용
- keyboard focus 표시
- 충분한 contrast
- metadata가 지나치게 작지 않도록 함
- 삭제 / 수정 버튼 구분

## 22. 기존 기능 보호

다음 기능을 깨뜨리지 않는다.

- HOME
- 공연 정보
- 제작 현황
- 전체 업무
- 일정
- 공연 전 체크
- PARTS 필터
- Task 관리
- Calendar Event
- 기존 localStorage
- rules.js 검수 로직
- Navigation

기존 데이터 구조를 불필요하게 재설계하지 않는다.

## 23. 구현 순서

1. 현재 프로젝트 및 Navigation 구조 분석
2. `rehearsalLogs` 데이터 모델 추가
3. Sidebar `연습일지` 메뉴 추가
4. Rehearsal Archive 목록 화면 구현
5. 글 상세 화면 구현
6. 글쓰기 구현
7. 수정 / 삭제 구현
8. localStorage 연결
9. 분류 / 검색 구현
10. 반응형 구현
11. 기존 기능 Regression Test

## 24. 테스트 항목

### Navigation
- 연습일지 메뉴 이동
- 다른 메뉴 복귀

### CRUD
- 새 글 작성
- 상세 보기
- 수정
- 삭제

### Storage
- 새로고침 후 글 유지
- 기존 프로젝트 상태와 충돌 없음

### Filter
- 카테고리 필터
- 검색

### Regression
- HOME
- 공연 정보
- 제작 현황
- 전체 업무
- 일정
- 공연 전 체크
- PARTS 필터
- Task 기능

### Error
- Browser console error 없음
- Asset 404 없음

## 25. Phase 1 완료 기준

- [ ] Sidebar에 연습일지 메뉴 존재
- [ ] 글 목록 확인 가능
- [ ] 글 작성 가능
- [ ] 글 상세 확인 가능
- [ ] 글 수정 가능
- [ ] 글 삭제 가능
- [ ] 분류 가능
- [ ] 검색 가능
- [ ] 새로고침 후 글 유지
- [ ] 기존 기능 정상
- [ ] 현재 디자인 시스템 유지

## 26. 향후 확장 아이디어

- 다중 사용자 로그인
- Supabase/Firebase 연결
- 댓글
- Task/Event 이미지 첨부로 Storage service 확장
- `확인` 표시
- 연습 참가자 기록
- Calendar 연습 일정 연결
- 관련 Task 연결
- 공연별 연습일지 묶음
- PDF 공연 제작 기록집 Export
- 시즌/공연 종료 후 Archive Mode

## 27. Final Statement

이 기능은 단순 게시판이 아니다.

> **공연이 완성되기까지 우리가 무엇을 고민했고, 어떻게 연습했고, 무엇이 달라졌는지를 남기는 기록 공간**

이어야 한다.

다음카페의 편한 게시판 구조와 현재 프로젝트의 Theatre Archive 디자인을 결합해,

**전대극회의 디지털 연습일지 아카이브**

를 만드는 것을 최종 목표로 한다.

## 28. 이미지 첨부 데이터 모델

이미지는 `rehearsal_logs.image_paths` JSON 배열이 아니라 별도 `rehearsal_log_images` 테이블로 관리한다.

필드:

- `id`: image metadata UUID
- `rehearsal_log_id`: 연결된 연습일지 UUID
- `production_id`: production 격리와 권한 검증
- `uploaded_by`: 업로드한 profile UUID
- `storage_path`: private Storage object path, UNIQUE
- `original_filename`: 표시·진단용 원본 파일명
- `mime_type`: JPEG, PNG, WebP만 허용
- `file_size`: 8MB 이하
- `sort_order`: 앞/뒤 버튼 정렬 순서
- `created_at`, `updated_at`: 생성 및 변경 시각

대표 이미지와 캡션 필드는 초기 schema에 포함하지 않는다.

```text
productions
  └── rehearsal_logs
        └── rehearsal_log_images

profiles
  └── uploaded_by
```

log 삭제 시 image metadata는 FK cascade로 삭제할 수 있지만 Storage object는 별도로 정리해야 한다. DB와 Storage는 단일 트랜잭션이 아니므로 실패 시 보상 삭제와 orphan 정리 절차를 사용한다.

Task/Event 첨부 가능성은 유지하지만 이번 버전에서 범용 `attachments` 테이블은 도입하지 않는다. 이미지 처리 service와 path generator만 향후 재사용 가능하게 분리한다.

## 29. 이미지 Storage 및 권한

- bucket: private `rehearsal-images`
- path: `<production_uuid>/<log_uuid>/<uploader_uuid>/<file_uuid>.<ext>`
- 원본 파일명은 path에 사용하지 않는다.
- 상세 이미지 URL은 10분 유효한 Signed URL로 발급하고 만료 시 재발급한다.
- Anonymous는 DB image row와 Storage object에 접근할 수 없다.
- MEMBER는 참여 중인 production 이미지를 조회하고 연습일지 작성 시 업로드할 수 있다.
- MEMBER는 자신이 업로드했거나 자신이 작성한 연습일지의 이미지만 관리할 수 있다.
- ADMIN은 해당 production의 이미지를 모두 관리할 수 있다.
- Storage policy는 path만 신뢰하지 않고 실제 production membership과 log-production 관계를 검증한다.
- 브라우저에는 publishable key만 사용하며 service role 또는 secret을 넣지 않는다.

## 30. 이미지 파일 제한과 처리

- 파일당 최대 8MB
- 글당 최대 12장
- 한 번에 최대 6장 선택·업로드
- 허용 형식: JPEG, PNG, WebP
- HEIC와 HEIC 변환은 초기 버전에서 지원하지 않는다.
- 업로드 전에 브라우저에서 최대 긴 변 2400px로 축소한다.
- 압축 품질은 약 0.82를 기준으로 한다.
- 각 object filename은 새 UUID로 생성해 충돌과 원본명 노출을 방지한다.

## 31. 이미지 글쓰기 및 상세 UX

초기 버전에 포함:

- `+ 사진 추가`
- 업로드 전 local preview
- 개별 삭제
- 키보드로 사용할 수 있는 앞/뒤 버튼 순서 변경
- 파일별 진행·실패 상태
- 일부 실패 시 성공한 이미지는 유지하고 실패 항목만 재시도
- 본문 아래 반응형 gallery
- 이미지 확대 dialog
- ESC 닫기, focus 관리, 이전/다음 이동
- Signed URL 만료 시 재발급

초기 버전에서 제외:

- 대표 이미지
- 캡션
- Drag & Drop 정렬
- HEIC 변환

권장 저장 흐름:

```text
연습일지 입력
→ 이미지 선택·검증·축소·압축·미리보기
→ rehearsal log 저장 및 UUID 확보
→ private Storage 업로드
→ image metadata 저장
→ 성공 image row 재조회
→ 상세 gallery 표시
```

Storage 업로드 후 metadata 저장이 실패하면 object 삭제를 시도한다. 일부 파일만 실패한 경우 성공 파일을 롤백하지 않는다.

## 32. 이미지 업로드 구현 Phase

1. **Phase 1 — 명세 갱신:** 승인된 DB, Storage, 권한, 제한과 UX를 공식 문서에 반영한다.
2. **Phase 2 — Database SQL 준비:** image table, 관계, CHECK, index와 timestamp SQL을 준비한다.
3. **Phase 3 — RLS + Storage 정책 준비:** metadata RLS, private bucket과 object 정책을 준비한다.
4. **Phase 4 — 이미지 처리 Service:** 검증, 축소·압축, preview, UUID path, upload/delete, Signed URL을 분리한다.
5. **Phase 5 — Rehearsal Log Supabase WRITE 연결:** log-first 저장과 DB UUID 확보를 구현한다.
6. **Phase 6 — 글쓰기 이미지 UI:** 선택, 미리보기, 삭제, 앞뒤 정렬과 부분 실패 재시도를 구현한다.
7. **Phase 7 — Gallery + Dialog:** 반응형 gallery와 접근 가능한 확대 dialog를 구현한다.
8. **Phase 8 — 삭제 / Cleanup:** 개별·log 삭제와 Storage orphan 보상 정리를 구현한다.
9. **Phase 9 — Regression / Responsive QA:** 권한, 실패, 파일 경계, 반응형과 기존 기능을 검증한다.

각 Phase는 기존 localStorage, 기존 `rehearsal_logs`, Auth/RLS와 다른 App View의 회귀가 없을 때만 완료한다.
