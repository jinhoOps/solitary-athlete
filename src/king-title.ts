import {shiftDay,sundayIndex} from './dates';

/** A workout king's month so far, as sets of KST dates. */
export interface KingMonth {dates:Set<string>;photoDates:Set<string>;memoDates:Set<string>;elapsedDays:number}

export const DEFAULT_KING_TITLE='✨';

function longestStreak(dates:Set<string>):number{
 let best=0;
 for(const date of dates){
  if(dates.has(shiftDay(date,-1)))continue;
  let length=1;
  while(dates.has(shiftDay(date,length)))length++;
  best=Math.max(best,length);
 }
 return best;
}

/** True when three or more rest days are followed by another record. */
function returnedAfterRest(dates:Set<string>):boolean{
 const sorted=[...dates].sort();
 return sorted.some((date,i)=>i>0&&shiftDay(sorted[i-1],4)<=date);
}

const isWeekend=(date:string)=>[0,6].includes(sundayIndex(date));

// Achievement-style titles in the grass-and-garden world. First match wins,
// so rarer patterns sit above common ones.
const RULES:{title:string;when:(m:KingMonth,days:number)=>boolean}[]=[
 {title:'뿌리 깊은 거목',when:(_,days)=>days>=30},
 {title:'빈틈없는 들판',when:(m,days)=>m.elapsedDays>=7&&days===m.elapsedDays},
 {title:'깊게 내린 뿌리',when:m=>longestStreak(m.dates)>=14},
 {title:'풍성한 잔디',when:(_,days)=>days>=20},
 {title:'이어진 오솔길',when:m=>longestStreak(m.dates)>=7},
 {title:'빛으로 새긴 날들',when:(m,days)=>days>=3&&m.photoDates.size===days},
 {title:'주말의 정원사',when:(m,days)=>days>=3&&[...m.dates].filter(isWeekend).length*2>=days},
 {title:'다섯 이랑의 농부',when:(m,days)=>days>=5&&[...m.dates].every(d=>!isWeekend(d))},
 {title:'잔디에 쓴 일기',when:(m,days)=>days>=3&&m.memoDates.size===days},
 {title:'다시 돋은 새싹',when:(m,days)=>days>=3&&returnedAfterRest(m.dates)},
];

export function kingTitle(month:KingMonth):string{
 const days=month.dates.size;
 return RULES.find(rule=>rule.when(month,days))?.title??DEFAULT_KING_TITLE;
}
