# AI Drama Club — Current Design System

> Project: 전대극회 공연 제작 업무자동화 시스템
>
> Status: 현재 `index.html`, `style.css`, `app.js` 구현 기준
>
> Direction: MotionSite Top Shell × Cinematic Theatre Opening × Production Desk

이 문서는 현재 사이트에 실제 적용된 디자인 규칙의 기준 문서다. 구현과 문서가 충돌하면 먼저 실제 구현을 확인하고, 의도적인 변경이라면 코드와 이 문서를 함께 갱신한다.

## 1. Design Direction

사이트는 두 개의 시각적 층을 결합한다.

1. **Global Shell / HOME Hero**: white-neutral, black typography, gray secondary text, 넓고 절제된 MotionSite 계열 디자인
2. **Production Content**: 공연 제작 문서, 콜 시트, 캘린더, 연습 기록 아카이브의 실무적 정보 밀도

핵심 인상은 다음과 같다.

- Cinematic Theatre Opening
- Minimal Top Navigation
- Editorial Production Desk
- Theatre Archive
- Wide but controlled whitespace
- 기능 우선의 명확한 정보 계층

HOME만 강한 랜딩 경험을 담당한다. 공연 정보, 제작 현황, 전체 업무, 일정, 연습일지, 공연 전 체크는 실무 화면이며 랜딩페이지처럼 연출하지 않는다.

## 2. App Shell

현재 App Shell은 `app.js`의 다음 구조를 기준으로 한다.

```text
.app-shell
├── .top-shell-header
│   └── .top-shell-nav-wrap
└── .app-main
    ├── HOME 또는 .view-page
    └── .site-footer
```

- 전역 Shell 배경은 `#f8f8f6`이다.
- `.app-main`은 `width: min(100% - 64px, 1280px)`로 중앙 정렬한다.
- 내부 기능 화면은 `.view-page`에서 다시 최대 `1120px`로 제한한다.
- `currentView` 기반 Single Page 렌더링을 유지한다.
- Navigation은 모든 View에서 동일한 위치와 구조로 유지된다.

### Deprecated: Sidebar Shell

다음 규칙은 폐기되었으며 다시 사용하지 않는다.

- 좌측 고정 Sidebar
- Sidebar 안의 작품명과 제작 상태
- Sidebar `PARTS` 목록
- Sidebar 하단 `+ 새 업무 추가`
- Sidebar 폭을 전제로 한 2열 App Shell
- Sidebar 전용 모바일 drawer와 `isSidebarOpen`

기존 목적지는 삭제된 것이 아니다. Navigation은 Top Navigation으로, PARTS 필터는 전체 업무 화면으로, 새 업무 CTA는 Top Navigation 우측으로 이동했다.

## 3. Top Navigation

Top Navigation은 사이트 전체의 메인 Navigation이다.

```text
전대극회

HOME  공연 정보  제작 현황  전체 업무  일정  연습일지  공연 전 체크

                                                      + 새 업무
```

### 구조와 동작

- 좌측 로고: `전대극회`
- 메뉴 순서: `HOME / 공연 정보 / 제작 현황 / 전체 업무 / 일정 / 연습일지 / 공연 전 체크`
- 우측 CTA: `+ 새 업무`
- 로고 클릭: HOME으로 이동
- 메뉴 클릭: 해당 `currentView`만 교체
- 현재 메뉴: 검정 텍스트와 얇은 하단선, `aria-current="page"`
- `+ 새 업무`: 전체 업무로 이동하고 기존 업무 추가 폼을 연다.

### 치수와 스타일

- Desktop 높이: `76px`
- 최대 Navigation 폭: `1380px`
- 좌우 여백: 기본 `32px`, Tablet `24px`, Mobile `18px`
- Header: sticky, `z-index: 30`
- 배경: `rgba(248, 248, 246, .94)`와 약한 blur
- Divider: `#dededb` 1px
- 로고: 한글 serif/display, 약 `25px`, 굵기 700
- 메뉴: Inter 계열, 10–11px, gray → active black
- CTA: black background, white text, 2px radius

