# 묵묵 · 공용 Supabase 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 병렬 위임은 사용자가 별도로 요청한 경우에만 선택한다.

**Goal:** 재생성된 서울 리전 공용 프로젝트의 `solitary_athlete`에 묵묵용 데이터 기반과 제한된 서버 연결을 준비한다.

**Architecture:** 공용 통합에서 만든 스키마를 재사용한다. 공개 일별 집계·성공 시각과 서버 전용 원본·커서·암호화된 삭제 큐를 테이블 권한과 RLS로 분리한다. 런타임은 전용 DB 역할로 연결하고 브라우저는 publishable key로 공개 테이블만 읽는다.

**Tech Stack:** Supabase Postgres, SQL migrations, psql, Supavisor transaction pooler, PostgREST.

**Spec:** [루트 DESIGN.md §5·§18](../../../DESIGN.md#18-공용-supabase-통합-설계). 공용 기반의 완료 기록은 [공용 전환 기록](../specs/2026-10-14-shared-supabase-multischema-design.md).

**상태:** 계획 작성 완료, 묵묵용 원격 변경은 미실행. 공용 통합 대기는 해소됐다. 실제 DB 적용은 계획 검토 후 기능 구현 단계에서 진행한다. 이 계획은 수집기·슬래시 처리·삭제 워커·웹 구현을 포함하지 않는다.

## Global Constraints

- 브랜드 **고독한 운동가**, 봇 **묵묵(`mukmuk`)**, 문구 **오늘도 묵묵히, 잔디 한 칸.**
- 대상 프로젝트는 `github-jinhoOps`, ref `olqdftjssrzqvcindekh`, 리전 `ap-northeast-2`다. 이전 ref `weryaqsufylxtngjnhbn`을 사용하지 않는다.
- 기존 `solitary_athlete` 스키마를 사용한다. `player_one`, `individualsavingflow`, `public`의 데이터·권한·뷰·기본 권한을 수정하지 않는다.
- 날짜는 메시지 작성 시각의 KST 날짜다. 같은 사용자·같은 날은 운동 **1일**이다. 같은 날 사진이 하나라도 있으면 `has_photo=true`다.
- 사진 파일·첨부 URL은 저장하지 않는다. 삭제 토큰은 암호문으로만 저장한다.
- 공개 SELECT만 익명 허용한다. 원본·커서·큐의 익명·일반 로그인 읽기와 모든 익명 쓰기를 거부한다.
- 앱별 이름의 service-role 키도 프로젝트 권한을 가진다. 서버에는 전용 `MUKMUK_DATABASE_URL`을 사용한다.
- 공용 마이그레이션 이력을 한 곳에서 관리한다. 연결 없이 개별 레포에서 `supabase db push`를 실행하지 않는다.
- 이 계획의 파일 경로는 구현 예정 경로다. 아직 존재하지 않는 SQL 파일·테스트를 통과했다고 보고하지 않는다. 커밋·푸시는 요청받은 경우에만 한다.

## Review Focus

- 재생성 전 연결값: ref 검증이 실패하면 다른 프로젝트에서 실행하지 않는다. Task 1의 SQL·설정 검사로 확인한다.
- 자동 노출이 만든 권한: 최종 ACL·RLS 검증이 실패하면 공개 서비스 연결을 보류한다. Task 2·3에서 확인한다.
- 역할의 PUBLIC 상속: 다른 앱 테이블·보안 정의 함수에 접근할 수 있으면 공용 담당자와 앱별 권한을 조정한다. Task 3에서 확인한다.
- 빈 결과를 성공으로 오인: 가상 집계를 넣어 익명 SELECT가 실제 한 건을 반환하고 쓰기·원본 조회는 거부되는지 Task 3에서 확인한다.
- 부분 배포·재실행: 기존 객체를 덮어쓰지 않고 변경안을 공용 이력에 한 번만 통합한다. Task 1·4에서 적용 이력과 객체 충돌을 확인한다.

---

## 파일과 경계

| 경로 | 책임 |
| --- | --- |
| `supabase/migrations/20261014000002_mukmuk_foundation.sql` | 앱 테이블·역할·RLS의 제안 변경안. 공용 이력의 다음 번호와 충돌하면 적용 전에 파일명만 조정 |
| `supabase/tests/mukmuk_foundation.sql` | 권한·RLS·가상 일별 기록 회귀 검사, 데이터는 ROLLBACK |
| `.env.example` | 빈 설정 이름 계약 유지 |
| `.env` | 새 ref의 로컬 설정·전용 연결 비밀값, Git 제외 |
| `DESIGN.md` | 확인된 적용 상태·선택 이유의 단일 기준 |

### Task 1: 새 프로젝트와 공용 이력 확인

**Files:** 기존 `supabase/migrations/20261014000001_init_multischema.sql` 읽기, `DESIGN.md` 갱신.

**Interfaces:** 입력은 새 프로젝트와 공용 배포 이력, 출력은 정확한 적용 대상·다음 마이그레이션 번호·현재 ACL 목록이다.

- [ ] **1. 대시보드 General과 Connect에서 대상 확인.** 이름 `github-jinhoOps`, ref `olqdftjssrzqvcindekh`, Seoul을 확인한다. Connect에 표시된 transaction pooler 호스트·포트를 사용한다. 리전 문자열로 호스트를 추측하지 않는다. 비밀번호·관리 연결은 로그·문서에 복사하지 않는다.
- [ ] **2. 아래 읽기 전용 SQL로 기존 객체와 역할을 조사한다.** `solitary_athlete`는 존재하고 묵묵 테이블·역할은 없어야 한다. 같은 이름 객체가 이미 있으면 삭제·CREATE OR REPLACE하지 말고 그 정의와 이번 변경안의 차이를 확인한다.

```sql
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('solitary_athlete', 'player_one', 'individualsavingflow');
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'solitary_athlete';
SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
FROM pg_roles WHERE rolname IN ('mukmuk_owner', 'mukmuk_worker');
```

다음 카탈로그 조회로 객체 소유권과 PUBLIC 상속을 확인한다. 확장 목록은 후속 삭제 작업의 구현 계획에 전달한다.

```sql
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl
FROM pg_namespace WHERE nspname = 'solitary_athlete';
SELECT version();
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('pg_cron', 'pg_net', 'supabase_vault');
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema = 'supabase_migrations';
```

- [ ] **3. 공용 변경 이력의 관리 위치와 다음 번호를 확인한다.** 현재 레포에 공용 초기 변경이 있다. 클라우드 적용 이력과 저장소 파일을 대조하며 기존 마이그레이션을 재실행하지 않는다. Cron·함수는 이 기반 계획에서 설치하지 않는다.

### Task 2: 앱 기반 변경안 작성

**Files:** Create `supabase/migrations/20261014000002_mukmuk_foundation.sql`.

**Interfaces:** 출력은 아래 5개 테이블과 `mukmuk_owner`·`mukmuk_worker`다. 수집기는 이벤트·일별 집계를 같은 트랜잭션에서 갱신하고, 후속 워커는 큐의 `status`, `lease_until`, `next_attempt_at`을 이용한다. 집계·선점 코드는 후속 기능 작업의 책임이다.

- [ ] **1. Task 3의 SQL 검증 파일을 먼저 작성하고 비운영 DB에서 실행한다.** 기반이 없으면 역할 또는 테이블 미존재로 실패해야 한다. 외부 Supabase의 다른 앱 데이터로 실패 테스트를 하지 않는다.
- [ ] **2. 아래 SQL을 변경안에 저장한다.** 역할은 충돌 시 명시적으로 실패한다. `mukmuk_worker`는 연결 계약 확인과 비밀번호 설정 전까지 NOLOGIN이다. 객체 생성과 최종 권한을 하나의 트랜잭션으로 처리한다.

```sql
BEGIN;
CREATE ROLE mukmuk_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE mukmuk_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  CONNECTION LIMIT 3;
GRANT mukmuk_owner, mukmuk_worker TO postgres;
GRANT USAGE, CREATE ON SCHEMA solitary_athlete TO mukmuk_owner;
GRANT USAGE ON SCHEMA solitary_athlete TO mukmuk_worker;
SET LOCAL ROLE mukmuk_owner;

CREATE TABLE solitary_athlete.workout_events (
  message_id text PRIMARY KEY CHECK (message_id ~ '^[0-9]+$'),
  guild_id text NOT NULL CHECK (guild_id = '1559802401802952706'),
  channel_id text NOT NULL CHECK (channel_id = '1559804769327910932'),
  user_id text NOT NULL CHECK (user_id ~ '^[0-9]+$'),
  username text NOT NULL,
  created_at timestamptz NOT NULL,
  edited_at timestamptz,
  log_date date GENERATED ALWAYS AS
    ((created_at AT TIME ZONE 'Asia/Seoul')::date) STORED,
  memo text NOT NULL,
  has_photo boolean NOT NULL DEFAULT false,
  reacted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(memo)) > 0 OR has_photo)
);
CREATE INDEX workout_events_user_date
  ON solitary_athlete.workout_events (user_id, log_date, created_at, message_id);

CREATE TABLE solitary_athlete.workout_logs (
  user_id text NOT NULL CHECK (user_id ~ '^[0-9]+$'),
  log_date date NOT NULL,
  username text NOT NULL,
  memo text NOT NULL,
  verification_count integer NOT NULL CHECK (verification_count > 0),
  has_photo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, log_date)
);
CREATE INDEX workout_logs_date_user
  ON solitary_athlete.workout_logs (log_date DESC, user_id);

CREATE TABLE solitary_athlete.sync_state (
  channel_id text PRIMARY KEY CHECK (channel_id = '1559804769327910932'),
  last_message_id text,
  last_success_at timestamptz,
  board_message_ids text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE solitary_athlete.sync_status (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_success_at timestamptz
);
CREATE TABLE solitary_athlete.reply_cleanup_jobs (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]+$'),
  application_id text NOT NULL CHECK (application_id = '1559809751603216444'),
  token_ciphertext bytea,
  token_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'scheduled', 'processing', 'done', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  delete_after timestamptz,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text,
  CHECK (delete_after IS NULL OR
    (published_at IS NOT NULL AND delete_after = published_at + interval '300 seconds')),
  CHECK (status IN ('done', 'failed') OR token_ciphertext IS NOT NULL),
  CHECK (status NOT IN ('done', 'failed') OR token_ciphertext IS NULL)
);
CREATE INDEX reply_cleanup_jobs_due
  ON solitary_athlete.reply_cleanup_jobs (delete_after, next_attempt_at)
  WHERE status IN ('scheduled', 'processing');

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workout_events', 'workout_logs', 'sync_state', 'sync_status', 'reply_cleanup_jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE solitary_athlete.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON solitary_athlete.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON solitary_athlete.%I TO mukmuk_worker', table_name);
    EXECUTE format('CREATE POLICY mukmuk_worker_access ON solitary_athlete.%I FOR ALL TO mukmuk_worker USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;
GRANT SELECT ON solitary_athlete.workout_logs, solitary_athlete.sync_status TO anon;
CREATE POLICY public_workout_read ON solitary_athlete.workout_logs
  FOR SELECT TO anon USING (true);
CREATE POLICY public_sync_read ON solitary_athlete.sync_status
  FOR SELECT TO anon USING (true);
RESET ROLE;
COMMIT;
```

`anon`의 스키마 USAGE는 공용 초기 변경이 제공한다. worker에는 소유 역할 멤버십이나 스키마 CREATE를 주지 않는다. 비밀번호·함수 배포·Cron·공용 기본 권한 변경은 위 SQL에 넣지 않는다.

- [ ] **3. 변경안을 비운영 DB에 적용한 뒤 Task 3 검증을 실행한다.** SQL 문법, 자동 노출에 따른 최종 ACL, KST 생성 날짜와 동일 날짜 PK를 확인한다. 다른 앱이 있는 클라우드에는 검증된 변경안을 공용 배포 담당 경로로 적용한다.

### Task 3: 권한과 저장 계약 검증

**Files:** Create `supabase/tests/mukmuk_foundation.sql`.

**Interfaces:** 입력은 Task 2 기반, 출력은 재사용 가능한 SQL 검증 결과다. 테스트 픽스처는 가상 ID·텍스트만 쓰며 트랜잭션을 ROLLBACK한다.

- [ ] **1. 아래 검증을 저장·실행한다.** 익명 쓰기와 원본·커서·큐 SELECT가 실제로 permission denied를 내는지 확인한다. 오류가 없는 경우 의도적으로 실패시킨다.

```sql
BEGIN;
SET LOCAL ROLE mukmuk_worker;
INSERT INTO solitary_athlete.workout_events
  (message_id, guild_id, channel_id, user_id, username, created_at, memo, has_photo)
VALUES ('1', '1559802401802952706', '1559804769327910932',
  '1', '검증용 가상 멤버', '2026-10-13T15:00:00Z', '걷기', true);
DO $$ BEGIN
  IF (SELECT log_date FROM solitary_athlete.workout_events WHERE message_id='1')
       <> date '2026-10-14' THEN RAISE EXCEPTION 'KST date mismatch'; END IF;
END $$;
INSERT INTO solitary_athlete.workout_logs
  (user_id, log_date, username, memo, verification_count, has_photo)
VALUES ('1', '2026-10-14', '검증용 가상 멤버', '걷기', 1, true);
DO $$ BEGIN
  BEGIN
    INSERT INTO solitary_athlete.workout_logs
      (user_id,log_date,username,memo,verification_count)
    VALUES ('1','2026-10-14','검증용 가상 멤버','중복',1);
    RAISE EXCEPTION 'duplicate daily row accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

SET LOCAL ROLE anon;
DO $$
DECLARE table_name text;
BEGIN
  IF (SELECT count(*) FROM solitary_athlete.workout_logs
      WHERE user_id='1' AND log_date='2026-10-14' AND has_photo) <> 1
  THEN RAISE EXCEPTION 'public read failed'; END IF;
  BEGIN
    UPDATE solitary_athlete.workout_logs SET memo='unauthorized' WHERE user_id='1';
    RAISE EXCEPTION 'anonymous write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  FOREACH table_name IN ARRAY ARRAY['workout_events','sync_state','reply_cleanup_jobs'] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM solitary_athlete.%I LIMIT 1', table_name);
      RAISE EXCEPTION 'anonymous private read accepted: %', table_name;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END $$;
RESET ROLE;
DO $$
DECLARE table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='solitary_athlete'
             AND c.relname IN ('workout_events','workout_logs','sync_state',
                              'sync_status','reply_cleanup_jobs') AND NOT c.relrowsecurity)
  THEN RAISE EXCEPTION 'RLS is disabled'; END IF;
  IF has_schema_privilege('mukmuk_worker','solitary_athlete','CREATE')
  THEN RAISE EXCEPTION 'worker has DDL privileges'; END IF;
  FOREACH table_name IN ARRAY ARRAY['workout_events','sync_state','reply_cleanup_jobs'] LOOP
    IF has_table_privilege('authenticated','solitary_athlete.' || table_name,'SELECT')
    THEN RAISE EXCEPTION 'authenticated private read granted: %', table_name; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mukmuk_worker'
             AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb))
  THEN RAISE EXCEPTION 'elevated worker role'; END IF;
END $$;
ROLLBACK;
```

Run in a nonproduction PostgreSQL environment with the standard `anon`, `authenticated`, `service_role`, `postgres` roles and the common initial schema grants already present:

```bash
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/mukmuk_foundation.sql
```

Supply connection through the execution environment or an ignored service file; no password on the command line. Expected: all blocks succeed, final ROLLBACK, no fixture remains. This test checks the storage contract; actual OR aggregation and retry logic require collector tests in the next feature plan.

- [ ] **2. 공용 프로젝트에서 다른 앱의 접근 경계를 읽기 전용으로 검사한다.** 다음 SQL이 반환한 테이블·함수는 개별 검토한다. 접근 허용이 있으면 전용 역할만으로 격리됐다고 보고하지 않는다. `PUBLIC` 권한의 일괄 회수 대신 공용 담당 경로에서 기존 앱 동작을 보존하는 변경을 먼저 준비한다.

```sql
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('player_one','individualsavingflow','public')
  AND c.relkind IN ('r','v','m','p')
  AND has_table_privilege('mukmuk_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE');
SELECT n.nspname, p.proname, p.oid::regprocedure
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('player_one','individualsavingflow','public')
  AND p.prosecdef AND has_function_privilege('mukmuk_worker',p.oid,'EXECUTE');
```

- [ ] **3. 원격 적용 전후 기존 앱의 공개 API·조회 건수를 비교한다.** 가상 테스트는 운영 데이터가 없는 별도 환경에서 수행한다. 클라우드 검증에는 위 권한 카탈로그와 기존 앱의 읽기 요청을 사용하고 데이터를 변경하지 않는다.

### Task 4: 연결 계약과 실제 API 확인

**Files:** Modify `.env.example`·`DESIGN.md`, ignored `.env` 업데이트. 공용 마이그레이션 이력에 검토된 변경안을 한 번 통합.

**Interfaces:** 브라우저는 `SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY`·schema `solitary_athlete`, 서버는 `MUKMUK_DATABASE_URL`. 원격 Secrets는 `MUKMUK_` 접두사를 유지한다.

- [ ] **1. 공용 배포 경로로 변경안을 적용하고 테이블별 API 노출을 확인한다.** 공개 대상은 `workout_logs`, `sync_status`다. 현재 UI가 제공하는 테이블별 선택에서는 서버 전용 세 테이블만 숨긴다. 기존 스키마 목록·다른 테이블·프로젝트 전체 자동 노출 설정을 변경하지 않는다. 최종 테이블 ACL·RLS를 다시 확인한다.
- [ ] **2. worker의 로그인 비밀번호를 안전하게 설정한다.** 관리자 세션에서 `\password mukmuk_worker`로 입력한 다음 다음 SQL을 실행한다. 비밀번호는 SQL 파일이나 콘솔 출력에 넣지 않는다.

```sql
ALTER ROLE mukmuk_worker LOGIN;
```

Connect에서 확인한 transaction pooler 호스트·포트와 사용자 `mukmuk_worker.olqdftjssrzqvcindekh`를 사용한다. 풀 최대 크기는 클라이언트당 1, SSL 필수, 짧은 트랜잭션, 세션 상태·서버 prepared statements 없이 연결한다. DB 역할 연결을 검증한 뒤 제한된 비밀값만 서버 실행 환경에 보관한다.

- [ ] **3. 새 publishable key로 공개 API를 읽고 권한 경계를 확인한다.** 환경변수는 실행 환경에 주입하고 verbose HTTP 로그는 사용하지 않는다.

```python
import json, os, urllib.request, urllib.error

url = os.environ['SUPABASE_URL'].rstrip('/')
assert url == 'https://olqdftjssrzqvcindekh.supabase.co'
headers = {'apikey': os.environ['SUPABASE_PUBLISHABLE_KEY'],
           'Accept-Profile': 'solitary_athlete'}
for table in ('workout_logs', 'sync_status'):
    req = urllib.request.Request(f'{url}/rest/v1/{table}?select=*&limit=1', headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        assert isinstance(json.load(response), list)
for table in ('workout_events', 'sync_state', 'reply_cleanup_jobs'):
    req = urllib.request.Request(f'{url}/rest/v1/{table}?select=*&limit=1', headers=headers)
    try:
        urllib.request.urlopen(req, timeout=10).close()
        raise AssertionError(f'private table accessible: {table}')
    except urllib.error.HTTPError as error:
        assert error.code in (401, 403, 404), error.code
print('public reads succeed; private reads denied')
```

publishable key를 JWT로 취급해 Authorization에 넣지 않는다. SQL의 쓰기 거부 검사와 HTTP의 읽기 검사는 모두 필요하다. HTTP의 404만으로 RLS가 정상이라고 판단하지 않는다.

- [ ] **4. 적용 상태와 제한을 DESIGN.md에 기록한다.** 적용된 마이그레이션 번호, 역할·권한 검사 결과, 읽기 확인 결과만 남긴다. 수집기·명령어·5분 삭제가 아직 없다는 상태를 유지한다. 함수 `mukmuk-discord-grass`, `mukmuk-discord-cleanup`과 Cron `mukmuk-cleanup-due`는 별도 기능 계획에서 배포한다.

## 되돌림과 자체 검토

적용 오류는 미커밋 트랜잭션을 ROLLBACK한다. 적용 뒤 연결을 중지해야 하면 묵묵 작업을 중단하고 worker만 NOLOGIN으로 변경한다. 인증 데이터를 삭제하거나 공용 프로젝트 키를 회전하지 않는다. 다른 앱의 스키마·공용 초기 이력을 되돌리지 않는다.

작성 시 검토: 새 ref·기존 스키마 반영, 기존 앱 변경 금지, 공개/서버 테이블 계약, 자동 노출 최종 권한, PUBLIC 상속 검사, 일별 PK·KST·사진 필드, 단일 마이그레이션 이력, 비밀값 보관 경계를 확인했다. SQL·HTTP 코드는 실행 단계에서 검증할 코드이며 현재 통과 결과가 아니다.

참고: [커스텀 스키마](https://supabase.com/docs/guides/api/using-custom-schemas), [DB 연결](https://supabase.com/docs/guides/database/connecting-to-postgres), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PUBLIC 상속 권한](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c).
