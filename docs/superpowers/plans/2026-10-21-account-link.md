# 묵묵 온라인 계정 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 묵묵봇 온라인 중 두 계정의 동의와 다른 관리자의 승인을 받아 한 사람의 잔디로 연결·해제하고, 과거 관측을 보존한다.

**Architecture:** Discord HTTP 수신·응답 삭제는 기존 Edge에 둔다. 로컬 Python 메인이 Gateway 접속·DB 세션 임대·계정 동작을 처리하며, 승인 적용은 수집 성공 확정과 같은 트랜잭션으로 게시한다. SQL 함수형 person_day와 버전 확인 RPC를 Discord·웹·월간 수집의 공통 입력으로 사용한다.

**Tech Stack:** Python 3.13/uv/psycopg 3, discord.py 2.x Gateway client, PostgreSQL 17, Supabase Edge/Deno/TypeScript, vanilla TypeScript/Vite/Vitest/Playwright.

**Spec:** [묵묵 계정 연결 · 승인과 집계 설계](../specs/2026-10-21-account-link-design.md)

현재 상태: 구현 전 계획. 문서 검토 후 본 세션에서 직접 순서대로 실행한다. 실제 Discord 계정 변경·원격 DB 적용·명령 등록·운영 봇 시작은 이 계획의 코드 구현과 별도 배포 단계다. 작업 기준은 `aae422d`, 작업 공간은 `/Users/jinho/orca/workspaces/solitary-athlete/mukmuk-account-link`다. 별도 대시보드 브랜치의 미병합 변경을 가져오거나 수정하지 않는다.

## Global Constraints

- 제품·문서 한국어, 코드 식별자 영어. 브랜드 고독한 운동가, 봇 묵묵.
- 원본 `workout_events.user_id`·message ID·계정별 workout_logs 유지. 소속 연결만 변경.
- 같은 사람·KST 날짜당 한 칸, 사진 OR, 메시지별 메모 순서 보존.
- 월간 N은 해당 월 인증 사람, 전체 잔디 분모는 전체 인증 이력이 있는 사람. 기존 경과 일수·50명 농도 규칙 유지.
- 두 계정 동의와 다른 관리자 승인 필수. 기존 그룹으로 자기 승인 우회 금지.
- 계정 기능만 로컬 온라인 전용. 기존 `/잔디`·`/기록갱신` Edge 동작 유지.
- 5초 tick·15초 로컬 임대·15초 동작 만료·20초 Edge 결과 확인·300초 응답 삭제.
- worker CONNECTION LIMIT 3 유지. 수집 잠금 1 + 공유 Store/로컬 1 + Edge 공유 잔여 예산.
- 과거 일별 N/S/D 불변. 현재 날짜 마지막 성공 관측만 갱신. 다른 계정/계산 버전의 전일 표본은 비교 제외.
- 신규 요청·실제 적용은 기본 비활성화. 테스트는 가상 계정과 별도 임시 DB만 사용.
- 기능 단위 검증 후 커밋·현재 작업 브랜치 푸시. main 병합·실서비스 활성화는 별도 요청 범위.

## Review Focus

- 배포 중 구버전 웹과 신규 person RPC가 섞이면 일부 수치만 사람 기준으로 바뀔 수 있음: Task 7/8에서 구버전 409와 전체 로드 재시작을 검증.
- 같은 날 연결·해제·재연결로 관측 이력이 잘못 재작성될 수 있음: Task 6에서 당일 대체와 지난 날짜 불변을 함께 검증.
- Edge 연결 획득이 만료된 뒤 늦게 SQL을 실행하거나 응답 예약 없이 업무를 시작할 수 있음: Task 4/5에서 강제 종료·예약 선행·응답 불확실성을 검증.
- 로컬 메인 소유 파일이 남거나 Gateway만 살아 있고 수집이 멈출 수 있음: Task 3에서 신선한 관리 신호·중복 진입·fallback·240초 실행 제한을 검증.
- 기록 없는 계정·이전 소속 관리자·접근 불가능한 상대 계정이 동의/승인 조건을 우회할 수 있음: Task 2/6에서 동의·그룹 동일인·권한 재검증과 0기록 분모를 검증.

