# 웹보드 시각·조작감 검수 보완 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 하위 에이전트는 별도로 요청받았을 때만 사용한다.

**Goal:** 사용자 검수의 네 가지 결함을 고치고, 이미 합격한 정렬·잔디 페이드·타임라인·사진 지연 로딩을 보존한다.

**Architecture:** 기존 바닐라 TypeScript 구성에서 요청 수명과 필터 상태를 정리하고, 멤버 칩의 스크롤 마감과 글자 확대 대응을 해당 렌더러·CSS에 한정한다. 디자인의 단일 기준은 루트 `DESIGN.md`이며 이 문서의 CSS는 구현 방법을 설명하는 제안이다. DB·Edge·수집기·외부 설정은 변경하지 않는다.

**Tech Stack:** TypeScript, Vite, CSS, Playwright, Vitest. 새 의존성 없음.

**Spec:** 사용자가 제공한 2026-10-20 검수 ①~④ 및 [DESIGN.md](../../../DESIGN.md), [ARCHITECTURE.md](../../../ARCHITECTURE.md)의 기존 제품 계약. 별도 설계 문서를 만들지 않고 요청받은 실행 계획을 작성한다.

**상태:** 실행 준비용 계획. 제품 코드 수정·브라우저 재현·기능 테스트·배포는 아직 수행하지 않았다. 기준 소스는 `d82fffa`이다.

## Global Constraints

- 브랜드: **고독한 운동가**. 표기 앞뒤에 공백을 넣지 않는다.
- 제품 문구와 기본 문서는 한국어로 작성한다. 코드 식별자는 영어를 사용한다.
- 콘텐츠 최대 폭 `960px`, 데스크톱 좌우 `24px`, 모바일 좌우 `14px`, 모바일 경계 `767px`를 유지한다.
- 일반 배율의 잔디 셀은 `14px`, 간격은 `4px`이다. 확대 대응은 행 트랙을 늘려 해결하며 셀을 잘라내거나 글자 크기를 고정하지 않는다.
- 사진 파일·썸네일을 별도 저장하지 않는다. 첫 화면에는 사진 요청을 보내지 않는다.
- 조회 실패, 빈 기록, 로딩과 데이터 갱신 중 상태를 각각 구분한다.
- `prefers-reduced-motion: reduce`에서 피드백 전환은 `0s`, 표면 진입 애니메이션은 `none`이다.
- 실제 사용자 데이터·코드·토큰을 캡처나 로그에 포함하지 않는다. 브라우저 검증은 가상 데이터와 가로챈 API만 사용한다.
- 배포와 공용 브랜치 병합은 이 계획 실행에 포함하지 않는다. 검증한 기능 단위로 작업 브랜치에 커밋·푸시한다.

## Review Focus

1. 2027년 화면에서 2026년 조회가 실패해도 멤버 선택을 보존하고 재시도·다른 연도 이동이 가능해야 한다. Task 1에서 검증한다.
2. 일반 실패와 코드 만료를 구분해야 한다. 인증 만료 뒤에는 이전 멤버·통계·사진을 다시 표시하지 않는다. Task 1에서 검증한다.
3. 선택 칩·미선택 칩을 누르거나 요청 중 비활성화해도 선택 의미와 실제 색상이 일치해야 한다. 일반 모션과 축소 모션 모두 Task 1에서 검증한다.
4. 많은 멤버·긴 이름·200% 글자에서 선택 칩과 포커스 윤곽선이 가장자리 페이드에 가려지지 않아야 한다. Task 2에서 검증한다.
5. 윤년·연초·연말과 스크롤 양 끝에서도 월·요일이 읽히고 날짜 셀 및 페이드와 정렬되어야 한다. Task 3에서 검증한다.

## 코드 대조와 판단

