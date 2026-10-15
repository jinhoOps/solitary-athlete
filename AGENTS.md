# 고독한 운동가 · 에이전트 지침

## 프로젝트 정체성

- 브랜드: **고독한 운동가**. 표기 앞뒤에 공백을 넣지 않는다.
- 봇: **묵묵**, 코드·설정 식별자: `mukmuk`.
- 슬로건: **오늘도 묵묵히, 잔디 한 칸.**
- 목적: Discord의 운동 인증을 하루 한 칸의 기록으로 모으고, 각자의 꾸준함을 돌아볼 수 있게 한다.
- 제품 문구와 기본 문서는 한국어로 작성한다. 코드 식별자는 영어를 사용한다.
- 차분하고 짧게 말한다. 사용자가 요청한 `운동왕 👑` 월간 KPI만 순위 금지 원칙의 예외로 둔다. 그 외 순위, 벌점, 쉬는 날에 대한 질책, 과도한 응원 문구를 추가하지 않는다.

## 현재 단계와 읽는 순서

현재는 **기능 구현·배포 검증 단계**다. Python 수집기, 서명 검증 슬래시·삭제 워커, 바닐라 TypeScript 웹보드와 CI/배포 워크플로우가 구현됐다. Pages·Edge·삭제 Cron은 배포됐고 로컬 수집·명령어 등록은 확인됐다. PR #1이 main에 병합됐고 수집 워크플로우 수동 실행이 성공했다. 정기 수집은 로그인된 개발 맥북의 launchd에서 5분마다 실행하며 GitHub Actions는 매일 06:00 KST 보완 수집을 예약한다. 수집기 변경을 배포할 때는 `uv run python scripts/install_macos_scheduler.py`로 검증한 로컬 런타임도 갱신한다. 실행·상태는 [운영 안내](docs/operations.md), 실제 ID·권한·이력은 [ARCHITECTURE.md](ARCHITECTURE.md#17-discord-초기-설정-현황)를 따른다.

1. [README](README.md): 목적, 범위, 진행 상태.
2. [DESIGN.md](DESIGN.md): YAML 디자인 토큰, 브랜드·타이포그래피·레이아웃·컴포넌트·반응형의 단일 기준.
3. [ARCHITECTURE.md](ARCHITECTURE.md): 제품 동작·날짜·데이터·기술 선택·운영 설정과 적용 이력.
4. [기여 안내](CONTRIBUTING.md): 변경과 검증 기준.

시각 디자인은 루트 `DESIGN.md`에서 관리한다. Cal 참고 문서처럼 YAML 토큰과 컴포넌트 규칙을 정의하고 관련 SVG 시안을 함께 갱신한다. DB·배포·실제 ID·제품 동작은 `ARCHITECTURE.md`에 기록한다. 두 문서의 책임을 섞거나 다른 경로에 같은 디자인 정의를 복제하지 않는다.

사용자가 요청한 단계부터 진행한다. 지침·설계·소개 정리 요청을 기능 구현이나 외부 서비스 배포로 확대하지 않는다. 이후 구현 요청이 오면 위 설계와 요청을 대조하고 필요한 부분을 갱신한다.

## 제품 계약

| 항목 | 기준 |
| --- | --- |
| 인증 | `#오운완`의 일반 사용자 텍스트 또는 사진 메시지 |
| 기록 날짜 | 메시지 작성 시각을 `Asia/Seoul`로 변환한 날짜 |
| 잔디 | 같은 사용자·같은 날의 여러 인증도 한 칸, 통계는 운동 **일수** |
| 잔디 단계 | 0 기록 없음 · 1 텍스트 인증 · 2 사진 포함 인증(진한 녹색). 같은 날 사진이 하나라도 있으면 2단계 |
| `/잔디` | 옵션이 없으면 본인, `유저` 옵션이 있으면 해당 멤버 |
| 슬래시 출력 | 최근 28일과 최근 기록일 5개의 메모, 채널 구성원에게 공개 |
| 슬래시 수명 | 결과 표시 후 300초에 삭제 예정. 예약 큐로 처리하고 지연·실패를 관측 |
| 현황판 | 최근 14일(2주 요일별 2행 그리드), 기존 묵묵 현황판을 수정. 5분 삭제 대상에 포함하지 않음 |
| 웹 | 선택 연도(평년 365일·윤년 366일) 잔디, 월간 KPI 4종, 멤버 필터, 주간 시크릿 코드 보호, 메모 타임라인 |
| 이번 주 | KST 월요일 00:00부터 오늘까지. 최근 7일과 혼용하지 않음 |
| 연속 일수 | 오늘 미인증이면 어제부터 계산. 오늘 하루가 끝나기 전에 끊지 않음 |
| 배포 범위 | 초기 버전은 한 Discord 서버. 서버 ID를 검증하고 DM을 지원하지 않음 |

## 구현 원칙

