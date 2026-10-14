# 묵묵 DB 기반 검증

운영·공용 DB가 아닌 **새 임시 PostgreSQL 17 클러스터**에서 실행합니다. `bootstrap.sql`은 Supabase 역할·공용 스키마·다른 앱의 가상 테이블을 준비합니다. 역할 이름이 이미 존재하면 트랜잭션이 실패합니다. 공용 초기 마이그레이션을 테스트 환경에서 재실행할 필요가 없습니다.

연결은 `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` 등 환경변수로 지정하고 비밀번호를 명령 인수에 넣지 않습니다. 클러스터 관리자가 `postgres`여야 합니다.

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261014000002_mukmuk_foundation.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/mukmuk_foundation.sql
```

마지막 검증은 실제 테이블·역할로 가상 인증을 쓰고 익명으로 조회합니다. KST 자정, 사진만 있는 인증, 메시지·운동일 중복, 빈 인증·다른 서버 거부, 300초 삭제 시각, 종료한 작업의 토큰 제거, 익명·일반 로그인·service-role 권한, worker의 DDL·다른 앱 접근 거부를 확인합니다. 픽스처는 마지막 `ROLLBACK`으로 제거합니다. 성공은 모든 SQL 블록 완료와 종료 코드 0입니다.

로컬 검증은 일별 OR 집계를 자동 구현하지 않습니다. 수집기·슬래시·삭제 실행·웹은 후속 기능에서 별도로 검증합니다. 원격 검증은 읽기 전용 카탈로그와 API 요청으로 수행하며 가상 인증을 운영 DB에 넣지 않습니다.
