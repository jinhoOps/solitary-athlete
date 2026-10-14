# 주간 시크릿 코드 및 대시보드 v2 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디스코드 채널 전용 주간 시크릿 코드 발급·공지 및 Supabase RPC 보안 체계를 구축하고, 14일 2줄 요일별 현황판 메시지와 1년 잔디·4대 월간 KPI를 갖춘 컴팩트 웹 대시보드 v2를 구현한다.

**Architecture:** Supabase DB에 `channel_access_secrets` 및 `get_workout_logs` RPC를 추가하여 인증 없는 테이블 조회를 차단한다. `pg_cron`과 Edge Function으로 매주 월요일 00:00 KST에 코드를 발급해 Discord `#공지`에 자동 게시한다. Python 수집기의 `#잔디` 현황판은 14일 2줄 마크다운 요일 그리드로 간소화하고, 웹보드는 4개 KPI 카드, 1년 잔디, 컴팩트 탭, 시크릿 코드 인증 모달을 제공한다.

**Tech Stack:** PostgreSQL 17 (Supabase, pg_cron), Deno (Supabase Edge Functions), Python 3.13 (uv, psycopg), TypeScript / Vite / CSS (Vanilla TS), Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-14-mukmuk-weekly-secret-and-dashboard-v2-design.md`](file:///Users/jinho/orca/solitary-athlete/docs/superpowers/specs/2026-10-14-mukmuk-weekly-secret-and-dashboard-v2-design.md)

## Global Constraints

- 브랜드: **고독한 운동가**, 줄임말 **고운**, 봇 **묵묵 (`mukmuk`)**.
- 날짜 기준: 모든 일자 판정 및 월간 기준은 `Asia/Seoul` (KST).
- 시크릿 코드 유예 기간: 발급 후 정규 7일 + **24시간 유예 기간** (총 8일간 조회 허용).
- 현황판: 최근 14일(지난주 월~일 7칸, 이번주 월~일 7칸 2행), 요일 열 헤더 `월 | 화 | 수 | 목 | 금 | 토 | 일`.
- 웹 헤더: `운동기록을 챙기는 묵묵, MUKMUK · WORKOUT JOURNAL` 단일 라인, 긴 소개 슬로건 제거.
- 4대 KPI: 1. 이번 달 고운, 2. 총 운동 일수, 3. 가장 푸른 요일, 4. 1인당 평균 일수.

## Review Focus

1. **시크릿 코드 공백 및 대소문자 정규화**: 복사 시 앞뒤 공백이나 대소문자 차이로 실패하지 않도록 `trim().toLowerCase()` 처리.
2. **24시간 유예 기간 경계 검증**: 발급 7일 경과 후 24시간 이내에는 구 코드와 신규 코드가 모두 작동하고, 24시간 초과 시 구 코드는 거부.
3. **월초 빈 데이터 KPI 0 나누기 방어**: 이번 달 인증이 없을 때 `1인당 평균 일수`나 `가장 푸른 요일`에서 `NaN`, `ZeroDivisionError`, `null` 크래시 방지.
4. **14일 현황판 달력 정렬**: 지난주 월요일부터 이번주 일요일까지 요일 열과 1:1 일치, 오늘 이후 미래 칸은 ⬜ 처리.
5. **URL 쿼리 코드 은닉**: `?code=...`로 진입 시 `localStorage` 저장 후 `history.replaceState`로 주소창에서 쿼리를 즉시 제거하여 주소 복사 시 시크릿 유출 방지.

---

### Task 1: DB 시크릿 코드 테이블 및 보안 RPC 함수 마이그레이션

**Files:**
- Create: `supabase/migrations/20261014000004_mukmuk_channel_secrets.sql`
- Modify: `scripts/test-db.sh:10-25`
- Test: `supabase/tests/secrets_rpc_test.ts`

**Interfaces:**
- Produces: `solitary_athlete.channel_access_secrets` 테이블
- Produces: `solitary_athlete.get_workout_logs(p_secret_code text, p_year integer DEFAULT NULL)` RPC 함수

- [ ] **Step 1: Write the failing Deno test for secrets and RPC**

Create `supabase/tests/secrets_rpc_test.ts` testing:
- Valid secret code returns workout logs.
- Invalid secret code raises `P0001` (`invalid_or_expired_secret`).
- Expired secret code (past 24h grace period) raises error.
- Secret code within the 24h grace period succeeds.
- Direct `SELECT` on `solitary_athlete.workout_logs` by `anon` is rejected.

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:54322/postgres" deno test --allow-env --allow-net=127.0.0.1 supabase/tests/secrets_rpc_test.ts`
Expected: FAIL (table and RPC do not exist yet).

