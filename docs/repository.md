# GitHub 레포 소개

## 기본 정보

| 항목 | 설정 |
| --- | --- |
| Repository | `jinhoOps/solitary-athlete` |
| 브랜드 | 고독한 운동가 |
| 봇 | 묵묵 · `mukmuk` |
| Description | 고독한 운동가 · 오늘도 묵묵히, 잔디 한 칸. Discord 운동 인증을 기록하는 묵묵(mukmuk) 봇과 잔디 대시보드. |
| Topics | `discord-bot`, `workout-tracker`, `habit-tracker`, `supabase`, `github-actions`, `github-pages`, `python`, `typescript`, `mukmuk` |
| Website | 웹보드를 배포한 뒤 실제 URL을 등록 |
| 라이선스 | 기존 Apache-2.0 유지 |

README에는 지금 구현된 범위와 예정된 기능을 구분해 적습니다. 워크플로우가 생기기 전에 성공 배지를 달거나, 미배포 Pages 주소를 서비스 링크로 표시하지 않습니다.

## 브랜드 자산

- [마크](../assets/brand/mark.svg): 잔디 한 칸 안에 자라는 작은 새싹. 봇 아바타·파비콘의 방향을 제안하는 벡터 원본.
- [배너](../assets/brand/banner.svg): README 첫 화면에 사용하는 가로형 브랜드 소개.
- [텍스트 잔디](../assets/brand/grass-record.svg) · [사진 잔디](../assets/brand/grass-photo.svg): Discord에 등록할 기본·진한 녹색 단계의 벡터 원본.
- [대시보드 시안](design/dashboard-preview.svg): 화면 설계를 검토하는 정적 예시. 실제 사용자 데이터나 배포 화면이 아님.

SVG는 외부 이미지·폰트·스크립트를 불러오지 않습니다. 글꼴은 운영체제의 한국어 산세리프를 사용합니다. 디자인 원칙과 색상은 루트 [DESIGN.md](../DESIGN.md#11-브랜드-방향)를 따릅니다.

GitHub Social preview 업로드가 필요하면 배너를 PNG로 내보내 사용합니다. Discord 앱·서버 아이콘에는 [마크 PNG](../assets/brand/mark.png)를 적용했습니다. [기본 잔디 PNG](../assets/brand/grass-record.png)와 [사진 잔디 PNG](../assets/brand/grass-photo.png)는 각각 `mukmuk_grass`, `mukmuk_photo`로 서버에 등록했습니다. SVG는 수정용 원본으로 보존합니다. 실제 등록 ID는 [DESIGN.md](../DESIGN.md#17-discord-초기-설정-현황)를 따릅니다.

## 협업 파일

- `AGENTS.md`: 에이전트 작업 기준과 CodeGraph 지침.
- `DESIGN.md`: 제품·시스템·브랜드·화면 설계의 단일 기준 문서.
- `CONTRIBUTING.md`: 변경 목적, 검증, 기여 안내.
- `.github/ISSUE_TEMPLATE/`: 문제 보고·개선 제안 폼.
- `.github/PULL_REQUEST_TEMPLATE.md`: 변경 결과·검증 근거 기록.
- `.env.example`: 구현 시 사용할 설정 이름. 실행용 비밀값 없음.