- 수집은 Python + `uv`, 실시간 응답·삭제는 Supabase Edge Functions, 웹은 GitHub Pages용 정적 페이지를 기본으로 한다.
- 웹 코드는 **TypeScript**를 사용한다. 현재의 단일 대시보드는 바닐라 TypeScript로 시작하고, 여러 화면·복잡한 폼·공유 상태로 DOM 관리가 복잡해지면 React + TypeScript를 선택한다. 전환 이유는 `ARCHITECTURE.md`에 기록한다.
- 단순함은 재처리 안전성과 기록 보존을 포함한다. `message_id`로 중복을 방지하고, 같은 날의 메모는 원본 기록에서 원자적으로 집계한다.
- ✅는 저장 성공을 알리는 표시다. 중복 판정이나 수집 위치의 유일한 근거로 사용하지 않는다.
- Discord와 DB 조회를 페이지네이션한다. 최근 100개, 전체 500개 같은 고정 제한을 완전한 기록으로 취급하지 않는다.
- 현황판은 작성자와 고유 표식을 함께 검사한다. 봇이 작성한 임의의 최신 메시지를 덮어쓰지 않는다.
- 날짜 규칙, 정렬, 집계 결과가 Python·TypeScript·브라우저에서 같아야 한다.
- 사용자 표시명·메모는 신뢰하지 않는다. 바닐라 웹은 `textContent`, React는 일반 텍스트 렌더링을 사용한다. Discord의 생성·수정 요청에는 `allowed_mentions: { parse: [] }`를 지정한다.
- 여러 줄 메모가 여러 번의 운동을 뜻하지 않는다. 인증 횟수가 필요하면 별도 집계 필드를 사용한다.
- 사진 여부는 Discord 이미지 첨부에서 판정하고 일별 `has_photo`를 OR 집계한다. 메모 문구·줄바꿈·인증 횟수로 단계를 추측하지 않는다. 사진 단계에서도 운동일수·연속 일수는 하루 1일로 센다.
- HTTP 상태, 타임아웃, 429의 `retry_after`, 5xx 재시도를 처리한다. 실패한 DB 응답을 빈 기록으로 보여주지 않는다.
- 슬래시 요청은 원문 본문의 Ed25519 서명을 검증한다. Discord 수신 함수의 JWT 검증 예외를 다른 관리 함수까지 확대하지 않는다.
- 5분 삭제를 함수 내부 `sleep`/`setTimeout`이나 매시간 GitHub Actions에 맡기지 않는다.
- 외부 서비스 변경은 사용자가 요청한 범위에서 수행하고 결과를 확인한다. 토큰, 비공개 기록, 실제 사용자 데이터를 로그나 문서에 넣지 않는다.
- 공용 Supabase는 서울 리전 `github-jinhoOps`(ref `olqdftjssrzqvcindekh`)로 재생성·통합됐다. 기존 `solitary_athlete` 스키마를 사용한다. 사용자의 진행 요청에 따라 묵묵 테이블·역할은 적용됐다. 함수·Cron은 후속 기능 구현에서 배포한다. 다른 앱의 스키마·API 노출·전역 권한·키를 변경하지 않는다.

## 데이터·설정

- 공용 Supabase의 서버 접근은 앱 전용 역할의 `MUKMUK_DATABASE_URL`, 브라우저 읽기는 `SUPABASE_PUBLISHABLE_KEY`를 기본 계획으로 한다. 프로젝트 전체 권한을 가진 secret/service-role 키를 앱별로 이름만 바꿔 격리된 키라고 취급하지 않는다.
- 데이터는 기존 `solitary_athlete` 스키마, 함수·Cron·원격 Secrets는 `mukmuk`/`MUKMUK_` 이름으로 구분한다. 기존 앱의 스키마·설정·마이그레이션 이력에 변경을 섞지 않는다. 연결 계획은 [공용 Supabase 계획](docs/superpowers/plans/2026-10-14-shared-supabase-integration.md)을 따른다.
- [`.env.example`](.env.example)은 설정 이름의 기준이다. 비밀값은 `.env` 또는 서비스의 Secrets에만 보관한다.
- `workout_logs`는 공개 일별 집계, 원본 이벤트·수집 커서·삭제 큐는 서버 전용이다. RLS와 권한을 명시한다.
- 공개 대시보드에는 표시명·운동 날짜·텍스트 메모가 공개된다는 안내를 포함한다. 사진 원본과 첨부 URL은 웹으로 복제하지 않는다.
- SQL 변경은 구현 단계에서 `supabase/migrations/`에 남긴다. 콘솔에서만 바꾸고 끝내지 않는다.

## 검증·완료 보고

- 문서·브랜드 변경: 링크, 명칭, 기간, 상태 표기와 SVG 렌더를 검증한다. 구현과 같은 내용을 되풀이하는 테스트는 만들지 않는다.
- 기능 변경: 날짜 경계, 사진 단계 상승·사진 제거 재집계, 일수 불변, 중복 재실행, 페이지네이션, 서명 오류, 삭제 재시도 등 해당 변경의 실제 실패 조건을 검증한다. 웹 변경은 TypeScript 타입 검사와 정적 빌드도 확인한다.
- 문서 단계에는 실행 명령을 지어내지 않는다. 구현 후 실제로 실행한 명령과 결과를 안내에 반영한다.
- 완료 보고에는 변경한 것, 확인한 것, 남은 제한을 짧게 쓴다. 배포·실서비스 검증은 실제 수행했을 때만 완료로 표시한다.
- 기존 작업과 라이선스를 보존한다. 관계없는 리팩터링·배포를 섞지 않는다. 사용자가 기능·마일스톤 단위 커밋·푸시를 요청했으므로 검증이 끝난 범위를 커밋하고 현재 작업 브랜치를 푸시한다. 기존 앱 변경·비밀값을 포함하지 않으며 공용 브랜치 병합은 별도 요청을 따른다.
- 하위 에이전트는 사용자가 병렬 작업·위임을 요청하거나 적용 지침이 명시한 경우에만 사용한다.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
