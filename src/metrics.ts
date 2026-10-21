import {dayAt} from './dates';
import {kingTitle} from './king-title';
import type { MonthlyKPIs, WorkoutLog } from './types';

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** Current KST month records, deduplicated per member into date sets. */
function monthRecords(logs: WorkoutLog[], now: Date) {
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
  for (const log of monthlyLogs) {
    if (!memberDays.has(log.user_id)) memberDays.set(log.user_id, new Set());
    memberDays.get(log.user_id)!.add(log.log_date);
    if (log.has_photo) photoDays.set(log.user_id, (photoDays.get(log.user_id) ?? new Set()).add(log.log_date));
    if (log.memo.trim()) memoDays.set(log.user_id, (memoDays.get(log.user_id) ?? new Set()).add(log.log_date));
  }
  const elapsedDays = Number(dayAt(now).slice(8));
  const titleFor = (id: string) => kingTitle({dates:memberDays.get(id) ?? new Set(),photoDates:photoDays.get(id) ?? new Set(),memoDates:memoDays.get(id) ?? new Set(),elapsedDays});
  return {monthlyLogs, memberDays, titleFor};
}

/** The member's achievement title for the current KST month, or null without records this month. */
export function memberMonthTitle(logs: WorkoutLog[], userId: string, now: Date): string | null {
  const {memberDays, titleFor} = monthRecords(logs, now);
  return memberDays.has(userId) ? titleFor(userId) : null;
}

export function calculateMonthlyKPIs(logs: WorkoutLog[], now: Date): MonthlyKPIs {
  const {monthlyLogs, memberDays, titleFor} = monthRecords(logs, now);
  const weekdayCounts = new Array(7).fill(0);
  for (const days of memberDays.values()) {
    for (const date of days) {
      const [y, m, d] = date.split('-').map(Number);
      weekdayCounts[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]++;
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
  const workoutKings=[...memberDays].filter(([,days])=>days.size===maximum).map(([id,days])=>({
    id,days:days.size,name:monthlyLogs.find(l=>l.user_id===id)!.username,
    title:titleFor(id),
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
