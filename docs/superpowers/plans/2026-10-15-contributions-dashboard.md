# 연간 합산 잔디·멤버 탐색·운동왕 KPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 이 계획은 단일 에이전트 순차 실행을 기본으로 하며 하위 에이전트를 자동 생성하지 않는다.

**Goal:** 전체 멤버의 기록을 단일 연간 그래프로 합치고 GitHub식 연도 탐색, 멤버 선택, 첫 번째 운동왕 KPI를 제공한다.

**Architecture:** 기존 바닐라 TypeScript를 유지한다. 전체 멤버 목록은 인증된 페이지 단위 RPC로 조회하고 연간 기록과 분리한다. 집계는 순수 함수, 그래프·날짜 상세와 탐색 컨트롤은 각각 DOM 모듈로 분리하며 main.ts는 선택 상태와 요청 순서만 조정한다.

**Tech Stack:** TypeScript / Vite / Vitest / Playwright / PostgreSQL 17 / Supabase RPC.

**Spec:** [DESIGN.md](../../../DESIGN.md)의 Member Filter, Monthly KPI & Workout King, Aggregate Grass, Grass Grid, Date Detail, Responsive Behavior. 시안은 `docs/design/dashboard-preview.svg`.

## Global Constraints

- 전체·개인 모두 그래프 카드 하나를 표시한다.
- 선택한 달력 연도는 평년 365일·윤년 366일이며 일요일 시작이다.
- 전체 농도는 `N > 0`일 때 `min(k, 50) / min(N, 50)`, `N = 0`이면 0이다. 사진과 중복 인증은 인원 가중치가 아니다.
- 사진은 개인 그래프의 진한 녹색으로 유지하며 전체에서는 날짜 상세로 구분한다.
- 전체 멤버는 전체 기록 중 인증 이력이 있는 고유 사용자이며 연도 변경으로 줄이지 않는다.
- 운동왕은 KST 현재 월 1일부터 오늘까지 고유 운동일수 최대인 모든 멤버다. 카드명은 `운동왕 👑`, 첫 번째에 배치한다.
- 데스크톱 KPI 다섯 열, 모바일 첫 카드 전체 너비와 나머지 두 열. 개인 화면은 KPI를 숨긴다.
- 사용자 표시명·ID·메모는 textContent로 렌더한다. 유효한 주간 코드 없이 기록·멤버 목록을 반환하지 않는다.
- 시각 정의는 DESIGN.md, RPC·집계·배포 계약은 ARCHITECTURE.md에 둔다. 앱 외 스키마·전역 설정은 변경하지 않는다.
- 마일스톤 검증 후 커밋·푸시한다. 계획 작성 단계에서는 앱 구현이나 배포를 수행하지 않는다.

## Review Focus

1. 과거 연도에만 기록이 있는 사용자를 포함해 멤버 목록과 분모가 동일해야 한다(Task 1, 3).
2. 50명 초과·동일 사용자 중복 인증에서 색은 포화돼도 실제 인원과 메모는 보존해야 한다(Task 2, 3).
3. KST 월말·연말과 미래 날짜에서 현재 월 운동왕과 과거 연간 기록이 섞이지 않아야 한다(Task 2, 4).
4. 긴 이름·동명 사용자·50명 공동 운동왕을 자르거나 같은 사람으로 합치지 않아야 한다(Task 4, 5).
5. 연도 연속 클릭·코드 만료·조회 실패에서 이전 응답이나 일부 페이지가 최신 화면을 덮지 않아야 한다(Task 1, 5).

## 파일 책임

| 파일 | 역할 |
| --- | --- |
| `supabase/migrations/20261015000001_mukmuk_dashboard_paging.sql` | 인증된 멤버·연간 기록 페이지 RPC |
| `supabase/tests/dashboard_rpc_test.ts`, `scripts/test-db.sh` | 실제 DB에서 인증·페이지 누락 검증 |
| `src/types.ts`, `src/metrics.ts`, `src/api.ts` | 단일 KPI 타입, 월간 운동왕, 전체 목록과 연도 기록 조회 |
| `src/aggregate.ts`, `tests/web/aggregate.test.ts` | 전체 일별 고유 인원·사진 인원·농도 집계 |
| `src/grass-card.ts`, `src/dashboard-controls.ts` | 단일 그래프·하단 상세와 멤버·연도 탐색 DOM |
| `src/main.ts`, `src/style.css` | 상태 연결, KPI 순서, 반응형 |
| `tests/web/metrics.test.ts`, `tests/web/api.test.ts`, `tests/browser/dashboard.spec.ts` | 계산·응답 역전·실제 화면 회귀 검증 |
| `ARCHITECTURE.md`, `AGENTS.md`, `README.md` | 실제 반영한 제품 계약·5개 KPI 설명 |

