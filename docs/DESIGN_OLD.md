# Design Specification: 전대극회 2026-2 모집 캠페인 (ACT II)

이 문서는 전대극회 2026-2 신입부원 모집 캠페인 웹 디자인의 구현을 위한 상세 명세서입니다. 현재 Stitch 프로젝트의 디자인을 **Source of Truth**로 하며, 모든 치수와 스타일은 현재 구현된 디자인을 그대로 보존하는 것을 목적으로 합니다.

---

## 1. 전체 디자인 구조 (Overall Layout Structure)

### 1.1 페이지 레이아웃 (Global Layout)
- **컨테이너 (Canvas)**: 모든 콘텐츠는 중앙 정렬된 수직 카드 형태의 컨테이너 안에 배치됩니다.
- **콘텐츠 최대 너비 (Max Width)**: 1080px (Instagram Portrait 비율 4:5 기반)
- **기본 여백 (Padding)**:
  - **Outer Boundary**: 상단/좌측/우측 약 40px~60px의 공백 영역을 유지하는 Inner Card 구조.
  - **Internal Margin**: 컨테이너 내부의 실제 텍스트 및 요소 시작점은 상하좌우 일관된 거리를 유지합니다.
- **섹션 간 간격 (Spacing)**: 섹션은 얇은 수평선(0.5px~1px)으로 구분되며, 상하 간격은 디자인 시스템의 Spacing 규칙을 따릅니다.

### 1.2 공통 구조 (Shared Elements)
- **Header**: 상단 Identity (`JEONDAE THEATRE / ACT II`), 페이지 인덱스 (`PAGE NN / 07`), 메타데이터 (`ACT II / CATEGORY`) 배치.
- **Footer**: 하단 Identity, 캠페인 슬로건 (`SINCE 1965 / 61 YEARS`), 페이지 네비게이션 인디케이터 배치.

---

## 2. 디자인 시스템 (Design System)

### 2.1 컬러 시스템 (Color Palette)
- **Background**: `#f9f9f9` (Off-white / Ivory)
- **Primary Text**: `#000000` (Black)
- **Accent**: `#8b0000` (Deep Red) - 강조 아이콘, 슬래시, 넘버링, 주요 라인에 사용.
- **Divider/Line**: `#000000` (10%~20% Opacity) 또는 `#dadada` (Thin solid line).
- **Surface Dim**: `#dadada` (보조 배경 요소).

### 2.2 타이포그래피 (Typography)
- **Primary Font Family**: `Hanken Grotesk` (Sans-serif)
- **Title (Hero Copy)**:
  - `font-size`: 약 80px ~ 120px
  - `font-weight`: 700 (Bold) / 800 (ExtraBold)
  - `line-height`: 1.1
  - `letter-spacing`: -0.02em
- **Sub-headline / Section Title**:
  - `font-size`: 32px ~ 48px
  - `font-weight`: 600 (SemiBold)
- **Body Text**:
  - `font-size`: 16px ~ 20px
  - `font-weight`: 400 (Regular)
  - `line-height`: 1.6
- **Metadata / Labels**:
  - `font-size`: 12px ~ 14px
  - `font-weight`: 600 (SemiBold)
  - `text-transform`: Uppercase

### 2.3 공통 스타일 (Common Styles)
- **Border**: `1px solid` 또는 `0.5px solid` (Hairline).
- **Border-radius**: 기본적으로 `0px` (Sharp corners). 일부 UI 카드에 미세한 라운드(4px) 적용 가능하나 지배적인 인상은 Rectilinear함.
- **Shadow**: 디자인의 평면성(Flat) 유지를 위해 그림자 사용을 지양함. 카드 외부 컨테이너에만 미세한 Soft Shadow 적용.

---

## 3. 공통 컴포넌트 (Shared Components)

### 3.1 Header (Global Navigation)
- **배치**: 좌측 로고, 중앙 메뉴(Overview, Recruitment, Archive), 우측 프로필 아이콘.
- **스타일**: 상단 고정, 하단 1px 보더.

### 3.2 Metadata Label
- **구성**: 번호 + 라벨 (예: `01 / WHO`)
- **스타일**: 번호는 Deep Red, 라벨은 Black Uppercase. 하단에 얇은 선 배치 가능.

### 3.3 Flow Graphic (Page 05 전용)
- **구성**: 원형 노드, 수평/수직 연결선.
- **스타일**: 액티브 노드는 Deep Red fill, 인액티브 노드는 White fill + 보더.

