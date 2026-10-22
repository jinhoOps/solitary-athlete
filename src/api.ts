import {parseIdentity,legacyLog,personLog,subjectOf,type DashboardIdentity} from './identity';
import { dayAt, sundayIndex, shiftDay, stats } from './dates';
import { calculateMonthlyKPIs } from './metrics';
import {parseGrassParticipation} from './grass-participation';
import type {GrassParticipation} from './types';
import type { DashboardData, Member, PublicConfig, WorkoutLog,ViewWorkoutLog,WorkoutEntry,PersonWorkoutDTO,RosterMember } from './types';

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
    if(['identity_revision_changed','client_update_required'].some(code=>errCode.includes(code)))throw new Error(errCode.includes('identity_revision_changed')?'identity_revision_changed':'client_update_required');
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

async function loadDashboardOnce(
  config: PublicConfig,
  secretCode: string,
  year?: number,
  fetcher: Fetcher = fetch
): Promise<DashboardData> {
  const normalizedCode = secretCode.trim().toLowerCase();
  const identity=parseIdentity(await rpc<DashboardIdentity[]>(config,'get_dashboard_identity',{p_secret_code:normalizedCode},fetcher,'code-only'));
  const context=identity.enabled?{p_revision:identity.revision}:{};
  const kind=identity.enabled?'person':'discord';
  async function annual(targetYear:number):Promise<ViewWorkoutLog[]> {
    const result:ViewWorkoutLog[]=[];
    let cursor:ViewWorkoutLog|undefined;
    for (;;) {
      const dto=await rpc<(WorkoutLog|PersonWorkoutDTO)[]>(config,identity.enabled?'get_person_workout_logs_page':'get_workout_logs_page',{
        p_secret_code:normalizedCode,p_year:targetYear,p_limit:500,...context,
        p_after_date:cursor?.log_date??null,[identity.enabled?'p_after_person_id':'p_after_user_id']:cursor?.subject.id??null,
      },fetcher,'code-only');
      const page=dto.map(row=>identity.enabled?personLog(row as PersonWorkoutDTO,identity.revision):legacyLog(row as WorkoutLog));
      for(const row of page){
        if(cursor && !(row.log_date<cursor.log_date || (row.log_date===cursor.log_date && row.subject.id>cursor.subject.id))) throw new Error('Non-progressing annual page');
        cursor=row;
      }
      result.push(...page);
      if(page.length<500)return result;
    }
  }
  async function allMembers():Promise<RosterMember[]> {
    const result:RosterMember[]=[];let cursor:string|null=null;
    for(;;){
      const page:{user_id?:string;person_id?:string;username:string;identity_revision?:number}[]=await rpc<{user_id?:string;person_id?:string;username:string;identity_revision?:number}[]>(config,identity.enabled?'get_dashboard_people':'get_dashboard_members',{
        p_secret_code:normalizedCode,...context,[identity.enabled?'p_after_person_id':'p_after_user_id']:cursor,p_limit:200,
      },fetcher,'code-only');
      for(const row of page){
        if(identity.enabled&&row.identity_revision!==identity.revision)throw new Error('identity_revision_changed');
        const id:string|undefined=identity.enabled?row.person_id:row.user_id;
        if(typeof id!=='string'||!id||(cursor!==null&&id<=cursor))throw new Error('Non-progressing member page');
        cursor=id;result.push({subject:{kind,id},name:row.username});
      }
      if(page.length<200)return result.sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.subject.id.localeCompare(b.subject.id));
    }
  }
  const now = new Date(), today = dayAt(now);
  const currentYear = Number(today.slice(0, 4));
  const targetYear=year??currentYear;
  const month=`${today.slice(0,7)}-01`;
  const participation=rpc<unknown[]>(config,identity.enabled?'get_person_grass_participation':'get_monthly_grass_participation',{
    p_secret_code:normalizedCode,p_month:month,...context,
  },fetcher,'code-only').then(rows=>parseGrassParticipation(rows,month)).catch((error):GrassParticipation=>{
    if(error instanceof Error&&['invalid_or_expired_secret','identity_revision_changed','client_update_required'].some(code=>error.message.includes(code)))throw error;
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
    if (!members.has(row.subject.id)) {
      members.set(row.subject.id, {
        subject: row.subject,
        name: row.username,
        dates: new Set(),
        photos: new Set(),
      });
    }
    const member = members.get(row.subject.id)!;
    member.dates.add(row.log_date);
    if (row.has_photo) member.photos.add(row.log_date);
  }

  const sortedMembers = [...members.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'ko') || a.subject.id.localeCompare(b.subject.id)
  );

  const currentStats = new Map<string, ReturnType<typeof stats>>();
  if ((year ?? currentYear) === currentYear) {
    const history = new Map(sortedMembers.map(m => [m.subject.id, new Set(m.dates)]));
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
        if (!history.has(row.subject.id)) history.set(row.subject.id, new Set());
        history.get(row.subject.id)!.add(row.log_date);
      }
    }
    for (const [id, dates] of history) currentStats.set(id, stats(dates, today));
  }

  const kpis = calculateMonthlyKPIs(currentLogs??logs, now);
  for(const king of kpis.workoutKings)king.name=roster.find(m=>m.subject.id===king.id)?.name??king.name;
  kpis.workoutKings.sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));

  return {
    identityRevision:identity.revision,calculationVersion:identity.calculation_version,subjectKind:kind,
    roster,
    members: sortedMembers,
    logs,
    lastSuccess: status[0]?.last_success_at ?? null,
    kpis,
    grassParticipation,
    currentStats,
  };
}

export async function loadDashboard(config:PublicConfig,secretCode:string,year?:number,fetcher:Fetcher=fetch):Promise<DashboardData>{
 for(let attempt=0;;attempt++){
  try{return await loadDashboardOnce(config,secretCode,year,fetcher);}
  catch(error){if(!(error instanceof Error)||error.message!=='identity_revision_changed'||attempt>=2)throw error;}
 }
}
export function loadTimeline<T extends WorkoutEntry>(logs:T[],userId:string|null,offset:number,limit=30):T[]{
 const filtered=userId?logs.filter(l=>subjectOf(l).id===userId):logs;
 return filtered.slice(offset,offset+limit);
}