### Task 1: 전체 멤버 목록과 완전한 연간 기록 조회

**Interfaces:** 새 RPC `get_dashboard_members(p_secret_code text, p_after_user_id text DEFAULT NULL, p_limit integer DEFAULT 200)` → `{user_id, username}[]`, `get_workout_logs_page(p_secret_code text, p_year integer, p_after_date date DEFAULT NULL, p_after_user_id text DEFAULT NULL, p_limit integer DEFAULT 500)` → 기존 WorkoutLog 응답. 기존 `get_workout_logs`는 호환성을 위해 유지한다. 프런트 `loadDashboard` 시그니처는 유지하며 결과에 전체 `roster: {id:string;name:string}[]`를 추가한다.

- [x] `supabase/tests/dashboard_rpc_test.ts`에 현재·과거 연도에만 있는 사용자, 동일 이름의 다른 ID, 1,001개 이상의 일별 기록, 페이지 경계, 잘못된·만료된 코드, 익명 직접 테이블 접근 차단을 검증하는 테스트를 먼저 작성한다. `scripts/test-db.sh`에 새 마이그레이션과 테스트를 순서대로 연결하고 실패를 확인한다.
- [x] 기존 RPC의 코드 정규화·만료 검사를 동일하게 적용한다. 새 함수는 `SECURITY DEFINER SET search_path = ''`, owner는 mukmuk_owner, PUBLIC 실행 권한은 회수하고 anon/authenticated에만 부여한다. 테이블 읽기 권한은 공개하지 않는다.
- [x] 멤버는 전체 workout_logs의 사용자별 최신 날짜 표시명으로 조회한다. 사용자 ID는 문자열 오름차순으로 페이지를 넘긴다. 기록은 `log_date DESC, user_id ASC` 순서이며 다음 페이지 조건은 다음과 같다.

```sql
WHERE l.log_date >= make_date(p_year, 1, 1)
  AND l.log_date < make_date(p_year + 1, 1, 1)
  AND (p_after_date IS NULL OR l.log_date < p_after_date
       OR (l.log_date = p_after_date AND l.user_id > p_after_user_id))
ORDER BY l.log_date DESC, l.user_id ASC
LIMIT least(greatest(p_limit, 1), 500)
```

연도는 1–9998, cursor는 두 값 모두 있거나 모두 없는 경우만 허용한다. 멤버 limit은 1–200이다. 중복 페이지나 앞으로 진행하지 않는 cursor는 실패로 처리한다.
- [x] `src/api.ts`에서 두 RPC를 끝까지 조회한다. 중간 페이지 실패 시 부분 결과를 완성된 데이터로 반환하지 않는다. `tests/web/api.test.ts`에서 1,001행 누락 없음·과거 전용 멤버 유지·두 번째 페이지 실패를 확인한다. 과거 연도 첫 진입에서도 현재 연도를 별도로 읽어 월간 KPI와 현재 통계를 확보한다.
- [x] `bash scripts/test-db.sh`와 `npm test -- tests/web/api.test.ts` 통과 후 관련 파일만 커밋·푸시한다.

### Task 2: 일별 합산과 운동왕 순수 집계

**Interfaces:** `src/aggregate.ts`는 `aggregateDays(logs: WorkoutLog[], memberCount: number): Map<string, {count:number;photoCount:number;opacity:number;logs:WorkoutLog[]}>`를 제공한다. `src/types.ts`의 단일 MonthlyKPIs에 `workoutKings: {id:string;name:string;days:number}[]`를 추가하고 metrics.ts의 중복 타입 선언을 제거한다.

- [x] `tests/web/aggregate.test.ts`에 아래 기준을 먼저 테스트한다. 같은 날짜·ID 중복은 한 명으로 합치고 photos는 OR, 메모는 보존한다.

```ts
expect(aggregateDays(twoMembersOnOneDay, 4).get('2026-10-15')?.opacity).toBe(.5);
expect(aggregateDays(oneMemberOnOneDay, 50).get('2026-10-15')?.opacity).toBe(.02);
expect(aggregateDays(fiftyOneMembersOnOneDay, 51).get('2026-10-15'))
  .toMatchObject({count:51, opacity:1});
expect(aggregateDays([], 0).size).toBe(0);
```

