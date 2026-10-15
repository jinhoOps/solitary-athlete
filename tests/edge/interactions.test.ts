import { expect, it } from 'vitest';
import { handleInteraction, publishReply } from '../../supabase/functions/_shared/interactions.ts';
import { encryptToken, decryptToken } from '../../supabase/functions/_shared/crypto.ts';
import { formatGrass } from '../../supabase/functions/_shared/grass.ts';

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const body = { type: 2, id: '123', token: 'interaction-fixture', application_id: '42', guild_id: '1',
  member: { user: { id: '10', username: '하루' } }, data: { name: '잔디', options: [{ name: '유저', value: '20' }], resolved: { users: { '20': { id: '20', username: '다른 멤버', bot: false } } } } };
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function signed(payload: unknown) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign','verify']);
  const timestamp = '1791968400'; const raw = JSON.stringify(payload);
  const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(timestamp + raw));
  return { request: new Request('https://example.test', { method:'POST', body:raw, headers: { 'X-Signature-Timestamp':timestamp, 'X-Signature-Ed25519':hex(signature) } }),
    publicKey: hex(await crypto.subtle.exportKey('raw', pair.publicKey)) };
}

it('validates a real Ed25519 PING, rejects missing or malformed signatures', async () => {
  const { request, publicKey } = await signed({type:1});
  const deps = { publicKey, guildId:'1', appId:'42', waitUntil:()=>{}, publish:async()=>{} };
  expect(await (await handleInteraction(request, deps)).json()).toEqual({type:1});
  expect((await handleInteraction(new Request('https://example.test', {method:'POST',body:'{}'}),deps)).status).toBe(401);
  const invalid = await signed({type:1}); invalid.request.headers.set('X-Signature-Ed25519','gg');
  expect((await handleInteraction(invalid.request,deps)).status).toBe(401);
});

it('returns public defer immediately and routes the resolved target, rejects wrong guild', async () => {
  const { request, publicKey } = await signed(body);
  const results: unknown[]=[];
  const res = await handleInteraction(request,{ publicKey,guildId:'1',appId:'42',waitUntil:p=>{ results.push(p); },publish:async b=>{ expect(b.targetId).toBe('20'); } });
  expect(await res.json()).toEqual({type:5});
  await Promise.all(results); expect(results).toHaveLength(1);
  const wrong = await signed({...body,guild_id:'2'});
  expect((await handleInteraction(wrong.request,{ publicKey:wrong.publicKey,guildId:'1',appId:'42',waitUntil:()=>{},publish:async()=>{} })).status).toBe(403);
});

it('AES-GCM hides tokens, binds each interaction and rejects modified ciphertext', async () => {
  const cipher = await encryptToken('secret-token',key,'123');
  expect(new TextDecoder().decode(cipher)).not.toContain('secret-token');
  expect(await decryptToken(cipher,key,'123')).toBe('secret-token');
  await expect(decryptToken(cipher,key,'124')).rejects.toThrow();
  cipher[cipher.length-1]^=1;
  await expect(decryptToken(cipher,key,'123')).rejects.toThrow();
});

it('retains all five record days with bounded previews and twenty-eight cells', () => {
  const rows = Array.from({length:5},(_,i)=>({user_id:'10',username:'하루',log_date:`2026-10-${14-i}`,memo:'@everyone 🌱'.repeat(1000),has_photo:i===0,verification_count:1}));
  const content=formatGrass('하루',rows,'2026-10-14',null,'https://example.com');
  expect(content.length).toBeLessThanOrEqual(2000);
  expect(content).toContain('누적 5일'); expect(content).toContain('5분');
  for (const day of ['10.14','10.13','10.12','10.11','10.10']) expect(content).toContain(day);
  expect(content).not.toContain('@everyone'); expect(content).toContain('🌲');
  expect(content).toContain('⬛ 기록 없음'); expect(content).toContain('⬛'); expect(content).not.toContain('⬜');
});

it('persists encrypted preparation before publishing and schedules from the successful display time', async () => {
  const order:string[]=[]; let published:Date|undefined;
  const job={...body,targetId:'20',targetName:'다른 멤버'};
  await publishReply(job,{
    key,now:()=>new Date('2026-10-14T09:00:00Z'),dashboardUrl:'',
    db:{prepare:async(_b,cipher)=>{expect(cipher.length).toBeGreaterThan(12);order.push('prepare');return true;},
      reservePublish:async()=>0,daily:async()=>[],lastSuccess:async()=>null,schedule:async(_id,at)=>{published=at;order.push('schedule');}},
    discord:async(method,_path,payload)=>{expect(method).toBe('PATCH');expect(payload?.allowed_mentions).toEqual({parse:[]});order.push('publish');return new Response('{}',{status:200});},
  });
  expect(order).toEqual(['prepare','publish','schedule']);expect(published?.toISOString()).toBe('2026-10-14T09:00:00.000Z');
});

it('deletes the deferred original when preparation fails, publishes nothing', async () => {
  const methods:string[]=[];
  await publishReply({...body,targetId:'10',targetName:'하루'},{key,now:()=>new Date(),dashboardUrl:'',
    db:{prepare:async()=>{throw new Error('DB unavailable')},reservePublish:async()=>0,daily:async()=>[],lastSuccess:async()=>null,schedule:async()=>{}},
    discord:async method=>{methods.push(method);return new Response(null,{status:204});}});
  expect(methods).toEqual(['DELETE']);
});

it('never PATCHes after a recovery worker has claimed preparation',async()=>{
  const methods:string[]=[];
  await publishReply({...body,targetId:'10',targetName:'하루'},{key,now:()=>new Date(),dashboardUrl:'',
    db:{prepare:async()=>true,reservePublish:async()=>null,daily:async()=>[],lastSuccess:async()=>null,schedule:async()=>{}},
    discord:async method=>{methods.push(method);return Response.json({});}});
  expect(methods).toEqual([]);
});

it('retries transient publication failures under a renewed ownership lease',async()=>{
  const sleeps:number[]=[];let requests=0;let leases=0;let scheduled=false;
  await publishReply({...body,targetId:'10',targetName:'하루'},{key,now:()=>new Date(),dashboardUrl:'',sleep:async n=>{sleeps.push(n)},
    db:{prepare:async()=>true,reservePublish:async()=>{leases++;return 0},daily:async()=>[],lastSuccess:async()=>null,schedule:async()=>{scheduled=true}},
    discord:async()=>{requests++;return requests===1?Response.json({retry_after:0.01},{status:429}):requests===2?new Response(null,{status:503}):Response.json({});}});
  expect(scheduled).toBe(true);expect(requests).toBe(3);expect(leases).toBe(3);expect(sleeps[0]).toBe(10);
});

it('publishes a direct-entry dashboard link using the currently valid code',async()=>{
  let content='';
  await publishReply({...body,targetId:'10',targetName:'하루'}, {
    key,now:()=>new Date('2026-10-14T09:00:00Z'),dashboardUrl:'https://example.com/board/?from=discord#grass',
    db:{prepare:async()=>true,reservePublish:async()=>0,daily:async()=>[],lastSuccess:async()=>null,schedule:async()=>{},activeSecret:async()=> 'mukmuk-fixture'},
    discord:async(_method,_path,payload)=>{content=String(payload?.content);return Response.json({});},
  });
  expect(content).toContain('https://example.com/board/?from=discord&code=mukmuk-fixture#grass');
});
