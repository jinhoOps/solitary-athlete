import { expect, it, vi } from 'vitest';
import { loadDashboard, loadTimeline } from '../../src/api';

const config = { url: 'https://example.supabase.co', key: 'sb_publishable_fixture' };
const row = (n: number) => ({
  user_id: String(n),
  username: n === 0 ? '최신' : '하루',
  log_date: '2026-10-14',
  has_photo: true,
  memo: '<img src=x onerror=alert(1)>',
  verification_count: 1,
});

it('calls get_workout_logs RPC with normalized secret code and loads dashboard data', async () => {
  const calls: { url: URL; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    expect(new Headers(init?.headers).get('Accept-Profile')).toBe('solitary_athlete');
    expect(new Headers(init?.headers).get('apikey')).toBe(config.key);
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);

    if (url.pathname.endsWith('sync_status')) {
      return Response.json([{ last_success_at: '2026-10-14T11:00:00Z' }]);
    }
    if(url.pathname.endsWith('get_dashboard_members')) return Response.json([{user_id:'0',username:'최신'},{user_id:'1',username:'하루'}]);
    if (url.pathname.endsWith('get_workout_logs_page')) {
      return Response.json([
        row(0),
        row(1),
        { ...row(0), username: '과거', log_date: '2026-09-01' },
      ]);
    }
    return new Response('Not found', { status: 404 });
  };

  const data = await loadDashboard(config, '  MukMuk-7K2X  ', 2026, fetcher);

  const rpcCall = calls.find(c => c.url.pathname.endsWith('get_workout_logs_page'))!;
  expect(rpcCall.body.p_secret_code).toBe('mukmuk-7k2x');
  expect(rpcCall.body.p_year).toBe(2026);

  expect(data.members).toHaveLength(2);
  expect(data.lastSuccess).toBe('2026-10-14T11:00:00Z');
  expect(data.kpis.activeMembers).toBeGreaterThan(0);
});

it('throws invalid_or_expired_secret when RPC fails', async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ message: 'invalid_or_expired_secret' }), { status: 400 });

  await expect(loadDashboard(config, 'wrong-code', 2026, fetcher))
    .rejects.toThrow('invalid_or_expired_secret');
});

it('slices timeline records for selected member in memory', () => {
  const logs = [
    { ...row(1), log_date: '2026-10-14' },
    { ...row(2), log_date: '2026-10-14' },
    { ...row(1), log_date: '2026-10-13' },
  ];

  const user1Timeline = loadTimeline(logs, '1', 0, 10);
  expect(user1Timeline).toHaveLength(2);
  expect(user1Timeline.every(l => l.user_id === '1')).toBe(true);

  const allTimeline = loadTimeline(logs, null, 0, 10);
  expect(allTimeline).toHaveLength(3);
});

it('keeps current week and streak across New Year while annual logs stay in selected year',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T03:00:00Z'));
  const years:number[]=[];
  const fetcher:typeof fetch=async(input,init)=>{
    if(String(input).includes('sync_status') || String(input).includes('get_dashboard_members'))return Response.json([]);
    const year=JSON.parse(String(init?.body)).p_year;years.push(year);
    return Response.json((year===2026?['2026-01-01']:['2025-12-31','2025-12-30','2025-12-29']).map(log_date=>({...row(1),log_date})));
  };
  try {
    const data=await loadDashboard(config,'fixture',2026,fetcher);
    expect(data.logs.map(r=>r.log_date)).toEqual(['2026-01-01']);
    expect(data.members[0].dates.size).toBe(1);
    expect(data.currentStats?.get('1')).toMatchObject({week:4,streak:4});
    expect(years).toEqual([2026,2025]);
  } finally {vi.useRealTimers();}
});

it('counts yesterday grace at New Year even before the first workout of this year',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T03:00:00Z'));
  const fetcher:typeof fetch=async(input,init)=>{
    if(String(input).includes('sync_status') || String(input).includes('get_dashboard_members'))return Response.json([]);
    const year=JSON.parse(String(init?.body)).p_year;
    return Response.json(year===2026?[]:['2025-12-31','2025-12-30','2025-12-29'].map(log_date=>({...row(1),log_date})));
  };
  try {
    const data=await loadDashboard(config,'fixture',2026,fetcher);
    expect(data.logs).toHaveLength(0);
    expect(data.currentStats?.get('1')).toMatchObject({week:3,streak:3});
  } finally {vi.useRealTimers();}
});

it('loads a stable all-history roster and more than 1000 annual logs with keyset pages', async()=>{
 const records=Array.from({length:1001},(_,n)=>({...row(n),user_id:String(n).padStart(4,'0')}));
 const fetcher:typeof fetch=async(input,init)=>{
  const path=String(input),p=JSON.parse(String(init?.body??'{}'));
  if(path.includes('sync_status'))return Response.json([]);
  if(path.includes('get_dashboard_members'))return Response.json([{user_id:'0000',username:'최신'},{user_id:'past',username:'과거에만 운동'}]);
  if(path.includes('get_workout_logs_page')){
   const start=p.p_after_user_id?Number(p.p_after_user_id)+1:0;
   return Response.json(records.slice(start,start+500));
  }
  return Response.json([]);
 };
 const data=await loadDashboard(config,'fixture',2026,fetcher);
 expect(data.logs).toHaveLength(1001);
 expect(data.roster).toContainEqual({id:'past',name:'과거에만 운동'});
});

it('rejects partial annual data if the second page fails', async()=>{
 const fetcher:typeof fetch=async(input,init)=>{
  const p=JSON.parse(String(init?.body??'{}'));
  if(String(input).includes('sync_status'))return Response.json([]);
  if(String(input).includes('get_dashboard_members'))return Response.json([]);
  if(p.p_after_user_id)return new Response('',{status:503});
  return Response.json(Array.from({length:500},(_,n)=>row(n)));
 };
 await expect(loadDashboard(config,'fixture',2026,fetcher)).rejects.toThrow();
});
