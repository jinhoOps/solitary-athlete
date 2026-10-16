import {el,button} from './dom';
import type {PublicConfig} from './types';
interface Photo {id:string;preview:string|null;url:string;original:string;width?:number;height?:number}
interface PhotoPage {photos:Photo[];next:string|null}
const validImage=(value:unknown)=>{
 try {const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)&&/^\/attachments\/\d+\/\d+\//.test(u.pathname);}catch{return false;}
};
const validOriginal=(value:unknown)=>typeof value==='string'&&/^https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+$/.test(value);

export function photoSection(config:PublicConfig,code:()=>string,user:string,date:string,name:string){
 const section=el('section','photo-section');
 section.setAttribute('aria-label',`${name}님의 사진`);
 const items=el('div','photo-grid'),controls=el('div','photo-controls');
 section.append(items,controls);
 let controller:AbortController|undefined,disposed=false,next:string|null=null,count=0;
 let dialog:HTMLDialogElement|undefined;
 const observers:IntersectionObserver[]=[];
 function dispose(){disposed=true;controller?.abort();observers.forEach(o=>o.disconnect());dialog?.close();dialog?.remove();}
 section.addEventListener('dispose',dispose);
 function enlarge(photo:Photo,opener:HTMLButtonElement){
  dialog?.remove();
  const modal=el('dialog','photo-dialog');dialog=modal;
  const close=button('닫기',()=>modal.close(),'button');
  const image=el('img','photo-full');image.alt=`${date} · ${name}님의 사진`;image.src=photo.url;image.referrerPolicy='no-referrer';
  image.onerror=()=>{image.remove();modal.append(el('p','','사진 링크가 만료되었거나 원본을 볼 수 없어요. 사진 목록을 다시 불러와 주세요.'));};
  modal.setAttribute('aria-label',`${date} · ${name}님의 사진 크게 보기`);
  const source=el('a','button','Discord 원문 보기');source.href=photo.original;source.target='_blank';source.rel='noopener noreferrer';
  modal.append(close,image,source);
  modal.onclose=()=>{modal.remove();if(opener.isConnected)opener.focus({preventScroll:true});};
  document.body.append(modal);modal.showModal();close.focus();
 }
 function append(photo:Photo){
  const index=++count;
  const opener=button('사진 보기',()=>enlarge(photo,opener),'photo-open button');
  opener.setAttribute('aria-label',`사진 ${index} 크게 보기`);
  if(photo.preview){
   const img=el('img','photo-preview');img.alt=`${date} · ${name} · 사진 ${index}`;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
   if(photo.width&&photo.height){img.width=photo.width;img.height=photo.height;}
   img.onerror=()=>{img.remove();opener.textContent='사진 보기';};
   const observer=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){
     if(!disposed&&section.isConnected)img.src=photo.preview!;
     observer.disconnect();
    }
   });
   opener.replaceChildren(img);observer.observe(opener);observers.push(observer);
  }
  items.append(opener);
 }
 async function load(appendPage=false){
  controller?.abort();controller=new AbortController();const current=controller;
  controls.replaceChildren(el('p','caption','사진을 불러오고 있어요.'));
  try{
   const r=await fetch(`${config.url.replace(/\/+$/,'')}/functions/v1/mukmuk-discord-photos`,{
    method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},
    body:JSON.stringify({code:code(),user_id:user,date,after:appendPage?next:null}),
    signal:AbortSignal.any([current.signal,AbortSignal.timeout(45_000)]),
   });
   if(!r.ok)throw new Error(r.status===401?'auth':r.status===429?'rate':'unavailable');
   const page=await r.json() as PhotoPage;
   if(!Array.isArray(page.photos)||page.photos.some(p=>!validImage(p.url)||(p.preview!==null&&!validImage(p.preview))||!validOriginal(p.original))||(page.next!==null&&!/^\d+$/.test(page.next)))throw new Error('invalid');
   if(disposed||current.signal.aborted||!section.isConnected)return;
   if(!appendPage){items.replaceChildren();count=0;observers.forEach(o=>o.disconnect());observers.length=0;}
   page.photos.forEach(append);next=page.next;
   controls.replaceChildren(el('p','caption',count?'사진은 Discord에서 불러옵니다. 원본 삭제 시 표시가 중단될 수 있어요.':'표시할 사진이 없어요. 원본이 삭제되었거나 첨부 정보를 확인할 수 없어요.'));
   if(next)controls.append(button('사진 더 보기',()=>void load(true)));
   controls.append(button('사진 새로고침',()=>void load()));
  }catch(error){
   if(disposed||current.signal.aborted||!section.isConnected)return;
   const message=error instanceof Error?error.message:'';
   controls.replaceChildren(el('p','caption',message==='auth'?'시크릿 코드가 만료되었어요. 웹보드를 새로 열어 주세요.':message==='rate'?'사진 요청이 많아요. 잠시 후 다시 시도해 주세요.':'사진을 불러오지 못했어요.'),button('다시 불러오기',()=>void load(appendPage)));
  }
 }
 controls.append(button('사진 보기',()=>void load()));
 return section;
}
