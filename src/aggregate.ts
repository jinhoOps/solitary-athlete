import type {WorkoutLog} from './types';
export interface AggregateDay {count:number;photoCount:number;opacity:number;logs:WorkoutLog[]}
export function aggregateDays(logs:WorkoutLog[],memberCount:number):Map<string,AggregateDay>{
 const dates=new Map<string,Map<string,WorkoutLog>>();
 for(const log of logs){
  if(!dates.has(log.log_date))dates.set(log.log_date,new Map());
  const people=dates.get(log.log_date)!,previous=people.get(log.user_id);
  if(!previous)people.set(log.user_id,{...log});
  else {
   previous.has_photo ||= log.has_photo;
   if(log.memo && !previous.memo.split('\n').includes(log.memo))previous.memo=[previous.memo,log.memo].filter(Boolean).join('\n');
  }
 }
 return new Map([...dates].map(([date,people])=>{
  const daily=[...people.values()].sort((a,b)=>a.username.localeCompare(b.username,'ko')||a.user_id.localeCompare(b.user_id));
  return [date,{count:daily.length,photoCount:daily.filter(l=>l.has_photo).length,opacity:memberCount>0?Math.min(daily.length,50)/Math.min(memberCount,50):0,logs:daily}];
 }));
}
