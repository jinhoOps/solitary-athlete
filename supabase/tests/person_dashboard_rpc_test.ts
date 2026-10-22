import postgres from 'npm:postgres@3.4.9';
Deno.test('person RPC pagination, all-history denominator, secret and identity guards',async()=>{
 const url=Deno.env.get('TEST_DATABASE_URL')!;const sql=postgres(url,{max:1,ssl:false,prepare:false});const rollback=new Error('fixture rollback');
 const assert=(v:unknown,msg:string)=>{if(!v)throw new Error(msg);};
 try{
  await sql.begin(async tx=>{
   const contract=await tx`SELECT conname,substring(pg_get_constraintdef(oid) from '''([0-9]+)''') AS value
    FROM pg_constraint WHERE conrelid='solitary_athlete.workout_events'::regclass AND conname IN ('workout_events_guild_id_check','workout_events_channel_id_check')`;
   const guild=contract.find(r=>r.conname==='workout_events_guild_id_check')!.value,channel=contract.find(r=>r.conname==='workout_events_channel_id_check')!.value;
   await tx`INSERT INTO solitary_athlete.channel_access_secrets(secret_code,issued_at,active_until,expires_at) VALUES('person-fixture',now(),now()+interval '1 day',now()+interval '2 days')`;
   await tx`UPDATE solitary_athlete.mukmuk_identity_state SET enabled=true`;
   await tx`INSERT INTO solitary_athlete.workout_events(message_id,guild_id,channel_id,user_id,username,created_at,memo,has_photo)
    SELECT (800000+i)::text,${guild},${channel},'801','같은 이름',timestamptz '2024-01-01 03:00Z'+i*interval '1 day','걷기',false FROM generate_series(0,500) i`;
   await tx`INSERT INTO solitary_athlete.workout_events(message_id,guild_id,channel_id,user_id,username,created_at,memo,has_photo)
    VALUES('800999',${guild},${channel},'802','같은 이름','2020-01-01T03:00:00Z','과거',false)`;
   await tx`SET LOCAL ROLE anon`;
   const bootstrap=await tx`SELECT * FROM solitary_athlete.get_dashboard_identity('PERSON-FIXTURE')`;assert(bootstrap[0].enabled,'identity unavailable');
   const revision=Number(bootstrap[0].revision);let total=0;
   for(const year of [2024,2025]){
    let date:string|null=null,person:string|null=null;
    for(;;){const page:Record<string,any>[]=await tx`SELECT * FROM solitary_athlete.get_person_workout_logs_page('person-fixture',${revision},${year},${date}::date,${person}::uuid,100)`;
     total+=page.filter(r=>r.username==='같은 이름').length;if(page.length<100)break;date=String(page.at(-1)!.log_date);person=page.at(-1)!.person_id;}
   }
   assert(total===501,'lost annual rows');
   const roster=await tx`SELECT * FROM solitary_athlete.get_dashboard_people('person-fixture',${revision})`;
   assert(roster.filter(r=>r.username==='같은 이름').length===2,'past-only or same-name person merged');
   await tx`RESET ROLE`;await tx`UPDATE solitary_athlete.mukmuk_identity_state SET revision=revision+1`;
   await tx`SET LOCAL ROLE anon`;
   const checks=[
    ['identity_revision_changed',()=>tx`SELECT * FROM solitary_athlete.get_dashboard_people('person-fixture',${revision})`],
    ['identity_revision_changed',()=>tx`SELECT * FROM solitary_athlete.get_person_workout_logs_page('person-fixture',${revision},2024)`],
    ['identity_revision_changed',()=>tx`SELECT * FROM solitary_athlete.get_person_grass_participation('person-fixture',${revision},'2026-10-01')`],
    ['client_update_required',()=>tx`SELECT * FROM solitary_athlete.get_dashboard_members('person-fixture')`],
    ['client_update_required',()=>tx`SELECT * FROM solitary_athlete.get_workout_logs_page('person-fixture',2024)`],
    ['client_update_required',()=>tx`SELECT * FROM solitary_athlete.get_monthly_grass_participation('person-fixture','2026-10-01')`],
    ['client_update_required',()=>tx`SELECT * FROM solitary_athlete.get_workout_logs('person-fixture',2024)`],
    ['invalid_or_expired_secret',()=>tx`SELECT * FROM solitary_athlete.get_dashboard_identity('wrong')`],
   ] as const;
   for(const [expected,query] of checks){let message='';try{await tx.savepoint(async()=>{await query();});}catch(e){message=(e as Error).message;}assert(message.includes(expected),`guard missing: ${expected}`);}
   throw rollback;
  });
 }catch(e){if(e!==rollback)throw e;}finally{await sql.end({timeout:0});}
});
