/** On-demand metadata only; image bytes go directly from Discord to the browser. */
export const PHOTO_PAGE_SIZE=3;
export interface PhotoAttachment {attachment_id:string;filename:string;width?:number|null;height?:number|null}
export interface PhotoEvent {message_id:string;guild_id:string;channel_id:string;attachments:PhotoAttachment[]}
export interface PhotoDB {
 validCode(code:string):Promise<boolean>;
 events(user:string,date:string,after:string|null):Promise<PhotoEvent[]>;
 removed(message:string,attachmentIds?:string[]):Promise<void>;
}
interface Options {db:PhotoDB;discord:(method:string,path:string)=>Promise<Response>;guild:string;channel:string;now?:()=>Date}
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey,authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const json=(body:unknown,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json',...headers}});
const numeric=(x:unknown):x is string=>typeof x==='string'&&/^\d{1,22}$/.test(x);
function cdn(value:unknown,channel:string,id:string):URL|null {
 try {
  const u=new URL(String(value));
  if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)||u.port||u.username||u.password)return null;
  if(!u.pathname.startsWith(`/attachments/${channel}/${id}/`))return null;
  return u;
 }catch{return null;}
}
export function createPhotoHandler(options:Options){
 const {db,discord,guild,channel}=options,now=options.now??(()=>new Date());
 type Message={id:string;author?:{id:string};attachments?:{id:string;url?:string;proxy_url?:string}[]};
 const cache=new Map<string,{until:number;body:Message}>(),pending=new Map<string,Promise<Message|null>>();
 let active=0;
 async function message(id:string):Promise<Message|null>{
  const cached=cache.get(id);if(cached&&cached.until>now().getTime())return cached.body;
  if(pending.has(id))return pending.get(id)!;
  if(active>=4)throw {status:429,retry:1};
  const task=(async()=>{
   active++;
   try{
    const r=await discord('GET',`/channels/${channel}/messages/${id}`);
    if(r.status===404){await db.removed(id);cache.delete(id);return null;}
    if(r.status===429){const b=await r.json();throw {status:429,retry:Math.max(1,Math.min(60,Number(b.retry_after)||1))};}
    if(!r.ok)throw new Error('Discord unavailable');
    const body=await r.json() as Message;
    if(body.id!==id||!Array.isArray(body.attachments))throw new Error('Invalid message');
    const expiries=body.attachments.map(a=>cdn(a.url,channel,a.id)?.searchParams.get('ex')).map(ex=>ex&&/^[a-f\d]+$/i.test(ex)?parseInt(ex,16)*1000:0);
    const until=Math.min(now().getTime()+60_000,...expiries.map(t=>t-30_000));
    if(until>now().getTime()){
     if(cache.size>=500)cache.delete(cache.keys().next().value!);
     cache.set(id,{body,until});
    }
    return body;
   }finally{active--;}
  })();
  pending.set(id,task);try{return await task;}finally{pending.delete(id);}
 }
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  try{
   if(Number(req.headers.get('content-length'))>4096)return json({error:'invalid_request'},400);
   const text=await req.text();if(text.length>4096)return json({error:'invalid_request'},400);
   const b=JSON.parse(text),code=typeof b.code==='string'?b.code.trim().toLowerCase():'';
   if(!code||code.length>128)return json({error:'invalid_or_expired_secret'},401);
   if(!numeric(b.user_id)||typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||new Date(b.date).toISOString().slice(0,10)!==b.date||(b.after!=null&&!numeric(b.after)))return json({error:'invalid_request'},400);
   if(!await db.validCode(code))return json({error:'invalid_or_expired_secret'},401);
   const events=(await db.events(b.user_id,b.date,b.after??null)).slice(0,PHOTO_PAGE_SIZE);
   const photos=[];
   for(const event of events){
    if(event.guild_id!==guild||event.channel_id!==channel||!numeric(event.message_id))throw new Error('Invalid stored event');
    const msg=await message(event.message_id);if(!msg)continue;
    if(msg.author?.id!==b.user_id)throw new Error('Author mismatch');
    const missing=event.attachments.filter(a=>!msg.attachments!.some(live=>live.id===a.attachment_id)).map(a=>a.attachment_id);
    if(missing.length)await db.removed(event.message_id,missing);
    for(const a of event.attachments){
     const live=msg.attachments?.find(x=>x.id===a.attachment_id);if(!live)continue;
     const full=cdn(live.url,channel,a.attachment_id);if(!full)continue;
     const proxy=cdn(live.proxy_url,channel,a.attachment_id);
     const scale=a.width&&a.height?Math.min(1,320/Math.max(a.width,a.height)):null;
     if(proxy&&scale){proxy.searchParams.set('width',String(Math.max(1,Math.round(a.width!*scale))));proxy.searchParams.set('height',String(Math.max(1,Math.round(a.height!*scale))));proxy.searchParams.set('format','webp');}
     photos.push({id:a.attachment_id,preview:proxy&&scale?proxy.toString():null,url:full.toString(),width:a.width,height:a.height,
      original:`https://discord.com/channels/${guild}/${channel}/${event.message_id}`});
    }
   }
   return json({photos,next:events.length===PHOTO_PAGE_SIZE?events.at(-1)!.message_id:null});
  }catch(e){
   if(e instanceof SyntaxError)return json({error:'invalid_request'},400);
   if((e as {status?:number}).status===429)return json({error:'rate_limited'},429,{'Retry-After':String((e as {retry:number}).retry)});
   return json({error:'photos_unavailable'},502);
  }
 };
}
