# Discord 수집기 Go 서비스 분리 범위와 전환 계획

상태: 구현·2026-11-02 로컬 컨테이너 운영 전환 완료. 실제 실행과 검증 이력은 운영 안내를 따른다.
작성일: 2026-11-02. 조사 기준: main `d2dda54`.

## 1. 목표와 결정 범위

현재 Discord 수집을 Go 서비스로 분리해 웹보드·묵묵봇과 별도로 실행·배포·복구할 수 있게 한다. 메인앱은 저장된 기록을 기존의 인증된 조회 계약으로 읽는다. Go로 바꾸는 목적은 실행 단위와 장애 범위를 분리하는 것이며, 처리량 향상을 측정 없이 보장하지 않는다.

사용자는 1차 범위를 **현재 Discord 수집기의 독립 서비스화**로 선택했다. 이번 경험을 바탕으로 다른 앱용 공용 수집 플랫폼과 여러 Discord 서버·채널 운영은 **별도 프로젝트**로 준비한다. 이번 작업에서 범용 플러그인, 테넌트 모델, 다른 수집원용 이벤트 스키마를 선행 구현하지 않는다.

이 문서는 분리 경계·조회 계약·전환 순서까지 제시한다. 작업별 코드와 명령을 담는 실행 계획은 이 설계 검토 후 작성한다. 새 서비스 배포 위치는 기존 로컬 환경을 첫 대상으로 하며, 호스팅 업체 선정이나 유료 자원 생성은 포함하지 않는다.

## 2. 현재 구현에서 확인한 결합

| 현재 위치 | 실제 책임 | 분리에 미치는 영향 |
| --- | --- | --- |
| `main.py` | 1회 수집·사진 메타데이터 보완 실행, 잠금 획득 | 로컬·Actions 진입점 모두 교체 필요 |
| `mukmuk/sync.py` | 메시지 페이지네이션·해석·저장·기록갱신·리액션·완료 처리·현황판 게시 | 함수 하나를 그대로 Go로 옮기면 봇까지 함께 이전됨 |
| `mukmuk/store.py` | 이벤트/일별 집계 원자 저장, 갱신 큐, 커서, 관측값, 현황판 상태 | 수집 저장와 계정/표시 기능의 DB 경계를 먼저 구분해야 함 |
| `mukmuk/local_bot.py` | Gateway 접속, 5초 계정 처리, 300초 수집, 종료 제어 | Python 메인이 현재 수집 스케줄러이기도 함 |
| `mukmuk/accounts.py` | 동의·승인·관계 변경, 현재 세션 검증 | 적용이 `Store.success()`의 트랜잭션 안에 있음 |
| `mukmuk/scheduler.py` | 수집 동안 별도 트랜잭션 advisory lock 연결 유지 | 독립 프로세스를 단순 추가하면 DB 연결 예산 초과 가능 |
| `mukmuk/db_session.py` | Python 두 스레드가 데이터 연결 1개 공유 | 프로세스 분리 후에는 이 공유 효과가 사라짐 |
| `scripts/macos_sync.py`, `scripts/install_macos_scheduler.py` | 로컬 소유 신호, 5분 fallback, 불변 런타임 설치 | 파일 소유 신호는 원격 실행 간 중복 방지에 사용할 수 없음 |
| `.github/workflows/sync.yml` | 매일 06:00 KST Python 보완 수집 | Go와 Python 양쪽에서 동시에 쓰지 않도록 전환 필요 |
| `src/api.ts`, `src/identity.ts` | Supabase RPC 페이지 조회, revision 확인·재시도, 브라우저 KPI 계산 | 수집기를 직접 호출하지 않으므로 기존 조회 경로 유지 가능 |
| `supabase/functions/_shared/db.ts` | `/잔디` 조회, 갱신 요청 enqueue, 계정 inbox | 조회와 요청 수신은 Edge에 유지 |
| `supabase/functions/mukmuk-discord-photos/index.ts` | 인증된 사진 조회, 만료된 첨부 참조 정리 | 기존의 제한된 메타데이터 변경 경로는 유지; 원본 단독 작성자 원칙의 명시적 예외 |

