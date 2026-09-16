# 공연 제작 업무자동화 시스템 (Performance Production Automation)

전대극회 공연 제작을 위한 업무자동화 대시보드입니다.

## 현재 운영 아키텍처

- 제작 콘텐츠 읽기는 Public Archive RPC를 통해 누구나 사용할 수 있습니다.
- 작성·수정은 현재 Production의 인증된 MEMBER/ADMIN에게만 허용되며, 삭제 권한은 기존 RLS 역할 정책을 따릅니다.
- 신규 인증 사용자는 현재 Production에 MEMBER로 자동 가입하고, 기존 ADMIN membership은 유지됩니다.
- Supabase가 공연·업무·일정·연습일지의 canonical source이며, 기존 localStorage 데이터는 호환 목적으로 보존됩니다.
- 연습일지 이미지 Storage bucket은 private입니다. 공개 이미지는 공개 식별자를 검증하는 Edge Function을 통해서만 전달됩니다.
- 익명 응답은 curated Public Archive RPC만 사용하며 내부 UUID, membership, profile 및 Storage 경로를 공개하지 않습니다.

## 1. 프로젝트 목적

> 공연 정보를 입력하면 현재 제작 단계와 필요한 업무를 판단하여
> 공연일까지의 제작 과정을 관리해주는 공연 제작 자동화 시스템

단순한 공연 소개 페이지가 아니라, **공연일까지 남은 기간·진행상황·업무 우선순위·선행업무 완료 여부**를 기준으로 지금 무엇을 해야 하는지 자동으로 판단해 보여주는 것이 목표입니다.

## 2. 해결하려는 업무 문제

전대극회에서 공연을 제작할 때 다음이 흩어져 있어 관리가 어려웠습니다.

- 지금이 제작의 어느 단계인지 한눈에 파악하기 어려움
- 파트(연출·배우·무대·조명·음향·기획)별로 무엇을 해야 하는지 정리되어 있지 않음
- 담당자·마감일이 누락되거나, 선행 업무가 끝나지 않았는데 다음 업무가 진행되는 경우를 놓치기 쉬움
- 공연 직전에 확인해야 할 필수 항목이 체계적으로 관리되지 않음

이 시스템은 이 문제들을 **자동 판단 + 검수**로 해결합니다.

## 3. 자동화 흐름

```
공연 정보 입력 → 현재 제작 단계 판단 → 필요한 업무 생성
→ 파트 및 담당자 배정 → 마감일 관리 → 진행상황 확인 → 공연 전 최종 체크
```

## 4. 핵심 MVP (6개)

| MVP | 설명 |
|---|---|
| 1. 공연 생성 | 작품명·공연일·공연장·참여인원·제작 파트 입력 |
| 2. 제작 단계 자동 분류 | D-day + 진행상황 기준으로 현재 단계 표시 |
| 3. 필요 업무 생성 | 파트별(연출/배우/무대/조명/음향/기획) 업무 생성·관리 |
| 4. 담당자 및 마감 관리 | 업무별 담당자·마감일·진행상태·우선순위·선행업무 관리 |
| 5. 통합 대시보드 | 전체 일정, 이번 주 할 일, 파트별 업무, 다가오는 마감, 미완료 업무를 한 화면에서 확인 |
| 6. 공연 전 체크리스트 | "공연 전 체크리스트에 포함"으로 표시한 업무만 모아서 확인 |

## 5. 프로젝트 파일 구조

```text
performance-production-automation/
├── index.html              # 메인 화면 (GitHub Pages 시작 페이지)
├── css/
│   └── style.css           # 디자인 전담
├── js/
│   ├── app.js               # 화면 렌더링 · 데이터 연결 · 입력 처리
│   └── rules.js             # 판단 규칙 (제작 단계 / 위험 검수 등)
├── data/
│   ├── performance.json     # 공연 정보 시작값
│   └── tasks.json           # 업무 데이터 시작값
├── verify.py                # 데이터 검증 스크립트
└── README.md
```

## 6. 각 파일의 역할

- **index.html** — 사용자가 보는 화면. CSS·JS를 상대경로로 불러오기만 하고, 로직은 담지 않습니다.
- **css/style.css** — 레이아웃·헤더·업무 카드·배지·체크리스트·모바일 대응 등 디자인 전담.
- **js/rules.js** — DOM을 건드리지 않는 순수 판단 함수/상수 모음 (제작 단계 판정, 마감 임박 판정, 선행업무 확인, 검수 위험 판단).
- **js/app.js** — 데이터 로드/저장, 화면 렌더링, 사용자 입력(폼·버튼) 처리. `rules.js`의 판단 결과를 화면에 반영만 합니다.
- **data/performance.json** — 공연 자체의 시작값(작품명, 공연일 등).
- **data/tasks.json** — 업무 데이터 시작값. 현재는 빈 배열(`[]`)입니다 — 실제 데이터가 없는 상태에서 임의로 예시 업무를 만들어 넣지 않았습니다. 처음 실행 후 화면에서 직접 추가하세요.
- **verify.py** — 위 두 JSON 파일의 구조적 오류를 검사하는 Python 스크립트.

## 7. 데이터 구조

### `data/performance.json`

