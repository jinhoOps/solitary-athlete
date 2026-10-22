import {expect,it,vi} from 'vitest';
import {createPhotoHandler} from '../../supabase/functions/_shared/photos';
const now=()=>new Date('2026-10-16T00:00:00Z');
const attachment={attachment_id:'200',filename:'a.jpg',width:800,height:600};
function setup(){
 const db={validCode:vi.fn(async()=>true),events:vi.fn(async()=>[{message_id:'100',channel_id:'20',guild_id:'10',attachments:[attachment]}]),removed:vi.fn(async()=>{})};
 const call=vi.fn(async(_method:string,_path:string)=>new Response(JSON.stringify({id:'100',author:{id:'3'},attachments:[{id:'200',url:'https://cdn.discordapp.com/attachments/20/200/a.jpg?ex=ffffffff&hm=x',proxy_url:'https://media.discordapp.net/attachments/20/200/a.jpg?ex=ffffffff&hm=x'}]})));
 const handle=createPhotoHandler({db,discord:call,guild:'10',channel:'20',now});
 const request=(extra={})=>new Request('https://example.test',{method:'POST',body:JSON.stringify({code:'test',user_id:'3',date:'2026-10-14',...extra})});
 return {db,call,handle,request};
}
it('authenticates every request including cached hits, deduplicates links and requests a smaller preview',async()=>{
 const {db,call,handle,request}=setup();
 const results=await Promise.all([handle(request()),handle(request())]);
 expect(results.map(r=>r.status)).toEqual([200,200]);
 const body=await results[0].json();
 expect(body.photos[0].preview).toContain('width=320');
 expect(body.photos[0].preview).toContain('height=240');
 expect(call).toHaveBeenCalledTimes(1);
 db.validCode.mockResolvedValue(false);
 expect((await handle(request())).status).toBe(401);
});
it('never fetches arbitrary input or events in other channels',async()=>{
 const {db,call,handle,request}=setup();
 expect((await handle(request({user_id:'https://evil'}))).status).toBe(400);
 db.events.mockResolvedValue([{message_id:'100',channel_id:'evil',guild_id:'10',attachments:[attachment]}]);
 expect((await handle(request())).status).toBe(502);
 expect(call).not.toHaveBeenCalled();
});
it('only confirmed 404 deactivates metadata and failures preserve records',async()=>{
 const {db,call,handle,request}=setup();
 call.mockResolvedValue(new Response('',{status:403}));
 expect((await handle(request())).status).toBe(502);expect(db.removed).not.toHaveBeenCalled();
 call.mockResolvedValue(new Response('',{status:404}));
 expect((await handle(request())).status).toBe(200);expect(db.removed).toHaveBeenCalledWith('100');
});
it('does not use arbitrary attachment hosts and propagates rate limit retry delay',async()=>{
 const {call,handle,request}=setup();
 call.mockResolvedValueOnce(new Response(JSON.stringify({retry_after:3}),{status:429}));
 const limited=await handle(request());expect(limited.status).toBe(429);expect(limited.headers.get('Retry-After')).toBe('3');
 call.mockResolvedValue(new Response(JSON.stringify({id:'100',author:{id:'3'},attachments:[{id:'200',url:'https://evil/a',proxy_url:'https://evil/a'}]})));
 const body=await (await handle(request())).json();expect(body.photos).toEqual([]);
});

it('refreshes expired cache, reports paging cursor, and excludes deleted attachment IDs',async()=>{
 let time=new Date('2026-10-16T00:00:00Z');
 const {db,call,request}=setup();
 db.events.mockResolvedValue(Array.from({length:10},()=>({message_id:'100',guild_id:'10',channel_id:'20',attachments:[attachment]})));
 const handler=createPhotoHandler({db,discord:call,guild:'10',channel:'20',now:()=>time});
 const first=await (await handler(request())).json();expect(first.next).toBe('100');expect(call).toHaveBeenCalledTimes(1);
 time=new Date(time.getTime()+61_000);
 call.mockResolvedValue(new Response(JSON.stringify({id:'100',author:{id:'3'},attachments:[]})));
 expect((await (await handler(request())).json()).photos).toEqual([]);
 expect(call.mock.calls.length).toBeGreaterThan(1);
});

