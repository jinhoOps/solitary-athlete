---
version: "1.6.0"
name: mukmuk-design-system
status: implementation-ready
updated: "2026-10-21"
description: >-
  고독한 운동가의 운동 기록 화면. 밝은 종이색 바탕, 흰 기록 카드,
  짙은 녹색 동작 버튼과 작은 사각형 잔디로 각자의 꾸준함을 보여준다.
  묵묵(mukmuk)의 목소리는 짧고 차분하며 기록 자체가 화면의 중심이다.

colors:
  primary: "#326C43"
  primary-active: "#275635"
  primary-disabled: "#E8EDE4"
  on-primary: "#FFFFFF"
  ink: "#18271E"
  body: "#18271E"
  muted: "#57665B"
  hairline: "#D3DBD0"
  canvas: "#F7F8F2"
  surface-card: "#FFFFFF"
  surface-message: "#EDF1E9"
  control-hover: "rgba(46,85,59,.08)"
  control-pressed: "rgba(46,85,59,.16)"
  surface-soft: "#D9E9D9"
  grass-empty: "#E8EDE4"
  grass-record: "#4B8F52"
  grass-photo: "#18532A"
  focus: "#326C43"
  success: "#326C43"
  warning: "#8A5A13"
  warning-soft: "#FFF4DD"
  error: "#A13D36"
  error-soft: "#FCEEEB"

fonts:
  ui: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

typography:
  display-lg:
    fontFamily: "{fonts.ui}"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  display-sm:
    fontFamily: "{fonts.ui}"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  title-lg:
    fontFamily: "{fonts.ui}"
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
  title-md:
    fontFamily: "{fonts.ui}"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "{fonts.ui}"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  body-sm:
    fontFamily: "{fonts.ui}"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "{fonts.ui}"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  metric:
    fontFamily: "{fonts.ui}"
    fontSize: 19px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
    fontVariantNumeric: tabular-nums
  button:
    fontFamily: "{fonts.ui}"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  cell: 3px
  control: 10px
  card: 16px
  mark: 28px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

layout:
  content-max: 1080px
  gutter-desktop: 24px
  gutter-mobile: 14px
  section-gap: 16px
  card-gap: 16px
  target-min: 44px
  grass-cell: 14px
  grass-gap: "{spacing.xxs}"
  focus-width: 2px
  focus-offset: 2px

motion:
  feedback: 140ms
  enter: 160ms
  easing: ease-out
  animatedProperties: color, background-color, border-color
  enterProperty: opacity
  pressed: immediate
  selection: immediate
  disabled: immediate
  focusOutline: immediate
  reducedMotion:
    feedback: 0s
    enter: none

grass:
  labels:
    fontSize: .75rem
    lineHeight: 1.1666667
    rowHeight: max(14px, .875rem)
    weekdayWidth: calc(.75rem + 4px)
    weekdayGap: 12px
    monthOffset: weekday-width-plus-gap
    monthClip: soft-mask-at-sticky-weekday-gutter
    monthFadeWidth: 12px
    monthFadeVisibility: remaining-scroll-direction-only
  detail:
    backgroundColor: "{colors.surface-card}"
    messageBackgroundColor: "{colors.surface-message}"
    borderColor: "{colors.hairline}"
  scroll_fade:
    width: 12px
    color: "{colors.surface-card}"
    edgeTolerance: 1px
    pointerEvents: none
    keyboardFocus: hidden
    weekdayLabels: unobscured
    leftEdge: sticky-weekday-right-edge
    verticalExtent: cell-rows-only
    visibility: remaining-scroll-direction-only
    updateOn: scroll, resize, reveal-date

components:
  brand-header:
    textColor: "{colors.ink}"
    typography: "{typography.title-md}"
    paddingBottom: 12px
    marginBottom: 14px
    subtitle: "묵묵 · 운동 기록"
    markSize: 28px
    gap: "{spacing.sm}"
    borderColor: "{colors.hairline}"
  intro:
    typography: "{typography.display-lg}"
    textColor: "{colors.ink}"
    supportingTypography: "{typography.body-md}"
    supportingColor: "{colors.muted}"
    paddingBlock: "{spacing.xxl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    minHeight: "{layout.target-min}"
    paddingInline: "{spacing.md}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
  button-primary-disabled:
    backgroundColor: "{colors.primary-disabled}"
    textColor: "{colors.muted}"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    minHeight: "{layout.target-min}"
    paddingInline: "{spacing.md}"
  button-secondary-active:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
  button-secondary-disabled:
    backgroundColor: "{colors.primary-disabled}"
    textColor: "{colors.muted}"
  button-icon:
    backgroundColor: transparent
    hoverFocusBackground: "{colors.control-hover}"
    borderWidth: 0px
    textColor: "{colors.muted}"
    rounded: 6px
    minSize: 32px
    iconSize: 20px
  control-focused:
    outlineColor: "{colors.focus}"
    outlineWidth: "{layout.focus-width}"
    outlineOffset: "{layout.focus-offset}"
  text-link:
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
    textDecoration: underline
  monthly-kpi:
    gap: 10px
    marginBottom: 14px
    padding: 10px 12px
    rounded: 10px
    labelValueGap: 2px
    valueTypography: "{typography.metric}"
    jointKingGap: 4px
    participationLabel: 함께 심은 잔디
    participationChangeTypography: "{typography.caption}"
    participationChangeGap: 4px
    contextLineTypography: "{typography.caption}"
    contextLineGap: 4px
    kingTitleColor: "{colors.primary}"
    kingTitleDefault: "✨"
  member-filter:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.muted}"
    fontSize: 13px
    fontWeight: 500
    borderColor: "{colors.hairline}"
    rounded: 8px
    minHeight: 36px
    mobileMinHeight: 44px
    gap: 6px
    padding: 6px 12px
    marginBottom: 14px
    feedback: immediate
    findButton: same-as-filter-chip
    mobileWrap: actions-first-row-personal-list-full-second-row
    refitOn: container-and-chip-size-change
    scrollFadeWidth: 12px
    scrollFadeColor: "{colors.canvas}"
    scrollEdgeTolerance: 1px
    scrollPaddingInline: 15px
    scrollFadeFocusVisible: hidden
    scrollFadePointerFocus: preserved
  member-filter-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    borderColor: "{colors.primary}"
  year-stepper:
    display: inline-flex
    alignItems: center
    gap: 0px
    backgroundColor: transparent
    borderWidth: 0px
    padding: 0px
    shadow: none
    buttonSize: 28px
    mobileTargetSize: 44px
    fontSize: 13px
    desktopArrows: hover-or-focus-within
    touchArrows: always-visible
  photo-toggle:
    backgroundColor: transparent
    borderWidth: 0px
    fontSize: 12px
    fontWeight: 500
    padding: 0px
    minHeight: 28px
    mobileMinHeight: 32px
  dialog-surface:
    shadow: none
    backdropFilter: none
    characterFilter: none
    actionsAlign: flex-end
    actionsGap: 8px
    actionsWrap: true
    actionsVariant: secondary
  inception-dialog:
    maxWidth: 420px
    rounded: "{rounded.card}"
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    backdrop: "rgb(24 39 30 / 40%)"
    characterSize: 88px
  aggregate-grass:
    baseColor: "{colors.grass-empty}"
    overlayColor: "{colors.grass-record}"
    opacityStepsMax: 50
    displayOpacityMin: 0.2
    detailPlacement: below-graph
  grass-cell-today:
    outlineColor: "{colors.primary}"
    outlineWidth: 1px
    outlineOffset: "{layout.focus-offset}"
  grass-cell-future:
    backgroundColor: "{colors.grass-empty}"
    opacity: 0.35
    disabled: true
  photo-preview:
    minColumnWidth: 128px
    maxHeight: 240px
    gap: "{spacing.xs}"
    minHeight: "{layout.target-min}"
  photo-dialog:
    maxWidth: 960px
    padding: "{spacing.md}"
    rounded: 12px
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    backdrop: "rgb(0 0 0 / 60%)"
  workout-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    borderWidth: 1px
    rounded: "{rounded.card}"
    padding: 20px
    mobilePadding: 16px
    headingLayout: date-metrics-year-flex-wrap
    mobileHeadingLayout: date-year-then-metrics
    headingMarginBottom: 10px
    shadow: none
  stat-metric:
    textColor: "{colors.ink}"
    labelColor: "{colors.muted}"
    display: flex-wrap-baseline
    valueFontSize: 14px
    valueFontWeight: 700
    labelTypography: "{typography.caption}"
    labelValueGap: 4px
    gap: 14px
    marginBottom: 0px
  grass-cell-empty:
    backgroundColor: "{colors.grass-empty}"
    rounded: "{rounded.cell}"
    size: "{layout.grass-cell}"
  grass-cell-record:
    backgroundColor: "{colors.grass-record}"
    rounded: "{rounded.cell}"
    size: "{layout.grass-cell}"
  grass-cell-photo:
    backgroundColor: "{colors.grass-photo}"
    rounded: "{rounded.cell}"
    size: "{layout.grass-cell}"
  grass-cell-focused:
    outlineColor: "{colors.focus}"
    outlineWidth: "{layout.focus-width}"
    outlineOffset: "{layout.focus-offset}"
  grass-legend:
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    gap: "{spacing.sm}"
  grass-footer:
    display: flex-wrap
    justifyContent: space-between
    alignItems: center
    gap: 8px
    marginTop: 10px
    previewIdle: empty
    previewFlexBasis: 180px
    previewMinHeight: 1.5em
    previewWhitespace: nowrap
    previewOverflow: ellipsis
    previewNewlines: space
  date-detail:
    backgroundColor: "{grass.detail.backgroundColor}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: 12px 14px
    closeSize: 32px
    memoFontSize: 14px
    memoLineHeight: 1.6
    aggregateRowGap: 8px
    message: "{components.timeline-message}"
    labelPaddingTop: 8px
  timeline-item:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderWidth: 0px
    padding: 0px
    gap: 12px
  timeline-message:
    backgroundColor: "{colors.surface-message}"
    rounded: 8px
    padding: 8px 12px
    fontSize: 14px
    lineHeight: 1.6
  timeline-month:
    gap: 16px
    recordGap: 8px
    headingFontSize: 13px
    sectionMargin: 16px 0 8px
    sectionFontSize: 16px
    datePaddingTop: 8px
    dateColor: "{colors.muted}"
    dateHoverFocusColor: "{colors.primary}"
  status-notice:
    textColor: "{colors.muted}"
    emptyState: hidden
    typography: "{typography.body-sm}"
  status-notice-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.control}"
    padding: "{spacing.md}"
    maxWidth: 100%
    messagePlacement: next-line
  status-notice-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
    rounded: "{rounded.control}"
    padding: "{spacing.md}"
  loading-placeholder:
    backgroundColor: "{colors.grass-empty}"
    rounded: "{rounded.control}"
    animation: none
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    marginTop: 24px
    paddingTop: 14px
    borderColor: "{colors.hairline}"