## 4. Typography

현재 폰트 계층은 영문 MotionSite 언어와 한글 가독성을 함께 사용한다.

```css
/* Motion / English display */
font-family: "Instrument Serif", serif;

/* Shell navigation / English UI */
font-family: "Inter", sans-serif;

/* Korean display / logo / headings */
font-family: "Noto Serif KR", "Nanum Myeongjo", Georgia, serif;

/* Korean interface / forms / body */
font-family: "Noto Sans KR", "Pretendard", Arial, sans-serif;

/* Production metadata */
font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

### 사용 원칙

- HOME Hero: Instrument Serif를 우선하고 한글 glyph는 한글 serif fallback으로 표시한다.
- `전대극회` 로고와 내부 한글 제목: 한글 serif/display
- Top Navigation과 Hero 설명: Inter 중심
- 폼과 본문: 한글 sans-serif
- ACT, DATE, AUTHOR, STATUS 등 작은 metadata: mono 또는 Inter uppercase
- HOME 외부에서는 52px 이상의 랜딩형 페이지 제목을 사용하지 않는다.

### 현재 크기 체계

- HOME Hero: `clamp(58px, 6.6vw, 96px)`, line-height `1.03`
- 내부 Page Header: `clamp(27px, 3vw, 38px)`, line-height `1.2`
- Mobile Page Header: `28px`
- 긴 연습일지 본문: 16–17px, line-height `1.9`
- 표/업무 UI: 9–16px 범위의 조밀한 계층

## 5. Color System

### Global Shell / Motion Hero

```css
--shell-background: #f8f8f6;
--shell-primary: #111111;
--shell-heading: #171717;
--shell-secondary: #6f6f6f;
--shell-description: #595959;
--shell-divider: #dededb;
--shell-divider-strong: #cfcfcb;
```

### Production Content Tokens

기존 warm palette는 내부 작업 콘텐츠와 상태 표현에 제한적으로 유지한다.

```css
:root {
  --color-paper: #f5f0e8;
  --color-paper-light: #fbf8f2;
  --color-paper-dark: #e9dfd1;

  --color-terracotta: #b85232;
  --color-terracotta-dark: #8f3523;
  --color-terracotta-light: #d88969;

  --color-brown: #5b3a29;
  --color-brown-dark: #33231b;
  --color-brown-light: #a78b76;

  --color-text: #1e1b18;
  --color-text-secondary: #716a63;
  --color-text-muted: #a39b93;
  --color-line: #d7cec4;
}
```

- Shell과 주 Navigation은 neutral/black/gray가 우선이다.
- Terracotta는 hover, warning, selected metadata, 진행 강조에만 제한한다.
- 파트마다 무지개색을 부여하지 않는다.
- 순수한 강한 색 배경을 반복하지 않는다.

## 6. HOME Hero

HOME의 순서는 다음과 같다.

```text
Top Navigation
→ Cinematic Hero
→ Production Dashboard
→ Footer
```

Hero에는 다음 요소가 있다.

- 공연 제작 상태 metadata
- 실제 작품명
- 회색 italic 슬로건 `무대에 오르기 전부터.`
- 제작 데스크 설명
- `오늘의 제작 현황 보기` CTA
- D-Day와 공연일
- 하단 archive/scroll micro label
- 장식용 배경 영상과 gradient overlay

### 영상

- `<video muted playsinline preload="metadata">`
- Hero 하단 영역(`top: 300px`)에서 cover 방식으로 표시
- 채도를 낮추고 대비를 절제한다.
- 상단과 하단이 `#f8f8f6`으로 사라지는 overlay를 사용한다.
- `requestAnimationFrame`으로 재생 시작과 마지막 0.5초 opacity를 계산한다.
- 종료 시 100ms 후 처음으로 이동해 수동 재생한다.
- View 전환과 재렌더 전에 animation frame과 timer를 정리한다.