- [ ] **Step 3: Create the SQL migration**

Create `supabase/migrations/20261014000004_mukmuk_channel_secrets.sql` implementing `solitary_athlete.channel_access_secrets` and `solitary_athlete.get_workout_logs` with proper permissions.

- [ ] **Step 4: Update test-db.sh to include the new migration and run the test**

Update `scripts/test-db.sh` to apply `20261014000004_mukmuk_channel_secrets.sql` and run `secrets_rpc_test.ts`.
Run: `bash scripts/test-db.sh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261014000004_mukmuk_channel_secrets.sql supabase/tests/secrets_rpc_test.ts scripts/test-db.sh
git commit -m "feat(db): add channel access secrets table and secure workout logs RPC"
```

---

### Task 2: Discord `#잔디` 현황판 메시지 간소화 (14일 2줄 요일 그리드)

**Files:**
- Modify: `mukmuk/board.py:1-49`
- Modify: `tests/python/test_collector.py` (or create `tests/python/test_board.py`)

**Interfaces:**
- Consumes: `rows`, `now`, `dashboard_url`, `emojis`
- Produces: `build_board(rows, now, dashboard_url, emojis)` returning 14-day 2-row formatted Discord message strings.

- [ ] **Step 1: Write the failing Python test for 14-day board format**

Create or update `tests/python/test_board.py` testing:
- Title starts with `## 🌱 고운 잔디밭\n최근 14일 · 갱신 · MM.DD HH:MM KST`.
- Weekday header `월 | 화 | 수 | 목 | 금 | 토 | 일` is present.
- Exactly 2 rows of 7 emoji cells (row 1: last week Mon-Sun, row 2: this week Mon-Sun).
- Today's date and past workout dates show proper emoji (`🟩`/`<:mukmuk_grass:...>`, `🌲`/`<:mukmuk_photo:...>`, or `⬜`).
- Footer has `웹보드 · URL` and `> ⬜ 기록 없음 · :mukmuk_grass: 텍스트 · :mukmuk_photo: 사진 포함`.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/python/test_board.py -v`
Expected: FAIL (currently generates 28 days with 4 rows).

- [ ] **Step 3: Update `mukmuk/board.py`**

Modify `grass_lines` and `build_board` in `mukmuk/board.py` to calculate Monday of last week, generate the 14-day 2-line calendar grid aligned with Monday-Sunday columns, and use the new title `## 🌱 고운 잔디밭`.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/python/test_board.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mukmuk/board.py tests/python/test_board.py
git commit -m "feat(board): simplify Discord grass board to 14-day 2-row weekday grid"
```

---

### Task 3: 주간 시크릿 코드 자동 발급 및 Discord 공지 Edge Function

**Files:**
- Create: `supabase/functions/mukmuk-weekly-code/index.ts`
- Create: `supabase/functions/_shared/weekly_code.ts`
- Test: `tests/edge/weekly_code.test.ts`
- Modify: `scripts/bundle-edge.mjs:4-9`

**Interfaces:**
- Produces: `generateSecretCode(): string` (generates `mukmuk-xxxx` code)
- Produces: `rotateWeeklySecret(deps): Promise<{ code: string; messageId: string }>`

- [ ] **Step 1: Write the failing unit test for weekly code generation & rotation**

Create `tests/edge/weekly_code.test.ts` testing:
- Code generation produces readable `mukmuk-xxxx` format.
- Rotation calculates `active_until` (+7 days) and `expires_at` (+8 days / 24h grace period).
- Discord message payload sends code block and formatted URL to the notice channel.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/edge/weekly_code.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement weekly code logic and Edge Function**

Create `supabase/functions/_shared/weekly_code.ts` and `supabase/functions/mukmuk-weekly-code/index.ts`.
Update `scripts/bundle-edge.mjs` to include `mukmuk-weekly-code`.

- [ ] **Step 4: Run test and deno check to verify it passes**

Run: `npm test tests/edge/weekly_code.test.ts && deno check supabase/functions/mukmuk-weekly-code/index.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/mukmuk-weekly-code/ supabase/functions/_shared/weekly_code.ts tests/edge/weekly_code.test.ts scripts/bundle-edge.mjs
git commit -m "feat(edge): add weekly secret code generation and Discord notice dispatcher"
```

---

### Task 4: 웹 대시보드 v2 4대 월간 KPI 계산 및 API 연동

**Files:**
- Create: `src/metrics.ts`
- Modify: `src/api.ts`
- Modify: `src/types.ts`
- Test: `tests/web/metrics.test.ts`

**Interfaces:**
- Produces: `calculateMonthlyKPIs(logs: WorkoutLog[], now: Date): MonthlyKPIs`
  - `activeMembers`: number ("이번 달 고운")
  - `totalWorkoutDays`: number ("총 운동 일수")
  - `mostActiveWeekday`: string ("가장 푸른 요일", e.g. "수요일" or "-")
  - `averageDaysPerMember`: number ("1인당 평균 일수", rounded to 1 decimal)
- Produces: `loadDashboard(secretCode: string, year?: number): Promise<DashboardData>`

- [ ] **Step 1: Write the failing unit test for 4 Monthly KPIs**

Create `tests/web/metrics.test.ts` testing:
- Correct count of unique active members in the current month.
- Correct sum of total workout days in the current month across members.
- Correct most active weekday (e.g. Wednesday).
- Correct average days per member (e.g. 4.5일).
- Graceful handling of empty logs (0 members, 0 days, "-" weekday, 0.0 average).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/web/metrics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/metrics.ts` and update `src/api.ts`**