## 공통 실행·기록

각 Task는 실패 테스트 작성 → 해당 실패 확인 → 최소 구현 → 해당 묶음 전체 검사 → 커밋 순서다. 실행 결과와 명세를 바꾸는 판단은 이 계획 전용 실행 ledger에 기록한다. 아래 명령은 구현 후 사용할 검증 명령이며 아직 새 기능이 통과했다는 뜻이 아니다.

기존 실행 명령:

```sh
npm test
npm run build
npm run test:browser
scripts/test-db.sh
```

## Task 1: 사람 식별과 SQL person_day

**Files:** Create `supabase/migrations/20261021000001_mukmuk_people.sql`, `tests/python/test_identity.py`; modify `scripts/test-db.sh`, `tests/python/test_store.py`.

**Interfaces:** `mukmuk_people(person_id uuid,primary_user_id text,username text)`, 버전 범위 소속 `mukmuk_person_accounts`, singleton `mukmuk_identity_state(enabled,revision,source_revision)`. `mukmuk_person_days(p_revision bigint,p_from date DEFAULT NULL,p_until date DEFAULT NULL,p_person_id uuid DEFAULT NULL)`의 반환 열은 명세 6절과 동일.

- [ ] RED: 기존 `test_participation.save`로 가상 사용자 1·2가 같은 날 각각 텍스트·사진 인증을 남긴 뒤, 연결 버전의 함수 결과가 하루 한 행·메모 둘·사진 true·메시지 수 2인지 검사한다. 함수가 없는 상태의 실패를 확인한다.

```python
rows = store.conn.execute('SELECT * FROM solitary_athlete.mukmuk_person_days(%s)', (revision,)).fetchall()
assert len(rows) == 1
assert rows[0]['verification_count'] == 2
assert rows[0]['has_photo'] is True
```

- [ ] 구현: 테이블·현재 소속 유일성·구간 비중복을 직렬 트랜잭션으로 강제한다. 기존 계정은 버전 0에서 1계정=1사람으로 준비한다. 원본 저장 trigger는 새 계정을 같은 트랜잭션에 준비하고, 실제 원본 내용 변경에만 source_revision을 올린다. 표시명은 대표 계정에서만 갱신한다. person_day 함수는 SECURITY INVOKER/STABLE·빈 search_path·worker 전용으로 만든다.
- [ ] GREEN: 날짜 `[from,until)`, 원본 재처리 불변, 사진 제거, 소속 누락 거부, 기록 없는 사람, 역대 소속 구간, anon/authenticated/service_role 거부를 실제 SQL로 검사한다. fixture가 새 테이블도 초기화하도록 하고 `scripts/test-db.sh`의 전체 Python·DB 검사를 통과시킨다.
- [ ] Commit: `feat: add canonical person identity and workout-day projection`.

## Task 2: 요청·동의·관리자 검토 상태 전이

**Files:** Create `supabase/migrations/20261021000002_mukmuk_account_workflow.sql`, `mukmuk/accounts.py`, `tests/python/test_accounts.py`.

**Interfaces:** `AccountService(store,api,settings).handle(action:dict,deadline:float)->dict`; action은 `interaction_id,actor_id,kind,target_id,request_id,version,payload`를 가진다. 결과는 `content,components` 또는 비식별 error_code다. 사용자 소속·권한 검증은 기존 `base_permissions`를 재사용한다.

- [ ] RED: 신청→상대 동의→다른 관리자 승인까지 처리한 결과 상태를 실제 DB에서 검사한다. 상대 아닌 계정의 동의와 본인/같은 사람 관리자의 승인은 상태를 바꾸지 못해야 한다.

```python
assert request['status'] == 'awaiting_consent'
assert after_consent['status'] == 'pending_review'
assert after_other_manager['status'] == 'approved'
```

