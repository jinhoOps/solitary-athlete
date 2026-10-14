# 묵묵 · 주간 시크릿 코드 및 대시보드 v2 설계 명세서

- 작성일: 2026-10-14
- 상태: 초안 작성 및 검토 대기
- 대상: Supabase DB·Edge Functions, Discord `#공지`·`#잔디`, 웹 대시보드(GitHub Pages)

---

## 1. 개요 및 배경

1. **정적 웹보드 데이터 보호**:
   - 현재 GitHub Pages는 공개 REST API(`anon` 키)로 `solitary_athlete.workout_logs` 전체를 누구나 읽을 수 있음.
   - 디스코드 서버 멤버들에게만 조회를 허용하기 위해 **주간 시크릿 코드** 기반 접근 제어를 도입.
   - 매주 월요일 00:00 KST에 Supabase가 새 코드를 자동 발급하고, 봇이 Discord `#공지` 채널에 복사용 코드블록 및 바로가기 링크(`?code=...`)를 자동 게시.
   - 새 코드 발급 후에도 기존 코드는 **24시간 유예 기간(Grace Period)** 동안 함께 유효하게 처리하여 사용 중 끊김 방지.
2. **Discord `#잔디` 현황판 메시지 간소화**:
   - 기존 28일 대신 **최근 14일(2주)**로 단축하고 마크다운 요일 헤더(`월 | 화 | 수 | 목 | 금 | 토 | 일`)와 2줄 잔디로 시각적 가독성 극대화.
3. **웹 대시보드 UI/UX 대개편**:
   - 긴 슬로건과 소개 문구를 제거하고 헤더를 컴팩트하게 단일 라인으로 정돈.
   - 컴팩트한 높이의 상단 탭(`전체 멤버` | `개별 멤버들`).
   - 기본 전체 멤버 화면: 하단 `#남겨둔운동` 숨김, 이번 달 핵심 통계 KPI 카드 4개 배치:
     1. **이번 달 고운**: 이번 달 잔디를 심은 고독한 운동가 수
     2. **총 운동 일수**: 이번 달 전체 멤버 운동 일수 합산
     3. **가장 푸른 요일**: 이번 달 가장 인증이 많이 모인 요일
     4. **1인당 평균 일수**: 이번 달 참여 멤버당 평균 운동 일수
   - 개별 유저 화면: 1년(365일) 잔디 그리드 + 개인 지표 + 하단 `#남겨둔운동` 타임라인 노출.

---

## 2. 데이터베이스 및 보안 (Supabase)

### 2.1 테이블: `solitary_athlete.channel_access_secrets`
```sql
CREATE TABLE solitary_athlete.channel_access_secrets (
  id serial PRIMARY KEY,
  secret_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  active_until timestamptz NOT NULL,
  expires_at timestamptz NOT NULL, -- active_until + 24 hours (grace period)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: anon/authenticated 직접 읽기/쓰기 금지 (오직 서버 및 SECURITY DEFINER 함수만 접근)
ALTER TABLE solitary_athlete.channel_access_secrets ENABLE ROW LEVEL SECURITY;
```

### 2.2 조회 RPC 함수: `solitary_athlete.get_workout_logs`
```sql
CREATE OR REPLACE FUNCTION solitary_athlete.get_workout_logs(
  p_secret_code text,
  p_year integer DEFAULT NULL
)
RETURNS TABLE (
  user_id text,
  username text,
  log_date date,
  has_photo boolean,
  memo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_year integer;
BEGIN
  -- 1. 시크릿 코드 검증 (유효 기한 내)
  IF NOT EXISTS (
    SELECT 1 FROM solitary_athlete.channel_access_secrets
    WHERE secret_code = p_secret_code
      AND now() <= expires_at
  ) THEN
    RAISE EXCEPTION 'invalid_or_expired_secret' USING ERRCODE = 'P0001';
  END IF;

  v_target_year := COALESCE(p_year, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer);

  -- 2. 해당 연도 운동 기록 반환
  RETURN QUERY
  SELECT l.user_id, l.username, l.log_date, l.has_photo, l.memo
  FROM solitary_athlete.workout_logs l
  WHERE EXTRACT(YEAR FROM l.log_date) = v_target_year
  ORDER BY l.log_date DESC, l.user_id ASC;
END;
$$;

-- 테이블 직접 SELECT 권한 회수 및 RPC 함수 실행 권한 부여
REVOKE SELECT ON solitary_athlete.workout_logs FROM anon;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_workout_logs(text, integer) TO anon, authenticated;
```

---

## 3. 주간 시크릿 코드 자동 발급 및 Discord 공지

### 3.1 발급 워커: Supabase Edge Function `mukmuk-weekly-code`
- **실행 주기**: 매주 월요일 00:00 KST (`pg_cron`: `0 15 * * 0` UTC)
- **로직**:
  1. 암호학적으로 안전하고 읽기 쉬운 8자리 코드 생성 (예: `mukmuk-` + 4자리 소문자/숫자, 예: `mukmuk-7k2x`).
  2. `solitary_athlete.channel_access_secrets`에 삽입:
     - `issued_at`: `now()`
     - `active_until`: `now() + interval '7 days'`
     - `expires_at`: `now() + interval '8 days'` (정규 7일 + 24시간 유예 기간)
  3. Discord REST API로 `#공지` (`DISCORD_NOTICE_CHANNEL_ID`: `1559802402893340744`) 채널에 메시지 작성:
     ```markdown
     ## 🔑 이번 주 웹보드 시크릿 코드
     매주 월요일 새로운 코드가 발급됩니다. (기존 코드는 24시간 동안 함께 유지돼요)

     ```
     mukmuk-7k2x
     ```

     👉 **[웹보드 바로 접속하기](https://jinhoops.github.io/solitary-athlete/?code=mukmuk-7k2x)**
     ```