운영 기능 on/off나 현재 연결 관계는 이번 조사에서 조회·변경하지 않았다. 과거 요약의 비활성 상태를 현재 상태로 가정하지 않는다.

## 3. 대안과 추천

| 안 | 장점 | 비용·한계 | 판단 |
| --- | --- | --- | --- |
| Go 수집 서비스 + 기존 Supabase 조회 유지 | 독립 실행·배포 가능, 웹의 인증·사진·집계 계약 유지 | 동일 DB 계약과 버전 호환을 관리해야 함 | **추천** |
| Go 수집·조회 HTTP API + 별도 DB | 저장소까지 완전한 서비스 경계 | 웹·Edge·사진·계정·코드 검증 이전과 데이터 이관 필요 | 이번 범위보다 큼 |
| Python 메인이 Go 실행 파일만 호출 | 초기 이식량 작음 | 수집 생명주기가 메인앱에 남아 독립 서비스 목표 미달 | 비교·검증 중에만 사용 가능 |

추천안은 **실행·배포 분리이며 DB까지 독립시키는 안은 아니다.** 조회 가능 여부가 Go 서비스의 생존 여부에 의존하지 않게 한다. 별도 REST 조회 API를 형식적으로 하나 더 만들지 않고, 이미 있는 PostgREST RPC를 서비스의 읽기 계약으로 사용한다.

## 4. 책임 경계

### Go로 이동

- Discord REST 메시지 수집, 100건 단위 페이지네이션, snowflake 순서와 재시작 커서.
- 현재 채널의 길드 검증, 일반 사용자 메시지 판정, KST 날짜, 사진 판정과 첨부 메타데이터.
- `workout_events`와 영향받는 `workout_logs`의 원자 저장·재집계.
- 명시적 `/기록갱신` 작업의 claim·권한 재검증·원본 조회·진행률·재시도.
- ✅/사진 리액션, 저장 후 확인 표시, 실패 시 재처리.
- 사진 메타데이터 backfill 전용 실행 모드. 사진 파일이나 CDN URL은 영구 저장하지 않음.
- 수집 주기, 시간 예산, 중복 실행 방지, 성공 커서·현재 관측값 확정, 실행 상태 관측.

### Python·Edge·웹에 유지

- Python: Gateway, 로컬 온라인 판정, 계정 신청·동의·승인·해제·관계 적용, 현황판 문구/PNG 생성·게시.
- Edge: 서명 검증, `/잔디` 응답, `/기록갱신` enqueue, 계정 버튼/메뉴, 300초 응답 삭제, 월간 코드, 선택 사진 조회.
- Postgres: `mukmuk_person_days`, 사람 소속/변경 이력, 날짜·월간 관측, 코드 검증, 공개 RPC와 RLS.
- 웹: 기존 TypeScript 조회와 UI, 월간 KPI 계산, revision 불일치 재조회, 사진 지연 로딩.

계정·관측 계산 SQL을 Go와 Python에 각각 재구현하지 않는다. Go의 패키지 경계는 Discord 클라이언트, 수집 실행, 저장소, 기록갱신, 리액션으로 충분하다.

## 5. 메인앱 조회 계약

데이터 흐름은 `Discord → Go → solitary_athlete의 원본·일별 집계 → 기존 RPC/Edge → 웹·봇`이다. Go가 중단돼도 마지막으로 저장된 데이터는 조회할 수 있고, 최신성은 따로 표시한다.

