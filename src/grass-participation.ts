import {dayAt,shiftDay} from './dates';
import type {GrassParticipation,GrassParticipationSample} from './types';

/** Validate private RPC aggregates before turning missing/partial data into a percentage. */
export function parseGrassParticipation(rows:unknown[],month:string):GrassParticipation {
 if(rows.length===0)return {status:'pending'};
 if(rows.length!==1||!rows[0]||typeof rows[0]!=='object')throw new Error('Invalid participation snapshot');
 const row=rows[0] as Record<string,unknown>;
 if(row.month_start!==month)throw new Error('Invalid participation month');
 function sample(prefix:string):GrassParticipationSample {
  const collectedAt=row[`${prefix}collected_at`],members=row[`${prefix}member_count`],days=row[`${prefix}workout_days`],elapsedDays=row[`${prefix}elapsed_days`];
  if(typeof collectedAt!=='string'||!Number.isFinite(Date.parse(collectedAt))
   ||typeof members!=='number'||!Number.isSafeInteger(members)||members<0
   ||typeof days!=='number'||!Number.isSafeInteger(days)||days<members
   ||typeof elapsedDays!=='number'||!Number.isInteger(elapsedDays)||elapsedDays<1||elapsedDays>31
   ||days>members*elapsedDays)throw new Error('Invalid participation sample');
  const date=dayAt(new Date(collectedAt));
  if(date.slice(0,7)!==month.slice(0,7)||Number(date.slice(8))!==elapsedDays)throw new Error('Invalid participation date');
  return {collectedAt,members,days,elapsedDays};
 }
 const current=sample('');
 const previousKeys=['previous_collected_at','previous_member_count','previous_workout_days','previous_elapsed_days'];
 const previousSample=previousKeys.every(key=>row[key]===null)?null:sample('previous_');
 if(previousSample&&Date.parse(previousSample.collectedAt)>=Date.parse(current.collectedAt))throw new Error('Invalid participation order');
 // Ignore legacy same-day pairs until the database migration is applied.
 const previous=previousSample&&dayAt(new Date(previousSample.collectedAt))===shiftDay(dayAt(new Date(current.collectedAt)),-1)?previousSample:null;
 return {status:'ready',month,current,previous};
}

export function grassParticipationRate(sample:GrassParticipationSample):number {
 return sample.members===0?0:sample.days/(sample.members*sample.elapsedDays)*100;
}

export function grassParticipationView(state:GrassParticipation):{value:string;change:string;description:string} {
 if(state.status!=='ready')return {value:'—',change:state.status==='pending'?'수집 대기':'집계 불러오기 실패',description:'성공한 월간 수집 집계를 확인한 뒤 표시해요.'};
 const rate=grassParticipationRate(state.current);
 let change='비교 기록 없음';
 if(state.previous){
  const delta=rate-grassParticipationRate(state.previous);
  change=delta===0?'전일 대비 변동 없음':Math.abs(delta)<.1
   ?`전일 대비 ${delta>0?'↑':'↓'} 0.1%p 미만`
   :`전일 대비 ${delta>0?'+':'−'}${Math.abs(delta).toFixed(1)}%p`;
 }
 return {value:`${Number(rate.toFixed(1))}%`,change,
  description:`${dayAt(new Date(state.current.collectedAt))} KST 수집 기준 · 월간 ${state.current.members}명이 ${state.current.elapsedDays}일 동안 채운 ${state.current.days}칸. 인원과 경과 일수의 변화도 증감에 포함돼요.`};
}