- [ ] 구현: 요청/동작 테이블과 ID 유일성, 7일 만료, 계정별 진행 요청 1개, 내용/상태 버전, 조건부 전이를 만든다. 대표 계정의 추가 연결만 허용하고 두 그룹 합병·대표 교체를 거부한다. 해제는 대표 또는 떼어낼 계정의 요청으로 시작한다. 승인 미리보기는 중첩 트랜잭션을 강제 롤백해 Task 1 함수를 재사용한다. 승인 시 source_revision·소속·요청 버전과 검토자를 확인한다.
- [ ] GREEN: 0기록 계정, 봇·다른 서버·그룹 자기 승인, 권한 상실, 429/5xx 보류, stale 미리보기, 두 관리자 동시 승인/취소, 중복 interaction, 해제, 미리보기 예외의 롤백을 검증한다. 실제 Discord HTTP 경계만 가상 응답으로 대체한다.
- [ ] Commit: `feat: implement consent and independent account-link review`.

## Task 3: 로컬 메인·온라인 임대·연결 예산

**Files:** Create `mukmuk/local_bot.py`, `mukmuk/local_runtime.py`, `mukmuk/db_session.py`, `tests/python/test_local_runtime.py`, `tests/python/test_connection_budget.py`; modify `mukmuk/store.py`, `scripts/macos_sync.py`, `pyproject.toml`, `uv.lock`, `.env.example`.

**Interfaces:** `SharedDB(url).session()`은 공유 Store의 참조를 빌리고, Store의 `transaction()`은 RLock으로 전체 트랜잭션을 직렬화한다. `LocalRuntime.tick(ready:bool)`는 임대 갱신·현재 세션 동작 1건 선점/처리를 수행한다. 실행: `uv run python -m mukmuk.local_bot`.

- [ ] RED: 살아 있는 임대가 있으면 두 번째 실행은 선점하지 못하고, 임대 만료 후 새 fence의 이전 실행은 갱신·처리를 못함을 실제 DB로 검증한다. 동작 만료 15초와 업무 상태 미변경도 확인한다.

```python
assert stale_result['status'] == 'expired'
assert stale_result['request_id'] is None
assert final_request_count == 0
```

- [ ] 구현: DB runtime 세션과 동작 전달 상태를 추가하고 DB 서버 시각을 사용한다. discord.py의 READY/RESUMED/disconnect 상태와 DB readiness를 연결한다. Gateway 이벤트 루프에서 동기 수집/SQL을 실행하지 않는다. 임대 갱신·원본 Store 트랜잭션은 공유 세션에서 직렬화한다. 메인은 수집을 5분마다 직접 실행하고 launchd는 신선한 소유 신호가 있을 때 DB 전에 건너뛴다. 메인 중단/소유 신호 만료는 기존 수집으로 복귀한다. 수집 전역 lock은 기존 전용 연결을 유지하고 240초 제한을 보존한다.
- [ ] GREEN: 무효 Gateway 상태·끊김·DB 장애·중복 실행·세션 변경·만료 전달·오래된 파일·종료/복귀를 검증한다. 잠금+Store+tick이 세 번째 Python 연결을 열지 않으며 HTTP 대기 중 트랜잭션을 잡지 않는지 실제 연결 계수와 스케줄러 경계로 확인한다. 원본 재검증은 기존 권한 범위 유지.
- [ ] Commit: `feat: run online-gated account actions in the local bot`.

## Task 4: Edge의 짧은 DB 작업과 연결 포화 처리

**Files:** Create `supabase/functions/_shared/short-db.ts`, `tests/edge/db-lifetime.test.ts`; modify `supabase/functions/_shared/db.ts`, `supabase/functions/mukmuk-discord-photos/index.ts`, 각 Edge entrypoint의 DB 생성 위치.

**Interfaces:** `withShortDB<T>(url:string,work:(sql:Sql)=>Promise<T>,options?:{deadline?:number;testOnlyNoTLS?:boolean}):Promise<T>`; 각 호출은 독립 client/reserve/finally-end 수명. 비밀값이나 query/parameters를 에러에 넣지 않는다.

