# 묵묵 · 구현·배포 현황

확인: 2026-10-14. [PR #1](https://github.com/jinhoOps/solitary-athlete/pull/1)은 병합됐다. 이후 기준 main은 `3784894`이며 기존 설계·DB 기반을 재구현할 필요가 없다.

## 다음 작업의 기준

- [DESIGN.md](../DESIGN.md): 화면 토큰·컴포넌트·반응형.
- [ARCHITECTURE.md](../ARCHITECTURE.md): 제품·DB·운영 계약과 적용 이력.
- [운영 안내](operations.md): 실제 실행·검증·배포 명령.
- [구현 계획](superpowers/plans/2026-10-14-mukmuk-release.md): 이번 릴리스의 단계와 검증 범위.

## 구현·배포 결과

| 항목 | 상태 |
| --- | --- |
| TypeScript 웹보드 | 바닐라/Vite 구현, 사진 단계·84일·전체 이력 통계·필터·메모·키보드 상세 |
| GitHub Pages | [실제 웹보드](https://jinhoops.github.io/solitary-athlete/), main 머지 후 자동 배포 성공 |
| Python 인증 수집 | message_id 중복 방지·원자적 일별 집계·사진 제거·리액션 재시도·현황판 복구/분할 구현 |
| 실제 수집 | 로컬 및 GitHub Actions 수동 실행 성공, 현황판 생성·갱신 확인 |
| 정기 수집 | main에 워크플로우 등록, 현재 매시 59분·concurrency 적용 |
| `/잔디` | 서버 명령어 등록, Ed25519 함수·인터랙션 엔드포인트 연결 |
| 5분 삭제 | 암호화 큐·게시 임대·삭제 선점/재시도·preparing 복구·burst 처리 구현 |
| Edge·Cron | 두 함수·앱 전용 Secrets/Vault·10초 due 점검·앱 이력 보존 적용 |
| 테스트 | Vitest 18개, Playwright 10개, Python 9개, SQL 역할/제약, Deno 실제 SQL 큐 검증 통과 |
| main CI | Checks·Publish Pages·Sync Workout Logs 실행 성공 |
| 비밀값 | 로컬 .env 0600/Git 제외, 앱 범위 GitHub Secrets·Edge Secrets·Vault에 보관 |

Pages `release.json`은 실제 배포 SHA를 기록한다. 문서만 변경한 main SHA와 배포 SHA가 다른 것은 정상이다. 화면 변경이 포함된 배포 SHA가 기준이다.

## 마지막 실서비스 확인

사용자가 실제 Discord `/잔디`를 호출했다. 20:55:35 게시, 21:00:35 삭제 예정으로 정확히 300초 예약과 예정 시각 전 공개 메시지 유지를 확인했다. 21:00:44에 `done`·삭제 1회·오류 없음·암호화 토큰 제거를 관측했고 Discord 메시지 부재와 현황판 보존을 확인했다. 5초 간격 관측으로 삭제 기한 약 8초 이내 완료를 확인한 것이며 밀리초 단위 정확한 삭제 시각으로 해석하지 않는다.

운영 DB에 가상 운동 기록을 넣지 않았다. 사진 첨부 인증·수정·삭제 전파의 실사용 확인은 실제 인증이 남겨진 뒤 수행한다. 28일 이전 수정과 원본 삭제 자동 반영은 초기 제품 범위 밖이다.

## 후속 작업 준비

main은 이미 원격과 동기화돼 있다. 후속 작업은 main에서 새 기능 브랜치로 시작하고, 기능·마일스톤 단위 검증 후 커밋·푸시한다. 원래 기능 브랜치 전체를 다시 적용하거나 공용 초기 DB SQL을 재실행하지 않는다. 다음 기능의 목적이 정해지면 DESIGN/ARCHITECTURE와 대조해 진행한다.
