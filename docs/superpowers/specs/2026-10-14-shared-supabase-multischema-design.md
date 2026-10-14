# Supabase 공용 데이터베이스 멀티 스키마 전환 설계

- 작성일: 2026-10-14
- 대상 프로젝트: Supabase `github-jinhoOps` (Region: `ap-northeast-2`, Project ref: `olqdftjssrzqvcindekh`)
- 상태: **서울 리전 재생성 및 마이그레이션 완료**

## 1. 배경 및 목적

Supabase Free 플랜의 활성 프로젝트 수 제한(최대 2개) 및 개인 프로젝트 통합 관리를 위해, 기존 `player-one` 프로젝트의 PostgreSQL 데이터베이스를 3개 개인 프로젝트의 공용 데이터베이스로 전환한다.

### 대상 프로젝트 및 스키마
1. `individualsavingflow`: 개인 저축 흐름 관리 프로젝트용 스키마 (초기 빈 상태로 생성)
2. `player_one`: 캐릭터/아이템 프로필 관리 프로젝트용 스키마 (기존 `public` 테이블 이전)
3. `solitary_athlete`: 고독한 운동가 프로젝트용 스키마 (초기 빈 상태로 생성, 테이블은 향후 기능 구현 시 생성)

## 2. 변경 상세

### 2.1 스키마 생성 및 권한 부여
```sql
CREATE SCHEMA IF NOT EXISTS individualsavingflow;
CREATE SCHEMA IF NOT EXISTS player_one;
CREATE SCHEMA IF NOT EXISTS solitary_athlete;

-- PostgREST 및 Supabase 역할 기본 USAGE 권한 부여
GRANT USAGE ON SCHEMA individualsavingflow TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA player_one TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA solitary_athlete TO anon, authenticated, service_role;
```

### 2.2 `player_one` 테이블 이전 및 하위 호환성 뷰
기존 `public` 스키마에 있던 테이블을 `player_one` 스키마로 이전하되, 기존 배포된 클라이언트의 조회 호환성을 위해 `public`에 뷰를 구성한다.

```sql
-- 1) 테이블 스키마 이전 (데이터 및 RLS 정책 보존)
ALTER TABLE public.profiles SET SCHEMA player_one;
ALTER TABLE public.items SET SCHEMA player_one;

-- 2) public 호환 뷰 생성
CREATE OR REPLACE VIEW public.profiles AS SELECT * FROM player_one.profiles;
CREATE OR REPLACE VIEW public.items AS SELECT * FROM player_one.items;

-- 3) 권한 승계
GRANT ALL ON ALL TABLES IN SCHEMA player_one TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA player_one TO anon;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
```

### 2.3 Supabase Data API(PostgREST) Exposed Schemas 설정
Supabase 웹 콘솔(Settings → API) 또는 PostgREST 설정을 통해 외부 API 및 Supabase JS 클라이언트가 각 스키마에 접근할 수 있도록 Exposed schemas를 지정한다.
- 설정 대상: `public, player_one, individualsavingflow, solitary_athlete`

### 2.4 `solitary_athlete` 스키마 테이블 생성 정책
- `solitary-athlete` 프로젝트의 구체적인 테이블(`workout_events`, `workout_logs`, `sync_state`, `reply_cleanup_jobs`) 및 RLS 정책은 실제 애플리케이션 및 수집기 코드를 작성하는 구현 단계에서 `supabase/migrations/`로 관리하며 생성한다.

## 3. 검증 계획

1. **스키마 생성 확인**:
   `information_schema.schemata`에서 `individualsavingflow`, `player_one`, `solitary_athlete` 존재 확인.
2. **player_one 테이블 데이터 확인**:
   `SELECT count(*) FROM player_one.profiles;` (기존 데이터 3건 보존 확인)
   `SELECT count(*) FROM player_one.items;` (기존 테이블 구조 보존 확인)
3. **public 뷰 호환성 확인**:
   `SELECT count(*) FROM public.profiles;` (3건 반환 확인)
4. **Data API 노출 상태 확인**:
   대시보드 API 설정의 Exposed schemas 확인.