### 타이포그래피

- 작품명과 italic 슬로건은 각각 block이다.
- 두 줄은 겹치지 않으며 italic 줄에 `.15em` 이상의 상단 간격을 둔다.
- 자간은 약 `-.032em`, line-height는 `1.03`으로 대형 타이포그래피의 존재감과 가독성을 함께 유지한다.
- Hero copy는 중앙 정렬하고 최대 폭 `940px` 안에 둔다.
- Mobile에서는 좌측 정렬하고 크기와 자간을 완화한다.

## 7. Internal Page Header

HOME을 제외한 모든 주요 View는 동일한 compact editorial Page Header를 사용한다.

```text
ACT 01 / PERFORMANCE
공연 기본정보
────────────────────────────
```

현재 매핑:

| View | Metadata | 제목 |
|---|---|---|
| 공연 정보 | ACT 01 / PERFORMANCE | 공연 기본정보 |
| 제작 현황 | ACT 02 / PRODUCTION | 제작 현황 |
| 전체 업무 | ACT 03 / TASKS | 전체 업무 |
| 일정 | ACT 04 / CALENDAR | 일정 |
| 연습일지 | ACT 05 / REHEARSAL ARCHIVE | 연습일지 |
| 공연 전 체크 | ACT 06 / PRE-SHOW | 공연 전 체크 |

### 규칙

- 항상 좌측 정렬한다.
- Header padding은 Desktop `48px 0 27px`, Mobile `34px 0 21px`이다.
- Metadata는 10px Inter, uppercase, 넓은 자간을 사용한다.
- 한글 제목은 최대 38px이다.
- 제목 아래에는 1px divider를 둔다.
- 첫 콘텐츠 섹션은 Header 아래 약 28–34px에서 시작한다.
- 기존 섹션 내부의 첫 대형 `.section-heading`은 공통 Header와 중복 표시하지 않는다.
- 상세 문서 제목이나 하위 검수 제목은 콘텐츠 계층으로 유지할 수 있다.

## 8. Content Width / Grid

### 폭

- Top Navigation: `min(100% - 64px, 1380px)`
- 전체 Main: `min(100% - 64px, 1280px)`
- 내부 View: `min(100%, 1120px)`
- Hero copy: 최대 `940px`
- 연습일지 읽기 본문: 최대 `760px`
- 연습일지 편집 폼: 최대 `820px`

모든 내부 View의 Page Header와 콘텐츠는 동일한 `.view-page` 안에서 같은 좌측 시작선을 사용한다.

### Grid

- `.grid2`: 2열, 기본 gap 42px
- `.grid3`: 3열, 기본 gap 20px
- Dashboard KPI: Desktop 4열, Mobile 2열
- Tablet에서 3열 폼은 2열로 축소할 수 있다.
- Mobile에서 폼과 콘텐츠 grid는 1열로 전환한다.
- `minmax(0, 1fr)`로 내부 콘텐츠 overflow를 방지한다.

## 9. Forms

폼은 랜딩 페이지의 장식 카드가 아니라 편집 가능한 Production Sheet다.

- label을 항상 제공한다.
- input/select 기본 높이: 44px
- 배경: `--color-paper-light`
- border: `--color-line` 1px
- radius: 2px
- shadow는 사용하지 않는다.
- focus: terracotta border와 얇은 inset underline
- textarea는 충분한 높이와 `resize: vertical`을 제공한다.
- placeholder만으로 field 의미를 전달하지 않는다.
- 관련 필드는 `.grid2`, `.grid3`으로 묶고 좁은 화면에서 1열로 바꾼다.
- 작성/편집 폼은 해당 View의 1120px 콘텐츠 폭 안에 둔다.

## 10. Buttons / CTA

### Primary

- black 또는 dark brown background
- light text
- radius 2px
- 명확한 action label
- hover 시 terracotta 계열을 제한적으로 사용

### Secondary

