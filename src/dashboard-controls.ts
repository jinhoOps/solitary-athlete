import {el,button} from './dom';
import markUrl from '../assets/brand/mark.svg';

export const SERVICE_START_YEAR = 2026;
export const CHANNEL_INCEPTION_DATE = '2026-10-14';

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
   const tops=[...new Set(personal.map(b=>b.getBoundingClientRect().top))].sort((a,b)=>a-b);
   const limit=tops[1]??tops[0]??0;
   const overflow=personal.filter(b=>b.getBoundingClientRect().top>limit);
   overflow.forEach(b=>b.hidden=true);
   const chosen=personal.find(b=>b.dataset.memberId===selected);
   if(chosen?.hidden){
    chosen.hidden=false;
    while(new Set(personal.filter(b=>!b.hidden).map(b=>b.getBoundingClientRect().top)).size>2){
     const last=personal.filter(b=>!b.hidden && b!==chosen).at(-1);if(!last)break;last.hidden=true;
    }
   }
  } else {
   const chosen=personal.find(b=>b.dataset.memberId===selected);
   if(chosen){const a=chosen.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.left<b.left)list.scrollLeft+=a.left-b.left;else if(a.right>b.right)list.scrollLeft+=a.right-b.right;}
  }
 }
 let lastWidth=-1;
 const observer=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==lastWidth){lastWidth=width;requestAnimationFrame(fit);}});observer.observe(list);root.addEventListener('dispose',()=>{observer.disconnect();dialog.remove();});requestAnimationFrame(fit);

 const years = el('div', 'year-controls'), desktop = el('nav', 'year-desktop'); desktop.setAttribute('aria-label', '잔디 연도 선택');
 const mobile = el('div', 'year-mobile'), yearLabel = el('label', '', '연도'); yearLabel.htmlFor = 'year-select';
 const select = el('select', 'button secondary'); select.id = 'year-select'; select.dataset.control = 'year-select';
 
 const inceptionDialog = el('dialog', 'inception-dialog');
 inceptionDialog.setAttribute('aria-labelledby', 'inception-dialog-title');
 const markImg = el('img', 'inception-mark') as HTMLImageElement;
 markImg.src = markUrl; markImg.alt = ''; markImg.width = 48; markImg.height = 48;
 const inceptionTitle = el('h2', '', '고독한 운동가 · 묵묵'); inceptionTitle.id = 'inception-dialog-title';
 const inceptionDesc = el('p', 'inception-desc', '고독한 운동가(#오운완) 채널은 2026년 10월 14일에 생성되었어요. 그 이전에는 남겨 둔 기록이 없어요.');
 const inceptionSlogan = el('p', 'caption', '오늘도 묵묵히, 잔디 한 칸.');
 const closeBtn = button('확인', () => inceptionDialog.close(), 'button primary inception-close');
 closeBtn.dataset.control = 'inception-close';
 inceptionDialog.append(markImg, inceptionTitle, inceptionDesc, inceptionSlogan, closeBtn);

 let triggerElement: HTMLElement | null = null;
 function showInception(trigger?: HTMLElement) {
  triggerElement = trigger ?? null;
  inceptionDialog.showModal();
  closeBtn.focus();
 }
 inceptionDialog.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); inceptionDialog.close(); }
 });
 inceptionDialog.addEventListener('close', () => {
  triggerElement?.focus({ preventScroll: true });
 });
 inceptionDialog.addEventListener('click', e => {
  const rect = inceptionDialog.getBoundingClientRect();
  const isIn = (
   rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
   rect.left <= e.clientX && e.clientX <= rect.left + rect.width
  );
  if (!isIn) inceptionDialog.close();
 });

 select.onchange = () => {
  if (select.value === 'older') {
   select.value = String(selectedYear);
   showInception(select);
   return;
  }
  setYear(Number(select.value));
 };

 mobile.append(yearLabel, select); years.append(mobile, desktop, inceptionDialog); root.append(years);
 root.addEventListener('dispose', () => { inceptionDialog.remove(); });
 let selectedYear = options.selectedYear; const current = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));
 function setYear(year: number) { selectedYear = year; select.value = String(year); desktop.querySelectorAll<HTMLButtonElement>('[data-year]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.year) === year))); options.onYearChange(year); }
 function renderYears() {
  desktop.replaceChildren(); select.replaceChildren();
  for (let year = current; year >= SERVICE_START_YEAR; year--) {
   const b = button(`${year}년`, () => setYear(year), 'filter-button'); b.dataset.year = String(year); b.dataset.control = `year-${year}`; b.setAttribute('aria-pressed', String(year === selectedYear)); desktop.append(b);
   const option = el('option', '', `${year}년`); option.value = String(year); select.append(option);
  }
  const olderBtn = button('이전 연도', () => showInception(olderBtn), 'button secondary year-older');
  olderBtn.dataset.control = 'year-older';
  olderBtn.title = '2026년 이전 기록 안내';
  desktop.append(olderBtn);

  const olderOption = el('option', '', '이전 연도...');
  olderOption.value = 'older';
  select.append(olderOption);

  select.value = String(selectedYear);
 }
 renderYears();return root;
}
