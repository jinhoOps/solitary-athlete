import { expect, it } from 'vitest';
import { calculateMonthlyKPIs } from '../../src/metrics';
import type { WorkoutLog } from '../../src/types';

it('calculates 4 monthly KPIs accurately for current month', () => {
  // Current date: 2026-10-14 KST (Wednesday)
  const now = new Date('2026-10-14T12:00:00Z');

  const logs: WorkoutLog[] = [
    // 2026-10-14 (Wednesday): 2 members
    { user_id: '1', username: '하루', log_date: '2026-10-14', memo: '달리기', has_photo: true, verification_count: 1 },
    { user_id: '2', username: '바람', log_date: '2026-10-14', memo: '헬스', has_photo: false, verification_count: 1 },
    // 2026-10-13 (Tuesday): 1 member
    { user_id: '1', username: '하루', log_date: '2026-10-13', memo: '수영', has_photo: true, verification_count: 1 },
    // 2026-10-07 (Wednesday of last week): 1 member
    { user_id: '2', username: '바람', log_date: '2026-10-07', memo: '요가', has_photo: false, verification_count: 1 },
    // Past month (2026-09-30): should not be counted in October
    { user_id: '1', username: '하루', log_date: '2026-09-30', memo: '지난달', has_photo: true, verification_count: 1 },
    { user_id: '3', username: '구름', log_date: '2026-09-29', memo: '지난달', has_photo: false, verification_count: 1 },
  ];

  const kpis = calculateMonthlyKPIs(logs, now);

  // 1. 이번 달 고운: 2 members (user 1, user 2)
  expect(kpis.activeMembers).toBe(2);

  // 2. 총 운동 일수: user 1 (10-14, 10-13 = 2일) + user 2 (10-14, 10-07 = 2일) = 4일
  expect(kpis.totalWorkoutDays).toBe(4);

  // 3. 가장 푸른 요일: Wednesday has 3 entries (10-14 for user 1 & 2, 10-07 for user 2)
  expect(kpis.mostActiveWeekday).toBe('수요일');

  // 4. 1인당 평균 일수: 4일 / 2명 = 2.0일
  expect(kpis.averageDaysPerMember).toBe(2);
});

it('handles empty logs gracefully without NaN or errors', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const kpis = calculateMonthlyKPIs([], now);

  expect(kpis.activeMembers).toBe(0);
  expect(kpis.totalWorkoutDays).toBe(0);
  expect(kpis.mostActiveWeekday).toBe('-');
  expect(kpis.averageDaysPerMember).toBe(0);
});
