import postgres from 'npm:postgres@3.4.9';
import {createDB} from '../functions/_shared/db.ts';
Deno.test('collector two connections and concurrent Edge operations fit worker budget',async()=>{
 const url=Deno.env.get('TEST_DATABASE_URL')!;const worker=url.replace('postgres@','mukmuk_worker@');
 const lock=postgres(worker,{max:1,ssl:false,prepare:false});const data=postgres(worker,{max:1,ssl:false,prepare:false});
 const edge=createDB(worker,true);
 try {
  await lock`SELECT pg_advisory_lock(hashtext('mukmuk-test-short-db'))`;
  await data`SELECT 1`;
  const results=await Promise.all(Array.from({length:12},(_,i)=>edge.sql`SELECT ${i}::int AS n`));
  if(results.some((rows,i)=>rows[0].n!==i))throw new Error('query lost or duplicated');
  const sessions=await data`SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='mukmuk_worker'`;
  if(sessions[0].n!==2)throw new Error('Edge left a connection open');
 }finally{await edge.sql.end();await lock.end({timeout:0});await data.end({timeout:0});}
});
