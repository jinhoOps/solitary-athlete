import { createDB } from '../functions/_shared/db.ts';
import { encryptToken } from '../functions/_shared/crypto.ts';

function assert(condition:boolean,message:string){if(!condition)throw new Error(message);}
Deno.test('real SQL queue: 300 seconds, concurrent claims, lease recovery, terminal token removal',async()=>{
  const url=Deno.env.get('TEST_DATABASE_URL');if(!url)throw new Error('isolated TEST_DATABASE_URL required');
  const workerUrl=url.replace('postgres@','mukmuk_worker@');
  const a=createDB(workerUrl,true),b=createDB(workerUrl,true);
  const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  const published=new Date('2026-10-14T09:00:00Z');
  const body={id:'456',application_id:'1559809751603216444',token:'fixture',targetId:'123',targetName:'하루'};
  try{
    const preparing={...body,id:'455'};
    await a.db.prepare(preparing,await encryptToken('fixture',key,'455'),new Date('2026-10-14T09:15:00Z'));
    await a.sql`UPDATE solitary_athlete.reply_cleanup_jobs SET created_at='2026-10-14T08:58:00Z' WHERE interaction_id='455'`;
    const publisher=await a.db.reservePublish('455',published);
    assert(publisher===0,'publisher must reserve a fresh generation');
    assert((await b.db.claim(new Date('2026-10-14T09:00:44Z'))).length===0,'recovery must respect active publication');
    assert((await b.db.claim(new Date('2026-10-14T09:00:45Z'))).length===1,'abandoned publication must recover');
    assert(await a.db.reservePublish('455',new Date('2026-10-14T09:00:46Z'),0)===null,'old publisher must not PATCH after recovery claim');
    await b.db.finish('455','done',undefined,1);
    await a.db.prepare(body,await encryptToken(body.token,key,body.id),new Date('2026-10-14T09:15:00Z'));
    assert(!await a.db.prepare(body,new Uint8Array([1]),new Date('2026-10-14T09:15:00Z')),'duplicate preparation must be ignored');
    await a.db.schedule(body.id,published);
    assert((await a.db.claim(new Date('2026-10-14T09:04:59Z'))).length===0,'must not claim early');
    const claims=await Promise.all([a.db.claim(new Date('2026-10-14T09:05:00Z')),b.db.claim(new Date('2026-10-14T09:05:00Z'))]);
    assert(claims[0].length+claims[1].length===1,'concurrent claims must not duplicate work');
    assert((await b.db.claim(new Date('2026-10-14T09:05:29Z'))).length===0,'active lease must be respected');
    assert((await b.db.claim(new Date('2026-10-14T09:05:30Z'))).length===1,'expired lease must recover');
    await Reflect.apply(a.db.finish,null,[body.id,'done',undefined,1]);
    const leased=await a.sql`SELECT status FROM solitary_athlete.reply_cleanup_jobs WHERE interaction_id=${body.id}`;
    assert(leased[0].status==='processing','stale lease owner must not finalize a renewed claim');
    await Reflect.apply(b.db.finish,null,[body.id,'done',undefined,2]);
    const rows=await a.sql`SELECT token_ciphertext,status FROM solitary_athlete.reply_cleanup_jobs WHERE interaction_id=${body.id}`;
    assert(rows[0].token_ciphertext===null&&rows[0].status==='done','terminal job must erase ciphertext');
  }finally{await a.sql.end();await b.sql.end();}
});
