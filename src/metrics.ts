import {dayAt} from './dates';
import {kingTitle} from './king-title';
import type { MonthlyKPIs, WorkoutLog } from './types';

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export function calculateMonthlyKPIs(logs: WorkoutLog[], now: Date): MonthlyKPIs {
  const kstFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  });
  const parts=kstFormatter.formatToParts(now);
  const currentMonthPrefix=`${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`;

  const monthlyLogs = logs.filter(l => l.log_date.startsWith(currentMonthPrefix) && l.log_date<=dayAt(now));

  const memberDays = new Map<string, Set<string>>();
  const photoDays = new Map<string, Set<string>>();
  const memoDays = new Map<string, Set<string>>();
  const weekdayCounts = new Array(7).fill(0);

  for (const log of monthlyLogs) {
    if (!memberDays.has(log.user_id)) {
      memberDays.set(log.user_id, new Set());
    }
    const days = memberDays.get(log.user_id)!;
    if (log.has_photo) photoDays.set(log.user_id, (photoDays.get(log.user_id) ?? new Set()).add(log.log_date));
    if (log.memo.trim()) memoDays.set(log.user_id, (memoDays.get(log.user_id) ?? new Set()).add(log.log_date));
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
  let mostActiveWeekdayDays = 0;
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
      mostActiveWeekdayDays = maxCount;
    }
  }

  const maximum=Math.max(0,...[...memberDays.values()].map(d=>d.size));
  const elapsedDays=Number(dayAt(now).slice(8));
  const workoutKings=[...memberDays].filter(([,days])=>days.size===maximum).map(([id,days])=>({
    id,days:days.size,name:monthlyLogs.find(l=>l.user_id===id)!.username,
    title:kingTitle({dates:days,photoDates:photoDays.get(id)??new Set(),memoDates:memoDays.get(id)??new Set(),elapsedDays}),
  })).sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
  return {
    workoutKings,
    activeMembers,
    totalWorkoutDays,
    mostActiveWeekday,
    mostActiveWeekdayDays,
    averageDaysPerMember,
  };
}
