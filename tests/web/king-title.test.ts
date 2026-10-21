import {expect,it} from 'vitest';
import {kingTitle,DEFAULT_KING_TITLE} from '../../src/king-title';
import {calculateMonthlyKPIs,memberMonthTitle} from '../../src/metrics';
import type {WorkoutLog} from '../../src/types';

const range=(from:number,to:number)=>Array.from({length:to-from+1},(_,i)=>`2026-10-${String(from+i).padStart(2,'0')}`);
const month=(dates:string[],elapsedDays:number,{photo=[] as string[],memo=[] as string[]}={})=>
 ({dates:new Set(dates),photoDates:new Set(photo),memoDates:new Set(memo),elapsedDays});

it('awards the rarest matching pattern first',()=>{
 // 2026-10-01 is a Thursday; 10-03/04, 10-10/11, 10-17/18 and 10-24/25 are weekends.
 expect(kingTitle(month(range(1,30),31))).toBe('뿌리 깊은 거목');
 expect(kingTitle(month(range(1,31),31))).toBe('뿌리 깊은 거목');
 const all=range(1,21);
 expect(kingTitle(month(all,21,{photo:all,memo:all}))).toBe('빈틈없는 들판');
 expect(kingTitle(month(range(2,21),21))).toBe('깊게 내린 뿌리');
 const busy=[...range(1,6),...range(8,13),...range(15,20),...range(22,23)];
 expect(busy.length).toBe(20);
 expect(kingTitle(month(busy,23))).toBe('풍성한 잔디');
 expect(kingTitle(month(range(2,8),14,{photo:range(2,8)}))).toBe('이어진 오솔길');
 expect(kingTitle(month(['2026-10-01','2026-10-05','2026-10-08'],14,{photo:['2026-10-01','2026-10-05','2026-10-08']}))).toBe('빛으로 새긴 날들');
 expect(kingTitle(month(['2026-10-03','2026-10-04','2026-10-07'],14))).toBe('주말의 정원사');
 expect(kingTitle(month(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07'],14))).toBe('다섯 이랑의 농부');
 expect(kingTitle(month(['2026-10-01','2026-10-04','2026-10-08'],14,{memo:['2026-10-01','2026-10-04','2026-10-08']}))).toBe('잔디에 쓴 일기');
 // Rest days are never scolded: returning after three or more of them earns a title.
 expect(kingTitle(month(['2026-10-01','2026-10-02','2026-10-04','2026-10-09'],14))).toBe('다시 돋은 새싹');
});

it('falls back to the sparkle when no pattern is established yet',()=>{
 expect(kingTitle(month(range(1,3),3,{photo:range(1,2)}))).toBe(DEFAULT_KING_TITLE);
 // Every day of a short month start is not yet perfect attendance.
 expect(kingTitle(month(range(1,6),6))).toBe(DEFAULT_KING_TITLE);
 expect(kingTitle(month(['2026-10-01','2026-10-04'],6))).toBe(DEFAULT_KING_TITLE);
 // Two rest days in between is not yet a return.
 expect(kingTitle(month(['2026-10-01','2026-10-02','2026-10-04','2026-10-07'],14))).toBe(DEFAULT_KING_TITLE);
});

it('derives titles from deduplicated monthly records, ignoring blank memos',()=>{
 const row=(date:string,memo='',photo=false):WorkoutLog=>({user_id:'1',username:'하루',log_date:date,memo,has_photo:photo,verification_count:1});
 const logs=[row('2026-10-01','걷기'),row('2026-10-01','  '),row('2026-10-05','달리기'),row('2026-10-08','요가'),row('2026-10-08','',true)];
 const [king]=calculateMonthlyKPIs(logs,new Date('2026-10-14T03:00:00Z')).workoutKings;
 expect(king).toMatchObject({days:3,title:'잔디에 쓴 일기'});
});

it('gives any member their own monthly title, and none without records this month',()=>{
 const row=(id:string,date:string):WorkoutLog=>({user_id:id,username:id,log_date:date,memo:'',has_photo:false,verification_count:1});
 const logs=[...range(1,14).map(d=>row('1',d)),row('2','2026-10-03'),row('3','2026-09-30')];
 const now=new Date('2026-10-14T03:00:00Z');
 expect(memberMonthTitle(logs,'1',now)).toBe('빈틈없는 들판');
 expect(memberMonthTitle(logs,'2',now)).toBe('✨');
 expect(memberMonthTitle(logs,'3',now)).toBeNull();
});
