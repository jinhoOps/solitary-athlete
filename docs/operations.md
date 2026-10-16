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

## GitHub Pages

`Publish Pages`는 main 또는 현재 릴리스 브랜치 `mukmuk/db-foundation`의 화면 변경 시 실행한다. 단위 테스트·타입 검사·빌드·브라우저 검사 후 Pages artifact를 배포한다. 공개 설정 두 개만 빌드에 전달한다.

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