| 검수 내용 | 현재 코드에서 확인한 사실 | 계획상 처리 |
| --- | --- | --- |
| ① disabled가 선택 색을 덮음 | `button:disabled`보다 `.filter-button[aria-pressed="true"]`의 구체성이 높다. 멤버 전환은 로컬 렌더이며 `init()`을 호출하지 않는다. 연도 전환은 필터 버튼을 일괄 비활성화한다. | 영구적인 중간색이나 disabled 우선 적용을 원인으로 단정하지 않는다. 일반 모션 재현을 먼저 추가하고 선택 상태 전환을 즉시 적용한다. |
| ① 실패하면 화면 잠김 | `init()`의 catch가 필터를 제거한다. 연도 컨트롤은 `renderFilters()`에서 카드 내부로 이동되므로 카드 교체 시 이미 제거된다. 단순히 finally에서 disabled를 해제해서는 복구되지 않는다. | 일반 오류에선 기존 roster와 선택 연도로 컨트롤을 재생성하고 별도 오류 헤더에 연도 컨트롤을 배치한다. |
| ① active 규칙 충돌 | 앞의 `.filter-button:active`와 뒤의 미선택 전용 규칙이 함께 존재한다. 뒤 규칙이 더 구체적이다. | 중복 규칙을 제거하고 선택 여부·disabled 조건별 스타일을 명시한다. |
| ② 칩 절단면 | 모바일 `.member-options`에 가로 스크롤과 3px 패딩만 있다. | 목록 전용 가장자리 페이드와 선택 칩 노출 여유를 추가한다. |
| ③ 요일·월 | 요일은 `.75rem` 글자와 14px 고정 행을 혼용한다. 월의 왼쪽 여백은 24px 상수다. | 요일과 셀에 같은 가변 행 높이를 쓰고 월 시작점을 요일 폭·간격과 공유한다. |
| ③ 1월·2월 겹침 원인 | 월 생성은 매주 첫 유효 날짜의 월이 바뀔 때만 라벨을 만든다. 1월 첫 주가 짧다는 이유로 다음 열에 2월이 붙는 로직은 아니다. | 라벨끼리의 충돌과 고정 요일 영역으로 스크롤되는 문제를 구분해서 측정한다. |
| ④ 평면 원칙 | 인증 모달·개설 안내에 그림자/블러, 캐릭터에 drop-shadow가 있다. 다만 현 문서는 카드 원칙만 명시한다. 사진 backdrop은 별도 60% 검정 토큰이다. | 평면 처리를 다이얼로그에도 명시하고 제거한다. 사진의 기존 backdrop 대비는 유지한다. |
| ④ 경고·버튼 | 경고가 정상 배지의 pill 스타일을 상속한다. 멤버 닫기·사진 닫기·원문 링크에 secondary 변형이 없다. | 경고만 기존 warning 토큰의 10px/16px를 적용하고 다이얼로그 액션을 정렬한다. |

캡처에서 관측한 시각 현상은 사용자 검수 근거다. 위 표의 코드 대조만으로 브라우저 재현까지 완료한 것으로 기록하지 않는다.

## 파일별 책임과 변경 범위

| 파일 | 변경 책임 |
| --- | --- |
| `src/main.ts` | 로딩 중 컨트롤 상태, 일반 오류 복구, 만료 시 데이터 제거, 요청 세대 보호 |
| `src/dashboard-controls.ts` | 칩 스크롤 래퍼·페이드·선택 노출·dispose, 멤버 찾기 액션 |
| `src/grass-card.ts` | 월 라벨의 스크롤 가림, 공유 기하와 기존 페이드 정합성 |
| `src/photo-view.ts` | 확대 다이얼로그 secondary 액션과 배치 |
| `src/style.css` | 선택·누름·비활성 스타일, 칩 페이드, 확대 행 높이, 평면 모달·경고 |
| `tests/browser/dashboard.spec.ts` | 기존 fixture를 재사용한 오류 복구·상태·기하 회귀 검증 |
| `DESIGN.md` | 변경된 상태·접근성·모달 규칙의 유일한 정의 |
| `ARCHITECTURE.md` | 연도 조회 실패 시 제어 복구와 재인증 동작만 반영 |
| `docs/design/dashboard-desktop.svg`, `dashboard-mobile.svg`, `dashboard-preview.svg`, `photo-detail-preview.svg` | 관련 화면의 최종 구현을 반영한 기존 SVG 갱신 |

새 상태 관리 라이브러리나 공통 스크롤 프레임워크를 도입하지 않는다. `package.json`, DB·Edge·Python 코드는 변경 대상이 아니다.

## 실행 준비

- [ ] 작업 시작 시 `git status --short`, `git branch --show-current`, `git rev-parse --short HEAD`를 확인한다. 문서 작성 뒤 변경된 소스가 있으면 이 계획의 함수·선택자와 다시 대조한다.
- [ ] 구현은 현재 문서 브랜치 또는 전용 기능 브랜치에서 수행한다. 이미 분리된 작업 공간이면 그대로 사용한다. 필요한 격리는 `using-git-worktrees` 지침으로 처리한다.
- [ ] 의존성이 없을 때만 `npm ci`를 실행한다. Playwright 브라우저가 없으면 `npx playwright install chromium`을 실행한다.
- [ ] 기존 기준 검증을 실행한다: `npm test`, `npm run build`, `npm run test:browser`. 실패가 있으면 새 변경과 구분해 기록하고 먼저 원인을 확인한다.