fixture는 실제 WorkoutLog 타입을 사용하며 위 변수마다 명시된 수의 고유 ID를 만든다. 사진 추가가 count와 opacity를 바꾸지 않는 assertion도 포함한다.
- [x] `tests/web/metrics.test.ts`에 단독 1위·공동 1위·빈 달·같은 ID 중복·동명 다른 ID·오늘 이후 기록 제외·KST 월말 경계를 먼저 작성한다. 예를 들어 `2026-09-30T15:00:00Z`는 10월 기록만 집계하고, 10월 1일 기준 10월 2일 기록은 제외한다.
- [x] 운동왕은 월별 memberDays 집계를 재사용한다. 날짜 prefix는 `Intl.DateTimeFormat.formatToParts()`로 YYYY-MM을 조합하며 오늘은 dayAt(now)를 사용한다. 최대값 0이면 빈 배열, 동률은 표시명 ko 정렬 후 ID로 안정 정렬한다. 표시명은 roster의 최신 값을 사용한다.
- [x] `npm test -- tests/web/aggregate.test.ts tests/web/metrics.test.ts` 통과 후 커밋·푸시한다.

### Task 3: 전체·개인 단일 그래프와 하단 상세

**Interfaces:** `src/grass-card.ts`는 `renderGrassCard({year,today,member,roster,logs,currentStats})` → `{element:HTMLElement,revealToday():void,openDate(date:string):void}`를 제공한다. `member:null`은 전체, 그 외는 해당 ID다. 현 main.ts의 키보드 동작·일자 상세를 이 모듈로 옮기고 기능을 보존한다.

- [x] Playwright fixture를 새 roster/페이지 RPC에 맞춘다. 전체 선택에서 `.workout-card` 하나와 실제 365일, 개인 선택에서 한 카드와 기존 사진 단계, 윤년 366일, 과거 기록 없는 개인의 빈 그래프를 실패 테스트로 작성한다.
- [x] 전체 셀은 빈색 위 `--aggregate-opacity`의 녹색 배경 한 레이어와 inset 테두리로 그린다. 접근 가능한 이름은 `10월 15일, 전체 20명 중 4명 운동, 사진 포함 2명`처럼 실제 인원을 포함한다. 개인은 기존 data-level 0/1/2를 유지한다.
- [x] 날짜 상세는 모든 폭에서 그래프·범례 아래에 둔다. 전체에서는 인증 멤버 이름·메모·사진 여부를 안정 정렬한다. 표시명·ID·메모는 textContent로만 렌더한다.
- [x] 0명/50명/51명, 악성 HTML, 긴 메모, 상세 열기 후 가로 위치 유지, 상세 제목 초점, Escape·닫기 후 날짜 초점, 화살표 탐색·미래 날짜 비활성을 검증한다. 미래 날짜는 오늘 이후 비활성이라는 기존 계약을 유지한다.
- [x] `npm run test:browser`와 `npm run build` 통과 후 커밋·푸시한다.

### Task 4: 운동왕 첫 카드와 반응형 KPI

**Interfaces:** `renderKPIs()`는 `MonthlyKPIs.workoutKings`를 사용한다. 첫 카드는 `.kpi-card--king`이고 일반 KPI의 뒤 순서는 현재 네 카드 그대로다.

- [x] Playwright에 첫 KPI 제목 `운동왕 👑`, 표시명·user_id·일수, 기록 없을 때 `아직 없어요`, 개인 선택 시 KPI 숨김, 과거 연도로 바꿔도 현재 월 결과 유지 assertion을 먼저 추가한다.
- [x] DOM 순서를 운동왕부터 구성한다. 공동이면 `공동 운동왕 · N명`과 각 대상 이름·ID를 생략 없이 렌더한다. 50명 공동 fixture에서도 이름을 누락하지 않고 카드 높이가 늘어나도록 한다. 사용자 ID에는 overflow-wrap:anywhere를 적용한다.
- [x] CSS는 아래 배치를 적용하되 기존 카드 토큰과 스타일을 유지한다.

```css
.kpi-section { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@media (max-width: 767px) {
  .kpi-section { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi-card--king { grid-column: 1 / -1; }
}
```

- [x] 360px에서 첫 카드 폭이 KPI 영역과 같고 나머지 네 카드가 두 열인지, 1280px에서 운동왕 x좌표가 가장 작고 다섯 카드가 같은 행인지 DOM boundingBox로 확인한다. 320px·200% 확대·긴 ID에도 페이지 전체 가로 넘침이 없어야 한다.
- [x] `npm test`와 `npm run test:browser` 통과 후 커밋·푸시한다.

