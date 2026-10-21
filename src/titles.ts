import {shiftDay,sundayIndex} from './dates';

/** One member's month so far, as sets of KST dates. */
export interface TitleMonth {dates:Set<string>;photoDates:Set<string>;memoDates:Set<string>;elapsedDays:number}

export const DEFAULT_TITLE='✨';

interface Tier {name:string;condition:string;when:(m:TitleMonth,days:number)=>boolean}
interface Branch {key:string;label:string;icon:string;hidden?:boolean;tiers:Tier[]}

export interface TierProgress {name:string;condition:string;earned:boolean}
export interface BranchProgress {key:string;label:string;icon:string;hidden:boolean;tiers:TierProgress[]}

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

// A garden-themed achievement tree. Each branch grows through tiers Ⅰ→Ⅲ;
// tiers are judged independently, so a rare higher tier can arrive first.
const BRANCHES:Branch[]=[
 {key:'root',label:'뿌리',icon:'🌳',tiers:[
  {name:'깊게 내린 뿌리',condition:'7일 연속',when:m=>longestStreak(m.dates)>=7},
  {name:'곧게 뻗은 줄기',condition:'14일 연속',when:m=>longestStreak(m.dates)>=14},
  {name:'뿌리 깊은 거목',condition:'21일 연속',when:m=>longestStreak(m.dates)>=21},
 ]},
 {key:'field',label:'들판',icon:'🌾',tiers:[
  {name:'푸릇한 풀밭',condition:'10일 기록',when:(_,days)=>days>=10},
  {name:'풍성한 잔디',condition:'20일 기록',when:(_,days)=>days>=20},
  {name:'빈틈없는 들판',condition:'14일 이상, 빠진 날 없음',when:(m,days)=>m.elapsedDays>=14&&days===m.elapsedDays},
 ]},
 {key:'journal',label:'기록',icon:'📖',tiers:[
  {name:'잔디에 쓴 일기',condition:'3일 이상 매번 메모',when:(m,days)=>days>=3&&m.memoDates.size===days},
  {name:'빛으로 새긴 날들',condition:'3일 이상 매번 사진',when:(m,days)=>days>=3&&m.photoDates.size===days},
  {name:'한 권의 그림일기',condition:'7일 이상 매번 사진과 메모',when:(m,days)=>days>=7&&m.photoDates.size===days&&m.memoDates.size===days},
 ]},
 {key:'rhythm',label:'리듬',icon:'🗓',tiers:[
  {name:'주말의 정원사',condition:'3일 이상, 절반 이상 주말',when:(m,days)=>days>=3&&[...m.dates].filter(isWeekend).length*2>=days},
  {name:'다섯 이랑의 농부',condition:'평일에만 5일 이상',when:(m,days)=>days>=5&&[...m.dates].every(d=>!isWeekend(d))},
  {name:'일곱 이랑의 농부',condition:'일~토 모든 요일',when:m=>new Set([...m.dates].map(sundayIndex)).size===7},
 ]},
 {key:'sprout',label:'숨은 업적',icon:'🌱',hidden:true,tiers:[
  {name:'다시 돋은 새싹',condition:'사흘 이상 쉰 뒤 다시 기록',when:(m,days)=>days>=3&&returnedAfterRest(m.dates)},
 ]},
];

export function titleProgress(month:TitleMonth):BranchProgress[]{
 const days=month.dates.size;
 return BRANCHES.map(({key,label,icon,hidden,tiers})=>({key,label,icon,hidden:!!hidden,
  tiers:tiers.map(({name,condition,when})=>({name,condition,earned:when(month,days)}))}));
}

/** Highest earned tier in each branch, in branch order. */
export function earnedTitles(progress:BranchProgress[]):{name:string;tier:number}[]{
 return progress.flatMap(branch=>{
  let tier=-1;
  branch.tiers.forEach((t,i)=>{if(t.earned)tier=i;});
  return tier<0?[]:[{name:branch.tiers[tier].name,tier}];
 });
}

/** The single representative title: highest tier wins, then branch order. */
export function representativeTitle(progress:BranchProgress[]):string{
 const earned=earnedTitles(progress);
 if(!earned.length)return DEFAULT_TITLE;
 return earned.reduce((best,t)=>t.tier>best.tier?t:best).name;
}