| 소비자 | 유지할 인터페이스 | 계약 |
| --- | --- | --- |
| 웹 초기 조회 | `get_dashboard_identity(p_secret_code)` | enabled/revision/calculation_version; revision>0에서 raw 방식으로 복귀 금지 |
| 웹 연간 잔디·메모 | `get_person_workout_logs_page(...)` | 코드 검증, revision 고정, 날짜 내림차순·person_id 오름차순, 끝까지 페이지 조회 |
| 웹 멤버 | `get_dashboard_people(...)` | 같은 revision, 모든 인증 이력 멤버 페이지 조회 |
| 웹 함께 심은 잔디 | `get_person_grass_participation(...)` | 월간 N/S/D와 실제 관측 revision·계산 버전 보존 |
| 웹 수집 최신성 | `sync_status.last_success_at` | 수집 완료 시각; 현황판 게시 성공으로 대체하지 않음 |
| Discord `/잔디` | Edge `createDB().daily()` | 사람 단위 일별 조회와 기존 출력·삭제 계약 유지 |
| 사진 | 기존 `mukmuk-discord-photos` | 코드+person+날짜+revision, 원본 작성자 확인, 선택 시에만 요청 |
| `/기록갱신` | `enqueue_workout_refresh` 및 기존 작업 조회 | 새 공개 쓰기 API 없이 같은 큐를 Go가 처리 |

이전 raw RPC는 현재 구현의 허용 조건에서만 유지한다. 새 consumer가 raw RPC를 우회 경로로 사용하지 않는다. 브라우저에는 봇 토큰·DB 접속 문자열·서비스 운영 API 키를 전달하지 않는다. 공개 런타임 상태는 서버 전용 run/lease 테이블을 그대로 노출하지 않는다.

연간 잔디와 월간 KPI의 기간 구분, 전체 멤버 분모의 현행 의미는 이 작업에서 바꾸지 않는다. 멤버 조회 범위를 특정 연도로 축소하지 않는다. 조회 오류를 빈 기록으로 바꾸지 않는다.

현재 RPC들은 identity revision을 고정하지만 동일 revision 내 여러 수집 트랜잭션을 하나의 읽기 snapshot으로 고정하지는 않는다. 완전한 시점 일관성 API 신설은 이번 분리의 보장에 포함하지 않는다.

## 6. 가장 중요한 변경: 수집 완료와 계정 적용 분리

### 현재와 달라지는 점

현재 `Store.success()`는 계정 적용, 통계 관측, 커서·성공 시각을 같은 트랜잭션에서 확정한다. Go에 Python 함수를 원격 호출해 같은 트랜잭션인 것처럼 다루지 않는다.

제안은 **수집 완료 확정**과 **완료 후 계정 적용 확정**을 나누는 것이다. 두 확정 사이에는 짧게 기존 사람 구성이 보일 수 있다. 이 변경은 구현 전 설계 검토 대상이며, 현재와 동일한 원자성이라고 설명하지 않는다.

1. Go는 원본 처리가 끝나면 전역 `mukmuk-workouts` 잠금 아래 현재 revision의 관측값, 수집 커서, `last_success_at`, 완료 run 및 후속 작업을 한 트랜잭션으로 저장한다.
2. 완료 run마다 계정 적용 기회를 하나만 만든다. Python은 새 완료 run을 확인하고, 온라인일 때만 기존 `prepare_apply`의 당사자·관리자 REST 재검증을 수행한다.
3. Python은 별도 짧은 트랜잭션에서 전역 잠금과 run 처리권을 확인한다. 현재 Gateway 상태·session/fence·요청 version·lease·구성 fingerprint를 다시 검증한다.
4. **관계 변경 + revision 증가 + 감사 + 요청 applied + 새 revision의 월간/당일 관측값 + run 소비 표시**를 함께 확정한다. 완료 시각은 DB가 만든 새로운 시각이며, 과거 run 시각으로 되돌려 기록하지 않는다. 이 단계는 수집 커서와 `last_success_at`을 갱신하지 않는다.
5. Python이 오프라인이면 Go 수집은 그대로 완료된다. 승인 요청은 보존하되 오래된 run으로 계정을 적용하지 않는다. 재접속 후 다음 새 완료 run이 적용 기회를 제공한다. 수집당 적용 최대 1건을 DB unique 제약으로 보장한다.
6. 처리 도중 연결이 끊기면 Python의 현재 프로세스 guard로 적용을 막는다. Go는 온라인 lease만 보고 계정 관계를 변경할 권한을 갖지 않는다.

