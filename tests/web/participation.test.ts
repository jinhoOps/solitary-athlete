import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {loadDashboard} from '../../src/api';
import {grassParticipationRate,grassParticipationView,parseGrassParticipation} from '../../src/grass-participation';

const config={url:'https://example.supabase.co',key:'sb_publishable_fixture'};
const sample={month_start:'2026-10-01',collected_at:'2026-10-14T09:00:00Z',member_count:2,workout_days:3,elapsed_days:14,previous_collected_at:'2026-10-14T08:55:00Z',previous_member_count:1,previous_workout_days:2,previous_elapsed_days:14};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));});
afterEach(()=>vi.useRealTimers());

it('loads current-month participation independently of selected grass year',async()=>{
 let requestedMonth:unknown;
 const data=await loadDashboard(config,'  FIXTURE  ',2025,async(input,init)=>{
  if(String(input).includes('get_monthly_grass_participation')){const body=JSON.parse(String(init?.body));requestedMonth=body.p_month;expect(body.p_secret_code).toBe('fixture');return Response.json([sample]);}
  return Response.json([]);
 });
 expect(requestedMonth).toBe('2026-10-01');
 expect(data.grassParticipation).toMatchObject({status:'ready',current:{members:2,days:3,elapsedDays:14},previous:{members:1,days:2,elapsedDays:14}});
});

it('uses each snapshot denominator so a new monthly member can reduce the rate',()=>{
 const state=parseGrassParticipation([sample],'2026-10-01');
 expect(grassParticipationView(state)).toMatchObject({value:'10.7%',change:'직전 수집 대비 −3.6%p'});
 if(state.status!=='ready')throw Error('expected ready');
 expect(grassParticipationRate(state.current)).toBeCloseTo(3/28*100);
});

it('uses the last collection KST day instead of the browser day and handles midnight',()=>{
 const row={...sample,collected_at:'2026-10-14T15:00:00Z',elapsed_days:15,member_count:1,workout_days:2};
 const view=grassParticipationView(parseGrassParticipation([row],'2026-10-01'));
 expect(view.value).toBe('13.3%');expect(view.change).toBe('직전 수집 대비 −1.0%p');
 expect(view.description).toContain('2026-10-15 KST');
});

it('distinguishes empty successful sample, first sample, pending, failure and exact zero change',()=>{
 const first={...sample,member_count:0,workout_days:0,previous_collected_at:null,previous_member_count:null,previous_workout_days:null,previous_elapsed_days:null};
 expect(grassParticipationView(parseGrassParticipation([first],'2026-10-01'))).toMatchObject({value:'0%',change:'비교 기록 없음'});
 expect(grassParticipationView({status:'pending'})).toMatchObject({value:'—',change:'수집 대기'});
 expect(grassParticipationView({status:'unavailable'})).toMatchObject({value:'—',change:'집계 불러오기 실패'});
 expect(grassParticipationView(parseGrassParticipation([{...sample,previous_member_count:2,previous_workout_days:3}],'2026-10-01')).change).toBe('직전 수집 대비 변동 없음');
});

it('keeps small real changes distinct from zero and subtracts before rounding',()=>{
 const row={...sample,member_count:100,workout_days:1000,elapsed_days:14,previous_member_count:100,previous_workout_days:999};
 expect(grassParticipationView(parseGrassParticipation([row],'2026-10-01')).change).toBe('직전 수집 대비 ↑ 0.1%p 미만');
 expect(grassParticipationView(parseGrassParticipation([{...row,previous_workout_days:1001}],'2026-10-01')).change).toBe('직전 수집 대비 ↓ 0.1%p 미만');
});

it('rejects impossible, mixed-month and incomplete snapshots rather than displaying a fake percentage',()=>{
 for(const change of [{member_count:-1},{member_count:0},{workout_days:29},{elapsed_days:0},{collected_at:'invalid'},
  {month_start:'2026-09-01'},{previous_collected_at:'2026-09-30T00:00:00Z'},{previous_member_count:null},
  {previous_collected_at:sample.collected_at}])expect(()=>parseGrassParticipation([{...sample,...change}],'2026-10-01')).toThrow();
 expect(()=>parseGrassParticipation([sample,sample],'2026-10-01')).toThrow();
});

it('keeps a participation API outage separate from other dashboard records and propagates expired codes',async()=>{
 for(const [status,message] of [[503,'unavailable'],[400,'invalid_or_expired_secret']] as const){
  const request=loadDashboard(config,'fixture',2025,async input=>String(input).includes('get_monthly_grass_participation')?Response.json({message},{status}):Response.json([]));
  if(status===400)await expect(request).rejects.toThrow('invalid_or_expired_secret');
  else expect((await request).grassParticipation).toEqual({status:'unavailable'});
 }
});

it('starts a new KST month with pending state rather than comparing with the previous month',async()=>{
 vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
 let month:string|undefined;
 const data=await loadDashboard(config,'fixture',2025,async(input,init)=>{
  if(String(input).includes('get_monthly_grass_participation'))month=JSON.parse(String(init?.body)).p_month;
  return Response.json([]);
 });
 expect(month).toBe('2026-11-01');expect(data.grassParticipation).toEqual({status:'pending'});
});

it('omits redundant decimal zero so a full percentage fits narrow enlarged KPI cards',()=>{
 const row={...sample,member_count:1,workout_days:14};
 expect(grassParticipationView(parseGrassParticipation([row],'2026-10-01')).value).toBe('100%');
});

it('keeps valid member authentication when only the participation RPC has SQL or permission errors',async()=>{
 for(const status of [400,401,403]){
  const data=await loadDashboard(config,'fixture',2025,async input=>String(input).includes('get_monthly_grass_participation')
   ?Response.json({message:status===400?'invalid_month':'permission denied',code:'42501'},{status})
   :Response.json([]));
  expect(data.grassParticipation).toEqual({status:'unavailable'});
 }
});
