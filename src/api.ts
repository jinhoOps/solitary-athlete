import { dayAt, sundayIndex, shiftDay, stats } from './dates';
import { calculateMonthlyKPIs } from './metrics';
import {parseGrassParticipation} from './grass-participation';
import type {GrassParticipation} from './types';
import type { DashboardData, Member, PublicConfig, WorkoutLog } from './types';

type Fetcher = typeof fetch;

async function rpc<T>(config: PublicConfig, func: string, body: Record<string, unknown>, fetcher: Fetcher,
  authErrors:'status-or-code'|'code-only'='status-or-code'): Promise<T> {
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
    if (errCode.includes('invalid_or_expired_secret') || (authErrors==='status-or-code' && [400,401,403].includes(res.status))) {
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
  const normalizedCode = secretCode.trim().toLowerCase();
  async function annual(targetYear:number):Promise<WorkoutLog[]> {
    const result:WorkoutLog[]=[];
    let cursor:WorkoutLog|undefined;
    for (;;) {
      const page=await rpc<WorkoutLog[]>(config,'get_workout_logs_page',{
        p_secret_code:normalizedCode,p_year:targetYear,p_limit:500,
        p_after_date:cursor?.log_date??null,p_after_user_id:cursor?.user_id??null,
      },fetcher);
      for(const row of page){
        if(cursor && !(row.log_date<cursor.log_date || (row.log_date===cursor.log_date && row.user_id>cursor.user_id))) throw new Error('Non-progressing annual page');
        cursor=row;
      }
      result.push(...page);
      if(page.length<500)return result;
    }
  }
  async function allMembers():Promise<{id:string;name:string}[]> {
    const result:{id:string;name:string}[]=[];let cursor:string|null=null;
    for(;;){
      const page:{user_id:string;username:string}[]=await rpc<{user_id:string;username:string}[]>(config,'get_dashboard_members',{
        p_secret_code:normalizedCode,p_after_user_id:cursor,p_limit:200,
      },fetcher);
      for(const row of page){
        if(cursor!==null && row.user_id<=cursor)throw new Error('Non-progressing member page');
        cursor=row.user_id;result.push({id:row.user_id,name:row.username});
      }
      if(page.length<200)return result.sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
    }
  }
  const now = new Date(), today = dayAt(now);
  const currentYear = Number(today.slice(0, 4));
  const targetYear=year??currentYear;
  const month=`${today.slice(0,7)}-01`;
  const participation=rpc<unknown[]>(config,'get_monthly_grass_participation',{
    p_secret_code:normalizedCode,p_month:month,
  },fetcher,'code-only').then(rows=>parseGrassParticipation(rows,month)).catch((error):GrassParticipation=>{
    if(error instanceof Error&&error.message.includes('invalid_or_expired_secret'))throw error;
    return {status:'unavailable'};
  });
  const [logs, roster, status, currentLogs, grassParticipation] = await Promise.all([
    annual(targetYear),allMembers(),
    read<{last_success_at:string|null}>(config,'sync_status',{select:'last_success_at'},fetcher).catch(()=>[{last_success_at:null}]),
    targetYear===currentYear?Promise.resolve(null):annual(currentYear),
    participation,
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

  const currentStats = new Map<string, ReturnType<typeof stats>>();
  if ((year ?? currentYear) === currentYear) {
    const history = new Map(sortedMembers.map(m => [m.id, new Set(m.dates)]));
    let historyYear = currentYear;
    const sunday = shiftDay(today, -sundayIndex(today));
    // Extend only if this week or a continuous streak reaches an earlier year.
    const needsEarlierHistory = () => {
      const start = `${historyYear}-01-01`;
      if (sunday < start || (historyYear === currentYear && shiftDay(today, -1) < start)) return true;
      return [...history.values()].some(dates => {
        let cursor = dates.has(today) ? today : shiftDay(today, -1);
        while (dates.has(cursor)) cursor = shiftDay(cursor, -1);
        return cursor < start;
      });
    };
    while (historyYear > 1 && needsEarlierHistory()) {
      historyYear--;
      const earlier = await annual(historyYear);
      for (const row of earlier) {
        if (!history.has(row.user_id)) history.set(row.user_id, new Set());
        history.get(row.user_id)!.add(row.log_date);
      }
    }
    for (const [id, dates] of history) currentStats.set(id, stats(dates, today));
  }

  const kpis = calculateMonthlyKPIs(currentLogs??logs, now);
  for(const king of kpis.workoutKings)king.name=roster.find(m=>m.id===king.id)?.name??king.name;
  kpis.workoutKings.sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));

  return {
    roster,
    members: sortedMembers,
    logs,
    lastSuccess: status[0]?.last_success_at ?? null,
    kpis,
    grassParticipation,
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
