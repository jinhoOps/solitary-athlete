import type {ReplyContent} from './interactions.ts';
export interface AccountAction {interaction_id:string;actor_id:string;kind:string;target_id?:string;request_id?:string;version?:number;payload?:{reason?:string;command?:boolean}}
export interface AccountInbox {online:()=>Promise<boolean>;enqueue:(a:AccountAction)=>Promise<void>;result:(id:string,actor:string)=>Promise<ReplyContent|null>}
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const kinds=['consent','decline','cancel','detail','status','review_list','review_detail','approve','reject_modal','reject'];
export const OFFLINE='지금은 묵묵이 쉬고 있어요. 온라인일 때 다시 이용해 주세요.';
export const BUSY='지금은 요청을 확인하지 못했어요. 잠시 뒤 현황을 다시 확인해 주세요.';
export function accountRoute(body:any,caller:{actorId:string;manager:boolean;member:boolean}):{action?:AccountAction;modal?:Record<string,unknown>;error?:string}|null {
 const command=body.type===2&&['계정연결','계정검토'].includes(body.data?.name);
 const component=[3,5].includes(body.type)&&String(body.data?.custom_id??'').startsWith('mukmuk-account:');
 if(!command&&!component)return null;
 if(!caller.member&&!caller.manager)return {error:'이 기능을 사용할 권한이 없어요.'};
 if(!/^\d{1,22}$/.test(caller.actorId)||!/^\d{1,22}$/.test(body.id)||typeof body.token!=='string')return {error:'요청을 확인하지 못했어요.'};
 const action:AccountAction={interaction_id:body.id,actor_id:caller.actorId,kind:''};
 if(command){
  const sub=body.data.options?.[0];const review=body.data.name==='계정검토';
  const map:Record<string,string>=review?{'목록':'review_list','상세':'review_detail'}:{'신청':'request','현황':'status','취소':'cancel','해제':'unlink'};
  action.kind=map[sub?.name];if(!action.kind||body.data.options.length!==1)return {error:'명령을 확인하지 못했어요.'};
  const opts=sub.options??[];
  if(['request','unlink'].includes(action.kind)){
   const target=opts.find((o:any)=>o.name==='유저')?.value;
   if(typeof target!=='string'||!/^\d{1,22}$/.test(target)||body.data.resolved?.users?.[target]?.bot)return {error:'이 서버의 일반 사용자 계정만 연결할 수 있어요.'};
   action.target_id=target;
  }
  if(['cancel','review_detail'].includes(action.kind)){
   const id=opts.find((o:any)=>o.name==='요청')?.value;
   if(typeof id!=='string'||!new RegExp(`^${UUID}$`,'i').test(id))return {error:'요청 번호를 확인해 주세요.'};
   action.request_id=id;action.payload={command:true};
  }
 }else{
  const parsed=new RegExp(`^mukmuk-account:([a-z_]+):(${UUID}):(0|[1-9][0-9]{0,8})$`,'i').exec(body.data.custom_id);
  if(!parsed||!kinds.includes(parsed[1]))return {error:'요청을 확인하지 못했어요.'};
  action.kind=parsed[1];action.request_id=parsed[2];action.version=Number(parsed[3]);
  if(body.type===5){
   if(action.kind!=='reject')return {error:'요청을 확인하지 못했어요.'};
   const reason=body.data.components?.flatMap((row:any)=>row.components??[]).find((c:any)=>c.custom_id==='reason')?.value;
   if(typeof reason!=='string'||reason.trim().length<1||reason.length>200)return {error:'거절 사유를 200자 이내로 적어 주세요.'};
   action.payload={reason:reason.trim()};
  }else if(action.kind==='reject')return {error:'거절 사유를 입력해 주세요.'};
 }
 if((action.kind.startsWith('review')||['approve','reject','reject_modal'].includes(action.kind))&&!caller.manager)return {error:'관리자만 검토할 수 있어요.'};
 if(action.kind==='reject_modal')return {modal:{type:9,data:{title:'계정 요청 거절',custom_id:`mukmuk-account:reject:${action.request_id}:${action.version}`,components:[{type:1,components:[{type:4,custom_id:'reason',label:'거절 사유',style:2,required:true,min_length:1,max_length:200}]}]}}};
 return {action};
}
export async function pollAccount(action:AccountAction,db:Pick<AccountInbox,'enqueue'|'result'>,now=Date.now,sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))):Promise<ReplyContent>{
 const until=now()+20000;
 try{
  await db.enqueue(action);
  while(now()<until){const result=await db.result(action.interaction_id,action.actor_id);if(result)return {...result,content:result.content.slice(0,1900)+'\n이 안내는 본인에게만 보이며 5분 뒤 사라져요.'};await sleep(Math.min(250,until-now()));}
 }catch{/* Sanitized operational notice; never log SQL or identifiers. */}
 return {content:BUSY+'\n이 안내는 본인에게만 보이며 5분 뒤 사라져요.'};
}
