import postgres from 'npm:postgres@3.4.9';
import {createDB} from '../functions/_shared/db.ts';
Deno.test('Edge inbox gates session, replays once, and never creates business requests',async()=>{
 const url=Deno.env.get('TEST_DATABASE_URL')!;const admin=postgres(url,{max:1,ssl:false,prepare:false});const edge=createDB(url.replace('postgres@','mukmuk_worker@'),true);
 const action={interaction_id:'901',actor_id:'902',kind:'status'};
 try{
  await admin`UPDATE solitary_athlete.mukmuk_identity_state SET enabled=true`;
  await admin`UPDATE solitary_athlete.mukmuk_local_runtime SET ready=false`;
  if(await edge.accounts.online())throw new Error('offline accepted');
  let denied=false;try{await edge.accounts.enqueue(action);}catch{denied=true;}if(!denied)throw new Error('offline queued');
  await admin`UPDATE solitary_athlete.mukmuk_local_runtime SET ready=true,lease_until=clock_timestamp()+interval '15 seconds'`;
  const before=await admin`SELECT count(*)::int AS n FROM solitary_athlete.mukmuk_account_link_requests`;
  await Promise.all([edge.accounts.enqueue(action),edge.accounts.enqueue(action)]);
  const count=await admin`SELECT count(*)::int AS n FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id='901'`;
  if(count[0].n!==1)throw new Error('duplicate action');
  const after=await admin`SELECT count(*)::int AS n FROM solitary_athlete.mukmuk_account_link_requests`;
  if(before[0].n!==after[0].n)throw new Error('Edge created business state');
  if(await edge.accounts.result('901','903'))throw new Error('private result leaked');
  await admin`UPDATE solitary_athlete.mukmuk_local_runtime SET fence=fence+1`;
  if(!(await edge.accounts.result('901','902'))?.content.includes('시간'))throw new Error('old session action alive');
 }finally{
  await admin`DELETE FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id='901'`;
  await admin`UPDATE solitary_athlete.mukmuk_identity_state SET enabled=false`;
  await admin`UPDATE solitary_athlete.mukmuk_local_runtime SET ready=false,lease_until=clock_timestamp()`;
  await edge.sql.end();await admin.end({timeout:0});
 }
});
