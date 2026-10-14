import { expect,it } from 'vitest';
import { cleanupDue } from '../../supabase/functions/_shared/cleanup.ts';
import { encryptToken } from '../../supabase/functions/_shared/crypto.ts';
const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const now=new Date('2026-10-14T09:05:00Z');
async function job(extra:Record<string,unknown>={}) {
  return { interaction_id:'123',application_id:'42',token_ciphertext:await encryptToken('token',key,'123'),
    token_expires_at:new Date('2026-10-14T09:15:00Z'),published_at:new Date('2026-10-14T09:00:00Z'),
    delete_after:now,attempts:1,...extra };
}
it('deletes only due originals, treats message-not-found as done and retries rate limits', async()=>{
  const finished:string[]=[]; const retries:Date[]=[]; const methods:string[]=[];
  const jobs=[await job(),await job({interaction_id:'124',token_ciphertext:await encryptToken('token',key,'124')})];
  await cleanupDue({key,now:()=>now,db:{claim:async()=>jobs,finish:async(id)=>{finished.push(id)},retry:async(_id,at)=>{retries.push(at)},schedule:async()=>{}},
    discord:async(method,path)=>{methods.push(method);return path.includes('/token/')&&methods.length===1?Response.json({code:10008},{status:404}):Response.json({retry_after:12},{status:429})}});
  expect(methods).toEqual(['DELETE','DELETE']);expect(finished).toEqual(['123']);expect(retries[0].toISOString()).toBe('2026-10-14T09:05:12.000Z');
});
it('recovers displayed preparing responses using their edit time, without deleting early', async()=>{
  const actions:string[]=[];
  await cleanupDue({key,now:()=>now,db:{claim:async()=>[await job({published_at:null,delete_after:null})],
    finish:async()=>{actions.push('finish')},retry:async()=>{actions.push('retry')},schedule:async(_id,at)=>{actions.push(at.toISOString())}},
    discord:async(method)=>{actions.push(method);return Response.json({flags:0,edited_timestamp:'2026-10-14T09:04:00Z',timestamp:'2026-10-14T09:00:00Z'})}});
  expect(actions).toEqual(['GET','2026-10-14T09:04:00.000Z']);
});
it('expired tokens fail without any HTTP request and unknown webhooks are terminal',async()=>{
  const failures:string[]=[];
  await cleanupDue({key,now:()=>now,db:{claim:async()=>[await job({token_expires_at:now}),await job()],
    finish:async(_id,status)=>{failures.push(status)},retry:async()=>{},schedule:async()=>{}},
    discord:async()=>Response.json({code:10015},{status:404})});
  expect(failures).toEqual(['failed','failed']);
});
