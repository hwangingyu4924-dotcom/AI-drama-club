# AI Drama Club — Design System

> **Project:** 전대극회 공연 제작 업무자동화 시스템  
> **Direction:** Warm Editorial × Theatre Archive × Production Desk

## 1. 최우선 원칙
1
이 문서는 현재 프로젝트의 UI/UX 리디자인 기준이다.

- 기존 기능을 삭제하거나 임의로 단순화하지 않는다.
- `performance.json`, `tasks.json`, localStorage 기반 데이터 처리를 유지한다.
- 공연 정보 입력, 제작 파트/인원, 검수, 대시보드, 업무 관리, 체크리스트 기능을 유지한다.
- 기존 ID나 selector 변경 시 관련 JavaScript까지 추적하여 기능이 깨지지 않게 한다.
- 데스크톱·태블릿·모바일 반응형을 지원한다.
- 리디자인 후 JavaScript 오류와 asset 404가 없어야 한다.
- **기능 보존 > 디자인 변경**

## 2. Core Concept

**“공연을 준비하는 사람들의 제작 데스크”**

일반적인 SaaS 관리자 페이지가 아니라 다음의 인상을 결합한다.

- 공연 프로그램북
- 연출 노트
- 제작 회의 자료
- 공연 아카이브
- 현대적인 에디토리얼 웹사이트

최종 개념은 **Digital Production Desk + Theatre Archive**다.

## 3. 레퍼런스 통합 원칙

### Minimal Editorial
전체 뼈대에 사용한다.
- 넓은 여백
- 큰 타이포그래피
- 얇은 구분선
- 정돈된 그리드
- 비대칭적인 텍스트/비주얼 배치

### Warm Portfolio
색과 일부 그래픽 언어에 사용한다.
- 아이보리
- 테라코타
- 브라운
- 부드러운 유기적 곡선
- Serif + Sans-serif 조합

### Minimal Product Editorial
정보 영역과 대시보드에 사용한다.
- 매우 넓은 whitespace
- 작은 caption
- 얇은 border
- 큰 숫자
- 콘텐츠 중심 레이아웃

### Archive / Paper Mood
연극 정체성을 만드는 보조 요소로 사용한다.
- 제작 기록물
- 작은 주석
- REV / ACT / UPDATED 같은 라벨
- 사진 아카이브
- 종이 문서의 느낌

실제 texture, 그림자, 찢어진 종이 효과를 과도하게 사용하지 않는다.

## 4. Visual Keywords

**Warm / Editorial / Archive / Theatrical / Human / Minimal / Documentary**

피한다:

**Corporate SaaS / Neon / Cyberpunk / Glassmorphism / Heavy Gradient / Excessive Shadow / Generic Bootstrap Dashboard**

## 5. Color System

```css
:root {
  --color-paper: #F5F0E8;
  --color-paper-light: #FBF8F2;
  --color-paper-dark: #E9DFD1;

  --color-terracotta: #B85232;
  --color-terracotta-dark: #8F3523;
  --color-terracotta-light: #D88969;

  --color-brown: #5B3A29;
  --color-brown-dark: #33231B;
  --color-brown-light: #A78B76;

  --color-text: #1E1B18;
  --color-text-secondary: #716A63;
  --color-text-muted: #A39B93;
  --color-line: #D7CEC4;
}
```

완전한 흰색과 순수 검정을 주색으로 사용하지 않는다. 기존 강한 빨강은 terracotta로 낮춘다.

## 6. Typography

### Display / Editorial
작품명, 섹션 제목, D-Day, 큰 숫자에 사용한다.

```css
font-family: "Noto Serif KR", "Nanum Myeongjo", Georgia, serif;
```

### Interface
입력, 버튼, 업무, 설명, navigation에 사용한다.

```css
font-family: "Pretendard", "Noto Sans KR", Arial, sans-serif;
```

권장 hierarchy:

```css
.hero-title {
  font-size: clamp(52px, 7vw, 104px);
  line-height: .95;
}

.section-title {
  font-size: clamp(30px, 4vw, 52px);
}

.dashboard-number {
  font-size: clamp(48px, 6vw, 84px);
}
```

## 7. Global Layout

```css
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding-inline: 48px;
}

section {
  padding-block: 80px;
}
```

태블릿은 약 28px, 모바일은 약 18px의 좌우 여백을 사용한다.

모든 콘텐츠를 동일한 카드 안에 넣지 않는다. 섹션 자체의 여백과 얇은 선으로 구조를 만든다.

## 8. 전체 정보 구조

```text
HERO / PRODUCTION DESK

ACT 01 — PERFORMANCE
공연 기본정보 / 제작팀

ACT 02 — PRODUCTION CHECK
검수 결과

ACT 03 — DASHBOARD
제작 현황

ACT 04 — TASKS
업무 관리

ACT 05 — PRE-SHOW
공연 전 체크리스트

FOOTER
```

