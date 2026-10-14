import { createDB } from '../_shared/db.ts';
import { cleanupDue } from '../_shared/cleanup.ts';
import { discord,setting } from '../_shared/runtime.ts';
import { verifyCleanupHeaders } from '../_shared/internal-auth.ts';
const {db}=createDB(setting('MUKMUK_DATABASE_URL'));
Deno.serve(async req=>{
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  if(!await verifyCleanupHeaders(req.headers,setting('MUKMUK_CLEANUP_SECRET')))
    return new Response('Unauthorized',{status:401});
  try{return Response.json(await cleanupDue({key:setting('MUKMUK_REPLY_TOKEN_KEY'),now:()=>new Date(),db,discord}));}
  catch{console.error('mukmuk_cleanup_failed');return new Response('Cleanup failed',{status:503});}
});
