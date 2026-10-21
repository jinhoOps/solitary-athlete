import {expect,it} from 'vitest';
import {kingTitle,DEFAULT_KING_TITLE} from '../../src/king-title';
import {calculateMonthlyKPIs} from '../../src/metrics';
import type {WorkoutLog} from '../../src/types';

const range=(from:number,to:number)=>Array.from({length:to-from+1},(_,i)=>`2026-10-${String(from+i).padStart(2,'0')}`);
const month=(dates:string[],elapsedDays:number,{photo=[] as string[],memo=[] as string[]}={})=>
 ({dates:new Set(dates),photoDates:new Set(photo),memoDates:new Set(memo),elapsedDays});

it('awards the rarest matching pattern first',()=>{
 // 2026-10-01 is a Thursday; 10-03/04 and 10-10/11 are weekends.
 const all=range(1,14);
 expect(kingTitle(month(all,14,{photo:all,memo:all}))).toBe('빈칸 없는 잔디');
 expect(kingTitle(month(range(2,14),14,{photo:range(2,14)}))).toBe('이어 심는 사람');
 expect(kingTitle(month(['2026-10-01','2026-10-05','2026-10-08'],14,{photo:['2026-10-01','2026-10-05','2026-10-08']}))).toBe('사진으로 남기는 사람');
 expect(kingTitle(month(['2026-10-03','2026-10-04','2026-10-07'],14))).toBe('주말의 운동가');
 expect(kingTitle(month(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07'],14))).toBe('평일의 운동가');
 expect(kingTitle(month(['2026-10-01','2026-10-04','2026-10-08'],14,{memo:['2026-10-01','2026-10-04','2026-10-08']}))).toBe('한 줄을 남기는 사람');
});

it('falls back to the sparkle when no pattern is established yet',()=>{
 expect(kingTitle(month(range(1,3),3,{photo:range(1,2)}))).toBe(DEFAULT_KING_TITLE);
 // Every day of a short month start is not yet perfect attendance.
 expect(kingTitle(month(range(1,6),6))).toBe(DEFAULT_KING_TITLE);
 expect(kingTitle(month(['2026-10-01','2026-10-04'],6))).toBe(DEFAULT_KING_TITLE);
});

it('derives titles from deduplicated monthly records, ignoring blank memos',()=>{
 const row=(date:string,memo='',photo=false):WorkoutLog=>({user_id:'1',username:'하루',log_date:date,memo,has_photo:photo,verification_count:1});
 const logs=[row('2026-10-01','걷기'),row('2026-10-01','  '),row('2026-10-05','달리기'),row('2026-10-08','요가'),row('2026-10-08','',true)];
 const [king]=calculateMonthlyKPIs(logs,new Date('2026-10-14T03:00:00Z')).workoutKings;
 expect(king).toMatchObject({days:3,title:'한 줄을 남기는 사람'});
});