## Task 1: 연도 조회 실패 복구와 필터 피드백

**Files:** Modify `src/main.ts` (`init`, `renderFilters`), `src/style.css` (filter/disabled/feedback); Test `tests/browser/dashboard.spec.ts`.

**Interfaces:** `renderDashboardControls(options): HTMLElement`의 기존 외부 인터페이스를 유지한다. `renderFilters()`가 멤버·연도 DOM을 재생성하고, `init(preserveSelection = false): Promise<void>`가 요청 세대별 로딩·오류 처리를 소유한다.

- [ ] **1. 기존 fixture로 오류 회귀 테스트를 추가한다.** 연도 이동을 시험할 때 시각을 반드시 2027년으로 둔다. 실제 현재 연도 2026년에서는 이전 연도 버튼이 개설 안내를 열어 API 실패를 재현할 수 없다.

```ts
test('year reload failure keeps member and year controls usable', async ({page}) => {
  await fixture(page, 'normal', true, false, '2027-01-05T09:00:00Z');
  await page.getByRole('button', {name:'하루', exact:true}).click();
  await page.route('**/rest/v1/rpc/get_workout_logs_page', route =>
    route.fulfill({status:503, json:{message:'unavailable'}}));
  await page.getByRole('button', {name:'이전 연도', exact:true}).click();
  await expect(page.locator('.error-state')).toBeVisible();
  const member = page.locator('.member-filter [data-member-id="2"]');
  await expect(member).toHaveAttribute('aria-pressed', 'true');
  await expect(member).toBeEnabled();
  await expect(page.locator('.year-label')).toHaveText('2026년');
  await expect(page.getByRole('button', {name:'다음 연도', exact:true})).toBeEnabled();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  await page.unroute('**/rest/v1/rpc/get_workout_logs_page');
  await page.getByRole('button', {name:'다시 불러오기', exact:true}).click();
  await expect(page.locator('.error-state')).toHaveCount(0);
  await expect(member).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.year-label')).toHaveText('2026년');
  await expect(page.locator('.timeline-item').first()).toBeVisible();
});
```

- [ ] **2. 회귀 테스트의 실패를 확인한다.** `npm run test:browser -- -g 'year reload failure keeps'`. 현재는 오류 후 멤버 필터가 없어져 실패해야 한다.
- [ ] **3. 일반 오류에서 컨트롤을 재구성한다.** 기존 필터와 카드의 dispose를 먼저 호출한다. `data`가 이전 성공 결과를 가진 경우에만 `renderFilters()`를 실행하고, 이전 데이터는 멤버 목록 복원에만 사용한다. 실패한 연도의 잔디·KPI·타임라인으로 표시하지 않는다. 오류 DOM에는 `yearBar`와 `.error-state`를 함께 배치한다. 예시 구조:

```ts
// 일반 오류 분기. 초기 로드 실패에는 data가 없으므로 컨트롤을 만들지 않는다.
if (data) {
  renderFilters();
  yearBar.hidden = false;
  cards.replaceChildren(yearBar, error);
} else {
  cards.replaceChildren(error);
}
```

  `renderCards()`가 기존 첫 자식에 dispose를 보내는 경로와 충돌하지 않도록, 필터 재생성 전 기존 controls에 dispose를 보낸다. DOM을 이동한 연도 컨트롤도 새 controls와 함께 정리한다.
