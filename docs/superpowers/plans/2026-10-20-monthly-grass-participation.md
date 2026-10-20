# 함께 심은 잔디 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 월간 KPI의 총 운동 일수를 함께 심은 잔디 참여율과 직전 성공 수집 대비 %p 변동으로 교체한다.

**Architecture:** 성공 수집 트랜잭션에서 월별 현재·직전 집계만 보관한다. 시크릿 코드로 보호한 RPC가 집계를 전달하고 웹은 집계의 각 분모로 비율을 계산한다. 연간 잔디의 전체 이력 멤버 분모와 50단계 색상은 유지한다.

**Tech Stack:** PostgreSQL 17, Python Store, 바닐라 TypeScript, Vitest, Playwright, pytest.

**Spec:** 사용자 승인 대화의 월간 계산식 및 `ARCHITECTURE.md`, 시각 기준 `DESIGN.md`.

## Global Constraints

- 제품 문구는 한국어, 카드 제목은 `함께 심은 잔디`.
- 현재 KST 월만 집계하며 마지막 성공 수집일의 일자를 경과 일수로 쓴다.
- 동일 멤버·날짜는 한 칸, 사진·복수 인증은 가중하지 않는다.
- 참여율 = 고유 멤버·날짜 수 / (월간 인증 멤버 수 × 경과 일수) × 100.
- 증감 = 현재 비율 − 직전 성공 수집 비율. 인원·경과 일수 변화도 포함한다.
- 월 변경·최초 수집에는 비교값 없음. 수집 실패는 이전 집계를 유지한다.
- 새 비공개 테이블·함수는 solitary_athlete 스키마, 기존 앱의 권한·데이터는 변경하지 않는다.
- 병합은 별도 요청에 따른다. 검증 후 현재 작업 브랜치에 커밋·푸시한다.

## Review Focus

1. KST 월 경계와 자정: 이전 월과 비교하지 않고 각 수집일의 분모 사용.
2. 새 멤버·삭제: 분자뿐 아니라 해당 월 멤버 수를 다시 집계.
3. 사진·중복 인증: 참여율 변화 없음.
4. 수집 실패·동일 수집 재실행·역행 시각: 비교 기준을 잘못 전진시키지 않음.
5. 최초·오류·작은 증감: 가짜 0%나 가짜 변동 없음 표시 방지.

## Task 1: 비공개 월별 집계와 수집 연동

**Files:** `supabase/migrations/20261020000001_mukmuk_monthly_grass.sql`, `mukmuk/store.py`, `tests/python/test_participation.py`, `tests/python/test_store.py`, `scripts/test-db.sh`.

**Interfaces:** `Store.success(channel,cursor,now)`는 상태와 `capture_monthly_grass_snapshot(now)`를 같은 트랜잭션에 기록한다. `get_monthly_grass_participation(p_secret_code text,p_month date)`는 월별 현재·직전 표본을 0~1행으로 반환한다. 표본은 `collected_at`, `member_count`, `workout_days`, `elapsed_days` 및 `previous_` 접두사 필드들이다.

- [x] Store.success 뒤 집계 조회가 없는 기존 구현에서 테스트 실패를 확인한다.
- [x] KST 기준 월초~수집일까지 COUNT(DISTINCT user_id), COUNT(*)를 저장한다. 스냅샷의 이전 값은 같은 월에서 수집 시각이 전진할 때만 이동한다.
- [x] 수집 상태와 집계 갱신을 동일 트랜잭션에서 잠그고 기록한다. 익명 직접 읽기·쓰기와 capture 실행은 거부하며 조회 RPC는 코드 검증을 거친다.
- [x] 2명·3칸·14일 → 10.7142857%, 새 멤버 포함 3명·4칸·14일 → 9.5238095%, 삭제·사진·중복·빈 달·KST 월 변경·실패 롤백·권한을 검사한다.
- [x] 임시 PostgreSQL의 전체 DB/Python/Deno 회귀 검사를 통과시키고 커밋한다.

## Task 2: 웹 계산·조회·카드