- [ ] RED: 연결 획득 중 만료되면 client를 종료하고 callback이 나중에 실행되지 않는지, SQLSTATE 53300 재시도가 성공해도 업무 callback은 한 번만 실행되는지 검사한다. driver 경계만 가상화한다.

```typescript
expect(result).toEqual({accepted:true});
expect(committedActions).toBe(1);
expect(openConnectionsAfterWait).toBe(0);
```

- [ ] 구현: acquire reserve와 업무 SQL을 분리한다. 100/200/400/800ms+jitter, 최대 4회 재시도·총 2.5초·남은 deadline 중 작은 상한. 만료 시 end({timeout:0})를 기다린다. 각 DB 메서드의 SQL 범위를 닫고 HTTP·sleep은 바깥으로 옮긴다. 업무 실행 후 불명확한 COMMIT은 재시도하지 않는다. 기존 code 예약 lock·삭제 임대·TLS 검증은 유지한다.
- [ ] GREEN: 정상·예외·만료·포화·종료 중 후속 SQL 차단을 검증한다. 실제 임시 DB에서 응답/삭제와 원본 수집을 겹쳐 전체 순환·누락·중복을 확인한다. `npm test`와 `scripts/test-db.sh`를 실행한다.
- [ ] Commit: `fix: bound worker database connections across edge operations`.

## Task 5: 서명된 계정 명령·버튼·응답

**Files:** Create `supabase/functions/_shared/account-links.ts`, `tests/edge/account-links.test.ts`; modify `_shared/interactions.ts`, `_shared/db.ts`, `mukmuk-discord-grass/index.ts`, `register_cmd.py`, 기존 interactions tests.

**Interfaces:** account route는 기존 서명/앱/서버 검사 뒤 type 2/3/5를 처리한다. `ReplyContent={content:string,components?:ReplyActionRow[]}`, `publishReply.render():Promise<string|ReplyContent>`는 기존 문자열 API와 호환된다. DB adapter는 세션-bound action 전달·결과 조회를 제공한다.

- [ ] RED: 실제 Ed25519 서명의 신청·동의 버튼은 `{type:5,data:{flags:64}}`를 반환하고 클릭 ID로 독립 삭제 예약을 만드는지 검사한다. 다른 서버·위조 서명은 전달 행을 만들지 않아야 한다.

```typescript
expect(await response.json()).toEqual({type:5,data:{flags:64}});
expect(parentDeleteAfter).toBe(originalDeleteAfter);
expect(clickDeleteAfter).toBe(clickPublishedAt + 300_000);
```

- [ ] 구현: `/계정연결` 신청/현황/취소/해제와 `/계정검토` 목록/상세를 등록한다. 담당 모달 열기만 type 9, 제출은 새 type 5. 서버 생성 버튼의 action/request/state version을 제한한다. 응답 예약 준비 후에만 동작을 전달하고, 온라인·세션·권한·15초 TTL을 재검사한다. 결과 조회는 최대 20초, DB 사이 sleep에는 연결이 없다. 오프라인/권한/혼잡 안내에 자동 삭제를 거짓 약속하지 않는다.
- [ ] GREEN: 오프라인·만료·재시작·중복 클릭·stale 버튼·모달·부모 메시지 삭제·예약 실패·업무 완료 후 응답 오류·allowed_mentions와 사용자 텍스트 안전성을 검증한다. 기존 `/잔디`·`/기록갱신` 전체 테스트도 통과시킨다.
- [ ] Commit: `feat: expose online account consent and review commands`.

## Task 6: 승인 적용과 관측 버전의 원자적 확정

**Files:** Create `supabase/migrations/20261021000003_mukmuk_identity_snapshots.sql`, `tests/python/test_identity_participation.py`; modify `mukmuk/accounts.py`, `mukmuk/store.py`, `mukmuk/sync.py`, 기존 participation tests.

