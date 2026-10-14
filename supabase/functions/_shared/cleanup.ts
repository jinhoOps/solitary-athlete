import { decryptToken } from './crypto.ts';
import type { DiscordCall } from './interactions.ts';

export interface CleanupJob {
  interaction_id:string; application_id:string; token_ciphertext:Uint8Array;
  token_expires_at:Date; published_at:Date|null; delete_after:Date|null; attempts:number;
}
export interface CleanupDB {
  claim:(now:Date)=>Promise<CleanupJob[]>;
  finish:(id:string,status:'done'|'failed',code?:string,attempt?:number)=>Promise<void>;
  retry:(id:string,at:Date,code:string,attempt?:number)=>Promise<void>;
  schedule:(id:string,publishedAt:Date,attempt?:number)=>Promise<void>;
}
export async function cleanupDue(deps:{key:string;now:()=>Date;db:CleanupDB;discord:DiscordCall}) {
  const started=deps.now().getTime();let claimed=0;
  // Fresh one-row claims keep each lease useful and drain bursts before token expiry.
  for(let round=0;round<50;round++) {
    const now=deps.now();
    if(round>0&&now.getTime()-started>=20_000)break;
    const jobs=await deps.db.claim(now);if(!jobs.length)break;claimed+=jobs.length;
    for (const job of jobs) {
    const ownedDB:CleanupDB={...deps.db,
      finish:(id,status,code)=>deps.db.finish(id,status,code,job.attempts),
      retry:(id,at,code)=>deps.db.retry(id,at,code,job.attempts),
      schedule:(id,at)=>deps.db.schedule(id,at,job.attempts),
    };
    const owned={...deps,db:ownedDB};
    const id=job.interaction_id;
    if (new Date(job.token_expires_at).getTime()<=now.getTime()) { await ownedDB.finish(id,'failed','token_expired'); continue; }
    let path: string;
    try { path=`/webhooks/${job.application_id}/${await decryptToken(job.token_ciphertext,deps.key,id)}/messages/@original`; }
    catch { await ownedDB.finish(id,'failed','cipher_invalid'); continue; }
    try {
      if (!job.published_at) {
        const original=await deps.discord('GET',path);
        if (original.ok) {
          const message=await original.json();
          if (!(message.flags & 128)) {
            const published=new Date(message.edited_timestamp || message.timestamp);
            if (!Number.isFinite(published.getTime())) throw new Error('Invalid publish time');
            await ownedDB.schedule(id,published);
            continue;
          }
          // Preparing rows are claimed only after 60 seconds: abandoned loading reply.
        } else if (original.status!==404) {
          await retryResponse(original,job,owned,now); continue;
        }
      } else if (!job.delete_after || new Date(job.delete_after).getTime()>now.getTime()) {
        await ownedDB.retry(id,new Date(job.delete_after ?? now),'not_due'); continue;
      }
      const res=await deps.discord('DELETE',path);
      if (res.status===204) { await ownedDB.finish(id,'done'); continue; }
      if (res.status===404) {
        const error=await res.json().catch(()=>({}));
        await ownedDB.finish(id,error.code===10008?'done':'failed',`discord_${error.code ?? 404}`); continue;
      }
      await retryResponse(res,job,owned,now);
    } catch {
      await ownedDB.retry(id,new Date(now.getTime()+Math.min(60,2**Math.min(job.attempts,6))*1000),'network_or_storage');
    }
  }
  }
  return {claimed};
}
async function retryResponse(res:Response,job:CleanupJob,deps:{db:CleanupDB},now:Date) {
  if (res.status===429 || res.status>=500) {
    const seconds=res.status===429 ? Number((await res.json()).retry_after) : Math.min(60,2**Math.min(job.attempts,6));
    if (!Number.isFinite(seconds) || seconds<0) throw new Error('Invalid retry delay');
    await deps.db.retry(job.interaction_id,new Date(now.getTime()+seconds*1000),`discord_${res.status}`);
  } else await deps.db.finish(job.interaction_id,'failed',`discord_${res.status}`);
}