**Files:** `src/grass-participation.ts`, `src/types.ts`, `src/api.ts`, `src/main.ts`, `src/style.css`, `tests/web/participation.test.ts`, `tests/web/api.test.ts`, `tests/browser/dashboard.spec.ts`.

**Interfaces:** `DashboardData.grassParticipation`은 ready(현재/직전 표본), pending(해당 월 집계 없음), unavailable(조회 실패)이다. `grassParticipationView(state)`는 카드의 `value`, `change`, `description` 문자열을 반환한다.

- [x] 기존 화면에서 함께 심은 잔디 제목·백분율이 없는 실패와 API에 집계가 없는 실패를 확인한다.
- [x] RPC는 현재 KST 월을 조회하고 과거 연도 선택과 독립시킨다. 코드 오류는 기존 재인증 흐름을 사용하며 집계 조회 실패는 다른 기록을 숨기지 않는다.
- [x] 각 표본을 자신의 인원·경과 일수로 계산한다. 값은 소수 한 자리까지 표시하고 불필요한 .0은 생략하며, 증감은 반올림 전 비율의 차이다. 0.1%p 미만의 실제 증감은 방향과 미만 표기로 보존한다.
- [x] 첫 집계는 비교 기록 없음, 집계 미생성은 수집 대기, 오류는 불러오기 실패로 표시한다. 0명인 성공 집계는 0%다.
- [x] 새 월·연도 탐색·수집 지연·빈 기록·200% 글자·모바일·페이드 회귀를 확인한다.
- [x] npm test, 타입 검사, 정적 빌드, 전체 브라우저 검사를 통과시키고 커밋한다.

## Task 3: 명세·시안·최종 리뷰·업로드

**Files:** `DESIGN.md`, `ARCHITECTURE.md`, `docs/design/dashboard-{desktop,mobile,preview}.svg`, `docs/operations.md`.

- [x] 시각 토큰·다섯 카드 순서와 관련 SVG의 제목·값·증감 행을 반영한다.
- [x] 집계 수식·수집 트랜잭션·권한·최초 수집·월 경계·배포 순서를 기록한다.
- [x] SVG 렌더와 320/360/768/1280px의 글자 확대 화면을 열어 검수한다.
- [x] 독립 코드 리뷰 후 필요한 수정·검증을 완료한다.
- [x] 검증 범위를 커밋·푸시하고 월간 KPI 전용 PR을 생성하고 배포 선행 조건을 충족한 뒤 리뷰 가능 상태로 전환한다. 실제 수행하지 않은 배포는 완료로 보고하지 않는다.


## 검증 결과

- 새 스냅샷 부재, 새 KPI 부재, 일반 4xx의 잘못된 인증 실패, 좁은 확대 카드의 불필요 소수점 표기를 각각 실패로 재현한 뒤 수정했다.
- 웹 67건, 브라우저 104건, Python 50건, Deno DB 4건 통과. TypeScript·정적 빌드·공개 설정 아티팩트 검사 통과.
- 임시 PostgreSQL 17.11 새 클러스터에 마이그레이션 적용. 501명/1002칸과 익명·일반 로그인·service-role 직접 접근 거부 확인.
- SVG 3개 XML·렌더 및 320/360/768/1280px 글자 확대 화면 확인. 디자인 YAML·문서 상대 링크·diff 공백 검사 통과.
- 독립 리뷰의 일반 4xx 인증 오분류 1건을 회귀 검사와 함께 수정했다. 추가 중요한 결함 없음.
- Orca의 로그인된 Supabase SQL Editor에서 운영 DB 마이그레이션을 적용했다. 앱 계정으로 테이블·RPC·RLS와 익명/service-role 직접 읽기 및 capture 실행 차단을 재검증했다. 인증 RPC 정상 조회와 잘못된 코드 거부를 확인했으며, 로컬 수집기 런타임 4602fd522b3125f8을 설치해 두 번의 정상 수집과 현재·직전 성공 집계를 확인했다. 실제 인증 RPC 응답의 웹 파서·참여율·증감 표시 함수 검증도 통과했다. main 병합·Pages 배포는 미수행이다.
