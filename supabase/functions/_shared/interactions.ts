import {accountRoute,OFFLINE,BUSY,type AccountAction} from './account-links.ts';
import { dashboardLink } from './dashboard-link.ts';
import { encryptToken } from './crypto.ts';
import { formatGrass } from './grass.ts';
import { dayAt } from '../../../src/dates.ts';
import type { WorkoutLog } from '../../../src/types.ts';

export interface ReplyActionRow {type:1;components:Record<string,unknown>[]}
export interface ReplyContent {content:string;components?:ReplyActionRow[]}
export interface Reply {
  id: string; token: string; application_id: string; targetId: string; targetName: string;
}
export type DiscordCall = (method: string, path: string, payload?: Record<string, unknown>) => Promise<Response>;
export interface ReplyDB {
  activeSecret?: (now:Date) => Promise<string|null>;
  prepare: (body: Reply, cipher: Uint8Array, expiresAt: Date) => Promise<boolean>;
  reservePublish: (id:string, now:Date, attempt?:number) => Promise<number|null>;
  daily: (userId: string) => Promise<WorkoutLog[]>;
  lastSuccess: () => Promise<string | null>;
  schedule: (id: string, publishedAt: Date, attempt?:number) => Promise<void>;
}
function unhex(hex: string, size: number): Uint8Array<ArrayBuffer> | null {
  if (hex.length !== size*2 || !/^[0-9a-f]+$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g)!, b => parseInt(b,16));
}
export async function handleInteraction(req: Request, deps: { publicKey:string; guildId:string; appId:string;
  account?:{online:()=>Promise<boolean>;publish:(body:Reply,action:AccountAction)=>Promise<void>};
  memberRoleId?:string; refresh?:(body:Reply & {requesterId:string})=>Promise<void>;
  waitUntil:(p:Promise<unknown>)=>void; publish:(body:Reply)=>Promise<void> }): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', {status:405});
  const timestamp = req.headers.get('X-Signature-Timestamp') ?? '';
  const signature = unhex(req.headers.get('X-Signature-Ed25519') ?? '',64);
  const key = unhex(deps.publicKey,32);
  if (!signature || !key || !/^\d{1,12}$/.test(timestamp)) return new Response('Invalid signature', {status:401});
  const raw = await req.text();
  try {
    const publicKey = await crypto.subtle.importKey('raw',key,'Ed25519',false,['verify']);
    if (!await crypto.subtle.verify('Ed25519',publicKey,signature,new TextEncoder().encode(timestamp+raw))) return new Response('Invalid signature',{status:401});
  } catch { return new Response('Invalid signature',{status:401}); }
  let body;
  try { body=JSON.parse(raw); } catch { return new Response('Invalid JSON',{status:400}); }
  if (body.type===1) return Response.json({type:1});
  if (body.guild_id!==deps.guildId || body.application_id!==deps.appId) return new Response('Unsupported guild',{status:403});
  let manager=false;
  try {manager=(BigInt(body.member?.permissions??'0')&40n)!==0n;}catch{/* deny through role check */}
  const actor=body.member?.user;
  const route=accountRoute(body,{actorId:actor?.id,manager,member:!!deps.memberRoleId&&Array.isArray(body.member?.roles)&&body.member.roles.includes(deps.memberRoleId)});
  if(route){
    const deny=(content:string)=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
    if(actor?.bot||route.error)return deny(route.error??'일반 사용자 계정만 이용할 수 있어요.');
    try {if(!deps.account||!await deps.account.online())return deny(OFFLINE);}catch{return deny(BUSY);}
    if(route.modal)return Response.json(route.modal);
    const reply:Reply={id:body.id,token:body.token,application_id:body.application_id,targetId:actor.id,targetName:'운동가'};
    deps.waitUntil(deps.account.publish(reply,route.action!).catch(()=>console.error('mukmuk_account_reply_failed')));
    return Response.json({type:5,data:{flags:64}});
  }
  if (body.type!==2 || !['잔디','기록갱신'].includes(body.data?.name)) return new Response('Unsupported interaction',{status:400});
  const caller=body.member?.user;
  const option=body.data.options?.find((o:{name:string})=>o.name==='유저');
  const targetId=option?.value ?? caller?.id;
  const target=option ? body.data.resolved?.users?.[targetId] : caller;
  if (!target || target.bot || !/^\d+$/.test(targetId) || !/^\d+$/.test(body.id) || typeof body.token!=='string') return new Response('Invalid user',{status:400});
  const member=option ? body.data.resolved?.members?.[targetId] : body.member;
  const reply:Reply={id:body.id,token:body.token,application_id:body.application_id,targetId,
    targetName:member?.nick || target.global_name || target.username || '운동가'};
  if(body.data.name==='기록갱신') {
    const deny=(content:string)=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
    let manager=false;
    try {manager=(BigInt(body.member.permissions??'0') & 40n)!==0n;}catch{return deny('권한을 확인하지 못했어요.');}
    const ownMember=!!deps.memberRoleId&&Array.isArray(body.member.roles)&&body.member.roles.includes(deps.memberRoleId)&&caller?.id===targetId;
    if(!manager&&!ownMember)return deny('회원님은 본인 기록만 갱신할 수 있어요.');
    if(!deps.refresh || (option&&!member))return deny('이 서버의 멤버만 갱신할 수 있어요.');
    if(body.data.options?.some((o:{name:string})=>o.name!=='유저'))return deny('유저 옵션만 사용할 수 있어요.');
    deps.waitUntil(deps.refresh({...reply,requesterId:caller.id}).catch(()=>console.error('mukmuk_refresh_failed')));
    return Response.json({type:5,data:{flags:64}});
  }
  deps.waitUntil(deps.publish(reply).catch(()=>console.error('mukmuk_publish_failed')));
  return Response.json({type:5});
}
export async function publishReply(body: Reply, deps: {key:string;now:()=>Date;dashboardUrl:string;db:ReplyDB;discord:DiscordCall;emojis?:[string|undefined,string|undefined];sleep?:(ms:number)=>Promise<void>;preparationFailure?:string;render?:()=>Promise<string|ReplyContent>}) {
  const path=`/webhooks/${body.application_id}/${body.token}/messages/@original`;
  try {
    const cipher=await encryptToken(body.token,deps.key,body.id);
    if (!await deps.db.prepare(body,cipher,new Date(deps.now().getTime()+900_000))) return;
  } catch {
    if(deps.preparationFailure)await deps.discord('PATCH',path,{content:deps.preparationFailure,allowed_mentions:{parse:[]}}).catch(()=>{});
    else await deps.discord('DELETE',path).catch(()=>{});
    console.error('mukmuk_prepare_failed'); return;
  }
  let content: string;let components:ReplyActionRow[]|undefined;
  try {
    if(deps.render){const rendered=await deps.render();if(typeof rendered==='string')content=rendered;else {content=rendered.content;components=rendered.components;}}
    else {
    const [rows,lastSuccess,code]=await Promise.all([deps.db.daily(body.targetId),deps.db.lastSuccess(),
      deps.dashboardUrl ? deps.db.activeSecret?.(deps.now()) ?? null : null]);
    content=formatGrass(body.targetName,rows,dayAt(deps.now()),lastSuccess,dashboardLink(deps.dashboardUrl,code),deps.emojis);
    }
  } catch {
    content='기록을 불러오지 못했어요. 잠시 뒤 다시 조회해 주세요.\n이 메시지는 5분 뒤 사라져요.';
    console.error('mukmuk_query_failed');
  }
  // Publication and recovery compete for the same row. A recovered claim prevents PATCH.
  const sleep=deps.sleep??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  let ticket:number|undefined;
  for(let attempt=0;attempt<3;attempt++) {
    const lease=await deps.db.reservePublish(body.id,deps.now(),ticket);
    if(lease===null)return; // Recovery owns the loading response.
    ticket=lease;
    let res:Response|undefined;
    try {res=await deps.discord('PATCH',path,{content,...(components?{components}:{}),allowed_mentions:{parse:[]}});}
    catch { /* Retry transport failures without logging token-bearing request URLs. */ }
    if(res?.ok) {await deps.db.schedule(body.id,deps.now(),ticket);return;}
    if(res && res.status!==429 && res.status<500)throw new Error('Discord publish rejected');
    if(attempt===2)break;
    const delay=res?.status===429?Number((await res.json()).retry_after)*1000:2**attempt*1000;
    if(!Number.isFinite(delay)||delay<0||delay>20_000)break;
    await sleep(delay);
  }
  throw new Error('Discord publish retries exhausted');
}
