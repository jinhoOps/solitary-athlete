import {it,expect} from 'vitest';
import {formatRefresh} from '../../supabase/functions/_shared/refresh';
it('receipts distinguish empty records and active duplicate without status option',()=>{
 expect(formatRefresh({id:'1',status:'done',total:0,checked:0,removed:0},'1')).toContain('갱신할 운동 기록이 없어요');
 const receipt=formatRefresh({id:'1',status:'running',total:100,checked:20,removed:2},'2');
 expect(receipt).toContain('중복 요청은 만들지 않았어요');expect(receipt).toContain('확인 20/100건 · 삭제 2건');
 expect(receipt).toContain('5분');expect(receipt).not.toContain('상태:');
});

import {publishReply} from '../../supabase/functions/_shared/interactions';
it('creates the refresh job only after durable response preparation and never on duplicate replay',async()=>{
 const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
 let renders=0;let prepared=false;const order:string[]=[];
 const run=()=>publishReply({id:'123',token:'fixture',application_id:'42',targetId:'10',targetName:'회원'},
  {key,now:()=>new Date(),dashboardUrl:'',db:{prepare:async()=>{order.push('prepare');return prepared;},reservePublish:async()=>0,daily:async()=>[],lastSuccess:async()=>null,schedule:async()=>{order.push('schedule');}},
   discord:async()=>{order.push('publish');return Response.json({});},render:async()=>{renders++;order.push('enqueue');return '접수';}});
 await run();expect(renders).toBe(0);
 prepared=true;order.length=0;await run();expect(renders).toBe(1);expect(order).toEqual(['prepare','enqueue','publish','schedule']);
});