---

# 고독한 운동가 · 디자인 시스템

## Overview

**오늘도 묵묵히, 잔디 한 칸.** 혼자 운동하는 사람들의 조용한 기록 공간이다. 봇 **묵묵(`mukmuk`)**은 곁에서 기록을 챙기는 존재로 표현한다. 밝은 종이색 바탕, 흰 카드, 작은 사각형 잔디를 사용하며 운동 기록이 화면의 중심이다.

이 문서는 색상·글꼴·간격·컴포넌트·상태·반응형의 단일 기준이다. `DESIGN-cal.md`의 **YAML 토큰 → 시각 원칙 → 컴포넌트 → 반응형 → 변경 가이드** 형식을 참고했다. Cal의 검정 CTA·전용 글꼴·마케팅 카드·어두운 푸터를 가져오는 대신 묵묵의 기존 녹색·한국어 글꼴·기록 화면을 정의한다. 2026-10-15에 전체 합산 그래프·멤버 탐색·오른쪽 연도 탐색 설계가 승인됐다. 구현된 컴포넌트의 명세는 현재 화면을 기준으로 유지하며, 문서와 구현의 수치 차이는 실제 사용성 결함과 구분해 정합성을 맞춘다.

제품 동작, 날짜 집계, DB·함수·배포 계약, 실제 서비스 ID와 적용 이력은 [ARCHITECTURE.md](ARCHITECTURE.md)에서 관리한다. 화면을 구현할 때에는 두 문서를 함께 따른다. [대시보드 통합 시안](docs/design/dashboard-preview.svg)과 [데스크톱 시안](docs/design/dashboard-desktop.svg)·[모바일 시안](docs/design/dashboard-mobile.svg)은 가상 기록을 사용하는 정적 구성 시안이다.

| 브랜드 요소 | 기준 |
| --- | --- |
| 브랜드명 | 고독한 운동가 |
| 봇 표시명 / 식별자 | 묵묵 / `mukmuk` |
| 페이지 제목 | 고독한 운동가 · 운동 잔디 |
| 소개 | 당신의 속도로 쌓아가는 운동 기록. |
| 대표 문장 | 오늘도 묵묵히, 잔디 한 칸. |

## Colors

### Brand & Accent

`{colors.primary}`는 브랜드 마크·주요 버튼·선택한 필터에 쓴다. 활성 버튼은 `{colors.primary-active}`로 한 단계 짙어진다. 기록을 강조하기 위해 화면 전체를 녹색 면으로 채우지 않는다. 링크는 `{colors.primary}`와 밑줄을 함께 사용한다.

### Surface & Text

바탕은 `{colors.canvas}`, 카드는 `{colors.surface-card}`다. 제목·본문은 `{colors.ink}`, 날짜·보조 문구는 `{colors.muted}`를 쓴다. 카드와 구분선은 1px `{colors.hairline}`이다. `{colors.surface-soft}`는 선택 맥락이나 가벼운 활성 상태에 쓴다. 푸터도 밝게 유지한다.

작은 글씨의 대비는 실제 사용하는 배경에서 4.5:1 이상을 확인한다. 흰 글씨는 짙은 주요 동작 버튼에 사용하고 기본 잔디 위에는 글씨를 얹지 않는다. 사진 잔디와 기본 잔디는 데이터 상태 색상이며 성공·오류 메시지와 혼용하지 않는다.

### Grass Levels

| 단계 | 토큰 | 범례·상세 표기 |
| --- | --- | --- |
| 0 | `{colors.grass-empty}` | 기록 없음 |
| 1 | `{colors.grass-record}` | 텍스트 인증 |
| 2 | `{colors.grass-photo}` | 사진 포함 |