- [ ] **4. 오류 중 멤버 클릭으로 이전 연도 데이터가 다시 나타나지 않게 한다.** `main.ts`에 `let dashboardReady = false`를 두고 요청 시작·오류에서는 false, 새 `data = loaded` 확정 뒤 true로 설정한다. `onMemberChange`에서 선택값은 항상 반영하되 false이면 `void init(true); return;`으로 재조회한다. true일 때만 기존 로컬 렌더를 실행한다. 오류 상태의 KPI는 비우고 숨긴다. 다음 정상 조회 시 `renderKPIs()`가 선택 상태대로 다시 표시한다.
- [ ] **5. 비활성 수명을 요청 세대와 묶는다.** 요청 시작에 `filters`와 별도로 이동한 `yearFilters`의 버튼까지 잠근다. 각 버튼의 원래 `disabled` 값을 Map에 저장하고, 최신 요청의 finally에서 아직 연결된 버튼만 원래 값으로 복원한다. 새로 생성된 스테퍼의 미래 연도 버튼을 일괄 활성화하지 않는다. 오래된 요청의 catch/finally는 최신 화면을 건드리지 않는다. 성공·실패·재인증에서 `aria-busy`는 최신 요청만 해제한다.
- [ ] **6. 선택 색 규칙을 정리한다.** `.filter-button:active` 공통 규칙에서 필터 부분을 제거하고 primary 버튼 규칙만 남긴다. 선택 칩은 hover·active·disabled 동안 primary 면/흰 글씨를 유지하며, 선택 변경과 disabled 변경에는 전환 시간을 주지 않는다. 미선택 칩의 hover 전환만 140ms를 허용하고 active는 기존 pressed 토큰을 즉시 적용한다. 아래 상태 규칙을 기존 중복 규칙 정리 후 사용한다.

```css
.filter-button[aria-pressed="true"] {
  background: var(--primary); color: white; border-color: var(--primary);
  transition-duration: 0s;
}
.filter-button:disabled { transition-duration: 0s; }
.filter-button:not([aria-pressed="true"]):not(:disabled):active {
  background: var(--control-pressed); color: var(--primary);
}
```

  위 선택 규칙은 공통 transition 선언 **뒤**에 배치한다. 로딩은 화면의 로딩 문구·`aria-busy`·조작 잠금으로 표현한다.
- [ ] **7. 실패 조건을 각각 검증한다.** 테스트를 `no-preference`와 `reduce`로 매개변수화한다. API 응답을 Promise gate로 지연시켜 로딩 중 선택 칩 색, 필터/연도 잠금을 검사하고 gate를 풀어 복구를 검사한다. 색은 임의 중간값 대신 CSS `--primary`를 브라우저에서 해석한 최종색과 비교한다. 초기 성공의 `aria-busy=false`를 기다린 뒤 첫 캡처를 찍는다. 다음 항목을 별도 테스트로 추가한다: 오류 뒤 다음 연도 이동 성공, 오류 중 다른 멤버 선택 시 재조회, 최초 로드 실패 재시도, 연도 변경 중 코드 만료, stale 응답 무시. 코드 만료 후에는 멤버/KPI/사진 0건과 인증 모달 표시를 검사한다. 기존 `failed year reload disposes pending timeline photos immediately`도 유지한다.
- [ ] **8. 검증·커밋.** `npm run typecheck`와 `npm run test:browser -- -g 'year|secret|control feedback'`를 실행한다. 정상 미래 연도 disabled와 개설 안내의 포커스 복귀까지 확인한 뒤 `fix(web): 연도 조회 실패 복구와 필터 상태 정리`로 커밋한다.

## Task 2: 모바일 멤버 칩 스크롤 마감

**Files:** Modify `src/dashboard-controls.ts` (`list`, `fit`, resize/dispose), `src/style.css`; Test `tests/browser/dashboard.spec.ts`.

**Interfaces:** 기존 `.member-options`가 실제 스크롤러다. 새 `.member-options-viewport`는 `flex:1; min-width:0; position:relative`인 래퍼, `.member-scroll-fade--left/right`는 `aria-hidden=true`인 장식이다. `renderDashboardControls`의 반환값·콜백은 유지한다.

- [ ] **1. 먼저 브라우저 회귀를 추가한다.** fixture의 멤버 RPC 응답에 가상 멤버 30명을 제공하고 360px·200% 글자에서 뒤쪽 멤버를 검색해 선택한다. 양 끝·중간 스크롤, 선택 칩 완전 노출, 키보드 포커스, 768px 전환을 검사한다. 아래 테스트 골격에 fixture 앞의 RPC override는 `fixture()`의 기존 라우트보다 우선하도록 `page.route`를 fixture가 설치된 뒤 등록하고 페이지를 reload한다.

```ts
const roster = Array.from({length:30}, (_,i) => ({
  user_id: String(100+i), username: `산책하는 멤버 ${String(i).padStart(2,'0')}`,
}));
await fixture(page);
await page.route('**/rest/v1/rpc/get_dashboard_members', route => route.fulfill({json:roster}));
await page.reload();
await expect(page.locator('.member-options .filter-button')).toHaveCount(30);
await page.locator('.member-options').evaluate(e => {e.scrollLeft=0;});
await expect(page.locator('.member-scroll-fade--left')).toBeHidden();
await expect(page.locator('.member-scroll-fade--right')).toBeVisible();
```