동일 KST 날짜의 관측값은 기존 정책대로 마지막 성공 관측으로 갱신한다. 닫힌 날짜를 다시 쓰지 않으며 자정 직전 run을 자정 뒤 처리하면 새 날짜의 실제 관측으로 남긴다. 전일과 revision/계산 버전이 다르면 기존처럼 비교 제외한다. 수집 실패에는 계정 적용 기회를 발급하지 않는다.

Python이 소비하는 완료 run의 유효 시간은 완료 후 30초로 제한한다. 5초 poll을 유지하고, 기회를 놓치면 다음 성공 수집을 기다린다. 중간에 실패·만료된 적용을 같은 run으로 다시 시도할 때도 applied unique 제약과 요청 version을 확인하며 중복 적용하지 않는다.

현황판 후속 작업은 별도 상태로 관리한다. 계정 처리가 완료·대기 없음·오프라인·기회 만료 중 하나로 결정되면 현재 revision으로 게시한다. 게시 실패는 수집 성공이나 관계 적용을 되돌리지 않는다. Gateway가 없어도 현황판 전용 실행은 가능하게 하며, 이 실행은 계정 온라인 상태를 광고하지 않는다.

## 7. 저장·실행 계약

### DB 추가와 작성 권한

기존 `solitary_athlete`에 additive migration을 추가한다. 아래 이름·컬럼은 제안이며 아직 존재하지 않는다.

- `mukmuk_collector_control`: 단일 설정 소스, writer_mode(`python`/`go`/`paused`), owner, 단조 증가 fence, lease_until.
- `mukmuk_collection_scan`: 스캔 시작 커서, 상한·다음 페이지·완료 여부·건수. 원문은 중복 저장하지 않는다.
- `mukmuk_collection_runs`: run_id, fence, 시작/완료 시각, 고정 수집 상한과 상태·건수. 비공개 인증 원문은 담지 않는다.
- `mukmuk_collection_effects`: run_id+kind(`identity_opportunity`/`board`) unique, 상태·기한·시도 횟수·lease/fence. 완료와 같은 트랜잭션에 삽입한다. run의 계정 실제 적용 성공을 별도 unique 표시로 보호한다.

Go는 원본·일별 집계·갱신 작업과 수집 상태를 작성한다. Python은 계정 도메인·현황판 및 해당 후속 작업만 작성한다. 사진 Edge의 첨부 참조 정리는 기존의 제한된 예외로 보존한다. 공용 프로젝트 service-role 키를 Go에 주지 않는다.

새 테이블은 서버 전용 RLS/ACL을 적용한다. 작업 테이블의 임의 접근이나 SECURITY DEFINER 함수의 PUBLIC 실행을 허용하지 않는다. 한 번의 이벤트 저장과 영향 날짜 재집계는 같은 트랜잭션으로 유지한다. 동일 의미의 재처리가 source_revision을 불필요하게 올리지 않게 한다.

### 잠금과 연결 예산

