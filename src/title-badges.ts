import {el} from './dom';
import {DEFAULT_TITLE,earnedTitles,type BranchProgress} from './titles';

let treeCount=0;

/** Earned title badges that open the member's title tree on hover (mouse) or tap/click. */
export function renderTitleBadges(month:number,progress:BranchProgress[]):HTMLElement{
 const root=el('div','member-titles');
 const earned=earnedTitles(progress).map(t=>t.name);
 const names=earned.length?earned:[DEFAULT_TITLE];
 const toggle=el('button','title-badges');
 toggle.type='button';
 const id=`title-tree-${++treeCount}`;
 toggle.setAttribute('aria-controls',id);
 toggle.setAttribute('aria-expanded','false');
 toggle.setAttribute('aria-label',`${month}월의 칭호: ${names.join(', ')}. 칭호 트리 보기`);
 toggle.append(el('span','member-title-label',`${month}월의 칭호`));
 for(const name of names)toggle.append(el('span','title-badge',name));
 const caret=document.createElementNS('http://www.w3.org/2000/svg','svg');
 caret.setAttribute('class','title-badges-caret');caret.setAttribute('viewBox','0 0 24 24');
 caret.setAttribute('width','14');caret.setAttribute('height','14');caret.setAttribute('aria-hidden','true');
 caret.setAttribute('fill','none');caret.setAttribute('stroke','currentColor');caret.setAttribute('stroke-width','2.5');
 caret.setAttribute('stroke-linecap','round');caret.setAttribute('stroke-linejoin','round');
 const chevron=document.createElementNS('http://www.w3.org/2000/svg','polyline');chevron.setAttribute('points','6 9 12 15 18 9');
 caret.append(chevron);toggle.append(caret);

 const tree=el('section','title-tree');
 tree.id=id;tree.hidden=true;
 tree.setAttribute('aria-label',`${month}월 칭호 트리`);
 const surface=el('div','title-tree-surface');
 for(const branch of progress){
  const row=el('div','title-branch');
  row.append(el('h5','title-branch-label',`${branch.icon} ${branch.label}`));
  const tiers=el('ol','title-tiers');
  for(const tier of branch.tiers){
   const item=el('li','title-tier');
   item.dataset.earned=String(tier.earned);
   // Hidden achievements stay a mystery until earned.
   const secret=branch.hidden&&!tier.earned;
   item.append(el('span','title-tier-name',secret?'???':tier.name),el('span','title-tier-condition',secret?'숨은 업적':tier.condition));
   if(!secret)item.setAttribute('aria-label',`${tier.name}, ${tier.condition}, ${tier.earned?'받음':'아직'}`);
   tiers.append(item);
  }
  row.append(tiers);
  surface.append(row);
 }
 tree.append(surface);
 root.append(toggle,tree);

 let pinned=false,hovering=false;
 const finePointer=()=>matchMedia('(hover:hover) and (pointer:fine)').matches;
 function update(){
  const open=pinned||hovering;
  tree.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
 }
 toggle.onclick=()=>{pinned=!pinned;if(!pinned)hovering=false;update();};
 // Open on real mouse movement only, so a layout shift under a resting cursor does not pop the tree.
 root.addEventListener('pointermove',e=>{
  if(!hovering&&e.pointerType==='mouse'&&finePointer()&&(e.movementX||e.movementY)){hovering=true;update();}
 });
 root.addEventListener('pointerleave',()=>{if(hovering){hovering=false;update();}});
 root.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!tree.hidden){
   // Keep Escape from also closing an open date detail in the same card.
   e.stopPropagation();e.preventDefault();
   pinned=false;hovering=false;update();toggle.focus();
  }
 });
 const outside=(e:PointerEvent)=>{if(pinned&&!root.contains(e.target as Node)){pinned=false;hovering=false;update();}};
 document.addEventListener('pointerdown',outside);
 root.addEventListener('dispose',()=>document.removeEventListener('pointerdown',outside));
 return root;
}
