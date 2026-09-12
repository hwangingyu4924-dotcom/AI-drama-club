# MOTION_HERO_SPEC.md

> 대상 프로젝트: `AI-drama-club`  
> 기능명: Cinematic Hero / Motion Hero  
> 목적: MotionSite에서 제안된 시네마틱 Hero 디자인과 영상 모션을 현재 프로젝트에 적용하기 위한 구현 명세  
> 원본 프롬프트 기술 스택: React + Vite + Tailwind CSS + TypeScript  
> 현재 프로젝트 적용 시 주의: 현재 프로젝트가 Vanilla HTML/CSS/JS 구조라면 React/Vite/Tailwind로 전체 마이그레이션하지 말고, 디자인·모션 개념을 현재 구조로 번역하여 적용한다.

---

# 1. Core Goal

Create a fullscreen cinematic hero section with:

- Fullscreen video background
- Large editorial serif headline
- Minimal top navigation
- Soft fade-rise motion
- Manual smooth video loop
- Clean monochrome palette
- Strong visual hierarchy
- Responsive layout

The visual goal is a refined, cinematic, premium landing experience.

---

# 2. Fonts

Use:

- Display / Heading / Logo: `Instrument Serif`
- Body / Navigation / Description: `Inter`

If using React/Vite implementation, import both in:

```text
/src/styles/fonts.css
```

If applying to the current Vanilla project, import them at the top of `style.css`.

Recommended import:

```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600&display=swap');
```

Recommended font rules:

```css
font-family: 'Instrument Serif', serif;
font-family: 'Inter', sans-serif;
```

---

# 3. Video Background

Use this video source:

```text
https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4
```

## Position

Original target:

```text
top: 300px
inset: auto 0 0 0
```

Video should visually sit in the lower portion of the viewport rather than fully covering the entire screen from the top.

## Video Behavior

Implement custom fade-in / fade-out looping.

### Logic

Use a continuous animation loop to monitor:

- `currentTime`
- `duration`

Behavior:

1. At playback start:
   - Fade opacity from `0` to `1`
   - Duration: `0.5s`

2. Near video end:
   - Start fade-out during final `0.5s`
   - Opacity transitions from `1` to `0`

3. On `ended`:
   - Set opacity to `0`
   - Wait `100ms`
   - Reset `currentTime = 0`
   - Call `play()`
   - Fade in again

Goal:

> Create a seamless manual loop with smooth visual transitions.

### React reference

Use:

- `useRef`
- `useEffect`
- `requestAnimationFrame`

### Vanilla adaptation

If implementing in the current Vanilla project:

- Use a normal `<video>` element
- Use `requestAnimationFrame`
- Use a dedicated function such as:

```text
initHeroVideoLoop()
```

Do not introduce React only for this feature.

---

# 4. Video Overlay

Place a gradient overlay above the video.

Original Tailwind reference:

```text
absolute inset-0
bg-gradient-to-b
from-background
via-transparent
to-background
```

Vanilla CSS equivalent should create:

- White / page background fade at top
- Transparent center
- White / page background fade at bottom

Example concept:

```css
.hero-video-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    #ffffff 0%,
    rgba(255,255,255,0) 40%,
    rgba(255,255,255,0) 60%,
    #ffffff 100%
  );
  pointer-events: none;
}
```

---

# 5. Navigation Bar

## Logo

Text:

```text
Aethera®
```

Original reference styling:

- `text-3xl`
- `tracking-tight`
- Instrument Serif
- `#000000`

If applying to AI-drama-club, this text should be replaced with the project identity rather than copied literally.

Recommended adaptation:

```text
JEONDAE THEATRE
```

Do not change the visual intent:

- Large serif wordmark
- Minimal black typography

## Menu Items

Original:

```text
Home
Studio
About
Journal
Reach Us
```

Original colors:

- Home: `#000000`
- Others: `#6F6F6F`

Current project adaptation should map these to existing navigation items instead of creating unrelated pages.

Suggested mapping:

```text
HOME
공연 정보
제작 현황
전체 업무
일정
연습일지
공연 전 체크
```