- 먼저 Python의 모든 수집 경로를 writer_mode 확인과 기존 채널 advisory lock 계약으로 갱신해 배포한다. Go는 쓰기 트랜잭션마다 동일한 채널 lock과 새 lease/fence를 확인한다. 구형 writer가 남아 있는 상태에서는 Go 쓰기를 켜지 않는다.
- Go는 단일 활성 worker로 시작한다. lease는 30초이며 DB 작업 및 페이지 조회 전에 갱신한다. 모든 쓰기 트랜잭션에서 fence와 유효 임대를 검증한다. 네트워크 대기 중 장기 DB 잠금을 점유하지 않는다.
- Go의 원본 쓰기 잠금 순서는 기존 Python의 채널 advisory lock → 전역 `mukmuk-workouts` → collector control 행 → run/effect·도메인 행이다. Python의 계정 적용은 전역 잠금 → control 행 → effect 순서다. claim/renew는 짧은 control 전용 트랜잭션으로 끝내며 다른 잠금을 뒤이어 잡지 않는다. 계정 코드의 기존 runtime/identity 잠금 순서까지 통합 검사한다.
- 임대가 만료됐거나 writer_mode가 바뀌면 늦게 도착한 HTTP 결과도 저장하지 않는다. 커서·완료 처리도 같은 검사를 한다. HTTP/Discord 외부 부수 효과의 완전한 exactly-once는 보장하지 않고 멱등 요청·게시 복구로 처리한다.
- 기존 `mukmuk_worker CONNECTION LIMIT 3`은 올리지 않는다. 1차 전환은 이 역할을 쓰되 Go 최대 동시 연결 1, Python 최대 1, Edge의 짧은 연결을 위한 1자리로 예산을 잡는다. 기존 수집 잠금 전용 연결은 새 계약 전환 후 제거한다.
- DB 연결은 네트워크 대기 전 닫거나 pool에서 물리적으로 정리한다. 단순 pool.Release만으로 역할 연결이 반환됐다고 가정하지 않는다. 동시 Edge 요청은 한 자리를 초과할 수 있으므로 기존 bounded acquire/retry 동작과 과부하 응답도 검증한다.
- 이 예산으로 부하 검사를 통과하지 못하면 쓰기 전환을 중단한다. 앱 전용 역할 분리는 후속 검토 사항이며, 몰래 연결 제한을 올리거나 공용 pooler 설정을 바꾸지 않는다.

pgx는 명시적으로 prepared statement cache를 쓰지 않는 실행 모드를 선택하고 실제 transaction pooler에서 검증한다. TLS 인증서 검증을 끄지 않는다. HTTP 호출·429 대기 중에는 DB transaction을 열어 두지 않는다.

### 재시작·상태

1분 수집과 1회 실행 모드, 사진 메타데이터 보완 모드를 제공한다. 한 실행이 길어지면 겹치지 않고 종료 후 다음 주기를 처리한다. 바이너리·컨테이너는 같은 실행 코어를 사용한다. 첫 배포는 로컬 전용 supervision으로 시작하며 Kubernetes나 메시지 브로커는 도입하지 않는다.

운영 probe는 프로세스 생존, 설정/DB 사용 가능 여부, 마지막 성공·지연·실행 버전·큐 적체를 구분한다. 인증 원문·닉네임·ID·시크릿 코드를 로그에 남기지 않는다. 공개 HTTP 운영 API는 만들지 않는다. probe를 HTTP로 제공하면 기본 loopback 바인딩이며 외부 공개 전 인증과 네트워크 정책을 별도로 정한다.

Go 서비스가 독립 실행되더라도 같은 단일 채널을 여러 replica가 병렬 저장하지 않는다. 이번의 확장성은 독립 배포·자원 조절·복구 가능성이며 멀티테넌트 처리량 확장이 아니다.

## 8. 보존 규칙과 이식 시 주의점

- Discord ID는 JSON 문자열로 유지한다. 비교는 정수 안전한 방식으로 하며 float64·사전식 문자열 정렬을 쓰지 않는다.
- 페이지 도중 장애가 나면 완료 커서를 전진하지 않는다. 이미 저장한 이벤트는 재처리 안전해야 한다. 최초 수집 상한과 최근 28일 재확인이라는 현재 동작을 fixture로 고정한다.
- **현재 구현과 지침의 차이:** `run_sync()`는 최근 28일의 기존 메시지도 재저장하지만 AGENTS.md는 원본 갱신을 명시적 `/기록갱신`에 한정한다. 신규 Go 정기 수집은 이미 저장된 메시지의 메모·사진을 수정하지 않고 새 메시지만 저장하도록 맞추는 안을 추천한다. 이 동작 변경을 언어 이식에 숨기지 않고 별도 수용 항목으로 승인받는다. 기존 메시지 편집·삭제 반영은 명시적 갱신에서 한다.
- 명시적 갱신은 길드/채널/대상/요청자 권한을 재검증한다. 삭제된 원본 판정은 HTTP404 **그리고** Discord10008, 불완전한 HTTP200은 보류한다. HTTP 200이지만 본문과 사진이 비어 인증 여부를 확정할 수 없는 경우는 원본을 보존하고 보류한다.
- 갱신 이벤트·영향 날짜·작업 커서·checked/removed는 같은 트랜잭션으로 확정한다. job version·lease 상실 후 저장하지 않는다.
- 리액션 실패가 운동 기록을 취소하지 않는다. 저장 성공 뒤에만 ✅를 보낸다. 재시도와 커서 성공 기준의 현행 의미를 fixture로 확인한다.
- 월간 N/S/D, 닫힌 일별 관측, 원본 작성자, 사람 중복 제거, 사진 OR, 메모 안정 정렬, 기존 source_revision 의미를 보존한다.
- Discord rate limit은 응답 헤더·retry_after를 따라 처리하고, 429·5xx·timeout의 제한된 재시도와 취소를 검증한다. 봇 토큰을 공유하는 Edge/Python의 호출도 있으므로 Go 내부 limiter만으로 전역 제한을 해결했다고 보지 않는다.
- 사진 Edge가 지운 첨부 메타데이터를 Go가 과거 응답으로 되살리지 않도록 동일 메시지 수정 직렬화/조건부 갱신을 검증한다.