- transparent background
- gray/brown text
- 얇은 border
- hover 시 약한 neutral/paper background

### Danger

- transparent background와 terracotta border/text
- hover 시 terracotta fill
- 삭제는 확인 절차를 거친다.

### 전역 CTA

- Top Navigation의 `+ 새 업무`가 유일한 전역 업무 생성 CTA다.
- HOME Hero CTA는 `#home-dashboard`로 smooth scroll한다.
- CTA hover scale은 Hero에서만 최대 `1.03`으로 제한한다.

## 11. Tables / Lists

- 표와 목록은 카드 묶음보다 divider 기반 editorial ledger로 표현한다.
- table header는 작은 mono uppercase label을 사용한다.
- row는 1px divider와 충분한 세로 padding을 사용한다.
- hover background는 매우 약하게 적용한다.
- shadow와 큰 radius를 사용하지 않는다.
- 업무명처럼 중요한 정보는 한글 serif로 한 단계 강조할 수 있다.
- 상태와 우선순위는 작은 text badge로 표시하고 강한 배경색을 반복하지 않는다.
- 넓은 표는 `.table-scroll` 안에서 가로 스크롤되며 문서 전체 overflow를 만들지 않는다.
- 빈 상태도 상·하 divider와 짧은 안내 문장으로 표현한다.

## 12. Calendar

Calendar는 일반 SaaS 달력이 아니라 **Editorial Theatre Production Calendar**다.

- 7열 Month Grid를 기본으로 한다.
- 날짜 cell마다 둥근 카드를 만들지 않고 얇은 선으로 표 구조를 만든다.
- 월 이동, 오늘, 새 일정 CTA는 grid 상단 toolbar에 둔다.
- Task 마감, Event, 공연일은 동일한 달력에 표시하되 데이터는 합치지 않는다.
- 종류 구분은 작은 label과 얇은 좌측선으로 표현한다.
- Event와 공연일에 terracotta를 제한적으로 사용한다.
- 선택 날짜와 오늘은 outline/underline 중심으로 구분한다.
- 날짜별 항목은 3개까지 보이고 초과분은 `+N MORE`로 표시한다.
- 하단은 선택 날짜와 다가오는 일정의 2열 구조이며 좁은 화면에서 1열이 된다.
- Mobile에서도 달력 자체는 내부 scroll container 안에서 최소 폭을 유지하며 문서 전체를 밀어내지 않는다.
- 일정 폼은 기존 Production Form과 같은 border, label, spacing 언어를 사용한다.

## 13. Rehearsal Archive

연습일지는 **게시판 × 공연 기록 아카이브**다.

- 기본 화면은 글쓰기 폼이 아니라 최신 연습일 우선 목록이다.
- 목록은 번호/분류, 제목, 작성자/날짜, 일부 태그를 divider row로 표시한다.
- 검색과 분류 filter는 목록 위에 둔다.
- Desktop 목록은 3열 editorial row, Mobile은 stacked list다.
- 상세 제목은 기록 문서의 제목이므로 Page Header보다 크게 표현할 수 있다.
- 본문은 최대 760px, line-height 1.9로 읽기 편하게 유지한다.
- DATE, AUTHOR, CATEGORY는 작은 metadata로 표시한다.
- 태그는 작은 mono text로 표시한다.
- 작성 textarea는 최소 300px 높이를 확보한다.
- 분류 선택은 작고 각진 option control로 표현한다.
- empty state는 중앙 정렬된 짧은 안내와 작성 CTA를 제공한다.
- 삭제는 복구 불가 안내와 확인 UI를 거친다.

## 14. Task Management

업무 화면은 **Production Call Sheet**다.