| 필드 | 타입 | 설명 |
|---|---|---|
| id | string | 공연 고유 ID (현재는 빈 값 — 필요 시 직접 채번) |
| title | string | 작품명 |
| date | string (YYYY-MM-DD) | 공연일 |
| venue | string | 공연장 이름 |
| venueInfo | string | 공연장 상세정보(주소·좌석 등, 자유 텍스트) |
| projectStartDate | string (YYYY-MM-DD) | 프로젝트 시작일 |
| status | string | 현재 상태 (`준비중` / `진행중` / `완료`) |
| parts | string[] | 제작 파트 목록 |
| participants | {name, part}[] | 참여 인원과 역할 |
| rehearsalAvailability | string | 연습 가능 시간 (자유 텍스트) |

### `data/tasks.json` (배열, 각 원소가 업무 하나)

| 필드 | 타입 | 설명 |
|---|---|---|
| taskId | string | 업무 ID (형식: `TASK-001`) |
| name | string | 업무명 |
| part | string | 담당 파트 |
| assignee | string \| "" | 담당자 |
| deadline | string (YYYY-MM-DD) \| "" | 마감일 |
| status | `대기`\|`진행중`\|`완료`\|`보류` | 진행상태 (표준값 고정) |
| priority | `높음`\|`보통`\|`낮음` | 우선순위 |
| prereqTaskId | string \| null | 선행 업무 ID |
| required | boolean | 필수 업무 여부 (업무 생성 시 직접 체크) |
| preShowCheck | boolean | 공연 전 체크리스트 포함 여부 (업무 생성 시 직접 체크) |

> `required`, `preShowCheck`는 자동 계산하지 않고 **업무를 만들 때 사용자가 직접 체크**하도록 설계했습니다 (확정된 결정 사항).

## 8. 제작 단계 판단 방식

`js/rules.js`의 `STAGES` 배열이 기준입니다. **아래 구간은 요구사항 문서에 명시되지 않아 임시로 정한 가정값**이며, 실제 전대극회 제작 관행과 다르면 `js/rules.js`에서 직접 수정하세요.

| 단계 | D-day 구간 |
|---|---|
| 기획 단계 | D-61 이상 |
| 준비 단계 (캐스팅·대본 확정) | D-31 ~ D-60 |
| 연습 단계 | D-15 ~ D-30 |
| 통합 연습 단계 (기술 요소 결합) | D-8 ~ D-14 |
| 테크·드레스 리허설 단계 | D-1 ~ D-7 |
| 공연 당일 | D-0 |

마감 임박 기준도 가정값(**3일 이내**)이며, `js/rules.js`의 `DEADLINE_SOON_DAYS` 값을 바꾸면 됩니다.

## 9. 실행 방법

`fetch()`로 `data/*.json`을 불러오기 때문에, **로컬 파일을 더블클릭해서 여는 방식(`file://`)은 브라우저 보안 정책 때문에 동작하지 않을 수 있습니다.** 아래 중 하나를 사용하세요.

**로컬에서 실행**
```bash
cd performance-production-automation
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

**GitHub Pages로 배포**
1. 이 폴더 전체를 GitHub Repository 최상위에 업로드
2. Repository → Settings → Pages → Branch를 `main`(또는 사용 중인 브랜치)으로 설정
3. `https://<사용자명>.github.io/<repository명>/` 접속

## 10. `verify.py` 사용 방법

**일반 Python 환경**
```bash
cd performance-production-automation
python3 verify.py
```

**Google Colab**
1. `data/performance.json`, `data/tasks.json`, `verify.py`를 Colab 파일 창에 동일한 폴더 구조로 업로드 (`data/` 하위 폴더 유지)
2. 다음 셀 실행
   ```python
   !python verify.py
   ```

출력 예시:
```text
[정상] 공연일 형식 확인
[경고] 담당자가 없는 업무 2건
[오류] 존재하지 않는 선행 업무 ID: TASK-014
----------------------------------------
검사 완료: 오류 1건 · 경고 1건
```

## 11. GitHub Pages 배포 시 참고사항

- `index.html`이 Repository 최상위(루트)에 있어야 시작 페이지로 인식됩니다.
- 운영 데이터는 Supabase에서 팀원과 공유됩니다. `localStorage`와 정적 JSON은 기존 브라우저 데이터 호환 및 초기 fallback 용도로만 유지됩니다.
- 익명 방문자는 활성화된 Public Archive를 읽을 수 있고, 작성·수정·삭제 기능은 인증 상태와 RLS 권한에 따라 제공됩니다.

## 12. 현재 MVP에서 구현된 범위

- 공연 정보 입력/수정, 참여 인원·제작 파트 관리
- 파트별 업무 생성·수정·삭제, 진행상태·우선순위·선행업무·필수여부·체크리스트포함 관리
- D-day 기반 제작 단계 자동 판정
- 대시보드: 이번 주 할 일 / 파트별 현황 / 다가오는 마감 / 미완료 업무
- 공연 전 체크리스트 (업무 중 `preShowCheck=true`인 것만 표시)
- 자동 검수: 공연일 오류, 연습(프로젝트) 일정 오류, 담당자 누락, 필수 업무 누락, 선후관계 충돌·존재하지 않는 선행업무 참조, 마감 임박·초과, 공연 직전 미완료 필수 업무, 업무 ID 중복, 잘못된 상태값
- `verify.py`로 위 검수 항목 대부분을 데이터 파일 단위에서도 검증 가능

## 13. 향후 확장 아이디어 (이번 범위 밖)

- 브라우저에서 수정한 내용을 `data/*.json`으로 자동 내보내기(export) 버튼
- 제작 단계·마감 임박 기준을 화면에서 직접 편집하는 설정 UI
- 대본 파일 업로드·연결 기능
- 공연장 정보(좌석 배치 등) 구조화
