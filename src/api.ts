import { dayAt, mondayIndex, shiftDay, stats } from './dates';
import { calculateMonthlyKPIs } from './metrics';
import type { DashboardData, Member, PublicConfig, WorkoutLog } from './types';

type Fetcher = typeof fetch;

async function rpc<T>(config: PublicConfig, func: string, body: Record<string, unknown>, fetcher: Fetcher): Promise<T> {
  if (!config.url || !config.key) throw new Error('Public configuration missing');
  const url = `${config.url.replace(/\/+$/, '')}/rest/v1/rpc/${func}`;
  const res = await fetcher(url, {
    method: 'POST',
    headers: {
      apikey: config.key,
      'Content-Type': 'application/json',
      'Accept-Profile': 'solitary_athlete',
      'Content-Profile': 'solitary_athlete',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    let errCode = '';
    try {
      const err = await res.json();
      errCode = err.message || err.details || err.code || '';
    } catch { /* empty */ }
    if (errCode.includes('invalid_or_expired_secret') || res.status === 400 || res.status === 401 || res.status === 403) {
      throw new Error('invalid_or_expired_secret');
    }
    throw new Error(`Public RPC failed (${res.status})`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid RPC response format');
  return data as T;
}

async function read<T>(config: PublicConfig, table: string, params: Record<string, string>, fetcher: Fetcher): Promise<T[]> {
  if (!config.url || !config.key) throw new Error('Public configuration missing');
  const url = new URL(`${config.url.replace(/\/+$/, '')}/rest/v1/${table}`);
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

export async function loadDashboard(
  config: PublicConfig,
  secretCode: string,
  year?: number,
  fetcher: Fetcher = fetch
): Promise<DashboardData> {
  const [logs, status] = await Promise.all([
    rpc<WorkoutLog[]>(config, 'get_workout_logs', {
      p_secret_code: secretCode.trim().toLowerCase(),
      p_year: year ?? null,
    }, fetcher),
    read<{ last_success_at: string | null }>(config, 'sync_status', { select: 'last_success_at' }, fetcher)
      .catch(() => [{ last_success_at: null }]),
  ]);

  const members = new Map<string, Member>();
  for (const row of logs) {
    if (!members.has(row.user_id)) {
      members.set(row.user_id, {
        id: row.user_id,
        name: row.username,
        dates: new Set(),
        photos: new Set(),
      });
    }
    const member = members.get(row.user_id)!;
    member.dates.add(row.log_date);
    if (row.has_photo) member.photos.add(row.log_date);
  }

  const sortedMembers = [...members.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)
  );

  const now = new Date(), today = dayAt(now);
  const currentYear = Number(today.slice(0, 4));
  const currentStats = new Map<string, ReturnType<typeof stats>>();
  if ((year ?? currentYear) === currentYear) {
    const history = new Map(sortedMembers.map(m => [m.id, new Set(m.dates)]));
    let historyYear = currentYear;
    const monday = shiftDay(today, -mondayIndex(today));
    // Extend only if this week or a continuous streak reaches an earlier year.
    const needsEarlierHistory = () => {
      const start = `${historyYear}-01-01`;
      if (monday < start || (historyYear === currentYear && shiftDay(today, -1) < start)) return true;
      return [...history.values()].some(dates => {
        let cursor = dates.has(today) ? today : shiftDay(today, -1);
        while (dates.has(cursor)) cursor = shiftDay(cursor, -1);
        return cursor < start;
      });
    };
    while (historyYear > 1 && needsEarlierHistory()) {
      historyYear--;
      const earlier = await rpc<WorkoutLog[]>(config, 'get_workout_logs', {
        p_secret_code: secretCode.trim().toLowerCase(), p_year: historyYear,
      }, fetcher);
      for (const row of earlier) {
        if (!history.has(row.user_id)) history.set(row.user_id, new Set());
        history.get(row.user_id)!.add(row.log_date);
      }
    }
    for (const [id, dates] of history) currentStats.set(id, stats(dates, today));
  }

  const kpis = calculateMonthlyKPIs(logs, now);

  return {
    members: sortedMembers,
    logs,
    lastSuccess: status[0]?.last_success_at ?? null,
    kpis,
    currentStats,
  };
}

export function loadTimeline(
  logs: WorkoutLog[],
  userId: string | null,
  offset: number,
  limit = 30
): WorkoutLog[] {
  const filtered = userId ? logs.filter(l => l.user_id === userId) : logs;
  return filtered.slice(offset, offset + limit);
}
