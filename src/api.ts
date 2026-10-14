import { shiftDay } from './dates';
import type { DashboardData, Member, PublicConfig, WorkoutLog } from './types';

type Fetcher = typeof fetch;
async function read<T>(config: PublicConfig, table: string, params: Record<string, string>, fetcher: Fetcher): Promise<T[]> {
  if (!config.url || !config.key) throw new Error('Public configuration missing');
  const url = new URL(`${config.url.replace(/\/$/, '')}/rest/v1/${table}`);
  url.search = new URLSearchParams(params).toString();
  const res = await fetcher(url.toString(), {
    headers: { apikey: config.key, 'Accept-Profile': 'solitary_athlete' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Public read failed (${res.status})`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('Invalid public response');
  return body as T[];
}
async function all<T>(config: PublicConfig, params: Record<string, string>, fetcher: Fetcher): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await read<T>(config, 'workout_logs', { ...params, offset: String(offset), limit: '1000' }, fetcher);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
export async function loadDashboard(config: PublicConfig, today: string, fetcher: Fetcher = fetch): Promise<DashboardData> {
  const [metadata, logs, status] = await Promise.all([
    all<Omit<WorkoutLog, 'memo' | 'verification_count'>>(config, {
      select: 'user_id,username,log_date,has_photo', 'log_date': `lte.${today}`,
      order: 'log_date.desc,updated_at.desc,user_id.asc',
    }, fetcher),
    all<WorkoutLog>(config, { select: 'user_id,username,log_date,memo,has_photo,verification_count',
      and: `(log_date.gte.${shiftDay(today, -83)},log_date.lte.${today})`, order: 'log_date.desc,user_id.asc' }, fetcher),
    read<{ last_success_at: string | null }>(config, 'sync_status', { select: 'last_success_at' }, fetcher),
  ]);
  const members = new Map<string, Member>();
  for (const row of metadata) {
    if (!members.has(row.user_id)) members.set(row.user_id, { id: row.user_id, name: row.username, dates: new Set(), photos: new Set() });
    const member = members.get(row.user_id)!;
    member.dates.add(row.log_date);
    if (row.has_photo) member.photos.add(row.log_date);
  }
  return { members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)), logs,
    lastSuccess: status[0]?.last_success_at ?? null };
}
export function loadTimeline(config: PublicConfig, userId: string | null, offset: number, fetcher: Fetcher = fetch): Promise<WorkoutLog[]> {
  return read<WorkoutLog>(config, 'workout_logs', {
    select: 'user_id,username,log_date,memo,has_photo,verification_count',
    order: 'log_date.desc,user_id.asc', offset: String(offset), limit: '30',
    ...(userId ? { user_id: `eq.${userId}` } : {}),
  }, fetcher);
}
