import {el,button} from './dom';
interface Options {
 roster:{id:string;name:string}[];selectedMemberId:string|null;selectedYear:number;
 onMemberChange:(id:string|null)=>void;onYearChange:(year:number)=>void;
}
export function renderDashboardControls(options:Options):HTMLElement {
 const root=el('div','dashboard-controls'),nav=el('nav','member-filter');nav.setAttribute('aria-label','멤버 선택');
 let selected=options.selectedMemberId;
 const all=button('전체 멤버',()=>choose(null),'filter-button member-all');all.dataset.control='member-all';
 const list=el('div','member-options');const personal:HTMLButtonElement[]=[];
 const roster=[...options.roster].sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
 function updatePressed(){all.setAttribute('aria-pressed',String(selected===null));for(const b of personal)b.setAttribute('aria-pressed',String(b.dataset.memberId===selected));}
 function choose(id:string|null){selected=id;updatePressed();fit();options.onMemberChange(id);}
 for(const member of roster){
  const b=button(member.name,()=>choose(member.id),'filter-button');b.dataset.memberId=member.id;b.dataset.control=`member-${member.id}`;
  if(roster.filter(m=>m.name===member.name).length>1)b.setAttribute('aria-label',`${member.name} · ID: ${member.id}`);
  personal.push(b);list.append(b);
 }
 const find=button('멤버 찾기',()=>{dialog.showModal();input.value='';results();input.focus();},'button secondary member-find');find.dataset.control='member-find';
 const dialog=el('dialog','member-dialog');dialog.setAttribute('aria-labelledby','member-search-title');
 const title=el('h2','','멤버 찾기');title.id='member-search-title';
 const label=el('label','','멤버 이름 검색');label.htmlFor='member-search';
 const input=el('input','modal-input');input.id='member-search';input.type='text';input.autocomplete='off';
 const found=el('div','member-results');found.setAttribute('aria-live','polite');
 function results(){
  found.replaceChildren();const matches=roster.filter(m=>m.name.toLocaleLowerCase('ko').includes(input.value.trim().toLocaleLowerCase('ko')));
  if(!matches.length)found.append(el('p','caption','일치하는 멤버가 없어요.'));
  for(const m of matches){const b=button(`${m.name} · ID: ${m.id}`,()=>{dialog.close();choose(m.id);personal.find(b=>b.dataset.memberId===m.id)?.focus();},'filter-button');found.append(b);}
 }
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close();find.focus();}});
 input.oninput=results;dialog.addEventListener('close',()=>find.focus({preventScroll:true}));
 dialog.append(title,label,input,found,button('닫기',()=>dialog.close()));
 nav.append(all,list,find);root.append(nav,dialog);
 updatePressed();
 // Hide overflow from the keyboard too; always reserve a visible slot for the selection.
 function fit(){
  if(!nav.isConnected)return;
  const mobile=matchMedia('(max-width:767px)').matches;
  personal.forEach(b=>b.hidden=false);
  if(!mobile){
   const top=list.getBoundingClientRect().top;const firstHeight=personal[0]?.getBoundingClientRect().height??44;
   const hidden=personal.filter(b=>b.getBoundingClientRect().top>=top+firstHeight*2+12);
   hidden.forEach(b=>b.hidden=true);
   const chosen=personal.find(b=>b.dataset.memberId===selected);
   if(chosen?.hidden){const last=personal.filter(b=>!b.hidden).at(-1);if(last)last.hidden=true;chosen.hidden=false;}
  } else {
   const chosen=personal.find(b=>b.dataset.memberId===selected);
   if(chosen){const a=chosen.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.left<b.left)list.scrollLeft+=a.left-b.left;else if(a.right>b.right)list.scrollLeft+=a.right-b.right;}
  }
 }
 const observer=new ResizeObserver(fit);observer.observe(list);root.addEventListener('dispose',()=>{observer.disconnect();dialog.remove();});requestAnimationFrame(fit);

 const years=el('div','year-controls'),desktop=el('nav','year-desktop');desktop.setAttribute('aria-label','잔디 연도 선택');
 const mobile=el('div','year-mobile'),yearLabel=el('label','','연도');yearLabel.htmlFor='year-select';
 const select=el('select','button secondary');select.id='year-select';select.dataset.control='year-select';select.onchange=()=>setYear(Number(select.value));
 mobile.append(yearLabel,select);years.append(mobile,desktop);root.append(years);
 let selectedYear=options.selectedYear;const current=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()));
 let oldest=Math.min(current-4,selectedYear);
 function setYear(year:number){selectedYear=year;select.value=String(year);desktop.querySelectorAll<HTMLButtonElement>('[data-year]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.year)===year)));options.onYearChange(year);}
 function renderYears(){
  desktop.replaceChildren();select.replaceChildren();
  for(let year=current;year>=Math.max(1,oldest);year--){
   const b=button(`${year}년`,()=>setYear(year),'filter-button');b.dataset.year=String(year);b.dataset.control=`year-${year}`;b.setAttribute('aria-pressed',String(year===selectedYear));desktop.append(b);
   const option=el('option','',`${year}년`);option.value=String(year);select.append(option);
  }
  select.value=String(selectedYear);
  const extend=()=>{oldest=Math.max(1,oldest-5);renderYears();};
  if(oldest>1){desktop.append(button('이전 연도 더 보기',()=>{extend();desktop.querySelector<HTMLButtonElement>(`[data-year="${oldest+4}"]`)?.focus();}));
   const more=button('이전 연도 더 보기',extend);mobile.querySelector('button')?.remove();mobile.append(more);
  } else mobile.querySelector('button')?.remove();
 }
 renderYears();return root;
}