**Interfaces:** `Store.success(...,account_context=None)` 기본 경로는 원본 수집만 수행한다. 로컬 문맥은 현재 runtime session/fence·권한 재검증 결과를 가진다. `capture_monthly_grass_snapshot`과 참여율 RPC는 current/previous 각각 identity_revision/calculation_version을 포함한다.

- [ ] RED: 월 경과 10일에 두 계정 합계 5칸·중복 1칸이 연결 후 N=1/S=4/40%가 되고, 전날 원래 N/S/D는 바뀌지 않는지 실제 SQL로 검사한다.

```python
assert (current['member_count'], current['workout_days'], current['elapsed_days']) == (1,4,10)
assert yesterday_after == yesterday_before
assert current['identity_revision'] != previous['identity_revision']
```

- [ ] 구현: 성공 시각의 동일/역행 guard 후 로컬 문맥·현재 권한·구성을 확인한다. 소속 변경·revision·현재 월 표본·당일 이력·수집 커서/성공 시각·요청 완료·감사를 한 transaction에 확정한다. 기존 표본은 revision 0/calculation 1 메타데이터만 붙인다. 캡처는 Task 1 함수를 사용한다. 새/해제 관계에 따른 현재 조회를 재계산하며 지난 날짜는 쓰지 않는다. DB 커밋 뒤 현황판을 게시하고 게시 실패는 관측·재시도한다.
- [ ] GREEN: 같은 날 연결/해제/재연결, N=0·기록 없는 부계정, 월초·윤일·수집 공백, 원본 수정/삭제, stale 시각/임대/권한, DB 오류 주입 전체 rollback, GitHub 실행의 승인 적용 0건, 현황판 오류 후 DB 완료 보존을 검사한다.
- [ ] Commit: `feat: publish linked-person snapshots atomically without rewriting history`.

## Task 7: 코드 검증된 person RPC와 사진 작성자 경계

**Files:** Create `supabase/migrations/20261021000004_mukmuk_person_dashboard.sql`, `supabase/tests/person_dashboard_rpc_test.ts`; modify `_shared/photos.ts`, `mukmuk-discord-photos/index.ts`, `_shared/db.ts`, 관련 tests.

**Interfaces:** `get_dashboard_identity(p_secret_code)`→enabled/revision/calculation_version. v2 `get_person_workout_logs_page`, `get_dashboard_people`, `get_person_grass_participation`는 `p_revision`을 받고 명세 9절의 최신 버전을 요구한다. person 로그의 식별 필드는 `person_id`; 원본 `user_id`로 위장하지 않는다. person 사진 요청은 `person_id,date,revision,after`.

- [ ] RED: 유효 코드로 500행 이후도 이어 읽고 조회 중 revision 변경 시 전용 오류를 받는지 검사한다. 다른 사람 사진과 원본 author 불일치를 거부한다.

```typescript
expect(allDays.length).toBe(501);
expect(await revisedRequest()).toMatchObject({error:'identity_revision_changed'});
expect(photos[0].original).toBe('https://discord.com/channels/1/2/100');
```

마지막 사진 원문 경로는 테스트의 가상 guild/channel/message ID로 구성하고 실제 Discord 정보를 쓰지 않는다.

- [ ] 구현: v2 RPC는 코드 검증 후 현재 버전·범위·진행 cursor를 검사하고 helper 함수 결과를 반환한다. 사진은 서버가 소속 원본 이벤트를 찾고 각 원본 user ID와 Discord author.id를 대조한다. 캐시 키·응답에 revision을 포함한다. 활성화 전에는 기존 경로가 유지되고 최초 실제 연결 후에는 구버전 필수/참여율/사진 경로 모두 HTTP409 client_update_required를 반환한다. 슬래시 `/잔디`도 대상 원본 ID를 현재 person으로 해석한다.
- [ ] GREEN: bad/expired code, 다른 사람/서버·원본 author, 501행·소속 변경·월/연도 경계, 0기록·whole-history 분모, 구버전의 부분 성공 혼합 방지, 사진 요청 0건 초기 화면과 기존 지연 로딩을 검증한다.
- [ ] Commit: `feat: serve consistent person dashboards and original-author photos`.