---

## 4. Discord `#잔디` 현황판 간소화 (`mukmuk/board.py`)

- **범위**: 최근 14일 (지난주 월요일부터 이번주 일요일까지의 2주 캘린더 그리드).
- **형식**:
  ```markdown
  ## 🌱 고운 잔디밭
  최근 14일 · 갱신 · 10.14 20:28 KST

  jhoops · 이번 주 1일 · 누적 1일
  월 | 화 | 수 | 목 | 금 | 토 | 일
  ⬜⬜⬜⬜⬜⬜⬜
  ⬜⬜⬜⬜⬜⬜:mukmuk_photo:

  웹보드 · https://jinhoops.github.io/solitary-athlete/ 
  > ⬜ 기록 없음 · :mukmuk_grass: 텍스트 · :mukmuk_photo: 사진 포함
  ```
- **특징**:
  - `월 | 화 | 수 | 목 | 금 | 토 | 일` 마크다운 열 헤더를 상단에 두어 요일별 위치가 즉각적으로 보임.
  - 1행: 지난주 월~일 7일
  - 2행: 이번주 월~일 7일 (오늘 이후 날짜는 ⬜)

---

## 5. 웹 대시보드 v2 개편 (TypeScript / Vite)

### 5.1 인증 흐름
1. 페이지 로드 시 URL `?code=...` 쿼리 파라미터 확인.
2. 파라미터가 있으면 `localStorage.setItem('mukmuk_code', code)`에 저장하고 URL 주소창에서 쿼리를 깔끔하게 제거 (`history.replaceState`).
3. 저장된 코드로 Supabase RPC `get_workout_logs(code)` 호출.
4. 유효할 경우: 대시보드 렌더링.
5. 유효하지 않거나 코드가 없을 경우:
   - 컴팩트한 비밀번호 입력 모달 표시:
     - "디스코드 #공지 채널에 올라온 이번 주 시크릿 코드를 입력해 주세요."
     - 코드 입력 input 및 확인 버튼
     - 입력 성공 시 재조회 및 화면 오픈

### 5.2 헤더 및 탭
- **헤더**:
  - `고독한 운동가` + `운동기록을 챙기는 묵묵, MUKMUK · WORKOUT JOURNAL` 단일 라인.
  - 슬로건 및 소개 단락 제거.
- **탭 네비게이션**:
  - 컴팩트 버튼: `전체 멤버` | `멤버 1` | `멤버 2` ...
  - 버튼 높이와 패딩을 줄이고 한눈에 보이는 컴팩트 레이아웃.

### 5.3 기본 화면 (전체 멤버 뷰)
- **이번 달 통계 KPI 카드 (4개)**:
  1. **이번 달 고운**: 이번 달(KST 기준 1일~말일) 1회 이상 운동한 멤버 수 (예: `3명`)
  2. **총 운동 일수**: 이번 달 전체 멤버의 운동 일수 총합 (예: `18일`)
  3. **가장 푸른 요일**: 이번 달 가장 많은 인증이 등록된 요일 (예: `수요일`)
  4. **1인당 평균 일수**: 이번 달 참여 멤버당 평균 운동 일수 (예: `4.5일`)
- **멤버별 카드**:
  - 각 멤버의 1년(365일) 잔디 그리드 요약.
- **하단 `#남겨둔운동` 메모 목록 숨김** (공간 절약 및 개별 뷰 차별화).

### 5.4 개별 유저 뷰
- 선택된 멤버의 카드:
  - 1년(365일 / 52주) 잔디 그리드.
  - 지표: 이번 주 / 연속 / 누적 일수.
- **하단 `#남겨둔운동` 메모 타임라인 노출**:
  - 해당 멤버의 날짜별 메모 목록 상세 표시.

---

## 6. 테스트 및 검증 계획

1. **DB & RPC 검증**:
   - 유효한 시크릿 코드로 `get_workout_logs` 호출 시 정상 데이터 반환 검증.
   - 만료된 코드(24시간 유예 기간 경과 후) 또는 잘못된 코드 전달 시 예외 발생 검증.
   - `workout_logs` 테이블 직접 접근 시 `anon` 권한 거부 검증.
2. **현황판 메시지 검증 (`tests/python/test_board.py`)**:
   - 14일(2주) 요일 정렬 및 마크다운 포맷(`월 | 화 | 수 | 목 | 금 | 토 | 일`) 검증.
   - 오늘 날짜 위치 및 2행 7열 이모지 생성 검증.
3. **웹보드 단위 & E2E 테스트**:
   - 시크릿 코드 미입력 시 모달 표시 및 입력 후 데이터 로드 검증.
   - 4개 KPI 계산 로직 검증 (`dates.ts` / `metrics.ts`).
   - 전체 뷰에서 타임라인 숨김 및 유저 선택 시 타임라인 노출 검증.
   - TypeScript 타입체크 및 Vite 빌드 성공 검증.
