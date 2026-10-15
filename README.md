<p align="center">
  <img src="assets/brand/banner.svg" alt="고독한 운동가 — 오늘도 묵묵히, 잔디 한 칸." width="100%">
</p>

<p align="center">
  <strong>고독한 운동가</strong><br>
  운동 인증을 모아, 각자의 꾸준함을 잔디로 기록합니다.<br>
  조용히 기록을 챙기는 봇, <strong>묵묵 <code>mukmuk</code></strong>.
</p>

<p align="center">
  <a href="ARCHITECTURE.md">제품·시스템 설계</a> ·
  <a href="DESIGN.md#overview">브랜드·화면 설계</a> ·
  <a href="AGENTS.md">에이전트 지침</a> ·
  <a href="CONTRIBUTING.md">기여 안내</a>
</p>

## 오늘도 묵묵히, 잔디 한 칸.

혼자 운동해도 기록은 함께 쌓을 수 있습니다. `#오운완`에 운동 메모나 사진을 남기면 묵묵이 기록을 모읍니다. 하루의 인증은 잔디 한 칸이 되고, Discord와 웹에서 지난 운동을 돌아봅니다.

순위를 매기기보다 자신의 리듬을 지키는 작은 운동 기록 공간을 만듭니다.

**[웹보드 열기 →](https://jinhoops.github.io/solitary-athlete/)**

수집기·현황판, `/잔디`·5분 삭제 큐, TypeScript 웹보드를 구현했습니다. Pages·Supabase Edge·삭제 Cron을 배포하고 테스트·실제 DB 연결을 검증했습니다. 정기 인증 수집은 개발 맥북에서 5분마다, GitHub 보완 수집은 매일 06:00 KST에 예약합니다. [실행·운영 상태](docs/operations.md)를 확인하세요.

## 묵묵이 할 일

| 이용 방법 | 보여줄 내용 |
| --- | --- |
| `#오운완`에 텍스트·사진 남기기 | 운동 기록 저장 후 ✅ 표시 |
| `/잔디` | 내 최근 28일 잔디와 최근 기록일 5개의 메모 |
| `/잔디 유저:@멤버` | 선택한 멤버의 잔디와 메모 |
| `#잔디` | 멤버들의 최근 14일 잔디를 요일별 2행 그리드(`월 \| 화 \| 수 \| 목 \| 금 \| 토 \| 일`)로 갱신 |
| 웹 대시보드 | 선택 연도(평년 365일·윤년 366일) 잔디, 이번 달 4대 KPI, 멤버별 메모 타임라인, 주간 시크릿 코드 보호 |

슬래시 결과는 채널 구성원에게 보이며 **표시 후 5분 뒤 삭제**하도록 예약합니다. 현황판과 운동 원본 기록은 계속 남습니다. 삭제는 예약 작업으로 처리하며 서비스 장애나 요청 지연 때는 늦어질 수 있습니다.

기록 날짜는 한국 시간(KST) 기준입니다. 같은 날 여러 번 인증해도 운동일은 1일로 셉니다. 인증 수집과 현황판 갱신은 맥북이 실행 중일 때 약 5분 간격으로 실행하며, `/잔디`는 호출 시점에 **저장된 기록**을 조회합니다. 방금 작성한 인증이 수집되기 전에는 결과에 나타나지 않을 수 있습니다.

잔디는 **기록 없음 → 텍스트 인증 → 사진 포함 인증**의 세 단계입니다. 같은 날 사진 인증이 하나라도 있으면 한 단계 더 진한 녹색으로 표시합니다. 사진을 여러 장 남겨도 운동일은 하루 1일로 셉니다.

## Discord 공간

| 채널 | 역할 |
| --- | --- |
| `#공지` | 이용 안내와 매주 자동 발급되는 웹보드 접속 링크 (주간 시크릿 코드 포함) |
| `#잔디` | 묵묵이 갱신하는 14일 2행 운동 현황판 |
| `#오운완` | 운동 메모·사진 인증 |
| `#기록실` | 운동 이야기, 대회 기록, 모임 사진 (포럼) |
| `#자유` | 일상 대화와 잡담 |
| `#환영` | 신규 멤버 입장 시스템 메시지 (저소음) |

웹보드는 디스코드 `#공지` 채널에 매주 발급되는 시크릿 코드로 인증한 멤버만 열람할 수 있습니다. 참여자의 표시명, 운동 날짜와 텍스트 메모가 제공되며, 사진 원본과 첨부 URL은 웹에 옮기지 않습니다. 이 범위는 참여 안내에 명시합니다.

[고독한 운동가 서버 열기](https://discord.com/channels/1559802401802952706/1559802402893340744) · 공지·잔디·환영은 멤버 읽기 전용, 오운완·기록실·자유는 쓰기 가능으로 설정했습니다. 설치한 묵묵에게 현황판 쓰기 역할을 연결했습니다. 실제 ID와 초기 설정 상태는 [ARCHITECTURE.md](ARCHITECTURE.md#17-discord-초기-설정-현황)에 기록합니다.

## 설계 둘러보기

| 문서 | 내용 |
| --- | --- |
| [제품·시스템 계약](ARCHITECTURE.md) | 제품 동작·데이터·운영 설정·적용 이력 |
| [구현·배포 현황](docs/implementation-readiness.md) | 다음 마일스톤과 구현·실서비스 검증에 필요한 설정 |
| [에이전트 지침](AGENTS.md) | 브랜드 표기, 제품 계약, 개발·검증 원칙 |
| [DESIGN.md](DESIGN.md) | 색상·타이포그래피·컴포넌트·반응형 디자인 시스템 |
| [대시보드 시안](docs/design/dashboard-preview.svg) | 화면 구성과 시각적 방향을 확인하는 정적 시안 |
| [레포 소개 설정](docs/repository.md) | GitHub 설명, Topics, 브랜드 자산 사용 |
| [환경변수 예시](.env.example) | 구현에 사용할 공개 설정과 서버 비밀값의 구분 |
| [공용 Supabase 연결 계획](docs/superpowers/plans/2026-10-14-shared-supabase-integration.md) | 재생성된 프로젝트의 연결·권한·마이그레이션 검증 순서 |

## 기술 구성

| 구성 | 선택한 방향 |
| --- | --- |
| 인증 수집·현황판 갱신 | Python · uv · macOS launchd (5분) / GitHub Actions (매일 06시 KST) |
| 기록 저장 및 시크릿 검증 | Supabase Postgres · `get_workout_logs` RPC 및 주간 시크릿 제어 |
| 주간 시크릿 발급 워커 | Supabase Edge Functions (`mukmuk-weekly-code`) · 매주 월요일 00:00 KST |
| 슬래시 응답 | Supabase Edge Functions · TypeScript |
| 5분 삭제 | 비공개 예약 큐 · Supabase Cron · 삭제 함수 |
| 상세 웹보드 | 바닐라 TypeScript · 정적 빌드 · GitHub Pages, 복잡해지면 React + TypeScript |

1. 서버·채널 설정과 DB 마이그레이션.
2. 중복 없는 인증 수집과 14일 2행 현황판 갱신.
3. `/잔디` 조회와 5분 삭제.
4. 주간 시크릿 코드 자동 발급 및 1년 대시보드 v2 배포.

각 단계의 검증 기준은 [ARCHITECTURE.md](ARCHITECTURE.md#9-개발-단계와-완료-기준)에 있습니다. 실행·테스트·배포 방법은 [운영 안내](docs/operations.md)에 있습니다.

## 함께 만들기

[CONTRIBUTING.md](CONTRIBUTING.md)를 참고해 변경 목적과 확인 결과를 남겨 주세요. 기능 제안과 문제 보고는 [Issues](https://github.com/jinhoOps/solitary-athlete/issues)에서 받습니다.

[Apache-2.0](LICENSE) 라이선스.

## DB 기반 검증

[SQL 검증 안내](supabase/tests/README.md)에 따라 별도 임시 PostgreSQL 17 클러스터에서 실행합니다. KST 날짜, 사진 인증, 중복, 5분 삭제 큐 제약과 역할별 접근을 실제 SQL로 확인하고 가상 기록은 롤백합니다. 운영 DB의 현재 적용 상태는 [ARCHITECTURE.md](ARCHITECTURE.md#18-공용-supabase-통합-설계)에 기록합니다.
