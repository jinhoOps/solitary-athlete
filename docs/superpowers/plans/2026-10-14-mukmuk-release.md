# 묵묵 기능 구현·Pages 배포 계획

> **For agentic workers:** Use `executing-plans`, inline. 사용자가 구현·테스트 후 배포를 요청했다. 별도 위임 없이 현재 Orca 체크아웃과 기능 브랜치에서 진행한다.

**Goal:** 공개 웹보드를 실제 Pages에 배포하고, 수집·현황판·슬래시·삭제 기능을 테스트 가능한 실행 코드로 제공한다.

**Architecture:** 기존 `solitary_athlete` 테이블과 앱 전용 DB 역할을 재사용한다. 웹은 바닐라 TypeScript/Vite, 수집은 Python/uv, Discord 수신·삭제는 TypeScript Edge Functions다. Pages에는 검증된 정적 산출물만 `gh-pages`로 발행한다.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright, Python, psycopg, httpx, PostgreSQL 17, Supabase Edge Functions.

**Spec:** [ARCHITECTURE.md](../../../ARCHITECTURE.md), [DESIGN.md](../../../DESIGN.md), [AGENTS.md](../../../AGENTS.md).

## Global Constraints

- KST 날짜, 월요일 기준 이번 주, 오늘 미인증 시 어제부터 연속, 누적은 전체 날짜.
- 사진 여부는 이미지 첨부로 판단한다. 하루 한 칸, 사진 포함 2단계.
- 공개 웹에는 사진 URL·원본 이벤트·서버 키를 포함하지 않는다.
- 페이지네이션, 원자적 집계, 메시지 ID 중복 방지, 멘션 비활성화.
- 슬래시 공개 defer 후 표시 시각 +300초의 영속 큐, 암호화 토큰, 선점·재시도.
- 공용 DB 다른 앱·전역 키·권한을 변경하지 않는다. 현재 기능 브랜치를 마일스톤별 푸시하며 main 병합은 수행하지 않는다.

## Review Focus

- 표시 범위 밖의 이력도 누적·연속 통계에 포함되는지.
- 사진 제거·같은 인증 재실행이 일별 집계를 왜곡하지 않는지.
- 사용자 문자열의 HTML·멘션과 긴 메모가 화면·Discord 한도를 깨지 않는지.
- 게시 후 예약 확정 실패와 삭제 워커 중단이 복구되는지.
- 빌드 산출물에 서버 설정이 들어가지 않고 Pages 하위 경로에서 정상 조회되는지.

### Task 1: 공개 웹보드

**Files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/{main,api,dates,types}.ts`, `src/style.css`, `tests/web/*.test.ts`, `tests/browser/dashboard.spec.ts`, `playwright.config.ts`.

**Interfaces:** `dayAt(now, daysAgo): string`, `stats(dates,today): {week,streak,total}`, `calendar(today): (string|null)[]`; `loadDashboard(config): Promise<{members,logs,lastSuccess}>`, `loadTimeline(config,userId,offset): Promise<WorkoutLog[]>`.

- [x] 1. 수동 계산한 KST 자정·월요일·어제부터 연속·84일 정렬·전체 통계와 1,000개 초과 공개 조회, HTTP 실패 테스트를 먼저 작성한다.
- [x] 2. `npm test`에서 미구현 함수/모듈로 실패를 확인한다.
- [x] 3. 날짜·API 함수와 공개 키만 정의하는 Vite 설정을 구현한다.
- [x] 4. `npm test && npm run typecheck`가 통과해야 한다.
- [x] 5. Playwright에서 사진 단계·필터·날짜 상세·키보드·XSS·로딩/빈/오류·더 보기 실패 유지·320/360/768/1280·200% 확대를 검증하는 테스트를 먼저 작성하고 실패를 확인한다.
- [x] 6. DESIGN 토큰에 맞춘 실제 DOM과 CSS를 구현한다. `npm run test:browser && npm run build`가 통과해야 한다.
- [x] 7. 정적 산출물에서 비밀값 부재를 확인하고 커밋·현재 브랜치 푸시.

### Task 2: 인증 수집·현황판

**Files:** `pyproject.toml`, `uv.lock`, `mukmuk/{discord,store,sync,board}.py`, `main.py`, `register_cmd.py`, `tests/python/`, `scripts/test-db.sh`.

**Interfaces:** `Discord.messages(channel,before=None)` 페이지 조회; `Store.save(event)` 원자적 원본·일별 재집계; `run_sync(discord,store,settings,now)` 전체 실행.

- [x] 1. 중복 재처리·KST 자정·사진 추가/제거·빈 인증으로 수정·리액션 실패 후 재시도·100건 초과·커서 실패·현황판 표식 복구/분할·429 테스트를 작성한다.
- [x] 2. `uv run pytest`의 실패를 확인한 후 HTTP 재시도·원자적 저장·수집·현황판과 서버 명령어 등록을 구현한다.
- [x] 3. `scripts/test-db.sh`와 `uv run pytest`에서 실제 PostgreSQL 트랜잭션·역할과 수집 경계 테스트 통과 확인.
- [ ] 4. 실제 봇 토큰이 있으면 운영 연결·읽기·명령어 등록을 확인하고, 없으면 설정 누락을 운영 상태에 명시한다. 커밋·푸시.

### Task 3: 슬래시·5분 삭제

**Files:** `supabase/functions/_shared/{grass,crypto,interactions,cleanup,db}.ts`, `supabase/functions/mukmuk-discord-{grass,cleanup}/index.ts`, `supabase/config.toml`, `tests/edge/*.test.ts`.

**Interfaces:** `handleInteraction(request,deps): Promise<Response>`, `publishReply(body,deps)`, `cleanupDue(deps,now)`; DB 큐는 기존 preparing/scheduled/processing/done/failed 계약을 유지한다.

- [ ] 1. 실제 Ed25519 서명·잘못된 입력/서버·defer·본인/타인·빈/오류·300초·AES-GCM 변조·재전달·lease 경쟁·429/404/만료·preparing 복구 테스트를 작성하고 실패를 확인한다.
- [ ] 2. 큐를 먼저 저장하고 공개 원본 응답을 수정하는 함수와 due 작업만 선점하는 삭제 함수를 구현한다.
- [ ] 3. `npm test`, Deno 형 검사, PostgreSQL 큐 통합 검사를 통과시키고 커밋·푸시한다.

### Task 4: CI·Pages·운영 연결

**Files:** `.github/workflows/{checks,sync,pages}.yml`, `scripts/{publish-pages,check-build}.mjs`, `docs/operations.md`, README/AGENTS/준비 현황.

- [ ] 1. CI에 Python·TypeScript·브라우저·DB 검사를 구성하고 정기 수집은 매시 17분, 동시 실행을 제한한다.
- [ ] 2. Pages 공개 설정을 전달하여 정적 빌드·검증 후 전용 `gh-pages`에 발행한다. GitHub Pages source를 해당 브랜치 루트로 설정한다.
- [ ] 3. 실제 HTTPS URL·JS/CSS·공개 API·모바일 화면과 배포 SHA를 확인한다.
- [ ] 4. 코드 검증 후 가능한 서버 Secrets·Edge·Cron을 연결한다. 인증이 필요한 누락 항목은 배포된 웹과 구분해 명시한다.
- [ ] 5. 전체 검증·별도 자체 코드 리뷰·문서 상태 갱신 후 커밋·푸시. 실제 확인한 배포 URL과 제한을 보고한다.