---

## 4. 화면별 세부 구조 (Screen-Specific Specs)

### [PAGE 01 - COVER]
- **목적**: 캠페인 메인 비주얼 선언.
- **구성 요소**: 대형 Hero Copy (`ACT II / 2막, 시작.`), 3분할 흑백 공연 이미지.
- **레이아웃**: 중앙 집중형, 대각선/비대칭 타이포그래피 배치.
- **주요 스타일**: 이미지 오버레이, 과감한 텍스트 크기 대비.

### [PAGE 02 - ABOUT]
- **목적**: 전대극회 역사 및 통계 전달.
- **구성 요소**: 수평 타임라인 (`1965 --- 2026`), 주요 숫자 (`61`, `127`).
- **레이아웃**: 상단 타임라인, 하단 2열 정보 배치.
- **주요 스타일**: 숫자의 그래픽화, 얇은 타임라인 라인.

### [PAGE 03 - WHAT WE DO]
- **목적**: 제작 파트 소개.
- **구성 요소**: 6개 파트 키워드 타이포그래피, 제작 과정 사진 크롭.
- **레이아웃**: 비대칭 그리드 배치. 텍스트가 이미지를 일부 침범.
- **주요 스타일**: 타이포그래피 중심 레이아웃, 저채도 이미지 처리.

### [PAGE 04 - OUR SCENES]
- **목적**: 활동 경험 시각화.
- **구성 요소**: 공연 포스터 및 현장 사진 콜라주, 활동 리스트 (01~04).
- **레이아웃**: 자유로운 크롭 이미지 배치, 우측/하단 여백 활용.
- **주요 스타일**: 사진 간 크기 대비, 수직 텍스트 배치 (`EXPERIENCE & SCENES`).

### [PAGE 05 - FIRST STAGE]
- **목적**: 신입부원 활동 원칙 안내.
- **구성 요소**: "모두 배우로 시작" 강조 문구, 대표 배우 이미지, 확장 플로우 차트.
- **레이아웃**: 상단 강조 문구, 중앙 이미지, 하단 플로우.
- **주요 스타일**: 딥 레드 플로우 라인, 이미지와 텍스트의 긴밀한 결합.

### [PAGE 06 - RECRUITMENT]
- **목적**: 실제 모집 정보 및 지원 유도.
- **구성 요소**: 2x2 정보 그리드 (대상, 기간, 방법, 일정), QR 코드 영역.
- **레이아웃**: 4분할 격자 구조.
- **주요 스타일**: 굵은 날짜 타이포그래피, QR 코드 독립 영역 확보.

---

## 5. 반응형 동작 (Responsive Behavior)

### 5.1 Desktop (> 1024px)
- 현재 디자인과 동일하게 4:5 비율의 카드를 중앙에 배치. 사이드 여백 충분히 확보.

### 5.2 Tablet (768px ~ 1024px)
- 내부 콘텐츠 너비는 유지하되, 전체 스케일을 90%~80% 정도로 축소하여 카드 형태 유지.

### 5.3 Mobile (< 768px)
- **레이아웃 전환**: 2x2 그리드(Page 06 등)는 수직 1열로 전환 권장.
- **텍스트 크기**: 모바일 가독성을 위해 본문 폰트 사이즈 최소 14px~16px 확보.
- **여백**: 좌우 여백을 최소 20px로 조정하여 화면 가득 채움.

---

## 6. 구현 지침 (Implementation Guidelines)

1. **Pixel Perfect**: 모든 텍스트의 줄바꿈과 위치는 시안을 Source of Truth로 하여 일치시킬 것.
2. **Line Weight**: 0.5px~1px의 아주 얇은 선들이 디자인의 정체성을 형성하므로 굵게 표현되지 않도록 주의할 것.
3. **Image Filtering**: 제공된 이미지는 원본의 흑백 처리나 저채도 느낌을 그대로 유지할 것.
4. **Spacing Consistency**: 요소 간의 간격(Padding/Margin)을 하드코딩하지 말고, 일관된 스페이싱 유닛(예: 8px, 16px, 24px)을 정의하여 사용할 것.
5. **No Modifications**: 새로운 UI 요소 추가, 색상 변경, 레이아웃 재해석을 엄격히 금지함.

---
**Document Status**: Final Specification for Development Hand-off.
**,data_type: