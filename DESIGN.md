---
version: "1.0"
name: mukmuk-design-system
status: implementation-ready
updated: "2026-10-14"
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
  surface-soft: "#D9E9D9"
  grass-empty: "#E8EDE4"
  grass-record: "#4B8F52"
  grass-photo: "#216E39"
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
    fontSize: 24px
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
  content-max: 960px
  gutter-desktop: "{spacing.xl}"
  gutter-mobile: "{spacing.md}"
  section-gap: "{spacing.xxl}"
  card-gap: "{spacing.lg}"
  target-min: 44px
  grass-cell: 14px
  grass-gap: "{spacing.xxs}"
  focus-width: 2px
  focus-offset: 2px

components:
  brand-header:
    textColor: "{colors.ink}"
    typography: "{typography.title-md}"
    paddingBlock: "{spacing.lg}"
    markSize: 36px
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
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    minSize: "{layout.target-min}"
    iconSize: 20px
  control-focused:
    outlineColor: "{colors.focus}"
    outlineWidth: "{layout.focus-width}"
    outlineOffset: "{layout.focus-offset}"
  text-link:
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
    textDecoration: underline
  member-filter:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.control}"
    minHeight: "{layout.target-min}"
    gap: "{spacing.xs}"
    paddingInline: "{spacing.md}"
  member-filter-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    borderColor: "{colors.primary}"
  year-filter:
    display: flex
    flexWrap: wrap
    gap: "{spacing.xxs}"
    buttonStyle: "{components.member-filter}"
    activeStyle: "{components.member-filter-active}"
    minHeight: "{layout.target-min}"
  grass-cell-today:
    outlineColor: "{colors.primary}"
    outlineWidth: 1px
    outlineOffset: "{layout.focus-offset}"
  grass-cell-future:
    backgroundColor: "{colors.grass-empty}"
    opacity: 0.35
    disabled: true
  workout-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    borderWidth: 1px
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
    gap: "{spacing.lg}"
    shadow: none
  stat-metric:
    textColor: "{colors.ink}"
    labelColor: "{colors.muted}"
    typography: "{typography.metric}"
    labelTypography: "{typography.body-sm}"
    gap: "{spacing.xs}"
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
  date-detail:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.control}"
    padding: "{spacing.md}"
  timeline-item:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    metaColor: "{colors.muted}"
    typography: "{typography.body-md}"
    metaTypography: "{typography.body-sm}"
    rounded: "{rounded.card}"
    borderColor: "{colors.hairline}"
    padding: "{spacing.md}"
    minHeight: "{layout.target-min}"
  status-notice:
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
  status-notice-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.control}"
    padding: "{spacing.md}"
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
    paddingBlock: "{spacing.xl}"
    borderColor: "{colors.hairline}"
---

# 고독한 운동가 · 디자인 시스템

## Overview

**오늘도 묵묵히, 잔디 한 칸.** 혼자 운동하는 사람들의 조용한 기록 공간이다. 봇 **묵묵(`mukmuk`)**은 곁에서 기록을 챙기는 존재로 표현한다. 밝은 종이색 바탕, 흰 카드, 작은 사각형 잔디를 사용하며 운동 기록이 화면의 중심이다.

이 문서는 색상·글꼴·간격·컴포넌트·상태·반응형의 단일 기준이다. `DESIGN-cal.md`의 **YAML 토큰 → 시각 원칙 → 컴포넌트 → 반응형 → 변경 가이드** 형식을 참고했다. Cal의 검정 CTA·전용 글꼴·마케팅 카드·어두운 푸터를 가져오는 대신 묵묵의 기존 녹색·한국어 글꼴·기록 화면을 정의한다. 현재는 구현용 디자인 정의이며 출시 화면을 분석한 결과는 아니다.

제품 동작, 날짜 집계, DB·함수·배포 계약, 실제 서비스 ID와 적용 이력은 [ARCHITECTURE.md](ARCHITECTURE.md)에서 관리한다. 화면을 구현할 때에는 두 문서를 함께 따른다. [대시보드 시안](docs/design/dashboard-preview.svg)은 가상 기록을 사용하는 정적 구성 시안이다.

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
| `{typography.body-md}` | 16px / 400 / 1.6 | 운동 메모·소개 |
| `{typography.body-sm}` | 14px / 400 / 1.5 | 날짜·수집 시각·설명 |
| `{typography.caption}` | 12px / 500 / 1.5 | 요일·월·잔디 범례 |
| `{typography.metric}` | 24px / 700 / 1.2 | 이번 주·연속·누적 숫자 |
| `{typography.button}` | 14px / 600 / 1.4 | 필터·더 보기·재시도 |

대표 문장만 -0.02em 자간을 사용하고 본문은 기본 자간을 유지한다. 통계 숫자는 `tabular-nums`를 사용한다. 한글은 단어 단위 줄바꿈을 우선하고 긴 이름·URL에는 `overflow-wrap: anywhere`를 적용한다. 메모는 원래 줄바꿈을 유지한다. 말줄임으로 숨긴 이름은 상세에서 전체를 읽을 수 있어야 한다.

## Layout

### Spacing System

4px 단위의 4·8·12·16·24·32·48px을 사용한다. 섹션 간격은 `{layout.section-gap}`, 카드 간격은 `{layout.card-gap}`이다. 카드 안쪽은 데스크톱 `{spacing.lg}`, 모바일 `{spacing.md}`다. 마케팅 페이지의 96px 간격을 가져오지 않고 기록을 빠르게 읽을 수 있게 한다.

### Grid & Container

콘텐츠는 최대 `{layout.content-max}` 중앙 정렬이다. 768px 이상은 좌우 `{layout.gutter-desktop}`, 그 이하는 `{layout.gutter-mobile}` 여백을 둔다. 멤버 카드는 한 열로 나열하고 통계는 카드 안에서 세 칸으로 배치한다. 전체 멤버 선택 시에도 카드를 작게 축소해 여러 열로 채우지 않는다.

### Page Composition

1. 마크·브랜드명·`묵묵 · 운동 기록`을 보여주는 헤더.
2. 대표 문장과 소개 한 줄.
3. 한국 시간 기준·마지막 인증 수집 시각.
4. `전체 멤버`와 멤버 이름 필터.
5. 연도 선택과 멤버별 해당 연도 잔디 카드. 올해는 이번 주·연속·해당 연도 운동일을 함께 표시한다.
6. 날짜 내림차순 상세 메모와 `더 보기`.
7. 공개 범위 안내와 브랜드 문장.

각 영역은 한 가지 역할을 갖는다. 웹 화면에 DB 스키마·키·수집 내부 구현 설정을 표시하지 않는다. 운동 작성은 Discord에서 이루어지므로 웹에 입력 폼을 추가하지 않는다.

## Elevation & Depth

| 영역 | 처리 |
| --- | --- |
| 바탕·소개·헤더 | 평면, 그림자 없음 |
| 기록 카드·메모 행 | 흰 바탕 + 1px hairline |
| 선택한 필터 | 녹색 면 + 흰 글씨 |
| 날짜 상세 | 종이색 바탕, 카드 안의 별도 영역 |
| 키보드 포커스 | 2px 녹색 outline, 2px offset |

카드에는 그림자·그라디언트·유리 효과를 쓰지 않는다. 원근감 대신 여백·면·타이포그래피로 계층을 만든다. 포커스 윤곽선을 카드 overflow로 잘라내지 않는다.

## Shapes

기록 카드·메모 행은 `{rounded.card}`, 버튼·상세 영역은 `{rounded.control}`, 잔디는 `{rounded.cell}`을 따른다. 데이터 셀은 작은 정사각형으로 유지한다.

마크의 128px 원본에는 `{rounded.mark}` 반경을 사용한다. [마크 원본](assets/brand/mark.svg)의 새싹과 사각 실루엣을 유지하고 최소 24px로 표시한다. 주변 여백은 마크 너비의 1/4 이상이다. [배너](assets/brand/banner.svg)는 README용 가로 소개다. PNG는 등록·내보내기용이고 SVG가 수정 원본이다.

## Components

### Brand Header & Intro

`{components.brand-header}`는 큰 내비게이션 대신 브랜드와 봇의 역할을 보여준다. 헤더에 가입·가격·관리 메뉴를 추가하지 않는다. `{components.intro}`의 제목은 대표 문장이며 모바일에서는 `{typography.display-sm}`로 바꾼다. 강제 한 줄 축소 대신 자연스럽게 두 줄로 흐르게 한다.

### Buttons & Links

`{components.button-primary}`는 조회 실패 후 `다시 불러오기`처럼 그 영역의 주요 동작에 사용한다. `{components.button-secondary}`는 `더 보기`, `{components.button-icon}`은 날짜 상세 닫기에 쓴다. 기본·눌림·비활성·focus-visible 상태를 명시하며 포커스는 `{components.control-focused}`를 공통으로 적용한다. 비활성 버튼은 색뿐 아니라 실제 `disabled` 상태를 사용한다.

링크는 실제 이동에만 쓰고 버튼은 페이지 안의 동작에 쓴다. 외부 Discord 링크도 알아볼 수 있는 문구를 제공한다. 초기 버전의 포인터 hover는 별도 부유·확대 효과를 넣지 않고 기본 면을 유지한다. 선택·눌림과 키보드 포커스는 분명히 구분한다.

### Member Filter

`{components.member-filter}`는 44px 이상 높이의 일반 버튼이다. 초기 선택은 `전체 멤버`, 선택된 버튼은 `{components.member-filter-active}`다. `aria-pressed`로 선택을 알리고 이름을 가나다순으로 나열한다. 긴 이름과 많은 멤버는 줄바꿈하며 페이지 가로 넘침을 만들지 않는다. 필터를 바꾸면 잔디와 메모가 함께 바뀌고 페이지 초점은 누른 필터에 남는다.

### Workout Card & Stats

`{components.workout-card}`는 멤버명, 기간, `{components.stat-metric}` 세 개, 잔디, 범례를 담는다. 통계는 `이번 주 3일`, `연속 4일`, `2026년 운동 32일`처럼 운동 **일수**와 범위를 표시한다. 과거 연도는 해당 연도 운동일만 표시한다. 순위·벌점·불꽃 아이콘·단절 경고를 붙이지 않는다. 운동 기록이 있는 멤버만 목록에 등장하며 데이터에 없는 멤버의 0일 카드를 임의로 만들지 않는다.

### Grass Grid & Legend

선택한 **달력 연도의 1월 1일→12월 31일**을 표시한다. 기본 선택은 KST 현재 연도이며 상단에 `2026년`, `2025년` 등 내림차순 버튼을 제공한다. 처음에는 최근 다섯 연도, `이전 연도 더 보기`로 더 오래된 연도를 펼친다. 연도 버튼은 멤버 필터와 동일한 선택·포커스 색상을 사용하며 최소 높이 44px, `aria-pressed`로 선택을 알린다. 모바일에서는 줄바꿈한다.

평년 365일·윤년 366일을 정확하게 표시한다. 월요일→일요일이 행, 오래된 주→새로운 주가 열이다. 연도 앞뒤 정렬용 빈 공간은 실제 기록 없음 셀과 구분하고 선택·탐색에서 제외한다. 올해의 미래 날짜는 옅게 표시하며 비활성화한다. 셀 크기·간격과 텍스트/사진의 녹색 단계는 기존 YAML 토큰을 사용한다.

멤버 카드 기간은 `2026년 · 1월 1일 — 12월 31일`처럼 연도를 명시한다. 연도를 바꿔도 선택한 멤버는 유지되며 메모 목록도 같은 연도로 바뀐다. 해당 연도 기록이 없어도 선택한 멤버의 빈 잔디를 보여준다. 과거 연도에서 현재 주·연속 지표를 0으로 표시하지 않고 해당 연도 운동일만 표시한다. 전체 뷰의 이번 달 KPI는 현재 월을 유지한다. 올해 주간·연속 통계는 12월 말부터 이어진 기록까지 반영하며, 연간 합계와 메모에는 선택한 연도 기록만 포함한다.

잔디 영역은 Tab 진입점 하나를 유지한다. 올해는 오늘, 과거 연도는 12월 31일을 진입점으로 삼는다. 올해 카드가 렌더되면 잔디 영역의 가로 스크롤만 조정해 오늘 칸을 가운데에 보여주며 페이지의 키보드 초점을 빼앗지 않는다. 오늘 칸은 별도 윤곽선으로 표시하고 `오늘 · 10월 14일` 버튼으로 다시 이동할 수 있다. 연도 변경 중 오래된 요청의 결과가 최신 선택을 덮어쓰지 않으며 조회 실패는 빈 기록과 구분한다. 월·요일·범례·날짜 상세는 기존 컴포넌트를 따른다.

### Date Detail & Keyboard

포인터 hover·키보드 포커스는 날짜·단계·메모를 보여주고 탭·클릭은 `{components.date-detail}`을 카드 안에 연다. 데스크톱에서는 잔디 오른쪽, 모바일에서는 잔디 아래에 배치한다. 상세를 열면 해당 날짜 칸을 가로 영역 안에 다시 드러내고 상세 제목으로 초점을 이동해 긴 메모의 시작이 가려지지 않게 한다. 다시 선택하거나 닫기 버튼을 누르면 닫고 날짜 칸으로 초점을 돌린다. 사이드 상세의 표시나 화면 폭 변경으로 잔디 영역이 좁아져도 선택한 날짜를 다시 드러낸다. 메모가 길어도 카드 밖으로 넘치지 않는다. hover가 끝나도 클릭으로 연 상세는 유지한다. 터치에서 작은 셀을 누르기 어렵다면 타임라인 행으로 같은 상세를 열 수 있다.

잔디 영역의 Tab 진입점은 하나이고 화살표로 실제 날짜를 이동한다. 위/아래는 같은 주의 이전/다음 행, 좌/우는 이전/다음 주이며 범위 끝을 넘어가거나 정렬 빈 공간으로 이동하지 않는다. Enter·Space로 상세를 열고 Escape로 닫아 해당 날짜로 초점을 돌린다. 닫기 버튼은 최소 44×44px이다. 접근 가능한 이름 예시는 `10월 14일, 사진 포함 인증, 가볍게 30분 걷기`다. 기본 `title`만으로 상세를 제공하지 않는다.

### Timeline

`{components.timeline-item}`은 날짜·멤버명·여러 줄 운동 메모를 보여준다. 사진만 있는 날은 `사진 인증`으로 표시하며 사진 파일·첨부 URL을 웹에 옮기지 않는다. 날짜가 최신인 항목부터 보여주며 최초 30개의 **일별 기록** 이후 `더 보기`로 늘린다. 추가 조회 실패 시 기존 목록을 유지하고 재시도를 제공한다. 상세를 여는 동작과 길고 선택 가능한 메모 본문을 겹치게 만들지 않는다.

### Status & Footer

`{components.status-notice}`는 마지막 수집 시각을 표시하고, 2시간 이상 지연되면 경고 변형을 쓴다. `{components.loading-placeholder}`는 정적 자리표시자다. 초기 로딩은 `aria-busy`, 재조회 결과는 짧은 `aria-live="polite"` 안내를 제공하고 메모 전체를 반복해서 읽지 않는다.

