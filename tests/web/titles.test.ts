import {expect,it} from 'vitest';
import {titleProgress,earnedTitles,representativeTitle,DEFAULT_TITLE} from '../../src/titles';
import {calculateMonthlyKPIs,memberMonthTitles} from '../../src/metrics';
import type {WorkoutLog} from '../../src/types';

// 2026-10-01 is a Thursday; 10-03/04, 10-10/11, 10-17/18 and 10-24/25 are weekends.
const range=(from:number,to:number)=>Array.from({length:to-from+1},(_,i)=>`2026-10-${String(from+i).padStart(2,'0')}`);
const month=(dates:string[],elapsedDays:number,{photo=[] as string[],memo=[] as string[]}={})=>
 ({dates:new Set(dates),photoDates:new Set(photo),memoDates:new Set(memo),elapsedDays});
const earned=(m:ReturnType<typeof month>)=>Object.fromEntries(titleProgress(m).map(b=>[b.key,b.tiers.map(t=>t.earned)]));
const names=(m:ReturnType<typeof month>)=>earnedTitles(titleProgress(m)).map(t=>t.name);

it('grows each branch through tiers independently',()=>{
 expect(earned(month(range(1,7),14)).root).toEqual([true,false,false]);
 expect(earned(month(range(1,14),20)).root).toEqual([true,true,false]);
 expect(earned(month(range(1,21),25)).root).toEqual([true,true,true]);
 expect(earned(month(range(1,10),25)).field).toEqual([true,false,false]);
 expect(earned(month([...range(1,6),...range(8,13),...range(15,20),...range(22,23)],25)).field).toEqual([true,true,false]);
 // Perfect attendance after 14 days is the field's top tier even before 20 days.
 expect(earned(month(range(1,14),14)).field).toEqual([true,false,true]);
 expect(earned(month(range(1,13),13)).field).toEqual([true,false,false]);
});

it('judges journal and rhythm branches from photos, memos and weekdays',()=>{
 const three=['2026-10-01','2026-10-05','2026-10-08'];
 expect(earned(month(three,14,{memo:three})).journal).toEqual([true,false,false]);
 expect(earned(month(three,14,{photo:three})).journal).toEqual([false,true,false]);
 const week=range(1,7);
 expect(earned(month(week,14,{photo:week,memo:week})).journal).toEqual([true,true,true]);
 expect(earned(month(['2026-10-03','2026-10-04','2026-10-07'],14)).rhythm).toEqual([true,false,false]);
 expect(earned(month(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07'],14)).rhythm).toEqual([false,true,false]);
 expect(earned(month(range(1,7),14)).rhythm[2]).toBe(true);
});

it('keeps the return-after-rest achievement hidden until earned',()=>{
 const progress=titleProgress(month(['2026-10-01','2026-10-02','2026-10-04','2026-10-09'],14));
 expect(progress.find(b=>b.key==='sprout')).toMatchObject({hidden:true,tiers:[{name:'다시 돋은 새싹',earned:true}]});
 // Two rest days in between is not yet a return.
 expect(earned(month(['2026-10-01','2026-10-02','2026-10-04','2026-10-07'],14)).sprout).toEqual([false]);
});

it('shows the highest tier per branch and picks one representative by tier then branch order',()=>{
 const all=range(1,14);
 const m=month(all,14,{photo:all.slice(1),memo:all.slice(1)});
 expect(names(m)).toEqual(['곧게 뻗은 줄기','빈틈없는 들판','일곱 이랑의 농부']);
 expect(representativeTitle(titleProgress(m))).toBe('빈틈없는 들판');
 expect(representativeTitle(titleProgress(month(range(1,7),14)))).toBe('일곱 이랑의 농부');
 expect(representativeTitle(titleProgress(month(['2026-10-01','2026-10-04'],6)))).toBe(DEFAULT_TITLE);
});

it('derives king and member titles from deduplicated monthly records, ignoring blank memos',()=>{
 const row=(id:string,date:string,memo='',photo=false):WorkoutLog=>({user_id:id,username:id,log_date:date,memo,has_photo:photo,verification_count:1});
 const logs=[row('1','2026-10-01','걷기'),row('1','2026-10-01','  '),row('1','2026-10-05','달리기'),row('1','2026-10-08','요가'),row('1','2026-10-08','',true),row('3','2026-09-30')];
 const now=new Date('2026-10-14T03:00:00Z');
 expect(calculateMonthlyKPIs(logs,now).workoutKings[0]).toMatchObject({days:3,title:'잔디에 쓴 일기'});
 expect(earnedTitles(memberMonthTitles(logs,'1',now)!).map(t=>t.name)).toEqual(['잔디에 쓴 일기','다시 돋은 새싹']);
 expect(memberMonthTitles(logs,'3',now)).toBeNull();
});