## 9. 단계별 실행 계획과 완료 조건

각 단계는 별도 검증·커밋 단위다. 아래는 설계 검토용 순서이며 미구현 명령을 현재 운영 명령처럼 제시하지 않는다.

| 단계 | 변경 대상 | 결과·검증 | 다음 단계 조건 |
| --- | --- | --- | --- |
| 1. 호환 fixture 확정 | `tests/python/test_collector.py`, `test_store.py`, `test_reconcile.py`, `test_identity_participation.py`, `test_connection_budget.py`; 새 공유 fixture | 익명/가상 입력으로 이벤트·일별 결과·실패 결과를 고정. 28일 기존 원본 처리 차이를 별도 승인 | 날짜·중복·사진·삭제·계정 적용 계약이 명시됨 |
| 2. 완료/계정 경계 선분리 | `mukmuk/store.py`, `sync.py`, `accounts.py`, `local_runtime.py`, `local_bot.py`; 새 migrations/통합 검사 | Python 상태에서 새 run/effects와 계정 후속 확정 적용. 중간 crash·자정·offline·중복 소비·revision409 검사 | 기존 Python만으로 새 경계 안정성 확인 |
| 3. 공통 writer 제어 | `mukmuk/scheduler.py`, `main.py`, 로컬 runner, Actions; control migration | 모든 Python 진입점이 mode/lease/fence를 따름. 구형 경로 차단. 겹친 writer·만료 후 지연 응답·잠금 순서 검사 | 운영에 남은 구형 writer가 없다는 확인 |
| 4. Go 수집 저장 코어 | 새 `services/collector/go.mod`, `cmd/mukmuk-collector/`, `internal/discord/`, `internal/collect/`, `internal/storage/` | 순수 메시지 해석과 HTTP fake → 격리 PG 통합. Python fixture와 저장 결과 동일 | race 검사, 오류/rollback/페이지네이션·풀러 호환 통과 |
| 5. 기록갱신·리액션·보완 | 새 `internal/refresh/`, `internal/reactions/`; 기존 refresh SQL 계약 | 100건 초과·중복 실행·권한 철회·정확한404·불완전200·429·임대 상실·사진 보완 검사 | 모든 수집 책임이 Go에서 독립 동작 |
| 6. 패키징·스케줄·현황판 분리 | 서비스 이미지/배포 정의, `scripts/install_macos_scheduler.py`, `scripts/macos_sync.py`, `.github/workflows/sync.yml`, 새 Python 현황판 실행 경로 | 고정 버전 아티팩트, graceful shutdown, run-once fallback, board 장애 독립. Gateway 종료 중 Go 수집과 마지막 기록 조회 검사 | 정상/수집실패/DB실패 상태 구분 및 롤백 실행 가능 |
| 7. 그림자 비교 | 가상/격리 DB, 필요 시 별도 승인한 운영 read-only 입력 | Go는 운영 DB·리액션·현황판·커서를 쓰지 않음. 같은 입력/시점으로 Python과 의미 비교 | 원본·일별·사람별·관측값 차이 0, 알려진 승인 차이만 존재 |
| 8. 운영 전환 | 앱 범위 migration, writer mode, Go/로컬/Actions 아티팩트 | writer paused → 실행 종료·lease 소진 → Go mode → 단일 writer 확인. 실제 RPC·기록갱신·온라인 계정·현황판·연결 포화 검사 | 사용자 승인된 배포와 운영 수용 검사 완료 |
| 9. 기존 수집 경로 정리 | Python 수집 진입점·의존성, README/AGENTS/ARCHITECTURE/operations, CI | rollback 기간 후 Python 수집 중단. Gateway·계정·Pillow 현황판 의존성은 유지 | 지원하는 실행 경로·버전·조회 계약 문서가 실제 운영과 일치 |