- 공통 Page Header 아래에 새 업무 toggle/form과 전체 업무 ledger를 둔다.
- 전역 `+ 새 업무` 클릭 시 이 View로 이동하고 폼을 자동으로 연다.
- PARTS 필터는 Sidebar가 아니라 전체 업무 화면 상단에 둔다.
- 필터 순서는 `전체` 다음에 현재 공연의 `performance.parts` 순서를 사용한다.
- 업무명, 파트, 담당자, 마감일, 상태, 우선순위, 선행업무, 필수, 체크리스트, ID를 유지한다.
- 완료 상태는 opacity/text decoration 등 절제된 방식으로 구분한다.
- 상태 select는 compact mono UI를 사용한다.
- 모바일에서는 넓은 업무표가 자체 scroll container 안에 남아야 한다.

## 15. Motion / Animation

기본 motion token:

```css
--ease: 180ms ease;
```

허용:

- opacity fade
- translateY 20px 이내의 fade-rise
- navigation underline
- subtle background hover
- progress width transition
- Hero CTA의 미세한 scale
- 영상 시작/종료 opacity 전환

HOME Hero 등장 순서:

- `.fade-rise`: delay 없음
- `.fade-rise-delay`: 0.2s
- `.fade-rise-delay-2`: 0.4s
- duration: 0.8s ease-out

금지:

- bounce
- 강한 parallax
- 반복적으로 시선을 빼앗는 animation
- 기능 화면 전체의 landing reveal
- animation library 추가가 필요한 과도한 효과

`prefers-reduced-motion: reduce`에서는 translate animation과 CTA scale을 제거하고 smooth scroll을 비활성화한다.

## 16. Responsive Rules

### Desktop

- Top Navigation 전체 메뉴 노출
- Main 최대 1280px, 내부 View 최대 1120px
- Hero 중앙 정렬
- Dashboard KPI 4열
- Calendar 7열 grid
- 넓은 form/table 레이아웃 허용

### Tablet

- 1000px 이하에서 좌우 여백을 24px로 축소
- Navigation gap과 메뉴 글자 크기를 축소
- `.grid3`는 필요 시 2열
- Calendar 하단 패널은 1열
- Hero 제목 scale을 낮추되 존재감은 유지

### Mobile

- 760px 이하에서 Top Navigation을 MENU toggle 방식으로 전환
- Header 높이 64px
- 좌우 여백 18px
- 펼침 메뉴는 모든 View를 세로 목록으로 제공
- Page Header 제목은 28px
- Hero는 좌측 정렬, 제목 `clamp(46px, 13.5vw, 66px)`
- Dashboard KPI는 2열
- grid form은 1열
- Rehearsal list는 stacked layout
- Calendar와 table은 자체 scroll container 사용
- 문서 전체에 가로 overflow가 생기면 안 된다.

## 17. Accessibility

- 모든 Navigation과 action은 semantic `button`을 사용한다.
- 현재 Navigation에는 `aria-current="page"`를 제공한다.
- Mobile MENU는 `aria-expanded`와 `aria-controls`를 제공한다.
- 장식 영상은 `aria-hidden`, muted, playsinline으로 사용한다.
- 영상 없이도 작품명, 설명, D-Day, CTA 정보를 읽을 수 있어야 한다.
- form label을 유지한다.
- keyboard focus를 색상 또는 outline/border로 명확히 표시한다.
- 색상만으로 상태를 구분하지 않는다.
- 모바일 action target은 가능한 34–45px 이상을 확보한다.
- 본문 contrast와 긴 글 line-height를 유지한다.
- motion 감소 설정을 존중한다.

## 18. Do / Don't

### Do

- neutral Shell과 기능 콘텐츠의 warm accent 계층을 구분한다.
- 한글 로고 `전대극회`를 좌측 상단에 유지한다.
- 모든 내부 View에 공통 compact Page Header를 사용한다.
- Header와 콘텐츠의 좌측 시작선을 맞춘다.
- 얇은 divider, typography, whitespace로 구조를 만든다.
- 데이터가 없어도 완성된 empty state를 보여준다.
- 기능 화면은 빠르게 읽고 조작할 수 있는 밀도를 유지한다.

### Don't