Implement `calculateMonthlyKPIs` in `src/metrics.ts`. Update `src/api.ts` to call Supabase RPC `get_workout_logs` with `secret_code`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/web/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metrics.ts src/api.ts src/types.ts tests/web/metrics.test.ts
git commit -m "feat(web): implement 4 monthly KPIs calculation and RPC data loader"
```

---

### Task 5: 웹 대시보드 v2 UI/UX 개편 (헤더 축소, 탭, KPI 카드, 1년 잔디, 비밀번호 모달)

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `src/dates.ts` (support 1-year calendar dates)
- Test: `tests/web/dates.test.ts`

**Interfaces:**
- UI components:
  - Header: single line `고독한 운동가` + `운동기록을 챙기는 묵묵, MUKMUK · WORKOUT JOURNAL`.
  - Compact member tabs: `전체 멤버` | `유저 1` | `유저 2` ...
  - Monthly KPI grid (4 cards).
  - 1-Year grass grid (365 days / 52~53 weeks) per member.
  - Secret code auth modal with input and notice copy guide.

- [ ] **Step 1: Update date calculations to support full year (365 days) and tests**

Update `src/dates.ts` and `tests/web/dates.test.ts` to generate 365-day calendar arrays and verify leap year/year boundary calculations.
Run: `npm test tests/web/dates.test.ts`
Expected: PASS.

- [ ] **Step 2: Implement UI updates in `src/main.ts` and `src/style.css`**

- Remove long slogan and intro section.
- Add compact header.
- Add secret code check (`?code=...` query param handling, `localStorage` caching, `history.replaceState`).
- Add secret code input modal for unauthorized state.
- Render 4 KPI cards at top of `전체 멤버` view.
- Hide `#남겨둔운동` timeline in `전체 멤버` view.
- Show `#남겨둔운동` timeline and 1-year grass when a specific user is selected.
- Style compact tab buttons and 4 KPI cards cleanly.

- [ ] **Step 3: Run type check, build, and tests**

Run: `npm run build && npm test`
Expected: PASS (Vite builds static assets, TypeScript passes with 0 errors, Vitest passes).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/style.css src/dates.ts tests/web/dates.test.ts
git commit -m "feat(web): revamp dashboard v2 with compact header, monthly KPIs and 1-year grass"
```

---

### Task 6: 운영 문서 갱신 및 전체 검증

**Files:**
- Modify: `docs/operations.md`
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`

- [ ] **Step 1: Update operations guide and architecture doc**

Document:
- Weekly secret code generation (`solitary_athlete.channel_access_secrets`, `pg_cron` schedule, Edge Function).
- 24-hour grace period policy.
- Simplified 14-day 2-row Discord `#잔디` board format.
- Dashboard v2 monthly KPIs and 1-year grass view.

- [ ] **Step 2: Run end-to-end verification**

Run: `npm test && npm run build && bash scripts/test-db.sh && uv run pytest`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add docs/operations.md ARCHITECTURE.md README.md
git commit -m "docs: record weekly secret code system, 14-day board and dashboard v2 architecture"
```