Go 버전과 pgx 정확한 버전은 구현 시작 시 지원 상태를 확인해 go.mod/CI에 고정한다. `.env.example`에는 새 실행 설정을 추가하되 기존 `MUKMUK_DATABASE_URL` 등과 공개 설정 구분을 유지한다. 기능 코드는 새 서비스 하위에 두어 웹·Edge와 독립 빌드한다.

## 10. 수용 검사

1. Go만 재시작·업데이트해도 웹·Edge 배포가 필요 없다. Go가 내려가도 저장 데이터 조회는 가능하고 수집 지연을 표시한다.
2. Python Gateway를 내린 채 신규 인증 수집이 성공한다. 계정 업무는 확정되지 않는다. 다시 온라인이 되면 새 수집 완료를 기준으로 한 건만 적용한다.
3. 같은 인증/날짜의 텍스트→사진, 사진 제거, 여러 계정 같은 날, 닉네임 변경, KST 자정·월말·윤일, 500/200개 초과 RPC 페이지를 검증한다.
4. 수집 도중 kill·응답 유실·커밋 성공 후 ACK 유실·lease takeover에서 중복 원본/관측/관계 적용이 없다. 미완료 커서를 완료로 공개하지 않는다.
5. 브라우저 코드 검증·revision 불일치 재조회·잘못된 코드 거부·사진 첫 화면 요청 0건을 유지한다.
6. 계정 적용 트랜잭션을 실패시키면 관계·revision·새 관측·소비 표시가 함께 rollback된다. 이미 완료된 Go 수집은 보존된다.
7. Go·Python·Edge가 동시에 동작하는 실제 transaction pooler 검사에서 연결 제한 초과를 무한 재시도하지 않는다. TLS 검증, 준비문 비활성, lease 갱신 지연도 확인한다.
8. 리액션/현황판의 재처리는 저장된 데이터를 훼손하지 않는다. 게시자는 봇 작성자·고유 표식을 함께 확인한다.

## 11. 롤백과 배포 경계

- SQL은 앱 범위 additive 변경만 한다. 원본 이벤트·관측 이력·사람 소속을 이동/삭제하거나 공용 Supabase 전체를 복원하지 않는다.
- Go를 중단하고 writer_mode=paused로 설정한 뒤 진행 중 트랜잭션 종료와 임대 만료를 확인한다. 그다음 **새 run/effects·lease 계약을 지원하는 Python 호환 버전**으로 mode를 바꾸고 재개한다. 구형 Python을 그대로 켜지 않는다.
- 원본·커서·계정 revision을 과거로 되돌리지 않는다. Go가 확정한 원본은 Python 재시작에서도 멱등 처리한다. 이미 적용된 계정 관계는 기능 플래그만으로 취소하지 않는다.
- 현황판 실패는 해당 게시 작업만 재시도하고, 수집 실패나 계정 관계 rollback으로 확대하지 않는다.
- 이번 문서 작성은 운영 DB migration, 서비스 중단/시작, 기능 플래그 변경, Discord 메시지 생성, Pages/Edge 배포를 승인하거나 수행하는 단계가 아니다.

## 12. 구현 전 검토할 제안

