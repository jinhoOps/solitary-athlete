import postgres from 'npm:postgres@3.4.9';
function assert(ok:unknown,msg:string){if(!ok)throw new Error(msg);}
Deno.test('dashboard paging: all-history roster, full annual pages, cursor validation, authenticated access',async()=>{
 const url=Deno.env.get('TEST_DATABASE_URL');if(!url)throw new Error('isolated database required');
 const admin=postgres(url,{max:1,prepare:false,ssl:false});const anon=postgres(url.replace('postgres@','anon@'),{max:1,prepare:false,ssl:false});
 try {
  await admin`INSERT INTO solitary_athlete.channel_access_secrets(secret_code,issued_at,active_until,expires_at) VALUES ('paging-fixture',now(),now()+interval '1 day',now()+interval '2 days') ON CONFLICT DO NOTHING`;
  await admin`INSERT INTO solitary_athlete.workout_logs(user_id,username,log_date,memo,has_photo,verification_count)
   SELECT (900000000000000000+u)::text, '같은 이름', date '2026-01-01'+d, '', false,1 FROM generate_series(1,4) u CROSS JOIN generate_series(0,300) d ON CONFLICT DO NOTHING`;
  await admin`INSERT INTO solitary_athlete.workout_logs(user_id,username,log_date,memo,has_photo,verification_count) VALUES ('900000000000000099','과거 멤버','2025-01-01','',false,1) ON CONFLICT DO NOTHING`;
  await admin`INSERT INTO solitary_athlete.channel_access_secrets(secret_code,issued_at,active_until,expires_at) VALUES ('paging-expired',now()-interval '9 days',now()-interval '2 days',now()-interval '1 day') ON CONFLICT DO NOTHING`;
  const normalized=await anon`SELECT * FROM solitary_athlete.get_dashboard_members('  PAGING-FIXTURE  ',NULL,1)`;assert(normalized.length===1,'normalization failed');
  let after:string|null=null;const ids:string[]=[];
  for(;;){const page: {user_id:string;username:string}[]=await anon`SELECT * FROM solitary_athlete.get_dashboard_members('paging-fixture',${after},2)`;ids.push(...page.map(r=>r.user_id));if(page.length<2)break;after=page.at(-1)!.user_id;}
  assert(ids.includes('900000000000000099'),'past-only member missing');assert(ids.filter(x=>['900000000000000001','900000000000000002','900000000000000003','900000000000000004'].includes(x)).length===4,'same names merged');assert(new Set(ids).size===ids.length,'duplicate roster');
  let cursorDate:string|null=null,cursorId:string|null=null;const keys:string[]=[];
  for(;;){const page: {user_id:string;log_date:string}[]=await anon`SELECT * FROM solitary_athlete.get_workout_logs_page('paging-fixture',2026,${cursorDate}::date,${cursorId},100)`;keys.push(...page.filter(r=>r.user_id >= '900000000000000001' && r.user_id <= '900000000000000004').map(r=>`${r.log_date}:${r.user_id}`));if(page.length<100)break;cursorDate=String(page.at(-1)!.log_date);cursorId=page.at(-1)!.user_id;}
  assert(keys.length===1204&&new Set(keys).size===1204,'annual pages incomplete');
  for(const query of [()=>anon`SELECT * FROM solitary_athlete.get_dashboard_members('paging-expired')`,()=>anon`SELECT * FROM solitary_athlete.get_workout_logs_page('paging-expired',2026)`,()=>anon`SELECT * FROM solitary_athlete.get_dashboard_members('wrong')`,()=>anon`SELECT * FROM solitary_athlete.get_workout_logs_page('wrong',2026)`,()=>anon`SELECT * FROM solitary_athlete.get_workout_logs_page('paging-fixture',2026,'2026-01-01',NULL)`,()=>anon`SELECT * FROM solitary_athlete.get_workout_logs_page('paging-fixture',9999)`,()=>anon`SELECT * FROM solitary_athlete.workout_logs`]){
   let rejected=false;try{await query();}catch{rejected=true;}assert(rejected,'invalid access accepted');
  }
 }finally{await admin`DELETE FROM solitary_athlete.workout_logs WHERE user_id >= '900000000000000001' AND user_id <= '900000000000000004' OR user_id='900000000000000099'`;await admin`DELETE FROM solitary_athlete.channel_access_secrets WHERE secret_code IN ('paging-fixture','paging-expired')`;await anon.end();await admin.end();}
});