- [ ] **2. 신규 테스트 실패 확인.** `npm run test:browser -- -g 'member chip scroll'`로 페이드가 아직 없는 상태의 실패를 확인한다. 신규 테스트 이름에는 이 문구를 포함한다.
- [ ] **3. 래퍼를 넣는다.** `nav.append(all, viewport, find)`로 구성하고 래퍼 안에 기존 list와 두 fade를 둔다. 모바일에서만 표시하며 바탕은 카드 흰색이 아닌 페이지 `#F7F8F2`를 사용한다. 폭은 잔디와 같은 12px, `pointer-events:none`, z-index는 장식에만 적용한다. 포커스가 목록 안에 있으면 두 페이드를 즉시 투명하게 한다.
- [ ] **4. 스크롤 수명을 연결한다.** controls 안에 `updateMemberFades():void`를 정의한다. 왼쪽은 `scrollLeft<=1`, 오른쪽은 `scrollWidth-clientWidth-scrollLeft<=1`이면 숨긴다. 수평 overflow가 없거나 데스크톱이면 둘 다 숨긴다. scroll(passive)·ResizeObserver·`fit()` 완료 후 호출하고 dispose에서 observer와 이벤트를 해제한다. 매번 중복 listener를 붙이지 않는다.
- [ ] **5. 선택 노출에 여유를 준다.** `fit()`의 모바일 분기에서 선택 칩이 `list.left+15px`부터 `list.right-15px` 안에 오도록 scrollLeft를 조정한다. 15px는 페이드 12px와 현재 포커스 패딩 3px의 합이다. 첫/마지막 칩도 여유를 갖도록 스크롤 콘텐츠의 양끝에 같은 공간을 예약한다. 선택 칩이 표시 가능한 폭보다 길면 현재 `max-width:160px`와 줄바꿈을 유지하고 텍스트를 가로로 잘라내지 않는다. CSS `scroll-padding-inline:15px`를 함께 사용하고, 포커스 진입에서도 선택/포커스 대상을 노출한다.
- [ ] **6. 기하·접근성을 검사한다.** 검색 선택 후 칩 bounding box가 list 경계 안에 들어오는지 검사한다. 320/360/390px에서 전체 멤버·찾기는 고정하고 목록만 스크롤되는지 확인한다. `focus-within`에서 페이드 `opacity:0`, 목록 끝에서 반대편 페이드만 표시, 768px 이상에서 기존 2행 제한과 숨긴 버튼의 Tab 제외가 유지되는지 확인한다. 전체 페이지 가로 넘침이 없어야 한다.
- [ ] **7. 검증·커밋.** `npm run test:browser -- -g 'member|responsive|text scaling'`와 `npm run typecheck` 후 `fix(web): 모바일 멤버 필터 스크롤 가장자리 정리`로 커밋한다.

## Task 3: 200% 글자에서 요일·월 읽기와 정렬 보장

**Files:** Modify `src/style.css` (month/weekday/grid), `src/grass-card.ts` (`updateScrollFades`); Test `tests/browser/dashboard.spec.ts`.

**Interfaces:** `.grass-grid`, `.weekday-labels`, `.month-labels`, `.grid-wrap` 선택자와 기존 날짜 키보드 인터페이스를 유지한다. `updateScrollFades()`는 기존 fade 위치 계산을 보존하면서 월 행의 고정 요일 영역 침범을 막는다.

- [ ] **1. 겹침을 수치로 검사하는 실패 테스트를 추가한다.** 기존 200% 테스트는 페이지 가로 넘침만 확인하므로 통과해도 라벨 겹침을 검출하지 못한다. 각 320/360/768/1280px, 100/200%에서 요일 span의 인접 bounding box가 겹치지 않고, 같은 인덱스의 grid 행 중심과 1px 이내로 맞는지 검사한다. 월 라벨은 빈 span을 제외하고 실제 텍스트 Range로 폭을 측정한다.

