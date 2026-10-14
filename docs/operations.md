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

`Sync Workout Logs`는 매시 59분(`59 * * * *`)과 수동 실행을 정의한다. `mukmuk-discord-sync` concurrency로 중복 실행을 막는다.

**예약 워크플로우는 기본 브랜치(`main`)에서 실행된다.** 현재 기본 브랜치에 반영되어 정기 수집이 활성화되어 있으며, 필요 시 Actions 콘솔 또는 로컬 `uv run main.py`로 수동 실행할 수 있다. [GitHub schedule 규칙](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

| Repository Secrets | 용도 |
| --- | --- |
| `DISCORD_BOT_TOKEN` | 봇 REST 인증 |
| `MUKMUK_DATABASE_URL` | 묵묵 전용 DB 역할 |

채널·서버·이모지 ID와 `DASHBOARD_URL`은 `.env.example`과 같은 이름의 Repository Variables를 사용한다. 현재 필요한 Secrets/Variables는 등록됐다. 등록 스크립트는 서버 `/잔디` 한 개를 upsert하며 다른 명령어를 일괄 삭제하지 않는다.

## Edge Functions·삭제 Cron

| 대상 | 설정 |
| --- | --- |
| `mukmuk-discord-grass` | 원문 Ed25519 서명, 서버·앱 검사 후 공개 defer |
| `mukmuk-discord-cleanup` | POST, 타임스탬프·nonce·HMAC-SHA256 서명 확인 |
| `mukmuk-cleanup-due` | 10초마다 due 여부 확인, 있을 때만 함수 호출 |
| `mukmuk-cleanup-history` | 앱 Cron 이력만 7일 보존, 다른 앱 이력 유지 |

두 함수의 플랫폼 JWT 검사는 꺼져 있고 각 함수가 위 인증을 수행한다. Discord 개발자 포털의 인터랙션 엔드포인트는 다음 주소다.

```text
https://olqdftjssrzqvcindekh.supabase.co/functions/v1/mukmuk-discord-grass
```

Edge Secrets는 `MUKMUK_DATABASE_URL`, `MUKMUK_REPLY_TOKEN_KEY`, `MUKMUK_CLEANUP_SECRET`, `MUKMUK_DISCORD_PUBLIC_KEY`, `MUKMUK_DISCORD_GUILD_ID`, `MUKMUK_DISCORD_APP_ID`, `MUKMUK_DASHBOARD_URL`, `MUKMUK_GRASS_RECORD_EMOJI_ID`, `MUKMUK_GRASS_PHOTO_EMOJI_ID`다. 값은 문서에 남기지 않는다. `pg_net` 전송 큐를 다른 역할도 읽을 수 있어 장기 비밀값을 HTTP 요청에 넣지 않는다. Vault 키로 계산한 `X-Mukmuk-Timestamp`·`X-Mukmuk-Nonce`·`X-Mukmuk-Signature`만 전송한다. 서명은 30초 유효하며 미래 시각 오차는 최대 5초 허용한다. 짧은 창에서 동일 요청의 재전송은 가능하지만 due 큐의 원자적 선점으로 삭제 부작용은 중복 처리하지 않는다.

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