## CTA

Original label:

```text
Begin Journey
```

Suggested project adaptation:

```text
+ 새 업무
```

or

```text
공연 관리 시작
```

Original style:

- rounded-full
- `px-6 py-2.5`
- `text-sm`
- black background
- white text
- hover scale `1.03`

Use only if consistent with current `DESIGN_SYSTEM.md`.

---

# 6. Navigation Layout

Original reference:

```text
flex justify-between
px-8 py-6
max-w-7xl
mx-auto
```

The navigation should:

- Span the top of the page
- Stay visually lightweight
- Avoid oversized controls
- Maintain generous horizontal spacing

If the current project already uses a Sidebar Dashboard structure, do not replace that navigation system globally.

Recommended usage:

- Hero-only top overlay navigation
- Or minimal project identity bar
- Existing Sidebar remains the primary app navigation after hero

---

# 7. Hero Section

## Positioning

Original:

```text
paddingTop: calc(8rem - 75px)
padding-bottom: 10rem
```

Hero should:

- Fill most or all of the viewport
- Center content
- Allow video to remain visible
- Preserve strong whitespace

Suggested structure:

```text
Hero
├── Small project identity
├── Large headline
├── Description
├── CTA
└── Video background / lower visual
```

---

# 8. Headline

Original text:

```text
Beyond silence, we build the eternal.
```

Original styling:

- `text-5xl`
- `sm:text-7xl`
- `md:text-8xl`
- max-width large
- font-weight normal
- Instrument Serif
- line-height `0.95`
- letter-spacing `-2.46px`

Colors:

- Main text: `#000000`
- Emphasized italic words: `#6F6F6F`

For the current theatre project, replace the actual text with project-relevant copy.

Recommended examples:

```text
봄, 손을 쥐다
```

or

```text
공연은,
무대에 오르기 전부터 시작된다.
```

The visual behavior is more important than keeping the MotionSite copy.

---

# 9. Description

Original:

```text
Building platforms for brilliant minds, fearless makers, and thoughtful souls.
Through the noise, we craft digital havens for deep work and pure flows.
```

Original style:

- `text-base sm:text-lg`
- max-width `2xl`
- `mt-8`
- relaxed line-height
- color `#6F6F6F`

Current project adaptation should describe the production dashboard.

Example:

```text
공연일까지의 모든 제작 과정과 기록을
하나의 Production Desk에서 관리합니다.
```

Keep it short and secondary to the headline.

---

# 10. Hero CTA

Original:

```text
Begin Journey
```

Style:

- pill button
- `px-14 py-5`
- `text-base`
- `mt-12`
- black background
- white text
- hover scale `1.03`

For current project use a contextual CTA such as:

```text
Production Desk 열기
```

or

```text
오늘의 제작 현황 보기
```

Click behavior can scroll to the dashboard section or switch to the HOME dashboard view.

---

# 11. Colors

Original palette:

```text
Background: #FFFFFF
Headline / Logo / Button: #000000
Description / Secondary Nav: #6F6F6F
Button Text: #FFFFFF
```

For AI-drama-club:

- Motion Hero may temporarily use the monochrome palette
- Existing app content below should continue using `DESIGN_SYSTEM.md`
- Do not erase the current Warm Editorial / Theatre Archive identity from the rest of the site

Recommended integration:

```text
Hero = cinematic monochrome / restrained
Dashboard below = existing ivory / brown / terracotta
```

---

# 12. Animations

Create three animation presets.

## fade-rise

```text
opacity: 0 → 1
translateY: 20px → 0
duration: 0.8s
easing: ease-out
```

## fade-rise-delay

Same animation with:

```text
delay: 0.2s
```

## fade-rise-delay-2

Same animation with:

```text
delay: 0.4s
```

If current project is Vanilla CSS:

