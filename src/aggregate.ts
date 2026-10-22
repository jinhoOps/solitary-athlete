import {legacyLog,subjectOf} from './identity';
import type {WorkoutEntry,ViewWorkoutLog} from './types';
export interface AggregateDay {count:number;photoCount:number;opacity:number;logs:ViewWorkoutLog[]}
export function aggregateDays(logs:WorkoutEntry[],memberCount:number):Map<string,AggregateDay>{
 const dates=new Map<string,Map<string,ViewWorkoutLog>>();
 for(const log of logs){
  if(!dates.has(log.log_date))dates.set(log.log_date,new Map());
  const people=dates.get(log.log_date)!,previous=people.get(subjectOf(log).id);
  if(!previous)people.set(subjectOf(log).id,'subject' in log?{...log}:legacyLog(log));
  else {
   previous.has_photo ||= log.has_photo;
   if(log.memo && !previous.memo.split('\n').includes(log.memo))previous.memo=[previous.memo,log.memo].filter(Boolean).join('\n');
  }
 }
 return new Map([...dates].map(([date,people])=>{
  const daily=[...people.values()].sort((a,b)=>a.username.localeCompare(b.username,'ko')||a.subject.id.localeCompare(b.subject.id));
  return [date,{count:daily.length,photoCount:daily.filter(l=>l.has_photo).length,opacity:memberCount>0?Math.min(daily.length,50)/Math.min(memberCount,50):0,logs:daily}];
 }));
}

/** Any participation starts at 20% so a single member stays visible against an empty cell. */
export const AGGREGATE_MIN_OPACITY=.2;
export function aggregateDisplayOpacity(ratio:number):number{
 return ratio>0?AGGREGATE_MIN_OPACITY+(1-AGGREGATE_MIN_OPACITY)*Math.min(ratio,1):0;
}
