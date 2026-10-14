const DAY = 86_400_000;
export function dayAt(now = new Date(), daysAgo = 0): string {
  return new Date(now.getTime() + 9 * 3_600_000 - daysAgo * DAY).toISOString().slice(0, 10);
}
export function shiftDay(date: string, delta: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + delta * DAY).toISOString().slice(0, 10);
}
export function mondayIndex(date: string): number {
  return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
}
export function stats(dates: Set<string>, today: string) {
  const valid = new Set([...dates].filter(d => d <= today));
  const monday = shiftDay(today, -mondayIndex(today));
  let streak = 0;
  let cursor = valid.has(today) ? today : shiftDay(today, -1);
  while (valid.has(cursor)) { streak++; cursor = shiftDay(cursor, -1); }
  return { week: [...valid].filter(d => d >= monday).length, streak, total: valid.size };
}
export function calendar(today: string): (string | null)[] {
  const start = shiftDay(today, -83);
  const result: (string | null)[] = Array(mondayIndex(start)).fill(null);
  for (let i = 0; i < 84; i++) result.push(shiftDay(start, i));
  while (result.length % 7) result.push(null);
  return result;
}
export function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}
