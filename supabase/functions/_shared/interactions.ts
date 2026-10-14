import { encryptToken } from './crypto.ts';
import { formatGrass } from './grass.ts';
import { dayAt } from '../../../src/dates.ts';
import type { WorkoutLog } from '../../../src/types.ts';

export interface Reply {
  id: string; token: string; application_id: string; targetId: string; targetName: string;
}
export type DiscordCall = (method: string, path: string, payload?: Record<string, unknown>) => Promise<Response>;
export interface ReplyDB {
  prepare: (body: Reply, cipher: Uint8Array, expiresAt: Date) => Promise<boolean>;
  daily: (userId: string) => Promise<WorkoutLog[]>;
  lastSuccess: () => Promise<string | null>;
  schedule: (id: string, publishedAt: Date) => Promise<void>;
}
function unhex(hex: string, size: number): Uint8Array<ArrayBuffer> | null {
  if (hex.length !== size*2 || !/^[0-9a-f]+$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g)!, b => parseInt(b,16));
}
export async function handleInteraction(req: Request, deps: { publicKey:string; guildId:string; appId:string;
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
  if (body.type!==2 || body.data?.name!=='잔디') return new Response('Unsupported interaction',{status:400});
  const caller=body.member?.user;
  const option=body.data.options?.find((o:{name:string})=>o.name==='유저');
  const targetId=option?.value ?? caller?.id;
  const target=option ? body.data.resolved?.users?.[targetId] : caller;
  if (!target || target.bot || !/^\d+$/.test(targetId) || !/^\d+$/.test(body.id) || typeof body.token!=='string') return new Response('Invalid user',{status:400});
  const member=option ? body.data.resolved?.members?.[targetId] : body.member;
  const reply:Reply={id:body.id,token:body.token,application_id:body.application_id,targetId,
    targetName:member?.nick || target.global_name || target.username || '운동가'};
  deps.waitUntil(deps.publish(reply).catch(()=>console.error('mukmuk_publish_failed')));
  return Response.json({type:5});
}
export async function publishReply(body: Reply, deps: {key:string;now:()=>Date;dashboardUrl:string;db:ReplyDB;discord:DiscordCall;emojis?:[string|undefined,string|undefined]}) {
  const path=`/webhooks/${body.application_id}/${body.token}/messages/@original`;
  try {
    const cipher=await encryptToken(body.token,deps.key,body.id);
    if (!await deps.db.prepare(body,cipher,new Date(deps.now().getTime()+900_000))) return;
  } catch {
    await deps.discord('DELETE',path).catch(()=>{});
    console.error('mukmuk_prepare_failed'); return;
  }
  let content: string;
  try {
    const [rows,lastSuccess]=await Promise.all([deps.db.daily(body.targetId),deps.db.lastSuccess()]);
    content=formatGrass(body.targetName,rows,dayAt(deps.now()),lastSuccess,deps.dashboardUrl,deps.emojis);
  } catch {
    content='기록을 불러오지 못했어요. 잠시 뒤 다시 조회해 주세요.\n이 메시지는 5분 뒤 사라져요.';
    console.error('mukmuk_query_failed');
  }
  // A preparing row survives PATCH or final scheduling failure for cleanup recovery.
  const res=await deps.discord('PATCH',path,{content,allowed_mentions:{parse:[]}});
  if (!res.ok) throw new Error('Discord publish failed');
  await deps.db.schedule(body.id,deps.now());
}
