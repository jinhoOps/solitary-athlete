/** Share only in-flight metadata lookups; never retain codes or signed links after completion. */
const pending = new Map<string, {controller:AbortController; promise:Promise<Response>; users:number}>();
export function requestPhotos(url:string, key:string, body:string, signal:AbortSignal):Promise<Response> {
 const id=JSON.stringify([url,key,body]);
 let entry=pending.get(id);
 if(!entry){
  const controller=new AbortController();
  const promise=fetch(url,{method:'POST',headers:{'Content-Type':'application/json',apikey:key},body,
   signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45_000)])})
   .then(async response=>new Response(await response.arrayBuffer(),{status:response.status,statusText:response.statusText,headers:response.headers}));
  entry={controller,promise,users:0};pending.set(id,entry);
  const current=entry;
  const cleanup=()=>{if(pending.get(id)===current)pending.delete(id);};
  void promise.then(cleanup,cleanup);
 }
 const shared=entry;shared.users++;
 return new Promise((resolve,reject)=>{
  let released=false;
  const release=()=>{
   if(released)return;released=true;signal.removeEventListener('abort',abort);
   if(--shared.users===0){shared.controller.abort();if(pending.get(id)===shared)pending.delete(id);}
  };
  const abort=()=>{release();reject(new DOMException('Aborted','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}
  void shared.promise.then(response=>{
   if(!released){resolve(response.clone());release();}
  },error=>{if(!released){reject(error);release();}});
 });
}
