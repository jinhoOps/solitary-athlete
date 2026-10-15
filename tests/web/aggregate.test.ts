import {expect,it} from 'vitest';
import {aggregateDays} from '../../src/aggregate';
import type {WorkoutLog} from '../../src/types';
const rows=(n:number):WorkoutLog[]=>Array.from({length:n},(_,i)=>({user_id:String(i),username:'운동가',log_date:'2026-10-15',memo:'걷기',has_photo:false,verification_count:1}));
it('combines unique people linearly and caps opacity at 50 while preserving actual counts',()=>{
 expect(aggregateDays(rows(2),4).get('2026-10-15')?.opacity).toBe(.5);
 expect(aggregateDays(rows(1),50).get('2026-10-15')?.opacity).toBe(.02);
 expect(aggregateDays(rows(51),51).get('2026-10-15')).toMatchObject({count:51,opacity:1});
 expect(aggregateDays([],0).size).toBe(0);
});
it('counts one user once, ORs photos, and keeps distinct memos',()=>{
 const row=rows(1)[0];const day=aggregateDays([row,{...row,has_photo:true,memo:'달리기'}],2).get(row.log_date)!;
 expect(day).toMatchObject({count:1,photoCount:1,opacity:.5});
 expect(day.logs).toHaveLength(1);expect(day.logs[0].memo).toContain('달리기');expect(day.logs[0].memo).toContain('걷기');
});