- Sidebar를 복원하지 않는다.
- HOME 이외 View에 fullscreen Hero나 52px 이상의 랜딩 제목을 추가하지 않는다.
- 모든 콘텐츠를 둥근 카드에 넣지 않는다.
- heavy shadow, glassmorphism, neon, heavy gradient를 사용하지 않는다.
- Material Design, Bootstrap, 일반 SaaS dashboard를 복제하지 않는다.
- Calendar를 Google/Notion Calendar처럼 만들지 않는다.
- 연습일지를 파란색 포털 게시판이나 SNS feed처럼 만들지 않는다.
- 파트별 rainbow palette를 만들지 않는다.
- 장식 때문에 label, table 정보, action을 숨기지 않는다.

## 19. 기능 보호 원칙

디자인 변경 시 아래 기능과 데이터 계약을 보존한다.

- Vanilla HTML/CSS/JS 구조
- `currentView` 기반 Single Page Navigation
- `performance.json`, `tasks.json` 초기 데이터
- `ppa-state-v1` localStorage의 performance/tasks/events
- 별도 `rehearsalLogs` localStorage
- 공연 정보와 참여 인원
- Task CRUD, 상태, 우선순위, 선행업무, 필수/체크리스트 속성
- PARTS filter
- Calendar 월 이동, Task 마감, 공연일, Event CRUD
- Rehearsal Log CRUD, 검색, 분류
- Dashboard 계산
- 공연 전 체크리스트
- `rules.js` 검수 로직

디자인 리팩터링은 ID, `data-*` selector, form field, 저장 key를 바꿀 권한을 자동으로 포함하지 않는다. selector를 변경하면 관련 event binding과 회귀 테스트를 함께 갱신한다.

React, Vite, TypeScript, Tailwind로 전체 마이그레이션하지 않는다. 별도 요구가 없는 한 현재 렌더/state 구조를 재사용한다.

## 20. 앞으로 새 화면 추가 시 따라야 할 공통 규칙

새 View는 다음 순서로 설계한다.

1. Top Navigation이 정말 필요한 전역 목적지인지 판단한다. 불필요하면 기존 View의 하위 기능으로 둔다.
2. `currentView`에 연결하고 Top Navigation을 새 화면에서도 그대로 유지한다.
3. `.view-page` 안에 `.view-page-header`와 `.view-page-content`를 사용한다.
4. Page Header는 `ACT NN / ENGLISH LABEL`과 27–38px 한글 제목으로 구성한다.
5. Header와 콘텐츠는 최대 1120px, 동일한 좌측 시작선을 사용한다.
6. 첫 콘텐츠는 Header 아래 28–34px에서 시작한다.
7. 화면의 핵심 action은 한 곳에만 두고 중복 CTA를 만들지 않는다.
8. form은 기존 field/grid/button 규칙을 재사용한다.
9. list/table/calendar는 카드보다 divider와 typography를 우선한다.
10. 데이터가 없는 상태, loading 실패, 긴 텍스트를 함께 설계한다.
11. Desktop, 1000px 전후 Tablet, 760px 이하 Mobile을 확인한다.
12. keyboard focus, label, ARIA, reduced motion을 확인한다.
13. 기존 localStorage와 JSON schema를 변경하지 않는다.
14. JavaScript runtime error, 중복 ID, asset 404, 문서 전체 가로 overflow를 검사한다.
15. HOME Hero는 재사용 가능한 일반 Page Header가 아니다. 새 기능 화면에 복제하지 않는다.

---

## Current Design Statement

이 사이트의 첫 화면은 한 편의 공연이 시작되는 순간처럼 보여야 하고, 그 아래와 내부 화면은 실제 제작자가 즉시 일할 수 있는 도구여야 한다.

> **Cinematic Theatre Opening → Clear Production Desk → Living Rehearsal Archive**

시각적 인상보다 기능 보존이 우선이며, 기능을 희생한 디자인 변경은 완료된 작업으로 간주하지 않는다.