실제 프로젝트의 기존 섹션 구조가 다르면 기능을 우선하며 ACT 번호를 자연스럽게 조정한다.

## 9. Hero

왼쪽:

```text
JEONDAE THEATRE / PRODUCTION DESK

봄,
손을 쥐다

ACT II / PERFORMANCE PRODUCTION
```

작품명이 화면에서 가장 강한 요소가 되게 한다.

오른쪽은 공연일/D-Day를 하나의 시각적 오브젝트로 구성한다.

```text
PERFORMANCE

D−27

2026. 09. 21
```

circle, arch 또는 soft organic shape를 제한적으로 사용할 수 있다.

## 10. ACT Section System

주요 섹션은 일관된 editorial heading을 사용한다.

```text
ACT 01
PERFORMANCE
공연 기본정보
```

또는

```text
01 /
공연 기본정보
```

ACT/번호는 작은 terracotta 색상, 제목은 크고 강하게 표시한다. 섹션 사이에는 얇은 horizontal rule을 사용한다.

## 11. 공연 기본정보

목표는 일반 웹 폼이 아니라 **Production Sheet**다.

Desktop 예:

```text
작품명                  공연일
공연장                  공연장 정보
프로젝트 시작일          현재 상태

연습 가능 시간
────────────────────────────

제작 파트
[연출] [배우] [무대] [조명] [음향] [기획]

참여 인원
────────────────────────────
```

입력창:
- 그림자 제거
- 작은 radius
- 얇은 border
- warm paper background
- focus 시 terracotta border/underline

## 12. 제작 파트

기존 chip 기능은 유지한다.

시각 언어 예:

```text
DIRECTING / 연출
ACTING / 배우
STAGE / 무대
LIGHT / 조명
SOUND / 음향
PLAN / 기획
```

선택/강조 상태에만 terracotta 또는 deep brown을 사용한다.

## 13. Production Check

현재 검수 결과를 오류 로그가 아닌 **제작 검수 노트**처럼 보이게 한다.

```text
ACT 02

PRODUCTION
CHECK

02
ISSUES FOUND
```

정상 상태:

```text
READY
NO CRITICAL ISSUES
```

각 항목:

```text
WARNING 01

공연일이 입력되지 않아
제작 단계를 판단할 수 없습니다.

────────────────
```

## 14. Dashboard

현재 핵심 수치 구조는 유지한다. 카드 대신 editorial grid를 사용한다.

```text
────────────────────────────────

24          07          03          REHEARSAL
TOTAL       OPEN        THIS WEEK   PHASE

────────────────────────────────
```

- 큰 숫자
- 넓은 여백
- vertical divider
- shadow 없음
- radius 최소화

Dashboard 하단은 `THIS WEEK`, `UPCOMING`, `PART STATUS` 영역으로 정리한다.

파트별 상태 예:

```text
DIRECTING      4 / 7
ACTING         8 / 12
STAGE          3 / 9
LIGHT          2 / 6
SOUND          5 / 8
PLAN           7 / 7
```

progress bar는 얇게 사용한다.

## 15. Task Management

목표는 일반 데이터 테이블보다 **Production Call Sheet**에 가깝게 한다.

```text
TASK 018

무대 평면도 최종 확정

STAGE / 김OO

DUE
SEP 04

STATUS
IN PROGRESS
```

Desktop에서 table 구조를 유지해도 되지만 row spacing을 충분히 확보한다.

Hover는 배경색이 아주 약하게 변하는 수준으로 제한한다.

## 16. Pre-show Checklist

실제 공연 현장의 체크 시트 같은 인상을 만든다.

```text
PRE-SHOW
HOUSE OPEN
────────────────

□ 무대 최종 확인
□ 소품 위치 확인
□ 조명 프리셋
□ 음향 재생 확인
□ 배우 콜 확인
```

완료 항목은 check 표시와 opacity 변화 중심으로 표현한다.

## 17. Cards

카드는 꼭 필요한 곳에서만 사용한다.

```css
.card {
  background: var(--color-paper-light);
  border: 1px solid var(--color-line);
  border-radius: 4px;
  box-shadow: none;
}
```

둥근 SaaS 카드가 반복되는 디자인을 피한다.

## 18. Organic Shapes

유기적 곡선은 다음 정도에 제한한다.

- Hero D-Day
- 큰 섹션의 배경 accent
- 향후 공연 사진 영역

모든 버튼/카드에 둥근 형태를 적용하지 않는다.

## 19. Image System

향후 공연 사진은 단순 갤러리보다 기록 사진처럼 사용한다.

```text
[PERFORMANCE PHOTO]

PERFORMANCE ARCHIVE
2026 / PRODUCTION 128
```

서로 다른 비율의 2~3개 사진을 editorial collage로 구성할 수 있다.

과도한 Polaroid, rotation, shadow 효과는 피한다.

## 20. Micro Labels

