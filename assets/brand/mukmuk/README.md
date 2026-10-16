# 묵묵 · 봇 마스코트 에셋

**고독한 운동가 서버·채널의 새싹과 묵묵 봇 마스코트를 구분한다.** 공용 `assets/brand/mark.*`는 새싹을 유지한다. 공용 배너도 상단 새싹과 잔디를 유지하고 하단 봇 소개에만 작은 묵묵을 넣는다. 이 폴더의 mark·banner는 묵묵 봇 전용이다.

- **봇 프로필 업로드:** [512px 정면 PNG](profile/mukmuk-profile-512.png)
- [프로필 크기별 파일](profile/README.md): 512px 원본·1024px 확대·256px 축소
- [시트에서 분리한 6종](sprites/README.md): 대표·정면·스티커·만족·결심·지침
- [봇 전용 마크 PNG](mark.png) · [SVG 래퍼](mark.svg)
- [봇 전용 배너 PNG](banner.png) · [SVG](banner.svg)
- [승인된 원본 시트](final/2026-10-16/mukmuk-character-sheet-v1.png)

2026-10-16 묵묵 봇 프로필에 정면 PNG를 적용하고 API 재조회로 확인했다. 고독한 운동가 서버 아이콘은 변경하지 않았다.


실제 Discord 앱에도 반영했다. 앱 아이콘은 1024px 정면, 봇 아바타는 512px 정면이며, 앱 커버와 봇 배너는 공용 배너의 최종 버전(`assets/brand/banner.png`)을 사용한다. 앱·봇 이미지 필드를 재조회하고 CDN 응답까지 검증했다. 이 폴더의 별도 `banner.png`는 봇 전용 다른 구성이므로 실제 적용 배너와 구분한다.

- [Discord 이모지 전용 6종](emojis/README.md): 128px 업로드 파일·ZIP·32px 밝은/어두운 배경 비교.