### Task 5: 멤버/연도 탐색 통합 및 배포 준비

**Interfaces:** `src/dashboard-controls.ts`는 `renderDashboardControls({roster,selectedMemberId,selectedYear,onMemberChange,onYearChange})` → HTMLElement를 제공한다. main.ts는 selected/selectedYear와 요청 세대 번호를 소유한다. 새 요청마다 번호를 증가시키고 일치하는 응답만 화면에 반영한다.

- [x] Playwright로 50명 이상 버튼, 과거 연도 전용 멤버, 동명 사용자 각각 선택, 빠른 연도 변경 후 늦은 이전 응답, 코드 만료와 503 구분을 먼저 테스트한다. 503은 기록 없음으로 바꾸지 않고 재시도를 제공한다.
- [x] 데스크톱은 상단 전체 버튼·두 줄 개인 버튼·멤버 찾기, 카드 오른쪽 96px 연도 세로 탐색을 구현한다. 연도는 최근 다섯 개부터 확장한다. 모바일은 전체와 찾기 버튼 고정·개인만 스크롤, 그래프 위 네이티브 연도 선택기로 바꾼다. 숨긴 컨트롤은 키보드 순서에서도 제외한다.
- [x] 멤버 찾기는 네이티브 dialog를 사용한다. 입력 레이블·결과 없음·Escape·닫기·초점 복귀를 구현한다. 검색은 이름의 부분 일치이며 동명은 ID로 구분한다. 선택된 멤버는 상단 표시 목록에 포함한다.
- [x] 연도와 멤버를 바꿔도 다른 선택은 유지한다. 현재 연도는 렌더 후 오늘을 가운데로 드러내되 초점을 훔치지 않는다. 과거 연도는 12월 31일을 키보드 진입점으로 한다. today 버튼과 세로 상세 포커스를 회귀 검증한다.
- [x] ARCHITECTURE.md에 새 RPC·분모·집계·운동왕 계약을 기록하고 README/AGENTS의 KPI 수를 5개로 갱신한다. DESIGN.md와 실제 화면을 320·360·768·1280px 및 200% 확대에서 대조한다.
- [x] `bash scripts/test-db.sh`, `npm test`, `npm run test:browser`, `npm run build`, `git diff --check`를 실행한다. 통과한 최종 변경을 커밋·푸시하고 PR에서 DB 계약과 화면 변경을 함께 검토한다.
- [x] 구현·검증 후 새 RPC만 공용 DB의 solitary_athlete 스키마에 적용하고 인증된 호출을 확인한다. 이후 Pages 배포 워크플로우와 배포된 release.json의 source commit을 확인한다. 구형 RPC를 남겨 이전 프런트와 호환하고 실패 시 이전 Pages 커밋으로 복구한다. 실제 비밀 코드나 사용자 기록을 출력·문서화하지 않는다.

## 완료 기준과 실행 경계

설계·계획 단계의 완료는 문서/시안 검증과 커밋·푸시까지다. 후속 구현은 이 계획을 확인한 다음 단일 에이전트가 위 순서로 진행하는 방식을 권장한다. 실제 DB 마이그레이션·Pages 배포 여부는 실행 시점의 검증 결과로 별도 보고한다.


## 실행 결과 · 2026-10-15

PR #7을 `7fdb46b731a4693616ad74d677a2d89c06cd60b0`으로 병합했다. Vitest 42개, Playwright 26개, Python 19개, 실제 DB Deno 4개, Deno 타입 검사와 정적 빌드를 통과했다. 독립 코드 리뷰의 페이지 실패 테스트·두 줄 배치·만료 코드·51명 상세 지적을 보완하고 재검증했다.

새 RPC를 공용 DB에 적용하고 유효 코드 200·무효 코드 거부를 확인했다. Discord 응답 Edge를 재배포하고 무서명 401을 확인했다. 맥북 LaunchAgent 런타임을 갱신해 exit=0과 실제 현황판의 일요일 시작 헤더를 확인했다.

main Checks `38663403251`, Pages `38663403231`이 성공했다. 실서비스 release.json의 sourceCommit이 위 병합 커밋과 일치하고 실제 브라우저에서 KPI 5개·운동왕 첫 카드·단일 연간 그래프·일요일 행·모바일 연도 선택·개인 필터를 확인했다. `/잔디` 실제 공개 호출은 이번 검증에서 실행하지 않았다. 주간 시크릿 코드의 월요일 발급 일정은 유지했다.