```ts
const labels = await page.locator('.weekday-labels > span').evaluateAll(nodes =>
  nodes.map(node => {
    const r=node.getBoundingClientRect();
    return {top:r.top, bottom:r.bottom};
  }));
for (let i=1; i<labels.length; i++) {
  expect(labels[i].top).toBeGreaterThanOrEqual(labels[i-1].bottom);
}
const monthRects = await page.locator('.month-labels > span').evaluateAll(nodes =>
  nodes.filter(n=>n.textContent?.trim()).map(node => {
    const range=document.createRange();range.selectNodeContents(node);
    const r=range.getBoundingClientRect();return {left:r.left,right:r.right};
  }));
for (let i=1; i<monthRects.length; i++) {
  expect(monthRects[i].left).toBeGreaterThanOrEqual(monthRects[i-1].right);
}
```

- [ ] **2. 200% 요일 테스트 실패를 확인한다.** `npm run test:browser -- -g 'grass label geometry'`. 신규 테스트 이름에 이 문구를 넣는다. 월 겹침이 재현되지 않으면 그 사실을 기록하고 상수 여백 정합성과 스크롤 침범 방지만 수정한다.
- [ ] **3. 공유 CSS 기하를 적용한다.** 일반 배율 14px 셀을 보존하되 텍스트 확대 시 행 트랙만 늘린다. 월 라벨 span의 `width:32px`는 `width:max-content`로 바꾼다. 아래 속성은 `.grass-visual`에 두어 그 카드 내부에서 공유한다.

```css
.grass-visual {
  --grass-label-size: .75rem;
  --grass-row-height: max(14px, .875rem);
  --grass-weekday-width: calc(var(--grass-label-size) + 4px);
  --grass-label-gap: 12px;
}
.grid-wrap { gap: var(--grass-label-gap); }
.weekday-labels {
  width: var(--grass-weekday-width); flex-shrink: 0;
  font-size: var(--grass-label-size); line-height: 1.1666667;
  grid-template-rows: repeat(7, var(--grass-row-height));
  align-items: center;
}
.grass-grid {
  grid-template-rows: repeat(7, var(--grass-row-height));
  align-items: center;
}
.month-labels {
  margin-left: calc(var(--grass-weekday-width) + var(--grass-label-gap));
}
.month-labels span { width: max-content; }
```

  일반 12px 글자에 14px 행, 200%의 24px 글자에 28px 행을 확보한다. 이 값은 `DESIGN.md` 토큰에도 함께 기록한다. 셀 자체는 계속 14×14px이며 확대 행 안에서 가운데 정렬한다.
- [ ] **4. 월 행의 왼쪽 침범을 막는다.** 월 행 시작점이 grid 시작과 같은지 먼저 측정한다. `updateScrollFades()`에서 `months.style.clipPath = \`inset(0 0 0 ${Math.max(0, grassScroll.scrollLeft)}px)\``를 갱신해 월 라벨이 고정 요일 폭 위로 넘어오지 않게 한다. `months`는 이미 요일 폭+gap만큼 떨어진 콘텐츠이므로 scrollLeft만큼 내부 왼쪽을 가린다. 시작·중간·끝에서 스크린샷으로 clipping 경계를 확인한다. 라벨끼리 겹치는 테스트가 실제로 실패하면 해당 월 시작 열과 텍스트 폭을 측정해 원인을 해결하며, 임의 월 삭제·월명 축소로 숨기지 않는다.
- [ ] **5. 연도와 배율 회귀를 확인한다.** fixture 시각을 `2029-01-05`로 설정해 2028년 윤년과 2026년까지 탐색한다. 셀 366/365개, 12개 월 라벨, 7개 요일, 1월과 2월의 실제 텍스트 비겹침을 검사한다. 100%에서 기존 셀 크기·헤더·프리뷰 높이 유지, 200%에서 글자 크기 24px·요일 행 28px와 셀 중심 정렬을 검사한다. 1월 1일/12월 31일 및 스크롤 시작·중간·끝을 캡처한다. clipping은 DOM box만으로 검증하지 말고 캡처도 확인한다.
- [ ] **6. 검증·커밋.** `npm run test:browser -- -g 'grass|text scaling|year'`, `npm run build` 후 `fix(web): 텍스트 확대 시 잔디 라벨 정렬 보완`으로 커밋한다. 기존 fade 테스트의 weekday.right/grid.top/grid.height 오차 1px 미만 기준은 완화하지 않는다.

## Task 4: 모달·경고·버튼의 평면 스타일 통일

**Files:** Modify `src/style.css`, `src/dashboard-controls.ts`, `src/photo-view.ts`; Test `tests/browser/dashboard.spec.ts`.

**Interfaces:** 멤버 검색과 사진의 native dialog/close 이벤트, 원문 링크의 URL 검증·`target`·`rel`, 사진 요청 및 포커스 복귀 동작은 유지한다. 새 `.dialog-actions`는 버튼/링크 정렬에만 사용한다.