- 추천 경계: Go 수집·저장 / Python 온라인 계정·현황판 / 기존 DB RPC 조회.
- 명시적 동작 변경: 계정 적용을 수집 완료 후 별도 원자 확정으로 전환, 정기 수집의 기존 원본 갱신을 지침에 맞춰 제한.
- 첫 운영 형태: 현재 로컬 환경의 독립 Go 서비스 + 같은 바이너리 기반 1회 보완 실행.

이 세 가지를 검토한 뒤 작업별 테스트·함수 계약·실제 명령을 포함하는 상세 구현 계획으로 확정한다. 2·3번 확장 프로젝트의 설계는 이 문서에 섞지 않는다.

## 근거

- 현재 계약: [시스템 설계](../../../ARCHITECTURE.md), [운영 안내](../../operations.md), 위 표의 소스/검증 파일.
- [pgx 공식 문서](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecMode): 연결 풀러와 prepared statement 실행 모드 검토 근거.
- [Discord 공식 rate limit 문서](https://github.com/discord/discord-api-docs/blob/main/developers/topics/rate-limits.mdx): 응답 헤더·Retry-After/retry_after 기반 처리 근거.

## 구현 브랜치의 조정 사항

- 1분 주기에는 기존 28일 페이지를 반복 조회하지 않는다. 커서가 있으면 `after`와 `limit=1`로 새 메시지 유무를 확인하고, 있을 때만 최신 페이지부터 커서까지 빠짐없이 수집한다. 커서가 없으면 전체 이력을 페이지네이션한다. 기록 수정·삭제는 명시적 갱신에서 다룬다.
- 봇의 채널 조회 권한이 없을 때 Discord가 빈 목록을 반환할 수 있으므로, 매 수집에서 채널·길드·역할·봇 멤버 권한과 애플리케이션의 MESSAGE_CONTENT 접근 설정을 확인한다. 변경이 없는 정상 주기는 Discord GET 약 6회이며 초기 봇 확인, 갱신·리액션·현황판·429 재시도는 별도다. 1분 간격은 기존 5분보다 요청 횟수가 늘 수 있으며 운영 부하의 실측이 아니다.
- 현황판은 계정 처리 기회가 끝난 뒤 게시한다. 원본/계정 revision이 바뀌면 다음 점검에 게시하며 변화가 없으면 5분 간격이다. Gateway가 꺼져도 별도의 Python 현황판 fallback이 게시할 수 있고 계정 적용은 온라인에 한정된다.
- 1분마다 생기는 비공개 실행/effect 행은 완료되었고 30일이 지난 항목만 시간당 최대 200건씩 정리한다. 진행 중인 후속 작업과 원본·계정 이력·일별/월별 관측은 삭제하지 않는다.
- 이 구현은 Go와 Python의 공동 DB 전환 계약을 추가한다. 운영 DB 적용·실행본 교체·1분 주기 활성화와 기본 pooler 연결 예산 검증은 운영 안내에 기록했다. 장시간 부하와 신규 운영 인증·계정 연결은 별도 검증 범위다.

- 긴 백로그는 저장을 마친 페이지마다 비공개 scan checkpoint를 기록한다. 중단 후 마지막 저장 페이지 다음부터 이어가며, 전체 스캔이 끝나기 전에는 공개 완료 커서를 전진하지 않는다.
- [Discord HTTP API도 메시지 본문 권한의 영향을 받는다](https://docs.discord.com/developers/events/gateway#message-content-intent). Discord 앱에 MESSAGE_CONTENT 설정이 없으면 수집을 보류한다. 기록갱신에서 내용이 비어 있는 HTTP 200은 삭제 근거로 사용하지 않는다. 채널의 의도적으로 빈 메시지 역시 이 경우 확인을 위해 보류될 수 있다.
- 계정 적용의 REST 검증 중에도 별도 tick이 15초 온라인 임대를 갱신한다. Gateway가 꺼진 fallback 현황판은 Discord HTTP 대기 전에 물리 DB 연결을 반환한다.

- Python 전환·롤백 경로도 같은 본문 접근 설정을 확인하며, 정기 수집으로 기존 원본을 덮어쓰지 않는다.
