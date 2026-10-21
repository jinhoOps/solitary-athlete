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

// First matching rule wins; the order keeps rarer patterns ahead of common ones.
const RULES:{title:string;when:(m:KingMonth,days:number)=>boolean}[]=[
 {title:'빈칸 없는 잔디',when:(m,days)=>m.elapsedDays>=7&&days===m.elapsedDays},
 {title:'이어 심는 사람',when:m=>longestStreak(m.dates)>=7},
 {title:'사진으로 남기는 사람',when:(m,days)=>days>=3&&m.photoDates.size===days},
 {title:'주말의 운동가',when:(m,days)=>days>=3&&[...m.dates].filter(d=>[0,6].includes(sundayIndex(d))).length*2>=days},
 {title:'평일의 운동가',when:(m,days)=>days>=5&&[...m.dates].every(d=>![0,6].includes(sundayIndex(d)))},
 {title:'한 줄을 남기는 사람',when:(m,days)=>days>=3&&m.memoDates.size===days},
];

export function kingTitle(month:KingMonth):string{
 const days=month.dates.size;
 return RULES.find(rule=>rule.when(month,days))?.title??DEFAULT_KING_TITLE;
}