사이트 곳곳에 작은 제작 문서 스타일 라벨을 사용한다.

```text
PRODUCTION NOTE
UPDATED 08.25
JEONDAE THEATRE
ACT II
STATUS / REHEARSAL
REV. 02
```

이 요소가 일반 포트폴리오와 다른 연극 제작 정체성을 만든다.

## 21. Buttons

Primary:

```css
background: var(--color-brown-dark);
color: var(--color-paper-light);
border-radius: 2px;
```

Hover:

```css
background: var(--color-terracotta);
```

Secondary는 transparent + dark brown border를 사용한다.

과도한 pill button은 사용하지 않는다.

## 22. Motion

허용:
- opacity fade
- translateY 8~12px
- underline transition
- subtle hover
- progress transition

```css
transition: 180ms ease;
```

bounce, flashy animation, 과도한 parallax는 사용하지 않는다.

## 23. Responsive

### Desktop
- 넓은 whitespace
- 2-column 적극 활용
- Dashboard 4-column
- 큰 typography

### Tablet
- form 필요 시 1-column
- Dashboard 2×2

### Mobile
Hero는 세로로 재배치한다.

```text
JEONDAE THEATRE

봄,
손을 쥐다

D−27
```

입력창은 width 100%.

Task table은 모바일에서 stacked row/card 형태로 바꿀 수 있다.

## 24. Accessibility

- 충분한 contrast
- keyboard focus 표시
- form label 유지
- semantic button 사용
- placeholder만으로 label을 대체하지 않음
- mobile touch target 확보

## 25. Codex 작업 순서

### STEP 1 — Audit
먼저 `index.html`, `style.css`, `app.js`, `rules.js`, `performance.json`, `tasks.json`의 역할과 연결 관계를 분석한다. 아직 수정하지 않는다.

### STEP 2 — Design Tokens
`style.css`에 색상, typography, spacing token을 정의한다.

### STEP 3 — Global Layout
body, wrapper, container, typography, section spacing을 수정한다.

### STEP 4 — Hero
Hero를 우선 완성한다.

### STEP 5 — Forms
공연 기본정보와 제작팀을 Production Sheet 스타일로 변경한다.

### STEP 6 — Production Check
검수 UI를 제작 검수 노트 스타일로 변경한다.

### STEP 7 — Dashboard
editorial dashboard로 변경한다.

### STEP 8 — Tasks / Checklist
업무와 공연 전 체크리스트를 개선한다.

### STEP 9 — Responsive
Desktop / Tablet / Mobile을 검증한다.

### STEP 10 — Regression Check
다음을 반드시 테스트한다.

```text
공연 정보 입력
파트 추가/삭제
인원 추가
업무 추가
업무 수정
업무 완료
검수
Dashboard 계산
Checklist
localStorage
JSON 초기 데이터 로딩
```

## 26. Definition of Done

### Visual
- [ ] Warm ivory 기반
- [ ] Terracotta 제한적 accent
- [ ] Serif + Sans hierarchy
- [ ] 충분한 whitespace
- [ ] SaaS dashboard 느낌 최소화
- [ ] 공연 제작/아카이브 정체성
- [ ] ACT section system 일관성
- [ ] 큰 숫자와 얇은 선 적극 활용

### Functional
- [ ] 기존 기능 모두 유지
- [ ] localStorage 정상
- [ ] JSON 초기 데이터 정상 로딩
- [ ] Dashboard 계산 정상
- [ ] 업무 관리 정상
- [ ] 검수 규칙 정상
- [ ] console error 없음
- [ ] asset 404 없음

### Responsive
- [ ] Desktop
- [ ] Tablet
- [ ] Mobile

## 27. Codex 실행 지시문

현재 프로젝트의 기능과 데이터 로직을 먼저 분석한다.

기존 기능을 삭제하거나 단순화하지 않는다.

이 `DESIGN_SYSTEM.md`의 시각적 원칙을 기준으로 현재 사이트 전체 UI를 리디자인한다.

특히 `style.css`를 중심으로 작업하되 필요한 경우 `index.html`과 `app.js`가 생성하는 렌더링 HTML을 수정한다.

JavaScript 수정이 필요한 경우 기존 기능과 데이터 호환성을 반드시 유지한다.

일반적인 SaaS Dashboard가 아니라 **Warm Editorial × Theatre Archive × Production Desk**의 인상을 목표로 한다.

구현 후 기존 기능을 회귀 테스트하고 browser console error 및 asset 404를 확인한다.

## 28. Final Design Statement

이 사이트는 단순한 업무 관리 프로그램이 아니다.

**한 편의 공연이 만들어지는 과정을 기록하는 디지털 제작 노트다.**

사용자가 사이트를 열었을 때

> “업무 프로그램에 들어왔다”

보다는

> **“지금 우리가 만들고 있는 공연의 제작 데스크를 펼쳤다.”**

라는 느낌을 주는 것을 최종 디자인 목표로 한다.