- [ ] **1. 실제 표면의 스타일 검증을 추가한다.** 인증 모달, 멤버 찾기, 개설 안내, 사진 확대를 각각 열고 `box-shadow:none`, `backdrop-filter:none`을 검사한다. native backdrop은 `getComputedStyle(dialog,'::backdrop')`로 확인한다. 인증의 `.modal-backdrop`도 따로 검사한다. 캐릭터는 `filter:none`이어야 한다. fixture 시각을 12:00Z로 두어 기존 last_success_at 대비 2시간 이상 지연 경고를 재현한다.

```ts
await fixture(page, 'normal', true, false, '2026-10-14T12:00:00Z');
const warning=page.locator('.status-notice.warning');
await expect(warning).toHaveCSS('border-radius','10px');
await expect(warning).toHaveCSS('padding-top','16px');
await expect(warning).toContainText('새 인증의 반영이 늦어지고 있어요.');
await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();
const close=page.locator('.member-dialog').getByRole('button',{name:'닫기',exact:true});
await expect(close).toHaveClass(/secondary/);
```

- [ ] **2. 신규 `flat dialog and warning` 테스트가 현재 그림자·pill·버튼 변형에서 실패하는지 확인한다.** `npm run test:browser -- -g 'flat dialog and warning'`.
- [ ] **3. 장식과 경고를 수정한다.** `.modal-backdrop`, `.inception-dialog::backdrop`의 blur, `.modal-box`/`.inception-dialog` 그림자와 `.inception-character` drop-shadow를 제거한다. 정상 수집 배지는 유지하고 `.status-notice.warning`에만 `border-radius:10px; padding:16px; max-width:100%; white-space:normal`을 적용한다. warning의 추가 span을 한 줄 아래로 배치하고 header-actions에는 `min-width:0; max-width:100%`를 적용해 320px·200%에서도 줄바꿈되게 한다. 필요 시 warning만 `flex-basis:100%`를 적용하며 Discord 링크가 밀려나지 않는지 확인한다.
- [ ] **4. 다이얼로그 액션을 배치한다.** 멤버 닫기와 사진 닫기에는 `'button secondary'`, 원문 링크에는 `'button secondary'`를 지정한다. 사진 DOM은 다음처럼 구성한다.

```ts
const actions=el('div','dialog-actions');
actions.append(source,close);
modal.append(image,actions);
```

```css
.dialog-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.dialog-actions > .button {
  display:inline-flex; align-items:center; justify-content:center;
  text-decoration:none; max-width:100%; overflow-wrap:anywhere;
}
```

  멤버 닫기도 같은 actions 래퍼에 넣는다. 사진 확대에서 `close.focus()`와 닫힌 뒤 opener 포커스 복귀를 유지한다. 200%에서 버튼 높이를 고정하지 않는다. 사진의 기존 `60%` 검정 backdrop과 인증/검색/개설 안내의 `40%` 녹색 backdrop은 각각 보존한다.
- [ ] **5. 검증·커밋.** 새 스타일 테스트와 기존 사진 오류·재시도·확대·Escape·모션 검증을 실행한다: `npm run test:browser -- -g 'flat dialog|photo|secret|inception|motion'`, `npm run typecheck`. 320px·200%에서 경고·버튼이 잘리지 않는지 확인하고 `style(web): 다이얼로그와 경고 스타일 통일`로 커밋한다.

## Task 5: 디자인 기준·시안 동기화 및 전체 회귀

**Files:** Modify `DESIGN.md`, `ARCHITECTURE.md`, `docs/design/dashboard-desktop.svg`, `docs/design/dashboard-mobile.svg`, `docs/design/dashboard-preview.svg`, `docs/design/photo-detail-preview.svg`; Test existing web/edge/browser suites.

**Interfaces:** 디자인 값은 `DESIGN.md`만 관리한다. SVG에는 최종 화면 예시를 반영하며 토큰 사본을 새 문서로 분리하지 않는다. 이 계획 문서의 체크박스는 실제 완료한 단계만 갱신한다.

