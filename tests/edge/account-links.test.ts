import {it,expect,vi} from 'vitest';
import {handleInteraction,publishReply,type ReplyDB} from '../../supabase/functions/_shared/interactions.ts';
import {accountRoute,pollAccount,type AccountAction} from '../../supabase/functions/_shared/account-links.ts';
const rid='00000000-0000-4000-8000-000000000001';
const base={type:2,id:'100',token:'test-only',application_id:'42',guild_id:'1',member:{user:{id:'10'},roles:['member'],permissions:'0'},data:{name:'계정연결',options:[{name:'신청',type:1,options:[{name:'유저',value:'20',type:6}]}]}};
async function signed(body:unknown){const p=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);const raw=JSON.stringify(body),timestamp='1791968400';const hex=(a:ArrayBuffer)=>[...new Uint8Array(a)].map(v=>v.toString(16).padStart(2,'0')).join('');return {request:new Request('https://fixture.test',{method:'POST',body:raw,headers:{'X-Signature-Timestamp':timestamp,'X-Signature-Ed25519':hex(await crypto.subtle.sign('Ed25519',p.privateKey,new TextEncoder().encode(timestamp+raw)))}}),publicKey:hex(await crypto.subtle.exportKey('raw',p.publicKey))};}
it('signed commands and clicks get a new private reply and own cleanup, preserving parent',async()=>{
 const actions:AccountAction[]=[];const jobs=new Map([['parent',50]]);let now=1000;const pending:Promise<unknown>[]=[];
 const db:ReplyDB={prepare:async b=>{if(jobs.has(b.id))return false;jobs.set(b.id,0);return true;},reservePublish:async()=>0,daily:async()=>[],lastSuccess:async()=>null,schedule:async(id,at)=>{jobs.set(id,at.getTime()+300000);}};
 for(const body of [base,{...base,type:3,id:'101',data:{custom_id:`mukmuk-account:consent:${rid}:1`}}]){
  const s=await signed(body);const res=await handleInteraction(s.request,{...s,guildId:'1',appId:'42',memberRoleId:'member',waitUntil:p=>pending.push(p),publish:async()=>{},account:{online:async()=>true,publish:async(b,a)=>publishReply(b,{key:btoa(String.fromCharCode(...new Uint8Array(32))),now:()=>new Date(now),dashboardUrl:'',db,discord:async(_m,path,payload)=>{expect(path).not.toContain('/parent/');expect(payload?.allowed_mentions).toEqual({parse:[]});return Response.json({});},render:async()=>{actions.push(a);return {content:'동의 확인',components:[]};}})}});
  expect(await res.json()).toEqual({type:5,data:{flags:64}});now+=1000;
 }
 await Promise.all(pending);expect(actions.map(a=>a.interaction_id)).toEqual(['100','101']);expect(jobs.get('parent')).toBe(50);expect(jobs.get('101')).toBeGreaterThanOrEqual(301000);
});
it('wrong guild and forged signature never route; offline and unauthorized notices promise no deletion',async()=>{
 const publish=vi.fn();const account={online:async()=>false,publish};
 for(const b of [base,{...base,member:{...base.member,roles:[]}}]){const s=await signed(b);const res=await handleInteraction(s.request,{...s,guildId:'1',appId:'42',memberRoleId:'member',waitUntil:()=>{},publish:async()=>{},account});const r=await res.json();expect(r.type).toBe(4);expect(r.data.content).not.toContain('5분');}
 const s=await signed({...base,guild_id:'2'});expect((await handleInteraction(s.request,{...s,guildId:'1',appId:'42',waitUntil:()=>{},publish:async()=>{},account})).status).toBe(403);expect(publish).not.toHaveBeenCalled();
});
it('opens rejection modal without queue and validates modal submit',async()=>{
 const context={actorId:'10',manager:true,member:true};const click={...base,type:3,data:{custom_id:`mukmuk-account:reject_modal:${rid}:2`}};
 const open=accountRoute(click,context)!;expect(open.modal?.type).toBe(9);expect(open.action).toBeUndefined();
 const submit=accountRoute({...click,type:5,data:{custom_id:`mukmuk-account:reject:${rid}:2`,components:[{components:[{custom_id:'reason',value:'사유'}]}]}},context)!;
 expect(submit.action?.payload?.reason).toBe('사유');expect(submit.action?.kind).toBe('reject');
 expect(accountRoute({...click,data:{custom_id:'mukmuk-account:approve:bad:2'}},context)?.error).toBeTruthy();
});
it('waits at most twenty seconds without accepting an expired or restarted action',async()=>{
 let clock=0;const enqueue=vi.fn(async()=>{});const result=vi.fn(async()=>null);
 const r=await pollAccount({interaction_id:'100',actor_id:'10',kind:'status'},{enqueue,result},()=>clock,async ms=>{clock+=ms;});
 expect(clock).toBe(20000);expect(enqueue).toHaveBeenCalledOnce();expect(r.content).toContain('현황');
});
it('never delivers a business action if cleanup preparation fails',async()=>{
 const render=vi.fn();let content='';await publishReply({id:'100',token:'test',application_id:'42',targetId:'10',targetName:'운동가'},{key:btoa(String.fromCharCode(...new Uint8Array(32))),now:()=>new Date(),dashboardUrl:'',db:{prepare:async()=>{throw new Error()},reservePublish:async()=>0,daily:async()=>[],lastSuccess:async()=>null,schedule:async()=>{}},render,preparationFailure:'잠시 뒤 다시 이용해 주세요.',discord:async(_m,_p,b)=>{content=String(b?.content);return Response.json({});}});expect(render).not.toHaveBeenCalled();expect(content).not.toContain('5분');
});
