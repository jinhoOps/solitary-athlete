import {it,expect,vi} from 'vitest';
import {loadDashboard} from '../../src/api';
import {grassParticipationView,parseGrassParticipation} from '../../src/grass-participation';
const person='00000000-0000-4000-8000-000000000001';
it('keeps percentage, omits changed-identity delta, and resumes the following day',()=>{
 const row={month_start:'2026-10-01',collected_at:'2026-10-10T03:00:00Z',member_count:1,workout_days:4,elapsed_days:10,identity_revision:1,calculation_version:2,
 previous_collected_at:'2026-10-09T14:59:00Z',previous_member_count:2,previous_workout_days:5,previous_elapsed_days:9,previous_identity_revision:0,previous_calculation_version:2};
 expect(grassParticipationView(parseGrassParticipation([row],'2026-10-01'))).toMatchObject({value:'40%',change:'계정 변경으로 비교 제외'});
 expect(grassParticipationView(parseGrassParticipation([{...row,previous_identity_revision:1,previous_member_count:1,previous_workout_days:3}],'2026-10-01')).change).toContain('전일 대비');
 expect(grassParticipationView(parseGrassParticipation([{...row,previous_identity_revision:1,previous_calculation_version:1}],'2026-10-01')).change).toBe('계산 기준 변경으로 비교 제외');
});
it('restarts the entire person load on revision change, and sends one version to every route',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
 try{
  let revision=1;const calls:{name:string;revision:number}[]=[];
  const fetcher:typeof fetch=async(input,init)=>{
   const name=String(input).split('/').at(-1)!,b=JSON.parse(String(init?.body??'{}'));calls.push({name,revision:b.p_revision});
   if(name==='get_dashboard_identity')return Response.json([{enabled:true,revision,calculation_version:2}]);
   if(name==='sync_status')return Response.json([]);
   if(b.p_revision!==revision)return Response.json({message:'identity_revision_changed'},{status:409});
   if(name==='get_dashboard_people')return Response.json([{person_id:person,username:'하루',identity_revision:revision}]);
   if(name==='get_person_grass_participation')return Response.json([]);
   if(name==='get_person_workout_logs_page'){
    if(revision===1){revision=2;return Response.json({message:'identity_revision_changed'},{status:409});}
    return Response.json([{person_id:person,username:'하루',log_date:'2026-10-14',memo:'걷기',has_photo:true,verification_count:2,identity_revision:revision}]);
   }
   throw new Error('legacy route used');
  };
  const data=await loadDashboard({url:'https://fixture.test',key:'test'},'test',2026,fetcher);
  expect(data.identityRevision).toBe(2);expect(data.logs[0]).toMatchObject({subject:{kind:'person',id:person},verification_count:2});
  expect(data.logs[0]).not.toHaveProperty('user_id');expect(calls.filter(c=>c.name==='get_dashboard_identity')).toHaveLength(2);
 }finally{vi.useRealTimers();}
});
it('bounds full-load retries and never treats identity errors as expired code',async()=>{
 let boots=0;const fetcher:typeof fetch=async(input)=>{
  if(String(input).endsWith('get_dashboard_identity')){boots++;return Response.json([{enabled:true,revision:boots,calculation_version:2}]);}
  if(String(input).includes('sync_status'))return Response.json([]);
  return Response.json({message:'identity_revision_changed'},{status:409});
 };
 await expect(loadDashboard({url:'https://fixture.test',key:'test'},'test',2026,fetcher)).rejects.toThrow('identity_revision_changed');
 expect(boots).toBe(3);
});
it('keeps one revision through previous-year streak extension and rejects a mid-extension switch',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T03:00:00Z'));
 try{
  const seen:{name:string;year:number;rev:number}[]=[];
  const fetcher:typeof fetch=async(input,init)=>{
   const name=String(input).split('/').at(-1)!,b=JSON.parse(String(init?.body??'{}'));seen.push({name,year:b.p_year,rev:b.p_revision});
   if(name==='get_dashboard_identity')return Response.json([{enabled:true,revision:1,calculation_version:2}]);
   if(name==='get_dashboard_people')return Response.json([{person_id:person,username:'하루',identity_revision:1}]);
   if(name==='get_person_workout_logs_page')return Response.json((b.p_year===2026?['2026-01-01']:['2025-12-31']).map(log_date=>({person_id:person,identity_revision:1,username:'하루',log_date,memo:'',has_photo:false,verification_count:1})));
   return Response.json([]);
  };
  const data=await loadDashboard({url:'https://fixture.test',key:'test'},'test',2026,fetcher);
  expect(data.currentStats?.get(person)?.streak).toBe(2);
  expect(seen.filter(c=>c.name==='get_person_workout_logs_page')).toEqual([{name:'get_person_workout_logs_page',year:2026,rev:1},{name:'get_person_workout_logs_page',year:2025,rev:1}]);
 }finally{vi.useRealTimers();}
});