## Task 8: 웹 식별 모델·전일 비교·조회 재시작

**Files:** Create `src/identity.ts`; modify `src/types.ts`, `src/api.ts`, `src/metrics.ts`, `src/aggregate.ts`, `src/main.ts`, `src/grass-card.ts`, `src/photo-view.ts`, `src/grass-participation.ts`, web/browser tests.

**Interfaces:** UI 식별 모델은 `WorkoutSubject={kind:'discord'|'person',id:string}`로 raw ID와 person UUID를 구분한다. legacy DTO를 화면 모델로 변환하는 경계와 person DTO 경계를 분리한다. 렌더링·필터·통계는 subject.id, 사진 요청은 subject.kind에 맞는 명시적 필드를 사용한다. raw author ID를 person ID로 치환하지 않는다.

- [ ] RED: 서로 다른 버전의 표본에서 증감/화살표를 표시하지 않으며, 같은 버전의 정확한 전날일 때 기존 계산으로 복구하는지 검사한다.

```typescript
expect(view.change).toBe('계정 변경으로 비교 제외');
expect(view.value).toBe('40%');
expect(reloadedDashboard.identityRevision).toBe(2);
```

- [ ] 구현: context 조회에서 활성화된 경우만 v2 경로를 선택하고 roster/연간/현재월/스트릭 연장/참여율/사진에 동일 버전을 전달한다. revision 변경 오류이면 전체 결과를 폐기하고 2회까지만 다시 조회한다. 구버전 갱신 필요·코드 만료·조회 실패·비교 제외를 구분한다. 다음날 같은 버전이면 전일 비교를 재개한다. 기존 화면 레이아웃과 텍스트 안전성·포커스 복귀를 보존한다.
- [ ] GREEN: 활성화 전 legacy parity, 두 계정 하루 한 칸·사진 OR·운동왕 동률, 전체 이력 분모, roster 없는 0기록 계정, 200% 텍스트·모바일, 늦은 페이지/사진 응답·revision 변경·재시도 상한·캐시 폐기를 검증한다. `npm test`, `npm run build`, `npm run test:browser` 실행.
- [ ] Commit: `feat: render linked-person grass with revision-safe comparisons`.

## Task 9: 운영 안내·전체 검증·검토

**Files:** Modify `ARCHITECTURE.md`, `docs/operations.md`, `.env.example`, `scripts/install_macos_scheduler.py`, `.github/workflows/checks.yml`, Task 1~8 결과 파일.

- [ ] 런타임 설치기는 새 Python 소스·잠금 파일을 포함하고 로컬 메인 시작/중단·정기 수집 fallback·기본 비활성 설정·DB 순서·버전 전환·복구 절차를 실제 구현과 일치시킨다. 명령 등록·운영 활성화 전 필요한 설정을 쓰되 비밀값은 기록하지 않는다.
- [ ] 실행: `npm test`, `npm run build`, `npm run test:browser`, `scripts/test-db.sh`, CI의 Edge entrypoint `deno check`. 연결 제한 3의 동시 실행과 요청 전후 불변량은 disposable DB에서 확인한다. 실제 pooler와 운영 데이터 검증은 배포 전 확인 항목으로 남기며 수행하지 않은 것을 통과로 보고하지 않는다.
- [ ] 기능 전체 diff·명세·ledger를 대상으로 최종 검토한다. Critical/Important는 회귀 테스트 RED→GREEN과 관련 전체 검사로 수정한다. 신규 기능이 비활성화된 기본 실행, 원본 보존, 과거 관측, 권한·서명·연결 예산을 다시 확인한다.
- [ ] 검증한 브랜치를 커밋·푸시하고 변경/검증/남은 배포 단계를 보고한다. 사용자가 요청하지 않은 main 병합이나 계정 연결 활성화는 수행하지 않는다.