`{components.footer}`는 밝은 바탕에서 공개 범위를 안내한다. `표시명·사용자 ID·운동 날짜·텍스트 메모가 공개됩니다. 사진은 Discord에 남습니다.`를 읽을 수 있어야 한다. 색상 반전을 위한 큰 어두운 푸터를 만들지 않는다.

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
| 사진만 있는 인증 | 사진 인증 |
| 슬래시 수명 | 이 메시지는 5분 뒤 사라져요. |
| 가상 시안·데모 | 예시 기록 |

조회 실패를 빈 기록으로 보여주지 않는다. 차분하고 짧게 쓰며 과장된 응원·질책·순위 문구를 넣지 않는다. 날짜는 KST, `이번 주`는 월요일부터 오늘까지다. 자세한 동작은 시스템 계약을 따른다.

## Discord Presentation

웹의 잔디 단계·기간 의미·운동일 단위를 Discord에도 유지한다. Discord 자체 글꼴·배경은 바꾸지 않으며 브랜드는 마크·등록 이모지·제목·문구로 전달한다. 28칸은 **7개씩 네 줄**, 최근 메모는 **최근 기록일 5개**다. 현황판은 계속 남고 슬래시 결과만 5분 뒤 삭제된다.

등록된 `mukmuk_grass`·`mukmuk_photo`는 각각 기본·진한 녹색이다. 둘 중 하나라도 설정이 없으면 전체를 ⬜·🟩·🌲 문자 범례로 대체한다. 실제 등록 ID와 전송·삭제 동작은 [Discord 설정](ARCHITECTURE.md#17-discord-초기-설정-현황)을 따른다. 아래는 가상 출력 시안이다.

```text
🌱 묵묵 · 하루님의 운동 잔디
최근 28일 · 2026.09.17 — 2026.10.14

⬜🟩⬜🟩⬜⬜🟩
🟩⬜⬜🟩⬜🌲⬜
⬜🟩🟩⬜⬜🌲⬜
🟩⬜⬜🟩🌲🟩🌲

이번 주 3일 · 연속 4일 · 누적 32일
⬜ 기록 없음 · 🟩 텍스트 · 🌲 사진 포함

최근 기록일 5개
10.14 · 가볍게 30분 걷기 [사진 인증]
10.13 · 하체 운동 40분
10.12 · 퇴근하고 조깅 20분 [사진 인증]
10.11 · 스트레칭과 산책
10.08 · 등 운동 30분

마지막 수집 · 10.14 19:17 KST
이 메시지는 5분 뒤 사라져요.
```

현황판 제목은 `🌱 묵묵 · 운동 잔디 현황`으로 하고 멤버명·이번 주·누적·네 줄 잔디를 반복한다. 분할 시 `1/2`, `2/2` 번호를 붙인다. 웹보드 링크는 실제 배포 주소가 생긴 뒤 표시한다.

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
- 순위·벌점·쉬는 날 경고·스트릭 단절 강조를 넣지 않는다.
- 그림자·애니메이션·큰 장식으로 기록보다 시선을 끌지 않는다.
- 중요한 내용을 hover·색·작은 셀 클릭에만 맡기지 않는다.
- 사진 원본이나 서버 설정을 공개 웹 화면에 넣지 않는다.

## Responsive Behavior

| 구간 | 규칙 |
| --- | --- |
| Compact · 360px 미만 | 16px 바깥 여백, 소개·필터·통계 자연 줄바꿈, 잔디 안쪽만 필요 시 가로 스크롤 |
| Mobile · 360–767px | 제목 28px, 바깥·카드 안쪽 16px, 통계 세 칸, 필터 줄바꿈 |
| Desktop · 768px 이상 | 제목 40px, 바깥 32px·카드 안쪽 24px, 콘텐츠 최대 960px, 기록 카드 한 열 |

큰 화면에서 열 수를 늘리는 대신 여백을 늘린다. 320·360·768·1280px와 200% 확대에서 페이지 전체 가로 넘침이 없어야 한다. 통계의 긴 값은 줄바꿈할 수 있으며 자르지 않는다. 잔디만 스크롤하더라도 범례·상세 패널은 화면 폭에 맞게 유지한다.

버튼·필터·상세 닫기·타임라인 동작은 최소 44px이다. 14px 잔디는 밀도 있는 기록 표시를 위해 유지하되 키보드 탐색과 큰 타임라인 동작으로 같은 정보에 접근할 수 있게 한다. 사진 원본 갤러리·호버 전용 메뉴는 만들지 않는다.

## Motion

초기 버전은 정적인 기록 화면이다. 잔디 채우기·스트릭 축하·반짝임·shimmer를 넣지 않는다. 상태 전환은 즉시 반영하고 로딩 자리표시자는 움직이지 않는다. 이후 모션을 추가하면 목적·시간·`prefers-reduced-motion` 대체 동작을 이 문서에 기록한다.

## Iteration Guide

1. 변경할 컴포넌트와 토큰을 먼저 정한다. 참조는 `{components.workout-card}`, `{colors.grass-photo}`처럼 YAML 경로를 그대로 쓴다.
2. 기본·활성·비활성·포커스 변형은 `components`에 별도 항목으로 정의한다. 변형은 기본 컴포넌트의 미지정 속성을 상속한다. focus-visible은 해당 기본·활성 상태 위에 합성한다.
3. 실제 구현에서는 토큰을 CSS custom properties 등으로 매핑한다. 토큰값이 없는 새 색·간격·모서리를 임의로 추가하지 않는다.
4. 디자인 변경은 이 문서와 관련 SVG 시안을 같이 갱신한다. 제품 동작·기술 선택 변경은 `ARCHITECTURE.md`, 실행 순서는 `docs/superpowers/plans/`에 기록한다.
5. 타입스크립트 웹 구현은 현재 단일 대시보드에 맞춰 바닐라로 시작한다. React 전환 판단은 시스템 설계에 기록하고 화면 스타일은 이 문서를 유지한다.
6. 마일스톤 검증 후 커밋·푸시한다. 시안이나 토큰 검증을 실제 서비스 출시·접근성 검증으로 보고하지 않는다.

## Known Gaps & Validation

- [정적 SVG 시안](docs/design/dashboard-preview.svg)은 데스크톱·360px 구성을 보여준다. 구현 DOM은 Chromium에서 320·360·768·1280px, 클릭 상세·화살표·Escape·200% 글자 확대·긴 이름과 메모·조회 실패를 검증했다. 다른 OS의 글꼴과 실제 모바일 브라우저 확인은 추가 검증 대상이다.
- 요일·월 라벨, 84개 실제 날짜와 정렬 빈 공간, 긴 멤버명·메모·많은 필터를 실제 데이터 크기로 검증해야 한다.
- 색상 대비는 본문·보조 문구·버튼·경고·오류의 실제 조합으로 확인한다. 잔디는 텍스트 범례·접근 가능한 이름·상세를 함께 검증한다.
- 로딩·빈 상태·오류·지연·추가 조회 실패·사진만 있는 인증을 모두 확인한다.
- 한국어 운영체제 글꼴에 따라 글자 폭이 달라질 수 있으므로 macOS와 Windows·모바일에서 줄바꿈을 확인한다.
- dark mode·사진 갤러리·입력 폼은 초기 화면 범위에 없다. 추가 시 별도 토큰·상태·반응형을 정의한다.
- 후속 기능 구현 준비와 누락 설정은 [준비 현황](docs/implementation-readiness.md)에서 관리한다. 이 문서의 `implementation-ready`는 시각 기준의 준비 상태이며 봇·웹 기능의 출시 상태가 아니다.