같은 날 사진 인증이 하나라도 있으면 진한 녹색이다. 사진 수·메모 줄 수에 따라 단계를 더 올리지 않는다. 날짜당 운동일수는 항상 1일이다. 셀 접근 가능한 이름과 범례·날짜 상세에 단계 이름을 함께 표시해 색에만 의존하지 않는다. 정확한 집계 계약은 [날짜·집계](ARCHITECTURE.md#3-사용자-경험과-날짜-규칙)를 따른다.

### Semantic

`{colors.warning}`·`{colors.warning-soft}`는 **수집 지연**, `{colors.error}`·`{colors.error-soft}`는 **조회 실패**에만 쓴다. 쉬는 날·연속 일수 감소·누적이 적은 멤버를 경고색으로 표시하지 않는다. 성공 표시는 꼭 필요한 저장 상태에만 사용하고 잔디를 과도하게 강조하지 않는다.

## Typography

### Font Family

모든 한국어 제목·본문·UI는 `{fonts.ui}`를 쓴다. 운영체제 글꼴로 시작하며 전용 웹폰트 다운로드가 필수 조건이 아니다. Cal Sans·Inter의 크기·자간을 한국어에 그대로 복사하지 않는다. 제품 화면에는 개발용 코드 영역이 없으며 `{fonts.mono}`는 문서·개발 예시용이다.

### Hierarchy

| 토큰 | 크기 / 두께 / 행간 | 사용 |
| --- | --- | --- |
| `{typography.display-lg}` | 40px / 700 / 1.3 | 데스크톱 대표 문장 |
| `{typography.display-sm}` | 28px / 700 / 1.3 | 모바일 대표 문장 |
| `{typography.title-lg}` | 20px / 700 / 1.4 | 운동 잔디·상세 메모 섹션 |
| `{typography.title-md}` | 18px / 600 / 1.4 | 브랜드명·멤버명 |
| `{typography.body-md}` | 16px / 400 / 1.6 | 소개·일반 본문 |
| `{typography.body-sm}` | 14px / 400 / 1.5 | 날짜·수집 시각·설명 |
| `{typography.caption}` | 12px / 500 / 1.5 | 요일·월·잔디 범례 |
| `{typography.metric}` | 19px / 700 / 1.2 | 월간 KPI 값·운동왕 이름 |
| `{typography.button}` | 14px / 600 / 1.4 | 필터·더 보기·재시도 |

대표 문장만 -0.02em 자간을 사용하고 본문은 기본 자간을 유지한다. 통계 숫자는 `tabular-nums`를 사용한다. 한글은 단어 단위 줄바꿈을 우선하고 긴 이름·URL에는 `overflow-wrap: anywhere`를 적용한다. 메모는 원래 줄바꿈을 유지한다. 말줄임으로 숨긴 이름은 상세에서 전체를 읽을 수 있어야 한다.

## Layout

### Spacing System

4·8·12·16·24·32·48px 간격을 기본으로 하며 컴팩트 화면의 2·6·10·14px은 아래 컴포넌트 토큰을 따른다. 섹션 간격은 `{layout.section-gap}`, 카드 간격은 `{layout.card-gap}`이다. 카드 안쪽은 데스크톱 20px, 모바일 16px이다. 마케팅 페이지의 96px 간격을 가져오지 않고 기록을 빠르게 읽을 수 있게 한다.

### Grid & Container

콘텐츠는 최대 `{layout.content-max}` 중앙 정렬이다. 768px 이상은 좌우 `{layout.gutter-desktop}`, 그 이하는 `{layout.gutter-mobile}` 여백을 둔다. 전체·개인 모두 그래프 카드 하나를 표시한다. 연도 탐색은 그래프 스크롤 영역 밖의 카드 상단 오른쪽에 둔다. 연간 그래프의 14px 셀은 유지한다. 1080px 이상 화면에서는 53주 전체가 스크롤 없이 들어가고, 그보다 좁으면 부족한 폭을 그래프 내부에서만 스크롤한다. 요일과 셀은 동일한 `max(14px, .875rem)` 행 트랙 가운데에 정렬한다. 기본 14px 행은 200% 글자에서 28px가 되어 요일이 겹치지 않는다. 월 시작 여백은 요일 폭(`.75rem + 4px`)과 12px 간격의 합을 사용하며 스크롤 중 월 라벨이 고정 요일 영역을 침범하지 않게 가린다.

### Page Composition

1. 28px 마크·브랜드명·`묵묵 · 운동 기록`, 마지막 수집 시각과 Discord 링크를 보여주는 헤더.
2. 전체 멤버 화면의 월간 KPI 5종.
3. `전체 멤버`·멤버 이름 필터와 같은 톤의 `멤버 찾기` 버튼.
4. 하나의 연간 잔디 카드. 오늘 날짜·인라인 통계·연도 탐색을 묶은 상단, 잔디, 범례·프리뷰 푸터 순서이며 날짜 상세는 아래에 둔다.
5. 개인 화면의 「남겨 둔 운동」 제목과 월별 메모 타임라인·`더 보기`. 우측 중복 캡션은 두지 않는다.
6. 멤버 열람 범위·Discord 사진 삭제 가능성과 수집 간격 안내.

각 영역은 한 가지 역할을 갖는다. 웹 화면에 DB 스키마·키·수집 내부 구현 설정을 표시하지 않는다. 운동 작성은 Discord에서 이루어지므로 웹에 입력 폼을 추가하지 않는다.

## Elevation & Depth

| 영역 | 처리 |
| --- | --- |
| 바탕·소개·헤더 | 평면, 그림자 없음 |
| 기록 카드·메모 행 | 흰 바탕 + 1px hairline |
| 선택한 필터 | 녹색 면 + 흰 글씨 |
| 날짜 상세 | 종이색 바탕, 카드 안의 별도 영역 |
| 키보드 포커스 | 2px 녹색 outline, 2px offset |

카드와 인증·멤버 검색·개설 안내·사진 확대 다이얼로그에는 그림자·유리 효과·backdrop blur를 쓰지 않는다. 개설 안내 캐릭터에도 drop-shadow를 붙이지 않는다. 사진 확대의 검정 60% backdrop과 다른 다이얼로그의 녹색 40% backdrop은 기존 대비를 유지한다. 다이얼로그의 닫기·원문 링크는 secondary 버튼으로 오른쪽 정렬하고 공간이 부족하면 줄바꿈한다. 카드에는 장식용 그라디언트를 쓰지 않는다. 잔디와 멤버 목록의 12px 가장자리 페이드는 스크롤 방향을 안내하는 기능성 예외이며 포커스를 가리지 않는다. 원근감 대신 여백·면·타이포그래피로 계층을 만든다. 포커스 윤곽선을 카드 overflow로 잘라내지 않는다.

## Shapes

기록 카드·메모 행은 `{rounded.card}`, 버튼·상세 영역은 `{rounded.control}`, 잔디는 `{rounded.cell}`을 따른다. 데이터 셀은 작은 정사각형으로 유지한다.

다이얼로그는 현재 구현의 용도별 형태를 유지한다. 인증·멤버 검색·개설 안내의 모서리 반경은 16px, 사진 확대는 12px다. 개설 안내의 최대 폭은 420px, 사진 확대는 960px이며, 사진 확대는 화면 가장자리에서 최소 16px를 확보한다. 다이얼로그의 폭과 여백을 모두 동일하게 맞추는 것을 검수 조건으로 삼지 않는다. 작은 화면과 글자 확대에서는 본문을 읽고 필요한 동작에 도달할 수 있으며, 닫은 뒤 초점이 복귀하는지 확인한다.

마크의 128px 원본에는 `{rounded.mark}` 반경을 사용한다. [마크 원본](assets/brand/mark.svg)의 새싹과 사각 실루엣을 유지하고 최소 24px로 표시한다. 주변 여백은 마크 너비의 1/4 이상이다. [배너](assets/brand/banner.svg)는 README용 가로 소개다. 하단 왼쪽의 초록 라벨 박스는 제거하고, 승인된 대표 포즈를 80px 캔버스(실제 캐릭터 약 65px)로 줄여 좌우 반전해 배치한다. 캐릭터 뒤의 배경·테두리·배지는 두지 않는다. 오른쪽에는 21px·400(보통 굵기) `잔디 심는 묵묵`을 두고 문구 시작을 x=168px로 맞춰 캐릭터와의 간격을 좁힌다. 그림자는 추가하지 않는다. 상단 새싹과 오른쪽 잔디의 크기·위치는 유지한다. PNG는 등록·내보내기용이고 SVG가 수정 원본이다.

## Components

### Brand Header & Intro

`{components.brand-header}`는 큰 내비게이션 대신 브랜드와 봇의 역할을 보여준다. 헤더에 가입·가격·관리 메뉴를 추가하지 않는다. `{components.intro}`의 제목은 대표 문장이며 모바일에서는 `{typography.display-sm}`로 바꾼다. 강제 한 줄 축소 대신 자연스럽게 두 줄로 흐르게 한다.

### Mukmuk Mascot

2026-10-16 승인 마스코트는 말랑한 모찌 체형의 너구리 SD 캐릭터다. 따뜻한 크림색 몸, 작은 둥근 귀, 짧은 줄무늬 꼬리, 짙은 갈색 윤곽선과 단순한 눈·입을 유지한다. 볼에 홍조·점·무늬·수염을 추가하지 않는다. 단순한 2D 일러스트를 기준으로 하고 입체적인 재해석으로 얼굴과 몸의 인상을 바꾸지 않는다.

**고독한 운동가 서버·채널과 공용 브랜드의 대표 마크는 기존 새싹을 유지한다. 배너도 상단 새싹·슬로건·오른쪽 잔디를 유지하며, 하단 봇 소개에만 작은 묵묵을 배치한다. 묵묵 봇 프로필만 마스코트로 구분한다.** 봇 전용 마크·배너와 개별 스프라이트는 `assets/brand/mukmuk/` 안에서 관리하고 공용 `assets/brand/mark.*`·`banner.svg`를 대체하지 않는다.

고유 표식은 **초록 운동 아대 위의 작은 아이보리 새싹**이다. 새싹은 짧은 줄기와 두 잎으로 표현하고 아대 방향에 맞춰 그린다. 머리나 볼에 새싹을 옮기지 않는다. 대표 전신·정면 프로필·흰 외곽선 스티커/와펜·만족·결심·지침 여섯 구성을 동일 캐릭터로 유지한다.

[최종 캐릭터 시트](assets/brand/mukmuk/final/2026-10-16/mukmuk-character-sheet-v1.png)와 [파일 안내](assets/brand/mukmuk/final/2026-10-16/README.md)가 승인 형태의 기준이다. 기존 default·emotions·shiny 폴더의 시안과 구분하며 후속 수정은 새 버전으로 저장한다. 기존 새싹 브랜드 마크와 마스코트는 별도 에셋이다.

### Mukmuk Discord Emoji

[이모지 전용 6종](assets/brand/mukmuk/emojis/README.md)은 인사·놀람/감탄·고마워·웃음·지침·파이팅이다. 기존 `mukmuk_yes`는 `mukmuk_exclaim`으로 교체한다. 얼굴을 화면 대부분에 두고 큰 손동작이나 하트 하나로 의미를 구분한다. 전신·다리·꼬리는 제외하고 작은 글씨나 볼 장식을 추가하지 않는다. 원래 마스코트의 크림색·둥근 귀·짙은 윤곽선과 보이는 손목의 초록 새싹 아대를 유지한다.

정사각형 투명 PNG 128px를 등록용으로 제공하며 64px 재사용본을 함께 둔다. 윤곽과 눈·입은 축소를 고려해 두껍게 표현한다. 32px 실제 크기로 밝은 배경과 어두운 배경에서 표정과 손동작을 점검하고 [비교 시트](assets/brand/mukmuk/emojis/preview.png)를 남긴다. 파일 준비와 실제 서버 등록 상태를 혼동하지 않는다.

[기호형 6종](assets/brand/mukmuk/emojis/symbols/README.md)은 `?`·`!`·`O`·`X`·`✓`·`👍`가 중심이며 묵묵은 모서리나 옆에서 작게 반응한다. 기호의 주요 획을 가리지 않고 기호가 얼굴보다 먼저 읽혀야 한다. 질문은 짙은 갈색, 느낌표는 따뜻한 노랑, O·체크는 녹색, X는 붉은색, 엄지는 크림색과 초록 아대로 구분한다. 밝은 외곽선을 사용해 밝고 어두운 배경 모두에서 기호를 식별할 수 있게 한다.

### Buttons & Links

`{components.button-primary}`는 조회 실패 후 `다시 불러오기`처럼 그 영역의 주요 동작에 사용한다. `{components.button-secondary}`는 `더 보기`, `{components.button-icon}`은 날짜 상세 닫기에 쓴다. 기본·눌림·비활성·focus-visible 상태를 명시하며 포커스는 `{components.control-focused}`를 공통으로 적용한다. 비활성 버튼은 색뿐 아니라 실제 `disabled` 상태를 사용한다.

링크는 실제 이동에만 쓰고 버튼은 페이지 안의 동작에 쓴다. 외부 Discord 링크도 알아볼 수 있는 문구를 제공한다. 초기 버전의 포인터 hover는 별도 부유·확대 효과를 넣지 않고 기본 면을 유지한다. 선택·눌림과 키보드 포커스는 분명히 구분한다.

### Member Filter

`{components.member-filter}`는 44px 이상 높이의 일반 버튼이다. 그래프 바로 위에 `전체 멤버`를 첫 번째로 고정하고 개인은 가나다순으로 배치한다. 초기 선택은 전체, 선택 상태는 `{components.member-filter-active}`와 `aria-pressed`로 알린다. 선택 변경은 즉시 칠하며 선택 칩은 hover·누름·일시 비활성 중에도 같은 녹색을 유지한다. 선택 해제 후에도 중간색이 남지 않도록 필터 칩의 hover·누름·선택·비활성은 모두 즉시 적용한다. 다른 컨트롤의 140ms 피드백은 유지한다. 데스크톱은 최대 두 줄까지 개인 버튼을 표시하고 넘치는 멤버는 `멤버 찾기`로 접근한다. 모바일은 전체 버튼과 멤버 찾기를 고정하고 가운데 개인 버튼 목록만 가로 스크롤한다. 목록 양끝에는 페이지 바탕색의 12px 페이드를 두며 끝에 도달한 방향은 숨긴다. 선택 칩은 양끝 15px 여유로 노출하고 키보드 포커스(`:focus-visible`)가 목록 안에 있으면 페이드를 즉시 투명하게 한다. 클릭·터치로 생긴 포커스에서는 페이드를 유지한다. 200% 글자 등으로 세 영역이 들어가지 않으면 첫 행 양끝에 전체 멤버와 멤버 찾기를 두고 개인 목록은 둘째 행 전체 폭을 쓴다. 컨테이너와 개별 칩 크기 변경을 관찰하여 글자 확대·폰트 로드 뒤에도 두 줄 제한과 선택 칩 노출을 다시 계산한다. 긴 이름은 버튼 안에서 줄바꿈하며 페이지 가로 넘침을 만들지 않는다.

`멤버 찾기`는 이름 검색과 전체 멤버 목록을 제공하는 대화상자다. 제목과 입력 레이블을 제공하며 열면 검색 입력으로 초점을 이동한다. 이름이 같아도 별도 멤버로 유지하고 선택은 사용자 ID로 관리한다. 결과 없음 안내, Escape·닫기, 내부 초점 순환과 닫은 뒤 실행 버튼으로 초점 복귀를 제공한다. 개인을 선택하면 대화상자를 닫고 해당 버튼이 목록에 드러나게 한다. 선택된 개인이 두 줄 범위 밖이면 표시 목록에 포함시킨다.

필터를 바꾸면 그래프와 메모를 함께 바꾸고 연도는 유지한다. 일반 필터 선택 후 초점은 누른 버튼에 남는다. 연도 변경도 멤버 선택을 유지한다. 멤버 목록은 전체 기록에서 인증 이력이 있는 사용자로 구성하며 연도를 바꿔도 사라지지 않는다.

### Workout Card & Stats

`{components.workout-card}`는 전체 또는 선택한 개인의 제목, 기간, 통계, 잔디, 범례, 날짜 상세를 담는 단일 카드다. 전체에서는 오늘 날짜와 같은 상단 행에 `전체 멤버 20명`, `누적 143일`을 인라인으로 표시한다. 누적은 선택 연도의 사용자별 운동일수를 합한 총 일수이며 하루 두 사람이 운동하면 2일로 집계된다. 개인 통계는 올해 `이번 주 3일`, `연속 4일`, `2026년 운동 32일`, 과거 연도는 해당 연도 운동일만 표시한다. 전체에 개인 연속 일수를 합산한 지표를 만들지 않는다. 기존 이번 달 KPI는 현재 월 기준으로 유지하고 범위를 명시한다. 운동왕 KPI 외의 순위·벌점·단절 경고를 붙이지 않는다.

### Monthly KPI & Workout King

전체 멤버 화면의 KPI는 `운동왕 👑` → `이번 달 고운` → `함께 심은 잔디` → `가장 푸른 요일` → `1인당 평균 일수` 순서다. 데스크톱(768px 이상)은 같은 너비 다섯 열로 배치하며 운동왕이 맨 왼쪽이다. 모바일은 두 열로 배치하고 운동왕은 첫 행의 전체 너비(`grid-column: 1 / -1`)를 사용한다. 나머지 네 카드는 아래 두 행에 배치한다. 각 카드의 긴 이름은 줄바꿈하고 높이를 고정하지 않는다. 기존 카드의 흰 면·테두리·타이포그래피를 사용하고 왕관 이외의 순위 장식은 추가하지 않는다.

운동왕은 KST 현재 월 1일부터 오늘까지 사용자별 고유 운동일수가 가장 많은 멤버다. 같은 날 사진이나 여러 인증이 있어도 1일이며 미래 기록은 제외한다. 그래프에서 과거 연도를 선택해도 현재 월 지표를 유지한다. 개인을 선택하면 기존처럼 KPI 전체를 숨긴다.

카드에는 `운동왕 👑`, 닉네임과 닉네임 아래의 칭호만 표시한다. 사용자 ID와 운동일수 숫자는 선정·동명이인 구분에만 사용하며 화면에 출력하지 않는다. 칭호는 게임 업적의 보상처럼 이번 달 기록 패턴에 따라 붙으며, 공동 운동왕은 각자의 칭호를 이름 아래에 단다. caption 크기·`{colors.primary}`·이름과 간격 4px로 차분하게 표시한다. 동률은 모든 대상의 닉네임을 가나다순(동명은 내부 ID순)으로 표시하고 공동 인원 안내는 추가하지 않는다. 같은 닉네임의 다른 사용자를 합치지 않는다. 공동 대상이 많아도 누락하지 않고 카드가 세로로 늘어나도록 한다. 기록이 없으면 `아직 없어요`를 표시하며 조회 실패를 같은 상태로 표시하지 않는다.

칭호는 KST 이번 달 1일부터 오늘까지의 기록으로 판정하며 위에서부터 처음 맞는 조건 하나만 쓴다. 맞는 조건이 없으면 공통 기본값 `✨`를 단다. 날짜 수는 같은 날 여러 인증·사진을 하루로 센다.

| 순서 | 칭호 | 조건 |
| --- | --- | --- |
| 1 | `빈칸 없는 잔디` | 이번 달 경과 일수가 7일 이상이고 모든 날 기록 |
| 2 | `이어 심는 사람` | 이번 달 안에서 7일 이상 연속 기록 |
| 3 | `사진으로 남기는 사람` | 3일 이상 기록했고 모든 기록일에 사진 포함 |
| 4 | `주말의 운동가` | 3일 이상 기록했고 절반 이상이 토·일요일 |
| 5 | `평일의 운동가` | 5일 이상 기록했고 모두 월~금요일 |
| 6 | `한 줄을 남기는 사람` | 3일 이상 기록했고 모든 기록일에 공백이 아닌 메모 |
| 기본 | `✨` | 위 조건에 해당하지 않음 |

나머지 KPI 카드도 값 아래에 caption 크기의 맥락 한 줄을 4px 간격으로 둔다. `이번 달 고운`은 `전체 12명 중`, `가장 푸른 요일`은 그 요일의 이번 달 운동 칸 수 `이번 달 18칸`, `1인당 평균 일수`는 경과 일수 `21일 중`이다. 맥락 줄은 값을 해석하는 기준만 보여주며 순위·비교 문구를 넣지 않는다. 기록이 없어 가장 푸른 요일이 `-`이면 맥락 줄을 생략한다.

`함께 심은 잔디`는 월간 참여율을 metric 크기의 백분율로 표시한다. 그 아래 caption 크기로 `전일 대비 +2.5%p`처럼 증감을 표시하고 값과의 간격은 4px로 둔다. 증감은 같은 녹색·회색 체계로 차분하게 표시하며 순위·보상·질책 의미의 색상을 추가하지 않는다. 실제 증감이 0.1%p보다 작으면 방향 화살표와 `0.1%p 미만`을 쓰며, 정확히 같은 경우에만 `변동 없음`을 표시한다. 첫 집계·매월 1일·전날 수집 기록이 없는 경우는 `비교 기록 없음`, 해당 월의 성공 집계가 없으면 값 `—`와 `수집 대기`, 조회 실패면 값 `—`와 `집계 불러오기 실패`를 구분한다. 상세 수식과 수집 기준은 ARCHITECTURE.md를 따른다. 증감 행은 줄바꿈하며 카드 높이를 고정하지 않는다.

기존 순위 금지 원칙의 예외는 사용자가 요청한 이 카드 하나다. 전체 순위표·2위 이하 순위·벌점·경쟁 알림을 추가하지 않는다.

### Aggregate Grass

전체 멤버 선택 시 모든 멤버의 기록을 하나의 연간 그래프에 합친다. `N`은 전체 기록에서 인증 이력이 있어 멤버 선택 목록에 포함된 고유 사용자 수이며 날짜·연도 필터로 줄이지 않는다. `k`는 해당 날짜에 인증한 고유 사용자 수다. 월간 KPI의 해당 월 인증 멤버 수와 이 분모는 별개다. 한 사람이 같은 날 여러 번 인증하거나 사진을 추가해도 `k`는 1만 증가한다.

- `N = 0`: 나누기를 하지 않고 빈 그래프와 첫 기록 안내를 표시한다.
- `N > 0`: 농도는 `min(k, 50) / min(N, 50)`이다. 2명은 1명당 50%, 4명은 25%, 50명은 2%이며 50명을 넘으면 50명에서 포화된다.
- `{colors.grass-empty}` 위에 `{colors.grass-record}`를 계산한 불투명도로 한 번 합성한다. 셀 전체의 CSS opacity를 낮추거나 사용자별 반투명 레이어를 중첩하지 않는다.
- 전체 잔디 셀은 별도 테두리 없이 농도(불투명도)로만 참여 인원을 표현한다. 오늘·선택·키보드 초점의 바깥 윤곽선은 농도와 무관하게 유지한다.
- 화면 농도는 참여 비율 `r`을 `r > 0`이면 `0.2 + 0.8 × r`, `r = 0`이면 0으로 옮겨 합성한다. 한 명이라도 운동한 날은 최소 20% 농도로 빈 칸과 구분되며, 비율의 연속성과 사람 수에 따른 차이는 유지한다. 범례 견본도 같은 변환을 쓴다.
- 범례는 0·25·50·75·100% 예시만 표시한다. 실제 데이터는 최대 50단계로 계산하며 다섯 등급으로 양자화하지 않는다. 2% 간격은 사람마다 시각적으로 구분하기 어려우므로 정확한 인원은 상세와 접근 가능한 이름으로 제공한다.
- 사진은 전체 그래프의 농도를 가중하지 않는다. 개인 그래프의 텍스트·사진 두 단계는 유지하며 전체 날짜 상세에 `20명 중 4명 운동 · 사진 포함 2명`처럼 표시한다. 50명을 넘더라도 실제 인원과 비율은 정확히 표시한다.
- 전체 날짜 상세는 인증한 멤버를 가나다순으로 나열하고 각자의 메모·사진 여부를 보여준다. 기록이 없는 날은 `기록 없음`이다. 전체에 개인 카드 여러 개를 나열하지 않는다.

분모는 현재 조회한 연도의 참여자나 지금까지 로드한 일부 페이지에서 추정하지 않는다. 구현 단계에는 인증된 전체 멤버 목록과 해당 연도의 일별 고유 인원을 빠짐없이 조회할 계약을 ARCHITECTURE.md에 정의한다. 멤버가 추가되면 과거 칸의 상대 농도도 달라질 수 있다.

### Grass Grid & Legend

선택한 **달력 연도의 1월 1일→12월 31일**을 표시한다. 기본 선택은 KST 현재 연도이며, 커뮤니티 개설 연도인 **2026년부터**만 유효한 연도로 제공한다. 별도의 잔디 제목·멤버명·연간 날짜 범위는 표시하지 않는다. 카드 상단(`card-heading`)에 오늘 날짜(KST)를 왼쪽, 인라인 통계를 가운데, 연도 탐색을 오른쪽에 통합한다. 좁은 화면이나 글자 확대에서는 자연스럽게 줄바꿈한다. 연도 탐색은 해당 카드 상단 우측에 화살표 스테퍼(`‹ 2026년 ›`)로 배치하여 데스크톱과 모바일에서 동일하고 깔끔한 UX를 제공한다. 현재 연도(2026)에서 다음 연도(`›`)는 비활성화(disabled)되며, 서비스 개설 연도(2026)에서 이전 연도(`‹`)를 누르면 묵묵 캐릭터 마스코트(`assets/brand/mukmuk/sprites/mukmuk-representative.png`)와 함께 채널 개설일(2026년 10월 14일) 안내와 슬로건을 담은 묵묵 다이얼로그(`inception-dialog`)를 띄운다. 연도 탐색은 날짜 상세를 열어도 제자리에 유지한다.

평년 365일·윤년 366일을 정확하게 표시한다. 일요일→토요일이 행, 오래된 주→새로운 주가 열이다. 연도 앞뒤 정렬용 빈 공간은 실제 기록 없음 셀과 구분하고 선택·탐색에서 제외한다. 올해의 미래 날짜는 옅게 표시하며 비활성화한다. 셀 크기·간격과 텍스트/사진의 녹색 단계는 기존 YAML 토큰을 사용한다.

선택한 연도는 카드 상단 스테퍼의 `2026년` 표기로만 명시한다. 연도를 바꿔도 선택한 멤버는 유지되며 메모 목록도 같은 연도로 바뀐다. 해당 연도 기록이 없어도 선택한 멤버의 빈 잔디를 보여준다. 과거 연도에서 현재 주·연속 지표를 0으로 표시하지 않고 해당 연도 운동일만 표시한다. 전체 뷰의 이번 달 KPI는 현재 월을 유지한다. 올해 주간·연속 통계는 12월 말부터 이어진 기록까지 반영하며, 연간 합계와 메모에는 선택한 연도 기록만 포함한다.

잔디 영역은 Tab 진입점 하나를 유지한다. 올해는 오늘, 과거 연도는 12월 31일을 진입점으로 삼는다. 올해 카드가 렌더되면 잔디 영역의 가로 스크롤만 조정해 오늘 칸을 가운데에 보여주며 페이지의 키보드 초점을 빼앗지 않는다. 오늘 칸은 별도 윤곽선으로 표시한다. 연도 변경 중 오래된 요청의 결과가 최신 선택을 덮어쓰지 않으며 조회 실패는 빈 기록과 구분한다. 월·요일·범례·날짜 상세는 기존 컴포넌트를 따른다.

### Date Detail & Keyboard

포인터 hover·키보드 포커스는 날짜·단계·메모를 보여주고 탭·클릭은 `{components.date-detail}`을 카드 안에 연다. 모든 화면에서 잔디와 범례 아래에 전체 너비로 배치한다. 상세를 열어도 그래프 폭이나 연도 탐색 위치가 바뀌지 않는다. 상세를 열면 해당 날짜 칸을 가로 영역 안에 다시 드러내고 상세 제목으로 초점을 이동해 긴 메모의 시작이 가려지지 않게 한다. 다시 선택하거나 닫기 버튼을 누르면 닫고 날짜 칸으로 초점을 돌린다. 화면 폭 변경으로 잔디 영역이 좁아져도 선택한 날짜를 다시 드러낸다. 메모가 길어도 카드 밖으로 넘치지 않는다. hover가 끝나도 클릭으로 연 상세는 유지한다. 터치에서 작은 셀을 누르기 어렵다면 타임라인 행으로 같은 상세를 열 수 있다.

잔디 영역의 Tab 진입점은 하나이고 화살표로 실제 날짜를 이동한다. 위/아래는 같은 주의 이전/다음 행, 좌/우는 이전/다음 주이며 범위 끝을 넘어가거나 정렬 빈 공간으로 이동하지 않는다. Enter·Space로 상세를 열고 Escape로 닫아 해당 날짜로 초점을 돌린다. 닫기 버튼은 32×32px이며 키보드·Escape로도 닫을 수 있다. 접근 가능한 이름 예시는 `10월 14일, 사진 포함 인증, 가볍게 30분 걷기`다. 기본 `title`만으로 상세를 제공하지 않는다.

### Timeline

멤버 선택 시 「남겨 둔 운동」은 월별로 묶고 날짜 버튼은 `20일 (화)`처럼 일·요일을 표시한다. 접근 가능한 이름에는 연·월·일·요일 전체를 포함한다. 요일은 기록 날짜 자체에서 계산하며 브라우저 시간대에 영향받지 않는다.

`{components.timeline-item}`은 월별 영역 안에서 날짜와 작은 메시지 면의 메모를 보여준다. 선택된 멤버의 이름은 매 기록마다 반복하지 않는다. 사진만 있는 날은 본문 문구를 중복하지 않고 `사진 보기` 버튼을 제공한다. 사진은 타임라인 또는 날짜 상세에서 한 번 눌러 불러오며 파일은 별도 저장하지 않는다. 날짜가 최신인 항목부터 보여주며 최초 30개의 **일별 기록** 이후 `더 보기`로 늘린다. 추가 조회 실패 시 기존 목록을 유지하고 재시도를 제공한다. 상세를 여는 동작과 길고 선택 가능한 메모 본문을 겹치게 만들지 않는다.

### Status & Footer

`{components.status-notice}`는 마지막 수집 시각을 표시하고, 2시간 이상 지연되면 경고 변형을 쓴다. 경고는 반경 10px·패딩 16px의 박스로 표시하고 지연 설명은 다음 줄에 둔다. 정상 수집 배지의 알약 형태는 유지한다. `{components.loading-placeholder}`는 정적 자리표시자다. 초기 로딩은 `aria-busy`, 재조회 결과는 짧은 `aria-live="polite"` 안내를 제공하고 메모 전체를 반복해서 읽지 않는다.

`{components.footer}`는 밝은 바탕에서 공개 범위를 안내한다. `공지 채널 시크릿 코드로 인증된 멤버만 열람할 수 있습니다. 표시명·운동 날짜·텍스트 메모와 선택한 기록의 사진을 볼 수 있습니다. 사진은 Discord에서 불러오며, 원본 삭제 시 표시가 중단될 수 있어요.`를 읽을 수 있어야 한다. 색상 반전을 위한 큰 어두운 푸터를 만들지 않는다.

## States & Copy

| 상태 | 문구·동작 |
| --- | --- |
| 최초 로딩 | 운동 기록을 불러오고 있어요. |
| 전체 기록 없음 | 첫 잔디를 기다리고 있어요. / #오운완에 오늘의 운동을 남겨 보세요. |
| 선택한 멤버 기록 없음 | 아직 남긴 운동 기록이 없어요. |
| 최초 조회 실패 | 기록을 불러오지 못했어요. / 다시 불러오기 |
| 추가 조회 실패 | 나머지 기록을 불러오지 못했어요. / 다시 시도 |
| 마지막 성공 시각 없음 | 아직 인증을 수집하지 않았어요. |
| 정상 수집 | 마지막 수집 · 10월 14일 19:17 KST |
| 수집 지연 | 새 인증의 반영이 늦어지고 있어요. |
| 빈 날짜 | 기록 없음 |
| 사진만 있는 인증 | 상세 제목의 사진 단계와 사진 보기 버튼만 표시 |
| 슬래시 수명 | 이 메시지는 5분 뒤 사라져요. |
| 가상 시안·데모 | 예시 기록 |

조회 실패를 빈 기록으로 보여주지 않는다. 차분하고 짧게 쓰며 과장된 응원·질책·운동왕 KPI 외의 순위 문구를 넣지 않는다. 날짜는 KST, `이번 주`는 일요일부터 오늘까지다. 자세한 동작은 시스템 계약을 따른다.

## Discord Presentation

웹의 잔디 단계·기간 의미·운동일 단위를 Discord에도 유지한다. Discord 자체 글꼴·배경은 바꾸지 않으며 브랜드는 마크·등록 이모지·제목·문구로 전달한다. 28칸은 **7개씩 네 줄**, 최근 메모는 **최근 기록일 5개**다. 현황판은 계속 남고 슬래시 결과만 5분 뒤 삭제된다.

등록된 `mukmuk_grass`·`mukmuk_photo`는 각각 기본·진한 녹색이다. 둘 중 하나라도 설정이 없으면 전체를 ⬛·🟩·🌲 문자 범례로 대체한다. 실제 등록 ID와 전송·삭제 동작은 [Discord 설정](ARCHITECTURE.md#17-discord-초기-설정-현황)을 따른다. 아래는 가상 출력 시안이다.

```text
🌱 묵묵 · 하루님의 운동 잔디
최근 28일 · 2026.09.17 — 2026.10.14

⬛🟩⬛🟩⬛⬛🟩
🟩⬛⬛🟩⬛🌲⬛
⬛🟩🟩⬛⬛🌲⬛
🟩⬛⬛🟩🌲🟩🌲

이번 주 3일 · 연속 4일 · 누적 32일
⬛ 기록 없음 · 🟩 텍스트 · 🌲 사진 포함

최근 기록일 5개
10.14 · 가볍게 30분 걷기 [사진 인증]
10.13 · 하체 운동 40분
10.12 · 퇴근하고 조깅 20분 [사진 인증]
10.11 · 스트레칭과 산책
10.08 · 등 운동 30분

마지막 수집 · 10.14 19:17 KST
이 메시지는 5분 뒤 사라져요.
```

현황판 제목은 `## 🌱 고운 잔디밭`으로 하고, 오늘 인증 완료 멤버에게는 이름 앞 `🌱`를 붙이며, 멤버명·누적·최근 14일 2행 잔디를 반복한다. 분할 시 `(1/2)`, `(2/2)` 번호를 붙인다. 푸터에는 `[고독한 운동가 웹보드]` 링크, 최근 14일 갱신 시각 및 요일 안내, 잔디 범례를 표시한다.

## Do's and Don'ts

### Do

- 기록과 메모를 중심에 두고 토큰을 참조한다.
- 기본·사진 녹색의 의미를 범례·상세·접근 가능한 이름으로 함께 전달한다.
- 44px 이상 동작 영역, 긴 한국어 문장, 키보드·터치를 고려한다.
- 로딩·빈 상태·실패·지연을 구분하고 추가 조회 실패 시 기존 기록을 유지한다.
- 날짜·일수·사진 단계를 웹과 Discord에서 일치시킨다.

### Don't

- Cal의 폰트·검정 CTA·가격 카드·어두운 푸터를 그대로 가져오지 않는다.
- 사진 수·줄바꿈·메모 수를 녹색 단계나 운동일수로 오인하지 않는다.
- 운동왕 KPI 외의 순위·벌점·쉬는 날 경고·스트릭 단절 강조를 넣지 않는다.
- 그림자·애니메이션·큰 장식으로 기록보다 시선을 끌지 않는다.
- 중요한 내용을 hover·색·작은 셀 클릭에만 맡기지 않는다.
- 사진 원본이나 서버 설정을 공개 웹 화면에 넣지 않는다.

## Responsive Behavior

| 구간 | 규칙 |
| --- | --- |
| Compact · 360px 미만 | 좌우 14px 바깥 여백, 헤더·통계 자연 줄바꿈, 잔디 안쪽만 필요 시 가로 스크롤 |
| Mobile · 360–767px | 좌우 14px·카드 안쪽 16px, 인라인 통계 줄바꿈, 전체 멤버 고정·개인 버튼 가로 스크롤, 상단 연도 선택기 |
| Desktop · 768px 이상 | 바깥 24px·카드 안쪽 20px, 여백 포함 최대 1080px(1080px 이상에서 53주 전체 표시), 단일 그래프·상단 오른쪽 연도 탐색·아래 날짜 상세 |

큰 화면에서 열 수를 늘리는 대신 여백을 늘린다. 320·360·768·1280px와 200% 확대에서 페이지 전체 가로 넘침이 없어야 한다. 통계의 긴 값은 줄바꿈할 수 있으며 자르지 않는다. 잔디만 스크롤하더라도 범례·상세 패널은 화면 폭에 맞게 유지한다.

일반 버튼·재시도·사진 확대는 최소 44px이다. 멤버 칩/찾기는 데스크톱 36px·모바일 44px, 날짜 버튼은 32px·44px, 사진 토글은 28px·32px이며 상세 닫기는 32px이다. 14px 잔디는 밀도 있는 기록 표시를 위해 유지하되 키보드 탐색과 큰 타임라인 동작으로 같은 정보에 접근할 수 있게 한다. 전체 사진 갤러리·호버 전용 메뉴는 만들지 않는다. 기록 상세에서 선택한 사진만 확대한다.

## Motion

동작 피드백은 `{motion.feedback}` 140ms의 색상·배경·테두리 전환, 날짜 상세·열린 다이얼로그·인증 상자는 `{motion.enter}` 160ms의 opacity 등장으로 통일한다. easing은 ease-out이다. 누름 상태와 키보드 초점 윤곽선은 즉시 반영하며 닫기·초점 복귀를 애니메이션 종료까지 미루지 않는다. `prefers-reduced-motion: reduce`에서는 전환 시간을 0s로 두고 등장 애니메이션을 생략한다. 잔디 채우기·스트릭 축하·반짝임·shimmer·높이 애니메이션은 넣지 않으며 로딩 자리표시자는 움직이지 않는다.

## Iteration Guide

1. 변경할 컴포넌트와 토큰을 먼저 정한다. 참조는 `{components.workout-card}`, `{colors.grass-photo}`처럼 YAML 경로를 그대로 쓴다.
2. 기본·활성·비활성·포커스 변형은 `components`에 별도 항목으로 정의한다. 변형은 기본 컴포넌트의 미지정 속성을 상속한다. focus-visible은 해당 기본·활성 상태 위에 합성한다.
3. 실제 구현에서는 토큰을 CSS custom properties 등으로 매핑한다. 토큰값이 없는 새 색·간격·모서리를 임의로 추가하지 않는다.
4. 디자인 변경은 이 문서와 관련 SVG 시안을 같이 갱신한다. 제품 동작·기술 선택 변경은 `ARCHITECTURE.md`, 실행 순서는 `docs/superpowers/plans/`에 기록한다.
5. 타입스크립트 웹 구현은 현재 단일 대시보드에 맞춰 바닐라로 시작한다. React 전환 판단은 시스템 설계에 기록하고 화면 스타일은 이 문서를 유지한다.
6. 마일스톤 검증 후 커밋·푸시한다. 시안이나 토큰 검증을 실제 서비스 출시·접근성 검증으로 보고하지 않는다.

## Known Gaps & Validation

- [정적 SVG 시안](docs/design/dashboard-preview.svg)은 데스크톱·360px 구성을 보여준다. 구현 DOM은 Chromium에서 320·360·768·1280px, 클릭 상세·화살표·Escape·200% 글자 확대·긴 이름과 메모·조회 실패를 검증했다. 다른 OS의 글꼴과 실제 모바일 브라우저 확인은 추가 검증 대상이다.
- 2026·2027·2028년의 365·366개 날짜, 월·요일 텍스트의 비겹침과 중심 정렬, 멤버 30명의 스크롤·검색 선택을 가상 데이터로 검증한다. 실제 사용자 기록이나 시크릿 코드를 검증 캡처에 사용하지 않는다.
- 색상 대비는 본문·보조 문구·버튼·경고·오류의 실제 조합으로 확인한다. 잔디는 텍스트 범례·접근 가능한 이름·상세를 함께 검증한다.
- 로딩·빈 상태·오류·지연·추가 조회 실패·사진만 있는 인증을 모두 확인한다.
- 한국어 운영체제 글꼴에 따라 글자 폭이 달라질 수 있으므로 macOS와 Windows·모바일에서 줄바꿈을 확인한다.
- dark mode·전체 사진 갤러리·입력 폼은 초기 화면 범위에 없다. 추가 시 별도 토큰·상태·반응형을 정의한다.
- 후속 기능 구현 준비와 누락 설정은 [준비 현황](docs/implementation-readiness.md)에서 관리한다. 이 문서의 `implementation-ready`는 시각 기준의 준비 상태이며 봇·웹 기능의 출시 상태가 아니다.


### Mukmuk Additional Symbol Emoji

추가 기호는 `ㄱㄱ`·`♥`·`💪`·`👀`·`…`·`🔥` 6종이다. 모래시계 대신 점 세 개로 대기·머쓱함·할 말 없음을 표현한다. 큰 기호가 먼저 읽히고 작은 묵묵은 모서리에서 반응한다. 하트는 따뜻한 붉은색, 운동 아대는 녹색과 새싹을 유지한다. [원본·128/64px·실제 크기 비교](assets/brand/mukmuk/emojis/symbols-extra/README.md)를 함께 관리한다. 기본 기호형과 추가 기호형은 서버 공용 이모지로 등록하며 역할 제한을 두지 않는다.


## Discord 사진 미리보기

상태: 구현됨. 기존 사진 여부 표시에 기록별 지연 조회를 추가한다. 데이터·접근·만료 계약은 [시스템 설계](ARCHITECTURE.md#2026-10-16-discord-사진-지연-조회-계획)를 따른다.

- 첫 화면에는 기존 잔디·메모·사진 여부만 표시한다. 별도 사진 피드나 전체 사진 선로딩을 추가하지 않는다.
- 날짜/기록 상세를 열면 메모와 인라인으로 사진 보기 버튼을 제공한다. 이 버튼을 눌러 링크 조회를 시작하며 전체 멤버 상세에서도 멤버마다 독립적으로 요청한다. 화면에 들어오는 미리보기만 로딩하고 클릭하면 큰 이미지와 Discord 원문 보기 동작을 제공한다.
- 기존 색·간격·모서리 토큰을 재사용하고 모바일에서는 패널 폭 안에 맞춘다. 이미지 크기 메타데이터로 자리를 확보해 로딩 중 레이아웃 이동을 줄인다.
- 로딩, 사진 없음, 원본 삭제, 조회 실패/재시도 상태를 구분한다. 오류를 사진 없음으로 표시하지 않는다. 축소 이미지를 제공할 수 없으면 사진 보기 버튼을 사용한다.
- 이미지 설명은 날짜·멤버·사진 순번으로 제공하고 사진 내용을 추측하지 않는다. 열기/닫기/원문 동작은 키보드로 접근하며 확대를 닫으면 원래 동작으로 포커스를 돌린다. 사진 확대·재시도 동작 영역은 최소 44px이며 인라인 사진 토글은 전용 토큰을 따른다.
- 사진은 Discord에서 제공되며 원본 삭제 후 표시가 중단될 수 있다는 안내는 공통 푸터에 한 번 표시한다. 정상 조회로 사진이 있으면 반복 안내와 상시 새로고침을 생략한다. 로딩·사진 없음·오류/재시도·사진 더 보기는 유지하며 다시 접고 펼쳐 링크를 갱신할 수 있다. [기록 상세 시안](docs/design/photo-detail-preview.svg)을 따른다.


## 후속 계획: 삭제한 운동 인증의 표시

상태: 수동 기록 갱신으로 구현됨. 처리·지연·집계 규칙은 [원본 삭제 반영 설계](ARCHITECTURE.md#2026-10-16-인증-원본-삭제-반영-설계)를 따른다.

- 삭제가 확인된 인증은 다음 조회에서 메모·사진 목록에 남기지 않는다. 취소 배지·취소선·실패 잔디·벌점 표시를 추가하지 않는다.
- 하루의 다른 인증이 남아 있으면 그 메모와 잔디를 유지한다. 사진 인증이 모두 없어지면 기존 기본 녹색 단계로 돌아간다. 모두 없어지면 기존 기록 없음 셀·빈 상세 상태를 사용한다.
- 운동일수·스트릭·운동왕·전체 그래프는 같은 집계에 맞춘다. 현재 화면에 대한 실시간 삭제 애니메이션이나 자동 포커스 이동을 추가하지 않는다.
- 삭제 반영은 `/기록갱신`를 통한 수동 점검 후 이루어진다. 회원님은 옵션 없이 본인 기록을 정리하고 관리자는 `유저:@멤버`로 다른 멤버를 지정할 수 있다. 회원님의 타인 지정은 `회원님은 본인 기록만 갱신할 수 있어요.`로 안내하며 작업을 만들지 않는다. 접수/상태는 본인에게만 `대기 중`, `확인 20/100건 · 삭제 2건`, `완료 · 확인 100건 · 삭제 3건`처럼 짧게 표시하며 원문 메모를 나열하지 않는다.
- 반영 지연 안내는 다음 수집부터 나누어 처리한다는 내용으로 짧게 제공한다. 권한·통신 오류를 사용자의 삭제나 운동 취소로 표시하지 않는다. 새 레이아웃·색·컴포넌트 토큰은 필요하지 않다.


## 카드 밀도·타임라인 사진 개선 (2026-10-20 · 구현 반영)

### 카드 내부 밀도

- 카드 상단은 왼쪽 오늘 날짜, 가운데 인라인 통계, 오른쪽 `‹ 2026년 ›` 한 줄을 기본으로 한다. 별도 제목·멤버명·연간 범위는 되살리지 않는다.
- 연도 선택기는 공통 버튼 크기와 분리하고 배경·윤곽·그림자 없이 연도 텍스트 중심으로 표시한다. 화살표 각 28px, 연도 글자 13px/600, 좌우 패딩 4px. 데스크톱의 마우스 입력에서는 평소 화살표를 숨기고 영역 hover 또는 focus-within에서 표시한다. 숨길 때도 너비와 키보드 탐색 순서는 유지하여 위치가 흔들리지 않는다. 모바일·터치 장치에는 화살표를 항상 표시하며 44px 터치 영역을 유지한다. 비활성 화살표는 표시될 때만 옅게 보인다.
- 카드 안쪽 여백은 데스크톱 20px, 모바일 16px. 상단 안에서 날짜·통계·연도 사이 가로 간격은 14px, 줄바꿈 간격은 8px이며 상단과 그래프 사이 간격은 10px이다. 모바일에서는 날짜·연도를 먼저 배치하고 통계를 아래 한 행에 모으며, 날짜 영역의 기준 폭은 100px로 둔다. 확대 시에는 각 영역이 필요한 만큼 자연스럽게 줄바꿈한다.
- 카드 통계는 flex-wrap 인라인 요약으로 표시한다. 상단에 포함하며 별도 하단 마진 없이 항목 간격 14px, 레이블 12px muted·값 14px bold ink, 레이블-값 간격 4px, 그래프까지 간격 10px이다. 빈 공간을 줄이기 위해 긴 숫자를 자르거나 통계를 중복하지 않는다.
- 월 라벨·요일·잔디 셀 크기와 오늘 표시, 키보드 이동 및 상세 초점 복귀는 유지한다. 320px·200% 확대에서는 필요한 경우 상단만 자연 줄바꿈한다.

### 월별 대화형 운동 기록

- 「남겨 둔 운동」은 월별로 묶은 하나의 대화 흐름으로 표시한다. `2026년 10월` 월 구분선 아래 날짜·메모를 연속 배치하며, 매일의 기록마다 독립된 흰 카드·테두리·큰 패딩을 반복하지 않는다.
- 월과 날짜 모두 최신순을 유지한다. 실제 채팅처럼 보이기 위해 오래된 순으로 바꾸거나 아래로 자동 스크롤하지 않는다. 최신 기록을 위에서 바로 확인한다.
- 기록은 왼쪽 정렬하며 `20일 (화)` 날짜 버튼, 메모 본문, 선택적 사진 버튼 순서로 구성한다. 월 머리글이 연·월을 제공하므로 날짜 버튼의 화면 표기는 일·요일로 압축하고 접근 가능한 이름에는 `2026년 10월 20일 화요일` 전체 날짜를 제공한다. 기존 일반 날짜 표기 규칙보다 이 월별 타임라인 규칙이 우선한다.
- 메모는 채팅 메시지처럼 작은 둥근 면으로 묶되 꼬리·아바타·좌우 교대 배치는 사용하지 않는다. 현재 선택 멤버의 닉네임을 매 기록마다 반복하지 않는다. 날짜와 메모는 서로 구분되며 날짜 버튼만 잔디 상세로 이동한다.
- 월 사이 간격 16px, 기록 사이 간격 8px, 메모 안쪽 여백 8px 12px, 모서리 8px, 본문 14px/1.6을 기준으로 한다. 긴 메모·줄바꿈은 보존하고 접기나 말줄임을 자동 추가하지 않는다. 모바일에서도 메모 너비를 억지로 좁히지 않는다.
- 사진 버튼은 메모 끝에 약 두 칸 간격(0.65em)을 두고 이어 표시한다. 강제 줄바꿈하지 않으며 공간이 부족할 때만 자연스럽게 다음 줄로 흐른다. 한 번 누르면 같은 기록 아래에서 썸네일을 펼친다. 사진만 있는 날도 날짜와 사진 버튼을 보이며 불필요한 `사진 인증` 본문을 중복하지 않는다.
- 초기에는 기존처럼 최대 30개 일별 기록을 표시하고 `더 보기`로 과거 기록을 이어 붙인다. 추가 로드가 같은 월에 속하면 기존 월 그룹에 합치며 월 머리글을 중복 생성하지 않는다. 이미 펼친 사진·키보드 초점·스크롤 위치를 유지하고 기존 기록의 사진을 다시 요청하지 않는다.
- 월별 영역에는 머리글을 연결하고 내부 기록은 목록으로 제공한다. 날짜와 사진 버튼은 키보드로 조작할 수 있으며 메모 전체를 클릭 대상으로 만들지 않는다. 날짜 이동 후 상세 닫기는 해당 날짜로 초점을 복구한다.

### 남겨 둔 운동에서 사진 바로 보기

- `사진 보기`·`사진 접기`는 배경·테두리 없는 12px 텍스트 버튼이다. 패딩 없이 데스크톱 최소 높이 28px, 모바일 32px로 두며 hover에서 밑줄, 키보드 초점에서 윤곽을 표시한다. 사진 확대·재시도 버튼까지 함께 축소하지 않는다.

- 사진 인증이 있는 타임라인 항목에 `사진 보기` 버튼을 직접 제공한다. 날짜 버튼은 기존처럼 잔디의 날짜 상세로 이동하고, 사진 버튼은 페이지를 이동시키지 않고 해당 기록 아래에서 사진을 요청·펼친다.
- 첫 클릭으로 조회와 썸네일 표시까지 처리한다. 중간 상세 화면이나 두 번째 `사진 보기` 버튼을 요구하지 않는다. 원본 확대는 나타난 썸네일을 클릭했을 때만 실행한다.
- 첫 화면·멤버/연도 전환·메모 목록 더 보기만으로는 사진 API나 이미지 요청을 보내지 않는다. 사용자가 선택한 기록만 조회하며 응답의 썸네일도 화면에 들어온 것부터 Discord Media Proxy에서 불러온다.
- 기존 사진 조회 계약(페이지당 원본 메시지 최대 3개, 더 보기 커서, 코드 검증, 원본 링크 재발급, 중복 요청 제한)을 재사용한다. 파일이나 썸네일을 Supabase/레포/별도 저장소에 복제하지 않는다.
- 펼친 사진은 `사진 접기`로 닫을 수 있다. 버튼에 펼침 상태를 제공하며, 로딩 중 중복 클릭은 추가 요청을 만들지 않는다. 접기·멤버/연도 전환·목록 교체 때 대기 요청과 관찰자를 해제한다. 여러 기록을 펼칠 수 있고 각 기록은 독립적으로 동작한다.
- 날짜 상세에서도 같은 사진 컴포넌트를 사용한다. 한 화면에서 같은 사용자·날짜를 중복 조회하지 않도록 진행 중 요청을 공유하되, 종료된 뷰가 다른 뷰의 요청을 취소하지 않게 한다. 정상 조회 후 만료된 원본 링크는 사진을 접었다 다시 펼쳐 갱신한다. 사진 없음 상태에는 새로고침 버튼을 유지한다.
- 조회 실패는 해당 항목 안에 재시도 버튼과 함께 표시한다. 원본 삭제로 사진이 없어도 운동 메모·날짜를 숨기지 않는다. 원본 삭제의 운동일수 반영은 기존 `/기록갱신` 계약을 따른다.

### 구현 순서와 검증

1. 카드 전용 연도 컨트롤 스타일과 통계 여백을 적용하고 320/360/768/1280px 및 200% 확대에서 확인한다. 공통 버튼 크기 변경이 사진·멤버 필터에 번지지 않게 한다.
2. 월별 대화형 목록과 사진 컴포넌트의 펼침/접기·요청 수명 처리를 구현한다. 월 경계를 넘는 더 보기, 같은 월 병합, 펼친 사진 유지와 기존 날짜 상세 경로도 회귀 검증한다.
3. 첫 화면 사진 요청 0건, 목록에서 1회 클릭 후 선택한 기록만 요청, 뷰포트 밖 썸네일 요청 0건, 확대 전 원본 요청 0건을 브라우저 테스트로 검증한다. 접기/전환 중 늦은 응답·중복 클릭·실패 재시도·원본 삭제도 확인한다.
4. 타입 검사·정적 빌드·관련 단위/브라우저 검증 후 기능 단위로 커밋·푸시한다. 본문 토큰·컴포넌트 규칙과 이 절은 함께 유지한다.


### 웹보드 일괄 컴팩트 정리 (2026-10-20)

- 헤더 하단 패딩 12px·마진 14px, 마크 28px, 부제는 `묵묵 · 운동 기록`이다. KPI는 간격 10px·하단 14px, 카드 10px 12px·모서리 10px, 제목과 값 간격 2px, 값 19px, 공동 운동왕 간격 4px이다.
- 멤버 필터는 간격 6px·하단 14px이다. 멤버 찾기는 칩과 동일한 글자 크기·배경·테두리·높이로 맞춘다.
- 잔디 푸터는 범례와 프리뷰를 좌우로 배치하고 폭이 부족하면 줄바꿈한다. 간격 8px·상단 10px이며 idle 프리뷰는 빈 문자열이다. hover와 focus 동안만 날짜·요약을 표시하고, 다른 칸의 hover가 끝나면 현재 focus 날짜를 복구한다. 프리뷰의 줄바꿈은 공백으로 치환하고 한 줄 말줄임으로 표시한다. flex-basis 180px·min-width 0·최소 높이 1.5em을 빈 상태에도 유지해 프리뷰 내용이 바뀌어도 카드 높이가 변하지 않게 한다. 전체 범례의 참여율 0%·25%·50%·75%·100%는 유지하며 농도 설명 문장은 생략한다.
- 전체 날짜 상세는 이름 열과 인라인 말풍선·사진 버튼의 두 열이다. 이름 뒤 `사진 포함`은 생략한다. 사진만 있는 날은 전체·개인 모두 `사진 인증` 본문을 반복하지 않으며 메모가 있으면 줄바꿈을 보존한다. 상세 패딩은 12px 14px이다. 개인 상세도 같은 말풍선 안에 메모와 사진 버튼을 인라인으로 배치한다. 모든 메모는 14px/1.6이며 상세에서는 원문의 여러 줄을 보존한다. 날짜·이름 열의 위쪽 패딩은 8px이다. 닫기는 투명 배경·무테두리·모서리 6px로 두고 hover/focus에서만 은은한 녹색 배경을 표시한다.
- 「남겨 둔 운동」 제목은 16px, 여백은 16px 0 8px이며 우측 캡션을 생략한다. 날짜는 muted, hover/focus에는 primary를 사용하고 메모 면은 `#EDF1E9`를 유지한다.

- 공통 푸터는 상단 마진 24px·상단 패딩 14px이다. 페이지 최대 폭은 바깥 패딩 포함 1080px이다. 53주 잔디 자체는 14px 셀 53개와 4px 간격 52개로 950px이며 요일 열은 별도다. 최대 폭에서는 카드 안쪽 990px에 53주와 요일 열이 모두 들어가고 끝 열의 초점 윤곽선 여유 12px가 남는다. 더 좁으면 셀 크기를 줄이지 않고 잔디 내부 가로 스크롤로 탐색하며, 카드·KPI·상세의 바깥 끝선은 정렬한다.


### 웹보드 균형·상호작용 마감 (2026-10-20)

- `{grass.scroll_fade}`는 잔디 스크롤 뷰포트 위에 배치한 12px 흰색 그라데이션이다. 해당 방향으로 스크롤할 기록이 남아 있을 때만 표시하며 양 끝 판정 허용 오차는 1px이다. 모든 주가 보이면 양쪽을 숨긴다. 왼쪽 페이드는 고정 요일 열의 실제 오른쪽 끝에서 바로 시작한다. 스크롤된 잔디가 요일 열 바로 뒤부터 드러나므로 원래 열 간격 12px을 다시 더하지 않는다. 양쪽 페이드의 위쪽 위치와 높이는 잔디 셀 그리드의 실제 경계에 맞추며 월 이름·위아래 패딩·스크롤바를 덮지 않는다. 월 라벨에는 별도 12px 소프트 마스크를 적용하며 왼쪽은 고정 요일 열의 오른쪽 끝, 오른쪽은 스크롤 뷰포트 끝에 맞춘다. 해당 방향 끝에 도달하면 그 방향의 월 페이드는 제거한다. 클릭을 가로채지 않고 접근성 트리에서도 제외한다. 그리드에 키보드 초점이 있는 동안 양쪽을 즉시 숨겨 셀 윤곽선을 가리지 않는다.
- 스크롤, 날짜 자동 노출, 뷰포트·그리드·요일 열 크기 변경 때 페이드를 갱신한다. 멤버·연도 전환으로 카드를 폐기하면 ResizeObserver와 스크롤 리스너를 해제한다. 범례·프리뷰·날짜 상세는 페이드 적용 영역 밖에 둔다.
- 날짜 상세는 `{grass.detail.backgroundColor}`의 흰 바탕·기존 얇은 테두리를 유지하고 말풍선은 `{colors.surface-message}`로 구분한다. 전체·개인·사진을 펼친 상세에 같은 위계를 적용한다.
- 멤버 칩·찾기·사진·날짜·닫기·연도·일반 동작 버튼과 Discord 링크는 `{motion.feedback}`를 공유한다. 선택된 멤버의 녹색과 비활성 상태는 hover에 덮이지 않는다. hover 효과는 마우스 입력 환경에 적용하며 누름은 즉시 반응한다. focus 윤곽선은 전환 대상에 넣지 않는다.
- 데스크톱 상단의 날짜·통계 간격은 기존 14px을 유지하며 세로 구분선을 추가하지 않는다. 날짜 안의 `·` 구분자와 기존 정렬만 사용한다.
- 정적 시안은 페이드와 배경·상태의 기준을 보여준다. 140ms·160ms 전환과 모션 줄이기는 실제 DOM에서 검증하며 애니메이션 라이브러리를 추가하지 않는다.
