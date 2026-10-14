import type { WorkoutLog } from './types';

export interface MonthlyKPIs {
  activeMembers: number;        // 이번 달 고운 (명)
  totalWorkoutDays: number;     // 총 운동 일수 (일)
  mostActiveWeekday: string;    // 가장 푸른 요일 (예: "수요일" or "-")
  averageDaysPerMember: number; // 1인당 평균 일수 (소수점 1자리)
}

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export function calculateMonthlyKPIs(logs: WorkoutLog[], now: Date): MonthlyKPIs {
  const kstFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  });
  const currentMonthPrefix = kstFormatter.format(now); // "YYYY-MM"

  const monthlyLogs = logs.filter(l => l.log_date.startsWith(currentMonthPrefix));

  const memberDays = new Map<string, Set<string>>();
  const weekdayCounts = new Array(7).fill(0);

  for (const log of monthlyLogs) {
    if (!memberDays.has(log.user_id)) {
      memberDays.set(log.user_id, new Set());
    }
    const days = memberDays.get(log.user_id)!;
    if (!days.has(log.log_date)) {
      days.add(log.log_date);
      const [y, m, d] = log.log_date.split('-').map(Number);
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      weekdayCounts[dayOfWeek]++;
    }
  }

  const activeMembers = memberDays.size;
  let totalWorkoutDays = 0;
  for (const days of memberDays.values()) {
    totalWorkoutDays += days.size;
  }

  const averageDaysPerMember = activeMembers > 0
    ? Math.round((totalWorkoutDays / activeMembers) * 10) / 10
    : 0;

  let mostActiveWeekday = '-';
  if (totalWorkoutDays > 0) {
    let maxCount = -1;
    let bestDay = -1;
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      if (weekdayCounts[d] > maxCount) {
        maxCount = weekdayCounts[d];
        bestDay = d;
      }
    }
    if (bestDay >= 0 && maxCount > 0) {
      mostActiveWeekday = WEEKDAY_NAMES[bestDay];
    }
  }

  return {
    activeMembers,
    totalWorkoutDays,
    mostActiveWeekday,
    averageDaysPerMember,
  };
}