```css
@keyframes fade-rise {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Use animation classes rather than adding a new animation library unless needed.

---

# 13. Layout Structure

Original target:

```text
Container
├── Background Video Layer (z-0)
├── Gradient Overlay
├── Navigation (z-10)
└── Hero Content (z-10)
```

Recommended current-project structure:

```text
HOME
├── Cinematic Hero
│   ├── Background Video
│   ├── Gradient Overlay
│   ├── Project Identity
│   ├── Hero Headline
│   ├── Description
│   └── CTA / D-Day
│
└── Existing Production Dashboard
    ├── Summary
    ├── Today's Tasks
    ├── Upcoming Deadlines
    ├── Part Status
    └── Important Tasks
```

---

# 14. Current Project Integration Rules

The current project must **not** be migrated to:

- React
- Vite
- TypeScript
- Tailwind

solely to reproduce this hero.

Instead, adapt the visual concept to the existing architecture.

Expected files:

```text
index.html
style.css
app.js
rules.js
performance.json
tasks.json
```

Primary modification targets:

```text
style.css
app.js
```

Possible minimal modification:

```text
index.html
```

Do not modify:

```text
rules.js
```

unless absolutely required for unrelated existing functionality.

---

# 15. Suggested Implementation Functions

If current project remains Vanilla JS, use dedicated functions.

Example:

```text
renderMotionHero()
initHeroVideoLoop()
initHeroAnimations()
destroyHeroAnimations()
```

Keep hero motion code separate from:

- Task logic
- Calendar logic
- Rehearsal Log logic
- Validation logic

---

# 16. Video Performance

The source video should:

- `muted`
- `playsinline`
- preload as appropriate
- avoid blocking app startup

Do not introduce canvas frame capture / boomerang logic in this version.

This specification uses the simpler manual fade-loop approach.

Potential later enhancement:

```text
MOTION_HERO_V2
```

can introduce more advanced canvas or parallax effects after performance validation.

---

# 17. Responsive

Desktop:

- Full viewport hero
- Large headline
- Video strongly visible
- Wide navigation

Tablet:

- Reduce headline scale
- Preserve centered composition
- Video crop remains intentional

Mobile:

- Headline wraps naturally
- CTA remains reachable
- Navigation may simplify
- Video should not overflow
- Avoid text overlapping the main visual focal point

---

# 18. Accessibility

- Video must be decorative and muted
- Text must remain readable over background
- Preserve adequate contrast
- CTA must be keyboard accessible
- Avoid essential information existing only in motion/video
- Respect `prefers-reduced-motion`

Suggested behavior:

```text
prefers-reduced-motion: reduce
→ disable fade-rise movement
→ keep opacity transitions minimal
```

---

# 19. Regression Protection

This feature must not break:

- HOME Dashboard
- 공연 정보
- 제작 현황
- 전체 업무
- 일정
- 연습일지
- 공연 전 체크
- Sidebar
- Part filters
- Task CRUD
- Calendar Events
- Rehearsal Logs
- localStorage
- Existing JSON loading
- rules.js validation

---

# 20. Implementation Order

1. Inspect current HOME structure
2. Add hero markup
3. Add font imports
4. Add hero CSS
5. Add background video
6. Add gradient overlay
7. Add fade-rise animation
8. Add manual video fade-loop
9. Connect CTA
10. Verify responsive behavior
11. Verify existing HOME dashboard remains intact
12. Regression test all major views

---

# 21. Definition of Done

- [ ] Hero appears only where intended
- [ ] Video loads and loops smoothly
- [ ] Fade-in/fade-out works
- [ ] Large editorial headline is readable
- [ ] CTA works
- [ ] Existing sidebar/dashboard remains functional
- [ ] Existing design system below the hero remains intact
- [ ] Mobile layout works
- [ ] No console errors
- [ ] No asset 404
- [ ] No React/Vite/Tailwind migration was introduced
- [ ] Existing production data and localStorage remain intact

---

# 22. Final Intent

This hero is not intended to replace the current Production Dashboard.

Its purpose is to create a cinematic first impression before the user enters the working interface.

The final experience should feel like:

```text
Cinematic Theatre Opening
          ↓
Production Dashboard
          ↓
Actual Work
```

rather than:

```text
Portfolio Landing Page Only
```

The visual language may come from MotionSite, but the product remains a **Theatre Production Management Tool**.