- [ ] **1. 디자인 기준을 동기화한다.** 기존 YAML에 선택 칩의 로딩/누름 상태, 모바일 멤버 페이드, 확대 시 행 트랙과 월 gutter, 모달의 shadow/blur 없음, 액션 정렬을 반영한다. `Elevation & Depth`에 모달·캐릭터의 평면 처리와 기존 잔디/멤버의 가장자리 페이드가 스크롤 방향 안내용 장식임을 명시한다. 14px 셀 유지와 확대 시 행 간격 확대를 함께 설명한다. 오류 복구는 `ARCHITECTURE.md` §8의 상태 규칙에만 짧게 기록한다.
- [ ] **2. 관련 SVG를 최종 구현에 맞춘다.** 데스크톱·모바일 시안의 멤버 칩 경계, 공유 월 시작 위치와 경고, 사진 상세 시안의 액션 배치를 반영한다. 새 브랜드 자산은 만들지 않는다. XML 파싱 후 사용 가능한 SVG 렌더러 또는 Playwright로 실제 렌더하고 텍스트 겹침·잘림을 직접 확인한다.
- [ ] **3. 전체 검증을 실행한다.** 저장소에 존재하는 다음 명령을 실행하고 성공/실패를 기록한다. `npm run build`에는 TypeScript 검사와 배포 산출물 검사가 포함된다.

```bash
npm test
npm run build
npm run test:browser
git diff --check
```

- [ ] **4. 최종 캡처를 확인한다.** 320/360/768/1280px × 100/200% × 전체/개인 화면을 검사한다. 일반 모션의 전환 직후와 140ms 이후를 구분하고, 정적 캡처는 `aria-busy=false` 및 전환 완료 후 찍는다. 동작 결함을 긴 임의 sleep으로 숨기지 않는다. 안정 캡처와 별개로 Task 1의 즉시 상태 검증을 유지한다. 기존 스크린샷은 위 브라우저 전체 검증에서 `test-results/dashboard-*.png`로 생성된다. 보조 캡처는 기존 경로를 사용한다.

```bash
MUKMUK_CAPTURE_DIR=test-results/visual-review npm run test:browser -- -g 'monthly conversation loads photos directly'
```

  보조 캡처는 390px/1280px의 개인 화면이다. 필수 전체 매트릭스를 대신하지 않는다. 추가 비교 캡처는 해당 회귀 테스트에서 `test-results/visual-review/` 아래에 저장한다. 런타임의 시크릿 코드/실제 사용자 정보는 쓰지 않는다.
- [ ] **5. 합격 영역의 회귀를 확인한다.** 헤더/KPI/필터/카드/푸터 좌우 끝선, 기본 데스크톱 1행·모바일 2행 헤더, 프리뷰의 빈 높이·hover/focus 높이 불변, fade의 요일 오른쪽 접점·셀 행 범위·포커스 시 투명화, 월별 말풍선, 첫 화면 사진 요청 0건, viewport 진입 후 썸네일, 클릭 후 원본, Escape 후 포커스 복귀를 확인한다. 헤더의 1행 기준은 일반 배율이며 200%에서는 가독성을 위해 줄바꿈을 허용한다.
- [ ] **6. 문서 검증·커밋·푸시.** 상대 링크와 변경 파일 목록을 확인하고 관계없는 변경/비밀값이 없는지 diff를 검토한다. `docs: 웹보드 검수 보완 기준과 시안 갱신`으로 커밋 후 `git push -u origin HEAD`를 실행한다. push가 배포를 유발하는 워크플로우인지 먼저 확인하고 공용 main에는 병합하지 않는다.

## 완료 기준과 보고

- ① 실패 후 필터·연도·재시도 복구, 멤버 선택 유지, 인증 만료 시 데이터 제거와 재인증, stale 응답 보호를 확인했다.
- ① 선택/누름/disabled 스타일은 모션 설정 양쪽에서 검증했고 캡처의 정상 전환 중간값을 영구 결함과 구분했다.
- ② 모바일 스크롤 경계에 방향별 페이드가 있으며 선택/포커스 대상은 잘리지 않는다.
- ③ 100/200%에서 요일·월 텍스트가 겹치지 않고, 요일/셀/월/페이드 기하와 날짜 탐색이 일치한다.
- ④ 모달의 평면 처리·secondary 액션·warning 10px/16px를 디자인 기준과 일치시켰다.
- 관련 SVG 렌더와 웹 테스트·타입 검사·정적 빌드가 통과했다. 확인한 환경과 수행하지 못한 검증은 구분해서 기록했다.
- 보고에는 변경 내용, 실제 실행한 명령·결과, 커밋·브랜치, 남은 제한을 짧게 쓴다. 배포·실서비스 확인 완료라고 쓰지 않는다.
