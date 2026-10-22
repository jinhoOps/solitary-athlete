# 묵묵 · 실행과 배포

공개 웹보드: **[jinhoops.github.io/solitary-athlete](https://jinhoops.github.io/solitary-athlete/)**.

## 개발·검증

Node 24, Python 3.13, uv 0.11.32, Deno 2.9.7, Docker가 현재 검증 환경이다.

```sh
npm ci
uv sync --locked
npm test
npm run build
npx playwright install chromium
npm run test:browser
deno check supabase/functions/mukmuk-discord-grass/index.ts supabase/functions/mukmuk-discord-cleanup/index.ts
scripts/test-db.sh
```

`scripts/test-db.sh`는 임시 PostgreSQL 17 컨테이너를 localhost 임의 포트에 띄우고 역할·테이블·집계·삭제 큐·동시 선점·게시 소유권을 검사한 뒤 제거한다. 외부 HTTP 전송 경계만 가상 구현으로 대체하여 실제 SQL dispatch 함수의 due 조건과 권한도 검사한다. 운영 DB에 테스트 기록을 삽입하지 않는다.

```sh
cp .env.example .env
# .env에 설정 추가, 파일 권한 0600 유지
npm run dev
uv run main.py
uv run register_cmd.py
```

수집 성공 후에만 마지막 수집 시각을 갱신한다. 실패한 실행은 0이 아닌 종료 코드로 끝나며 자격 증명을 출력하지 않는다. Message Content Intent와 인증 채널의 본문·사진 읽기, 리액션, 현황판 쓰기 권한이 필요하다. 기록 삭제·28일 이전 수정의 자동 반영은 초기 범위 밖이다. 운영자는 해당 메시지 ID를 확인하여 `Store.save(message_id, None)` 또는 갱신 이벤트로 명시적으로 재집계한다.

## 일별 잔디 집계 이력

기존 월간·전일 비교 마이그레이션이 적용된 환경에 `supabase/migrations/20261020000003_mukmuk_daily_grass_history.sql`을 적용한다. 현재 저장된 관측값을 이력으로 옮기고, 다음 정상 수집부터 KST 날짜당 한 행을 갱신·보존한다. 일별 이력 수와 수집 성공 시각의 일치, 같은 날 재수집 시 행 수 유지와 시각 전진을 확인한다. 수집 누락 날짜는 비워 두며 과거 운동 기록으로 마감값을 소급 생성하지 않는다.

이번 변경은 DB 함수와 테이블만 추가하므로 Python 런타임 재설치와 Pages 재배포가 필요하지 않다. 현재 KPI·전일 비교는 유지한다. 현재 동작과 저장 계약은 ARCHITECTURE.md의 월간 함께 심은 잔디를 따른다.

## 월간 잔디 참여율 배포 순서

1. `supabase/migrations/20261020000001_mukmuk_monthly_grass.sql`과 후속 `20261020000002_mukmuk_daily_grass_comparison.sql`을 순서대로 묵묵 스키마에 적용한다. 후속 마이그레이션은 비교 기준을 전날 최종 집계로 바꾸며 같은 날의 기존 비교값은 제거한다. 최초 적용 시 전날 집계가 없으면 비교 기록 없음이 정상이다. 기존 초기 마이그레이션이 적용된 환경에는 후속 파일만 적용한다. 다른 앱의 설정·권한은 변경하지 않는다.
2. 검증된 수집기 소스로 `uv run python scripts/install_macos_scheduler.py`를 실행해 로컬 런타임을 갱신한다. 다음 성공 수집부터 월간 집계를 보관하며, 다음 KST 날짜의 첫 성공 수집부터 전날 최종 집계와 비교할 수 있다. 기존 성공 회차를 소급 생성하지 않는다.
3. 화면 변경을 main에 병합한 뒤 Pages 배포와 `release.json`을 확인한다. 집계 전에는 `수집 대기`, 집계 RPC 미배포·일시 장애에는 `집계 불러오기 실패`를 표시하며 나머지 기록은 유지한다.

2026-10-20에 Orca의 로그인된 Supabase SQL Editor로 이 마이그레이션을 운영 DB에 적용했다. RLS·직접 접근 차단·코드 보호 RPC를 확인하고 로컬 런타임 `4602fd522b3125f8`을 설치했다. 새 런타임에서 두 번의 정상 수집과 현재·직전 월간 집계 저장, 실제 인증 RPC 응답의 웹 표시 함수 통과를 확인했다. 웹은 기능 브랜치에 있으며 main 병합과 Pages 배포가 남아 있다.

이 변경의 로컬 검증은 Docker 데몬이 응답하지 않아 새 임시 PostgreSQL 17.11 클러스터에서 같은 마이그레이션과 pytest·Deno DB 검사를 실행했다. 운영 DB에는 테스트 기록을 삽입하지 않았다.

## GitHub Pages

`Publish Pages`는 main의 화면 변경 시 자동 실행한다. 허용된 릴리스 브랜치 `mukmuk/db-foundation`은 `gh workflow run pages.yml --ref mukmuk/db-foundation`으로 수동 배포한다. 단위 테스트·타입 검사·빌드·브라우저 검사 후 Pages artifact를 배포한다. 공개 설정 두 개만 빌드에 전달한다.

| Repository Variables | 용도 |
| --- | --- |
| `SUPABASE_URL` | 공용 Supabase 공개 REST 주소 |
| `SUPABASE_PUBLISHABLE_KEY` | `solitary_athlete` 공개 읽기 |

`dist/release.json`의 `sourceCommit`으로 실제 배포된 소스를 확인한다. 처음 발행한 `gh-pages` 브랜치는 산출물 이력이며 현재 서비스는 Actions artifact를 사용한다. `scripts/publish-pages.mjs`는 초기 브랜치 발행용으로, 현재 자동 배포를 대체하지 않는다.

GitHub 환경 `github-pages`는 main·릴리스 브랜치 배포를 허용한다. 후속 브랜치는 검증·리뷰 후 환경 정책과 워크플로우 대상에 명시적으로 추가한다. 서버 비밀값은 Pages Variables·HTML·JS에 넣지 않는다.

## 인증 수집 스케줄

`Sync Workout Logs`는 매일 06:00 KST(`0 21 * * *` UTC) 보완 수집과 수동 실행을 정의한다. GitHub 내부 concurrency와 수집기 DB transaction advisory lock으로 로컬 수집과의 중복 실행도 막는다. GitHub 예약은 지연될 수 있다.

**예약 워크플로우는 기본 브랜치(`main`)에서 실행된다.** 현재 기본 브랜치에 반영되어 정기 수집이 활성화되어 있으며, 필요 시 Actions 콘솔 또는 로컬 `uv run main.py`로 수동 실행할 수 있다. [GitHub schedule 규칙](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

| Repository Secrets | 용도 |
| --- | --- |
| `DISCORD_BOT_TOKEN` | 봇 REST 인증 |
| `MUKMUK_DATABASE_URL` | 묵묵 전용 DB 역할 |

채널·서버·이모지 ID와 `DASHBOARD_URL`은 `.env.example`과 같은 이름의 Repository Variables를 사용한다. 현재 필요한 Secrets/Variables는 등록됐다. 등록 스크립트는 서버 `/잔디` 한 개를 upsert하며 다른 명령어를 일괄 삭제하지 않는다.

## Edge Functions·삭제 Cron·월간 시크릿 발급

| 대상 | 설정 |
| --- | --- |
| `mukmuk-discord-grass` | 원문 Ed25519 서명, 서버·앱 검사 후 공개 defer |
| `mukmuk-discord-cleanup` | POST, 타임스탬프·nonce·HMAC-SHA256 서명 확인 |
| `mukmuk-weekly-code` / `mukmuk-monthly-code` | 매월 1일 00:00 KST, 새 시크릿 코드 발급 및 Discord `#공지` 메시지 전송 |
| `mukmuk-cleanup-due` | 10초마다 due 여부 확인, 있을 때만 함수 호출 |
| `mukmuk-cleanup-history` | 앱 Cron 이력만 7일 보존, 다른 앱 이력 유지 |

세 함수의 플랫폼 JWT 검사는 꺼져 있고 각 함수가 인증을 수행한다. Discord 개발자 포털의 인터랙션 엔드포인트는 다음 주소다.

```text
https://olqdftjssrzqvcindekh.supabase.co/functions/v1/mukmuk-discord-grass
```

Edge Secrets는 `MUKMUK_DATABASE_URL`, `MUKMUK_REPLY_TOKEN_KEY`, `MUKMUK_CLEANUP_SECRET`, `MUKMUK_DISCORD_PUBLIC_KEY`, `MUKMUK_DISCORD_GUILD_ID`, `MUKMUK_DISCORD_APP_ID`, `MUKMUK_DASHBOARD_URL`, `MUKMUK_GRASS_RECORD_EMOJI_ID`, `MUKMUK_GRASS_PHOTO_EMOJI_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_NOTICE_CHANNEL_ID`다. 값은 문서에 남기지 않는다. `pg_net` 전송 큐를 다른 역할도 읽을 수 있어 장기 비밀값을 HTTP 요청에 넣지 않는다. Vault 키로 계산한 `X-Mukmuk-Timestamp`·`X-Mukmuk-Nonce`·`X-Mukmuk-Signature`만 전송한다. 서명은 30초 유효하며 미래 시각 오차는 최대 5초 허용한다.

## 월간 시크릿 코드 및 대시보드 v2

- **발급 주기**: 매월 1일 00:00 KST (`pg_cron`: 매일 `0 15 * * *` UTC 실행 후 KST 1일 판정).
- **유예 기간**: 다음 달 1일 00:00 KST까지 정규 사용, 이후 24시간 유예(`expires_at = active_until + 1 day`). 새 코드가 발급되어도 기존 코드는 24시간 동안 유효하다.
- **Discord 공지**: `#공지` 채널에 코드블록과 접속 링크를 게시한다. 다음 발급 때 새 안내 전송에 성공한 뒤 이전 묵묵 안내(기존 주간 안내 포함)를 삭제한다. 전송 실패 시 이전 안내를 유지하며, 재실행은 현재 코드·안내를 재사용한다. 다른 작성자의 메시지는 삭제하지 않는다.
- **RPC 보안**: `solitary_athlete.workout_logs`의 직접 `anon` 조회를 회수하고, `solitary_athlete.get_workout_logs(p_secret_code, p_year)` RPC를 통해서만 유효한 시크릿 코드로 1년 데이터를 조회한다.
- **대시보드 UI**:
  - 컴팩트 단일 라인 헤더 및 높이가 줄어든 탭 버튼.
  - 기본 `전체 멤버` 뷰: 상단 5대 월간 KPI (1. 운동왕 👑, 2. 이번 달 고운, 3. 총 운동 일수, 4. 가장 푸른 요일, 5. 1인당 평균 일수), 하단 타임라인 숨김.
  - 개별 유저 뷰: 1년(365일) 잔디 그리드 및 `#남겨둔운동` 메모 타임라인 노출.
  - 시크릿 코드 미입력/만료 시 모달 팝업으로 재입력 유도, URL `?code=...` 진입 시 `localStorage` 자동 저장 후 주소창 쿼리 정리.

Vault 이름은 `mukmuk_project_url`, `mukmuk_cleanup_secret`이다. 운영 관리자만 Vault를 읽으며 앱 worker에는 권한을 추가하지 않는다. 공용 프로젝트에서 `pg_cron`, `pg_net`을 활성화한 뒤 [Cron 마이그레이션](../supabase/migrations/20261014000003_mukmuk_cleanup_cron.sql)과 [서명 호출 마이그레이션](../supabase/migrations/20261014000004_mukmuk_signed_cleanup.sql)을 순서대로 적용한다. 공용 초기화 SQL을 다시 실행하거나 다른 앱의 키·스키마·권한을 바꾸지 않는다. 이 프로젝트는 콘솔에서 마이그레이션을 적용했으므로 향후 CLI history 통합은 공용 배포 담당자가 별도로 조정한다.

CLI 인증이 있을 때는 `supabase functions deploy <이름> --project-ref olqdftjssrzqvcindekh`로 배포한다. 이번에는 로그인된 Dashboard Editor를 사용했다. `node scripts/bundle-edge.mjs`로 타입 검사된 소스를 단일 배포 번들로 만들고 해당 함수의 Code 편집기에 넣는다. 생성된 `.edge-dist`는 Git 제외이며 타입이 제거된 번들이다. 원본 TypeScript와 Deno 검사가 기준이다.

프로덕션 Edge의 Supabase DB CA는 런타임에 구성돼 있다. 로컬 Deno에서 실제 pooler 연결을 검증하려면 Dashboard의 SSL 인증서를 받아 `SSL_CERT_FILE`과 CA 저장소를 설정한다. `rejectUnauthorized: false`로 서버 인증을 생략하지 않는다. 임시 Docker DB 검증의 TLS 생략은 localhost 테스트에만 적용한다. [Supabase Edge DB SSL 안내](https://supabase.com/docs/guides/functions/connect-to-postgres#ssl-connections)

## 수명·장애 관측

- 게시 직전에는 45초 게시 임대를 확보한다. 복구 워커가 이미 선점했다면 PATCH하지 않는다. 게시 요청은 429·5xx·타임아웃에 제한된 재시도를 한다.
- 표시 성공 시 `published_at + 300초`로 예약한다. 삭제 워커는 한 건씩 30초 임대를 선점하고, 실행당 최대 50건/약 20초 범위로 due 큐를 처리한다.
- 원본 메시지 확인으로 `preparing`을 복구한다. 삭제 대상은 webhook 원본 응답뿐이며 현황판·인증 원본을 건드리지 않는다.
- 삭제 204·메시지 없음 10008은 완료, unknown webhook·권한 오류·토큰 만료는 실패다. 종료 시 암호화 토큰을 지운다. 오래된 임대 소유자는 갱신된 작업을 완료·재예약하지 못한다.
- 오류 로그는 이름·실패 종류만 남기고 토큰·URL·메모·DB 자격 증명을 출력하지 않는다. 오래 남은 `preparing`, 기한을 넘긴 `scheduled/processing`, `failed` 개수와 `sync_status.last_success_at`, Cron history를 관측한다.

정확히 300초의 밀리초 단위 삭제를 보장하지 않는다. Cron 점검·네트워크·429 때문에 늦어질 수 있다. 장시간 장애로 15분 interaction token이 만료되면 운영자가 남은 메시지를 확인해 정리한다.

내부 서명은 호출 목적도 구분한다. 삭제 요청의 서명 원문은 `mukmuk-cleanup-v1:<timestamp>:<nonce>`, 월간 코드 요청은 `mukmuk-monthly-code-v1:<timestamp>:<nonce>` (기존 `mukmuk-weekly-code-v1` 호환)다. 삭제 큐에서 관측한 서명으로 월간 코드를 발급할 수 없다. 월간 코드 호출자는 해당 목적의 서명을 생성해야 한다.

### 주간 발급 실서비스 확인 (2026-10-14)

누락된 발급 함수 배포·봇/공지 채널 Secrets·주간 Cron을 연결했다. [주간 예약](../supabase/migrations/20261014000006_mukmuk_weekly_code_cron.sql)과 [앱 역할 접근 정책·시퀀스 권한](../supabase/migrations/20261014000007_mukmuk_weekly_code_worker_access.sql)을 적용했다. 공지 채널의 묵묵 역할에 View Channel, Send Messages, Read Message History만 허용했다.

최초 발급은 HTTP 200, Discord 안내 메시지 존재와 발급 코드의 웹 조회 RPC 200을 확인했다. Vault 서명을 사용하는 `pg_net` 예약 호출 경로도 200이며, 재실행 후 코드 한 개·안내 한 개를 유지했다. HTTP 응답에는 코드를 반환하지 않는다. 다음 실제 정기 발급 시점은 2026-10-19 00:00 KST다. 자동 정기 실행 자체는 그 시점 이후 Cron 실행 이력으로 확인한다.

동시 게시에는 코드별 고정 `nonce`와 `enforce_nonce`를 사용한다. Discord가 짧은 시간 내 같은 작성자의 nonce를 중복 판정하며, 이후 재시도는 공지 조회로 기존 안내를 재사용한다. [Discord 공식 Create Message 문서](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx#create-message) 참고.

### 코드 포함 링크와 웹 잔디 초점

공지 안내, `/잔디` 결과, 상시 현황판 모두 서버에서 현재 유효한 코드를 조회해 `?code=`가 포함된 웹보드 링크를 만든다. 다른 쿼리와 앵커는 유지하고 기존 code 값은 교체한다. 코드가 없으면 기본 주소로 우회하지 않는다. 공지 재실행 시 같은 코드 안내의 링크 형식도 갱신한다.

웹은 링크의 코드를 저장하고 주소창에서는 code만 지운다. 올해 잔디를 그린 뒤 오늘 칸을 가로 영역 가운데에 보여주고, `오늘` 버튼으로 다시 이동할 수 있다. 상세를 열면 선택 칸과 상세 제목을 드러내고 제목으로 초점을 옮긴다. 닫으면 날짜 칸으로 돌리며 화면 폭이 바뀌어도 선택 날짜를 다시 보여준다. 초기 표시에서 페이지의 키보드 초점을 강제로 바꾸지 않는다.

## macOS 기본 수집기

```sh
uv run python scripts/install_macos_scheduler.py
launchctl print gui/$(id -u)/io.jinhoops.mukmuk.sync
```

`~/Library/LaunchAgents/io.jinhoops.mukmuk.sync.plist`에 매시 00·05·…·55분 달력 예약과 등록 직후 실행을 설치한다. 사용자 로그인이 필요하며 터미널·Orca를 닫아도 실행된다. 절전 중 놓친 달력 일정은 기상 후 한 번으로 합쳐 실행한다. 전원이 꺼져 있거나 로그아웃 상태에서는 동작하지 않는다. 네트워크 실패는 다음 주기에 재시도하며 맥북을 강제로 깨우거나 켜 두지는 않는다. [Apple 예약 동작 문서](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)

수집 소스·잠금 파일·의존성은 `~/Library/Application Support/mukmuk/versions/<소스 해시>/`에 설치해 개발 브랜치 변경과 분리한다. plist에는 기존 프로젝트 `.env` 경로만 들어가며 키 값은 넣지 않는다. `.env`가 이동하면 다시 설치한다. **Python 수집기 수정 후 검증·배포할 때 설치 명령을 다시 실행한다.** 이전 버전은 복구용으로 보존한다.

`~/Library/Logs/mukmuk/sync.log`에는 실행 시각·결과·성공/실패가 남는다(1MB×4 회전). launchd/uv 시작 오류는 같은 폴더의 `launchd-error.log`에서 확인한다. 실행은 240초에 중단되며 중단 시 자식 프로세스도 종료한다. 수동 실행·GitHub와 겹치면 `sync_already_running`으로 건너뛴다. 마지막 정상 수집은 Supabase `sync_status.last_success_at`으로 확인한다.

제거는 `uv run python scripts/install_macos_scheduler.py --uninstall`이다. 이 앱의 LaunchAgent만 제거하며 `.env`, 수집 데이터, 로그, 설치 버전은 보존한다. 미리보기는 `--dry-run`으로 plist를 출력한다.


## Discord 사진 지연 조회 (2026-10-16)

- 원본·썸네일은 별도 저장하지 않는다. `workout_events.attachments`에는 서명 링크를 제외한 이미지 첨부 메타데이터만 저장한다. 기존 이벤트의 비공개 권한을 그대로 사용한다.
- 적용 마이그레이션: `20261016000002_mukmuk_photo_metadata.sql`. `mukmuk-discord-photos`는 매 요청 월간 코드·저장된 서버/채널/메시지/첨부·작성자를 확인한다. 전용 서버 Secrets는 `MUKMUK_DISCORD_BOT_TOKEN`, `MUKMUK_DISCORD_AUTH_CHANNEL_ID`이며 기존 DB·서버 ID 설정도 사용한다.
- 첫 화면·필터 변경에는 사진 요청이 없다. 기록 상세에서 사진 보기를 눌러 최대 3개 메시지의 사진을 조회하고 사진 더 보기로 이어간다. 미리보기는 화면에 들어올 때, 큰 이미지는 클릭할 때 Discord에서 받는다.
- 링크 메타데이터 캐시는 최대 60초·500개 메시지이며 코드 검증을 생략하지 않는다. 404 또는 성공 응답에서 없어진 첨부만 비활성화한다. 403·429·일시 오류는 기록 삭제로 처리하지 않는다. 브라우저 캐시의 잔존·CDN 링크 유효 기간 내 전달 가능성은 남는다.
- 과거 사진 정보만 보완할 때 `uv run python main.py --backfill-photos`를 실행한다. 기존 수집과 같은 잠금을 사용하며 메모·일별 집계·수집 커서·리액션·현황판을 수정하지 않는다. 실패 시 재실행 가능하다. 이미지 파일은 받지 않는다.
- 운영 DB 컬럼 적용 후 과거 사진 메시지 3건의 첨부 정보를 보완했다. 운영 함수에서 잘못된 코드 HTTP 401, 유효 코드 HTTP 200·사진 1건, Discord WebP 미리보기 HTTP 200을 확인했다. 실제 메시지를 새로 게시하거나 삭제하지 않았다.
- 수집 실행본은 설치기가 실제 `.env` 경로를 따라가도록 하여 작업 브랜치 디렉터리를 정리해도 환경 설정 경로가 유지된다. 최종 Pages·수집기 배포 상태는 아래 검증 이력에 기록한다.

검증 이력: Vitest 51건, Chromium 31건(화면 밖 미리보기 요청 지연 포함), Python/DB 29건과 Deno DB 4건·함수 타입 검사·프런트 빌드가 통과했다. 리뷰의 느린 페이지·첨부만 삭제된 경우를 회귀 테스트로 고정했다. 맥북 LaunchAgent는 런타임 `091896c10394ab88`로 갱신했으며 5분 주기와 안정적인 원본 `.env` 경로를 유지한다.

### 사진 기능 배포 완료

사용자 승인 후 PR #11을 main에 병합했다(`308fc6a`). [main Checks](https://github.com/jinhoOps/solitary-athlete/actions/runs/38867344424)와 [Pages](https://github.com/jinhoOps/solitary-athlete/actions/runs/38867344454)가 성공했고 실제 release.json의 sourceCommit을 대조했다. 실제 Pages의 390px 모바일 화면에서 첫 접속 사진 요청/링크 조회 0건, 미리보기 이미지 1건·링크 조회 1건, 확대 후 이미지 누적 2건·추가 링크 조회 없음, Escape 닫기와 가로 넘침 없음을 확인했다. 작업 브랜치의 이전 배포 실패는 기존 GitHub 환경 브랜치 보호에 의한 것이며 보호 설정은 변경하지 않았다. 맥북 설치 설정이 main과 동일함도 확인했다.


## 수동 기록 갱신

- `/기록갱신`은 회원님 역할의 본인 기록만 접수한다. 관리/서버 관리 권한은 `유저`로 다른 멤버를 지정할 수 있다. 상태 옵션은 없으며 같은 대상의 진행 중 작업은 재사용한다.
- 응답은 비공개·표시 후300초 삭제다. 완료 작업의 다음 호출은 새 점검을 시작한다. 장시간 작업 결과를 token 유효기간에 의존해 보내지 않는다.
- `workout_refresh_jobs`는 서버 전용이다. 접수 시 메시지 상한을 고정하고 기존5분 수집기에서20건/30초씩 처리한다. 없는 작업을 찾기 위한 DB조회 외에 추가 Discord API 호출은 없다. 원본 삭제는 권한 확인과404/10008에 한정한다.
- 진행·재시도 상태는 DB에서 유지하며 연속 일시 오류10회 또는 권한 회수 시 failed로 종료한다. 재호출로 새 요청을 접수할 수 있다. lease/version과 트랜잭션으로 재시작·중복 저장에 대비한다.
- 신규 마이그레이션 `20261017000001_mukmuk_workout_refresh.sql`과 Discord 수신 함수·서버 명령 추가 등록이 필요하다. Edge에는 `MUKMUK_DISCORD_ROLE_MEMBER_ID`, `MUKMUK_DISCORD_AUTH_CHANNEL_ID`, 로컬/Actions에는 `DISCORD_ROLE_MEMBER_ID`를 설정한다.
- 자동 테스트는 회원/관리자·채널 권한·잘못된404/불완전한200·메시지별 재집계/롤백·대상 중복·상한·임대·재시도10회·작업 없음0조회·시간 예산·비공개 권한을 확인한다. 실제 Discord 신규/삭제 테스트 메시지는 별도 승인 없이 만들지 않는다.


2026-10-17 적용: 비공개 큐/함수를 공용 DB에 추가하고 기존 Discord 수신 Edge를 갱신했다. `/기록갱신`을 서버에 등록했으며 실제 옵션은 선택 `유저` 하나임을 확인했다. Edge 회원 역할 ID와 GitHub 변수, 맥북 런타임 `373e98cfe4de11bb`를 적용했다. 새 수집 실행이 exit0으로 끝났고 별도 요청 없이 생긴 갱신 작업은0건이었다. 실제 봇 채널 읽기·서버 소유자 권한 검증, 익명 큐401, 미서명 interaction401을 확인했다. 실제 사용자 인증의 삭제/갱신 작업은 명령을 직접 호출했을 때만 실행된다.


## 웹보드 시각·조작감 보완 배포 (2026-10-20)

사용자의 구현·배포 요청으로 릴리스 소스 `2be1d316382bcb08c8776d5d72a93c9292180852`를 배포했다. [Pages 배포](https://github.com/jinhoOps/solitary-athlete/actions/runs/39378622253)와 [Checks](https://github.com/jinhoOps/solitary-athlete/actions/runs/39378622026)가 성공했다. 공개 `release.json`의 sourceCommit과 일치한다. 기존 허용 릴리스 브랜치를 사용했고 환경 보호 설정·DB·Edge·수집기는 변경하지 않았다. main 병합은 수행하지 않았다.

- 연도 조회 실패 후 멤버 선택·연도 탐색·재시도를 복구하고, 이전 연도 기록을 실패한 연도의 기록으로 표시하지 않는다. 코드 만료 시 이전 목록·통계·사진을 제거한다.
- 선택·선택 해제 모두 즉시 반영한다. 최종 리뷰에서 선택 해제의 140ms 잔류를 재현해 수정했다. 필터 칩 hover도 즉시 반영하고 다른 컨트롤의 모션은 유지한다.
- 모바일 멤버 칩에 방향별 페이드와 선택 노출 여유를 추가했다. 큰 글자로 공간이 부족하면 컨트롤이 줄바꿈한다. 검색 선택의 포커스는 dialog close 이벤트에서 복귀한다.
- 14px 잔디 셀을 유지하면서 200% 글자의 요일 행을 28px로 늘리고 월 gutter를 공유한다. 모달의 그림자·블러를 제거하고 secondary 액션과 경고 박스를 통일했다.
- 로컬 `npm test` 57개, `npm run build`, `npm run test:browser` 88개, 상대 링크·SVG XML·`git diff --check`를 확인했다. 네 화면 폭(320/360/768/1280px), 100/200% 글자, 전체/개인 화면 16조합과 SVG 4종을 Chromium으로 렌더 확인했다.
- 실제 Pages 산출물에서도 일반 오류의 재시도·연도 이동·멤버 전환, 360px 잔디 라벨, 사진 다이얼로그, 200% 정렬의 6개 브라우저 검사가 통과했다. 데이터·사진 API는 가상 응답으로 대체했으며 실제 사용자 기록·월간 코드를 사용하지 않았다. 별도의 무인증 접속은 HTTP 200·코드 입력 모달·데이터 API 요청 0건·page error 0건을 확인했다.

검증 중 기존 브라우저 테스트 두 경로에서 초기 잔디 reveal과 클릭 좌표가 경합했다. fixture는 `aria-busy=false`와 두 번의 레이아웃 프레임을 기다리도록 정리했다. 실사용 코드에 대기 시간을 추가하지 않았다. 기존 HTTP 400/401/403의 인증 만료 분류는 이번 범위에서 변경하지 않았으며, 직접 호출이 불가능한 중복 요청을 강제로 만드는 대신 실제 진입점 잠금과 기존 generation 가드 보존을 검토했다. macOS Chromium 이외 OS·실기기 브라우저는 별도 확인 대상이다.

## 계정 연결 준비와 로컬 메인 (구현됨, 운영 활성화 전)

기본 설정은 `MUKMUK_ACCOUNT_LINK_ENABLED=false`다. 기존 `/잔디`·`/기록갱신`과 Edge 삭제 Cron은 로컬 온라인 여부와 독립적으로 유지한다. 계정 신청·동의·승인·조회만 온라인 전용이다. 소속 변경은 원본 작성자·메시지·계정별 집계를 지우지 않으며, 잘못 연결했다면 승인된 해제 요청으로 정정한다.

운영 반영 순서는 다음과 같다. 이 절차는 구현 안내이며 아직 수행한 배포 이력이 아니다.

1. 기존 묵묵 마이그레이션 이후 `20261021000001_mukmuk_people.sql` → `20261021000002_mukmuk_account_workflow.sql` → `20261021000003_mukmuk_identity_snapshots.sql` → `20261021000004_mukmuk_person_dashboard.sql` 순으로 적용한다. 다른 앱의 스키마·전역 권한·역할 연결 제한은 변경하지 않는다.
2. 새 RPC와 기본 비활성 Python·Edge·웹을 준비한다. 새 웹은 `get_dashboard_identity`가 먼저 필요하다. Discord 수신·사진뿐 아니라 짧은 DB 수명을 공유하는 삭제/월간 코드 함수도 같은 소스로 배포한다. 1계정=1사람 상태에서 기존 일수·사진·전체 분모·월간 N/S/D가 같은지 확인한다.
3. Python 검증 뒤 `uv run python scripts/install_macos_scheduler.py`로 고정 버전 런타임과 의존성을 갱신한다. 설치 소스에는 모든 `mukmuk/*.py`, `uv.lock`, 로컬 메인 실행기가 포함된다. 설치기가 마지막에 출력하는 `MUKMUK_ENV_FILE=… uv … scripts/macos_local.py` 명령으로 그 고정 버전의 로컬 메인을 실행한다. 실행기의 import 경로는 설치 버전으로 고정되어 현재 개발 브랜치를 읽지 않는다. 개발 검증용 진입점은 `uv run python -m mukmuk.local_bot`이다.
4. 실제 transaction pooler에서 수집 잠금/공유 Store와 Edge 응답·삭제를 겹쳐 연결 제한 3, 포화 복구, 임대 갱신을 확인한다. 로컬 준비·재접속·강제 종료·재시작, 기존 명령의 오프라인 동작, 비공개 응답/버튼/모달의 300초 정리를 확인한다. 실제 테스트 메시지·계정 연결은 당사자 동의와 별도 운영 요청이 있을 때 수행한다.
5. 활성화할 때 로컬과 Edge의 기능 플래그 및 DB `mukmuk_identity_state.enabled`를 함께 켠다. `register_cmd.py`는 로컬 플래그가 true일 때만 계정 명령을 추가 등록한다. `/계정검토`의 기본 권한은 MANAGE_GUILD이며 현재 REST 권한도 재검증한다. DB 신호만으로 신청을 확정하지 않고 로컬의 현재 세션/fence 확인 후에만 처리한다.

로컬 메인은 터미널 전경에서 실행하며 중단은 Ctrl-C다. Gateway 연결에는 guilds intent만 사용하고 메시지/멤버/presence privileged intent는 요구하지 않는다. 연결 건강 상태가 준비되지 않으면 계정 기능을 열지 않는다. 수집은 같은 메인이 5분마다 실행하며 기존 launchd는 파일 잠금과 15초 이내 신호를 함께 확인해 중복 접속을 피한다. 메인 종료·신호 만료 후 다음 launchd 주기는 기존 단독 수집으로 복귀한다. 수집이 240초를 넘거나 종료 중 수집 스레드가 멎으면 제한 시간에 프로세스를 종료한다. 설치 버전을 갱신했다면 전경 메인도 새 출력 명령으로 다시 시작한다.

전달 동작은 15초 후 만료하며 재시작한 세션이 예전 전달을 처리하지 않는다. 승인된 요청은 봇이 꺼져도 반영 대기로 남는다. 다음 온라인 수집에서 최대 1건씩 현재 자격을 재확인한다. 429는 retry_after까지 보류하고 실패 횟수에 넣지 않으며, 연속 일시 오류 10회는 failed로 종료한다. 상태·시도·임대·다음 시각·비식별 오류 코드는 비공개 요청 테이블에서 확인한다. 원본·토큰·실제 사용자 ID를 로그나 공개 안내에 복사하지 않는다.

중단·복구 시 기능 플래그와 DB enabled를 꺼 신규 변경을 막고 기존 수집/삭제는 유지한다. 이미 revision>0이면 person 모드와 구버전 409를 유지한다. raw 방식으로 롤백하거나 과거 관측을 덮어쓰지 않는다. HTTP 게시만 실패했다면 DB 적용은 유지되고 다음 수집이 현황판 게시를 다시 시도한다. 무기록 부계정을 연결해도 운동일은 새로 생기지 않는다.

로컬 자동 검증은 `npm test`, 공개 테스트 설정의 `npm run build`·`npm run test:browser`, 임시 PostgreSQL의 Python/Deno 통합 검사와 Edge entrypoint `deno check`로 수행했다. Docker daemon이 응답하지 않아 이 세션의 후반 DB 검증은 소유한 별도 로컬 PostgreSQL 클러스터로 진행했다. CI는 기존 `scripts/test-db.sh`의 PostgreSQL17 Docker 경로를 유지한다. 실제 pooler, Discord 버튼·모달 수신, 운영 사용자 연결, 운영 런타임 갱신과 배포는 미확인이다.


## 계정 연결 운영 검증과 롤백 절차

상태: **절차 작성만 완료, 실행 전**. 이 문서 정리와 PR 개설은 main 병합, 운영 DB 마이그레이션, Edge·Pages·로컬 런타임 배포, 명령 등록, 기능 활성화를 포함하지 않는다. 아래 운영 변경과 실제 계정 검증은 별도 승인된 작업 창에서 수행한다. 실제 계정·메모·사진·토큰은 검증 보고에 넣지 않고 버전·건수·성공 여부만 남긴다.

### 운영 반영 전 준비

1. 적용 후보 커밋과 직전 정상 버전의 Pages 소스·Edge 소스·macOS 설치 해시·GitHub 보완 수집 소스를 기록한다. 묵묵 데이터와 관측·감사의 백업 및 복구 가능 여부를 기존 백업 절차로 확인한다. 공용 프로젝트 전체 복원은 다른 앱에 영향을 주므로 이 기능의 롤백 수단으로 사용하지 않는다.
2. 후보 커밋의 Checks 전체 성공과 마이그레이션 적용 현황을 확인한다. 이번 변경은 위 네 SQL 파일이며 각 파일은 자체 트랜잭션이다. 다른 앱의 스키마·키·프로젝트 전역 설정·worker 연결 제한을 바꾸지 않는다. 운영 DB에는 지금 이 문서에 따라 SQL을 실행하지 않는다.
3. 로컬·Edge의 `MUKMUK_ACCOUNT_LINK_ENABLED=false`, DB `mukmuk_identity_state.enabled=false`를 준비값으로 둔다. DB 상태 조회는 해당 테이블을 만든 뒤에 가능하다. 계정 기능을 끈 상태에서 기존 기록 조회·갱신·삭제 Cron이 정상인지 확인한다.
4. **첫 연결 적용 전에 모든 수집 경로가 사람 집계에 대응해야 한다.** 로컬 메인, 설치된 launchd fallback, GitHub 일일 보완 수집의 실제 실행 소스를 대조한다. main 병합 전의 기존 GitHub 수집 코드를 그대로 둔 채 운영 연결을 활성화하지 않는다.
5. 네 마이그레이션을 순서대로 적용한 뒤 새 RPC와 이에 대응하는 Edge·웹·Python을 비활성 상태로 준비한다. 새 웹이 사용하는 `get_dashboard_identity`가 먼저 준비돼야 한다. 코드·역할·개인 테이블 비공개 권한과 `revision=0`에서의 기존 결과 일치를 확인한다.

### 검증 항목과 통과 기준

| 단계 | 확인할 내용 | 통과 기준 |
| --- | --- | --- |
| 기본 비활성 | 월간 N/S/D, 일수·사진 단계, 전체 잔디 분모, 기존 명령 | 기존 결과 일치. N은 해당 월 인증 사람 수, 전체 분모는 전체 기간 인증 이력 사람 수. 신규 계정 요청 확정 0건 |
| 실제 pooler | 수집 잠금·공유 Store/tick·Edge 응답/삭제 동시 실행, TLS | 역할 연결 제한 3 유지. HTTP·sleep 중 Edge 연결 반환. 53300은 획득 전에만 제한 재시도하며 실패를 빈 기록으로 바꾸지 않음. TLS 서버 검증 유지 |
| 온라인 수명 | Gateway 준비·단절·재시작·로컬 종료, launchd fallback | 준비 중/오프라인 업무 확정 0건. 5초 갱신·15초 임대, 15초 동작 만료, 이전 session/fence 전달 실행 0건. 중복 수집 없음 |
| 동의·검토 | 두 계정 신청/동의, 다른 관리자 승인, 취소·거절·해제 | 비참여자·연결된 자기 계정 그룹의 승인 차단. 오래된 버튼 중복 실행 없음. 상대 탈퇴 시에도 허용된 취소·이력 조회 가능 |
| 응답 수명 | 명령·동의/승인 버튼·거절 모달 | 업무 응답은 새 비공개 메시지와 독립 삭제 예약. 게시 +300초 삭제, 부모 메시지 예약 연장 없음. 모달 열기 type 9, 제출 type 5 |
| 적용·관측 | 승인 후 성공 수집, 중복 운동일·사진 OR, 무기록 부계정 | 승인만으로 revision 변경 없음. 온라인 수집당 최대 1건 적용. 관계·현재 표본·성공 시각·완료·감사 함께 확정. 닫힌 날짜 관측과 원본 작성자 보존 |
| 웹·사진 | 로드 도중 revision 변경, 사진 원본 작성자·기준 버전, 구버전 웹 | 전체 로드 재시도 최대 2회. 혼합 결과 미게시. 첫 화면 사진 요청 0건. 최초 실제 적용 후 구버전 필수·참여율·사진 경로 모두 409 |
| 비교·실패 | 계산 버전/계정 버전 변경, HTTP 게시 실패, 저장 실패 | 현재 백분율 유지·기준이 다른 전일 증감 제외. 같은 버전의 정확한 전날 표본이면 비교 재개. 저장 실패 시 적용 전체 롤백. 게시 실패 시 DB 완료 보존·다음 수집 게시 재시도 |

준비·연결 반환·기본 비활성 검증과 실제 신청·승인·적용 검증을 구분한다. 실제 업무 흐름의 확인에는 운영 기능의 일시 활성화와 양 계정의 동의, 독립 관리자가 필요하므로 **별도 승인 없이 실행하지 않는다**. 검증용 데이터를 운영 인증 채널에 임의 생성하거나 원본 수정·삭제로 실패를 주입하지 않는다. 저장 실패·강제 장애 주입은 격리 DB에서 검사하고, 운영에서는 승인된 요청과 제한된 관측으로 확인한다.

### 중단과 코드 복구

문제 발견 시 계정 기능의 새 업무 확정과 적용을 먼저 멈춘다. DB에 접근할 수 있으면 기존 `mukmuk-workouts` 트랜잭션 잠금 아래 `mukmuk_identity_state.enabled=false`를 확정하고, 로컬·Edge 플래그도 false로 맞춘다. 이 변경이 확정되기 전에 이미 완료된 적용은 되돌아가지 않으므로 **중단 후 실제 revision을 다시 조회**한다. DB에 접근할 수 없으면 해당 로컬 메인을 먼저 Ctrl-C로 종료한 뒤 DB 복구 시 비활성을 확인한다. 공용 DB·Docker 전체나 다른 앱 프로세스를 중단하지 않는다.

로컬 종료/임대 만료 후 이전 세션의 15초 전달이 더 이상 유효하지 않은지 확인한다. status가 queued/processing으로 남아 있어도 만료 시각을 함께 판정하며, 이미 승인된 요청은 반영 대기로 보존한다. 기존 수집·삭제는 대응 버전으로 유지하고, launchd가 메인 종료 후 중복 없이 fallback하는지 확인한다.

| 중단 시점 | 복구 방법 | 보존할 것 |
| --- | --- | --- |
| SQL 적용 도중 실패 | 실패한 파일의 트랜잭션 롤백을 확인. 앞서 커밋된 파일과 현재 코드 상태를 기록하고 보정·재개를 별도 검토. 새 RPC가 준비되기 전에 새 웹을 공개하지 않음 | 이미 커밋된 스키마·데이터. 무조건 전체 파일 재실행 또는 객체 삭제 금지 |
| 실제 관계 적용 전, revision=0 | 비활성·유효 전달 없음·legacy RPC 정상과 노출할 표본의 계산 버전 호환성을 확인한 뒤 직전 정상 코드로 복귀 가능. 이미 계산 버전 2 표본이 있으면 전일 비교 제외를 지원하는 웹을 유지 | 원본·닫힌 날짜 관측·요청/동의 이력·DB 추가 객체. 당일 표본은 마지막 성공 수집 정책대로 갱신 가능 |
| 관계 적용 후, revision>0 | 사람 집계·revision·구버전 409를 지원하는 정상 버전으로만 복귀. 그런 버전이 없으면 기능을 비활성 상태로 두고 보정 릴리스 준비 | 현재 소속, 단조 증가 revision, 원본, 닫힌 관측, 감사. raw 전용 구버전 코드로 전체 복귀 금지 |
| DB 확정 후 현황판 게시만 실패 | 적용 완료를 유지하고 게시 오류를 관측. 대응 버전의 다음 수집에서 게시 재시도 | DB 성공 시각·적용 완료·감사. 같은 승인 재적용 금지 |
| 잘못 연결한 계정 정정 | 원인 확인 후 별도 승인으로 검증 창을 열어 당사자의 해제 요청과 다른 관리자의 승인을 거쳐 다음 성공 수집에서 정정 | 원본 작성자·메시지·닫힌 과거 관측. 새 revision으로 정정 이력 기록 |

운영 스키마를 삭제하는 down migration은 제공하지 않는다. `revision` 감소, 소속 행 수동 교체, 지난 날짜 N/S/D 재계산, 공용 프로젝트 전체 복원으로 되돌리지 않는다. 재개 전 동일 후보 소스·DB 버전·TLS·권한·비활성 기본값을 재확인하고, 별도 승인을 받은 뒤에만 신규 기능을 다시 연다. 재개 시 보존된 승인 요청도 현재 자격·구성·세션을 다시 검증하며 수집당 최대 1건 적용한다.
