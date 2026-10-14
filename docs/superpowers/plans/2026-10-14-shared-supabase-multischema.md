# Supabase 공용 데이터베이스 멀티 스키마 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `player-one` Supabase 프로젝트의 DB를 3개 개인 프로젝트(`individualsavingflow`, `player_one`, `solitary_athlete`)의 공용 DB로 전환하고 기존 `player-one` 데이터를 무중단 마이그레이션한다.

**Architecture:** 3개 스키마를 생성하고 권한을 부여한 뒤, 기존 `public.profiles`/`public.items` 테이블을 `player_one` 스키마로 이전하고 `public`에 하위 호환 뷰를 생성한다. 이후 Supabase Data API(PostgREST)의 Exposed schemas에 4개 스키마를 노출한다.

**Tech Stack:** PostgreSQL, Supabase Dashboard (SQL Editor & API Settings via Orca Browser), Git

**Spec:** `docs/superpowers/specs/2026-10-14-shared-supabase-multischema-design.md`

## Global Constraints
- PostgreSQL 스키마 이름은 snake_case: `individualsavingflow`, `player_one`, `solitary_athlete`
- 기존 `profiles` 3건 데이터 유실 금지
- 기존 `public` 조회 요청이 실패하지 않도록 호환 뷰 제공
- `solitary_athlete`의 구체적인 테이블 생성은 차후 애플리케이션 구현 단계로 위임

## Review Focus
- 스키마 생성 실패 또는 오타 방지: `information_schema.schemata` 검증
- `player_one.profiles` 데이터 건수 확인 (정확히 3건 보존)
- `public.profiles` 호환 뷰 정상 조회 확인
- PostgREST Exposed schemas 설정 누락 방지

---

### Task 1: DDL 마이그레이션 실행 (Orca 브라우저 탭 SQL Editor)

**Files:**
- Create: `supabase/migrations/20261014000001_init_multischema.sql`
- Browser Tab: Supabase `player-one` SQL Editor (`https://supabase.com/dashboard/project/weryaqsufylxtngjnhbn/sql/new`)

**Interfaces:**
- Produces: `individualsavingflow`, `player_one`, `solitary_athlete` 스키마, `player_one.profiles`, `player_one.items`, `public.profiles` (view), `public.items` (view)

- [ ] **Step 1: SQL 마이그레이션 스크립트 작성**

```sql
-- 1. 스키마 생성
CREATE SCHEMA IF NOT EXISTS individualsavingflow;
CREATE SCHEMA IF NOT EXISTS player_one;
CREATE SCHEMA IF NOT EXISTS solitary_athlete;

-- 2. 스키마 USAGE 권한 부여
GRANT USAGE ON SCHEMA individualsavingflow TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA player_one TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA solitary_athlete TO anon, authenticated, service_role;

-- 3. player_one 테이블 이전 (데이터 및 RLS 유지)
ALTER TABLE public.profiles SET SCHEMA player_one;
ALTER TABLE public.items SET SCHEMA player_one;

-- 4. public 호환 뷰 생성
CREATE OR REPLACE VIEW public.profiles AS SELECT * FROM player_one.profiles;
CREATE OR REPLACE VIEW public.items AS SELECT * FROM player_one.items;

-- 5. 테이블 및 뷰 접근 권한 부여
GRANT ALL ON ALL TABLES IN SCHEMA player_one TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA player_one TO anon;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
```

- [ ] **Step 2: Orca 브라우저의 Supabase SQL Editor에서 마이그레이션 실행**

Orca 브라우저 탭(`browserPageId: 6d332046-d439-47c8-a2cf-4621ab17d756`)의 Monaco Editor에 SQL 스크립트를 입력하고 Run 실행.

- [ ] **Step 3: 스키마 및 테이블 생성/데이터 검증**

SQL 실행:
```sql
SELECT 
  (SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('individualsavingflow', 'player_one', 'solitary_athlete')) AS schema_count,
  (SELECT count(*) FROM player_one.profiles) AS player_one_profiles_count,
  (SELECT count(*) FROM public.profiles) AS public_profiles_view_count;
```
Expected: `schema_count: 3`, `player_one_profiles_count: 3`, `public_profiles_view_count: 3`.

- [ ] **Step 4: 로컬 마이그레이션 파일 저장 및 커밋**

```bash
git add supabase/migrations/20261014000001_init_multischema.sql
git commit -m "feat(db): add multischema initialization migration"
```

---

### Task 2: Supabase Data API(PostgREST) Exposed Schemas 설정 및 검증

**Files:**
- Browser Tab: Supabase `player-one` Settings -> API (`https://supabase.com/dashboard/project/weryaqsufylxtngjnhbn/settings/api`)

**Interfaces:**
- Consumes: Task 1에서 생성된 스키마들
- Produces: PostgREST `db-schemas`에 `public, player_one, individualsavingflow, solitary_athlete` 등록

- [ ] **Step 1: Settings -> API 페이지 이동**

Orca 브라우저 탭을 `https://supabase.com/dashboard/project/weryaqsufylxtngjnhbn/settings/api`로 이동.

- [ ] **Step 2: Data API Settings의 "Exposed schemas" 확인 및 갱신**

"Exposed schemas" 항목에 `player_one`, `individualsavingflow`, `solitary_athlete` 추가 저장.

- [ ] **Step 3: PostgREST 설정 반영 확인**

SQL Editor에서 `SELECT current_setting('pgrst.db_schemas', true);` 실행하여 노출된 스키마 목록에 등록되었는지 확인.

---

### Task 3: 최종 검증 및 보고

**Files:**
- `docs/superpowers/specs/2026-10-14-shared-supabase-multischema-design.md`

- [ ] **Step 1: 브라우저 및 SQL 쿼리를 통한 종합 검증 결과 수집**
- [ ] **Step 2: 작업 완료 내역 요약 보고**