it('preflight needs no DB and malformed requests never reach Discord',async()=>{
 const {db,call,handle,request}=setup();
 expect((await handle(new Request('https://example.test',{method:'OPTIONS'}))).status).toBe(204);
 expect(db.validCode).not.toHaveBeenCalled();
 expect((await handle(request({date:'2026-02-30'}))).status).toBe(400);
 expect((await handle(request({after:'bad'}))).status).toBe(400);
 expect(call).not.toHaveBeenCalled();
});

it('deactivates only confirmed missing attachments without altering exercise records',async()=>{
 const {db,call,handle,request}=setup();
 call.mockResolvedValue(new Response(JSON.stringify({id:'100',author:{id:'3'},attachments:[]})));
 expect((await handle(request())).status).toBe(200);
 expect(db.removed).toHaveBeenCalledWith('100',['200']);
});

it('caps each lookup at three messages to bound slow Discord requests',async()=>{
 const {db,call,request}=setup();
 db.events.mockResolvedValue(Array.from({length:10},(_,i)=>({message_id:String(100+i),guild_id:'10',channel_id:'20',attachments:[attachment]})));
 call.mockImplementation(async(_method,path)=>new Response(JSON.stringify({id:path.split('/').at(-1),author:{id:'3'},attachments:[]})));
 const handler=createPhotoHandler({db,discord:call,guild:'10',channel:'20',now});
 const body=await (await handler(request())).json();
 expect(call).toHaveBeenCalledTimes(3);expect(body.next).toBe('102');
});

it('person photos check each original author, revision, and retire all legacy requests',async()=>{
 const {db,call}=setup();let revision=1;const person='00000000-0000-4000-8000-000000000001';
 const personDB={...db,identity:async()=>({enabled:true,revision}),personEvents:vi.fn(async()=>[{user_id:'3',message_id:'100',guild_id:'10',channel_id:'20',attachments:[attachment]}])};
 const handle=createPhotoHandler({db:personDB,discord:call,guild:'10',channel:'20',now});
 const request=(extra={})=>new Request('https://fixture.test',{method:'POST',body:JSON.stringify({code:'test',person_id:person,date:'2026-10-14',revision:1,...extra})});
 const good=await handle(request());expect(good.status).toBe(200);const result=await good.json();expect(result.revision).toBe(1);expect(result.photos[0].original).toBe('https://discord.com/channels/10/20/100');
 expect((await handle(request({person_id:undefined,user_id:'3',revision:undefined}))).status).toBe(409);
 revision=2;expect(await (await handle(request())).json()).toEqual({error:'identity_revision_changed'});
 revision=1;personDB.personEvents.mockResolvedValue([{user_id:'4',message_id:'100',guild_id:'10',channel_id:'20',attachments:[attachment]}]);
 expect((await handle(request())).status).toBe(502);
});
it('discards photos when identity changes during Discord HTTP',async()=>{
 const {db,call}=setup();let revision=1;
 const handle=createPhotoHandler({db:{...db,identity:async()=>({enabled:true,revision}),personEvents:async()=>[{user_id:'3',message_id:'100',guild_id:'10',channel_id:'20',attachments:[attachment]}]},discord:async(m,p)=>{const response=await call(m,p);revision=2;return response;},guild:'10',channel:'20',now});
 const res=await handle(new Request('https://fixture.test',{method:'POST',body:JSON.stringify({code:'test',person_id:'00000000-0000-4000-8000-000000000001',revision:1,date:'2026-10-14'})}));
 expect(res.status).toBe(409);expect(await res.json()).toEqual({error:'identity_revision_changed'});
});
