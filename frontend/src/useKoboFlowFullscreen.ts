import {useEffect,useLayoutEffect,useRef,useState} from 'react';
let bodyLocks=0,bodyOverflow='';
export function lockFlowBody(){if(bodyLocks++===0){bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}let active=true;return()=>{if(active){active=false;if(--bodyLocks===0)document.body.style.overflow=bodyOverflow}}}

/** Move one stable portal host so the diagram and its viewport are never remounted. */
export function useKoboFlowFullscreen(onCloseDetails:()=>void,detailsOpen:boolean){
 const[host]=useState(()=>{const node=document.createElement('div');node.className='kobo-shell qf-fullscreen-host';return node});
 const[fullscreen,setFullscreen]=useState(false),placeholder=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null),native=useRef(false);
 const current=useRef({fullscreen,detailsOpen,onCloseDetails});current.current={fullscreen,detailsOpen,onCloseDetails};
 useLayoutEffect(()=>{
  const active=document.activeElement as HTMLElement|null;
  if(fullscreen)document.body.appendChild(host);else placeholder.current?.appendChild(host);
  host.classList.toggle('is-fullscreen',fullscreen);
  if(active&&host.contains(active))active.focus({preventScroll:true});
  if(fullscreen){const previous=new Map<HTMLElement,boolean>();for(const child of document.body.children)if(child instanceof HTMLElement&&child!==host){previous.set(child,child.inert);child.inert=true}return()=>{for(const [node,inert] of previous)node.inert=inert}}
 },[host,fullscreen]);
 useEffect(()=>()=>{if(document.fullscreenElement===host)void document.exitFullscreen().catch(()=>{});host.remove()},[host]);
 useEffect(()=>{
  if(!fullscreen)return;
  const unlock=lockFlowBody();
  host.querySelector<HTMLButtonElement>('.qf-fullscreen-toggle')?.focus({preventScroll:true});
  return()=>{unlock();opener.current?.isConnected&&opener.current.focus({preventScroll:true})};
 },[fullscreen,host]);
 function exit(){setFullscreen(false);if(document.fullscreenElement===host)void document.exitFullscreen().catch(()=>{});native.current=false}
 useEffect(()=>{
  const sync=()=>{if(document.fullscreenElement===host){native.current=true;setFullscreen(true)}else if(native.current){native.current=false;setFullscreen(false)}};
  const escape=(event:KeyboardEvent)=>{
   if(event.key==='Tab'&&current.current.fullscreen&&!document.querySelector('[popover]:popover-open')){const controls=[...host.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href],select,[tabindex="0"]')].filter(node=>node.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
   if(event.key!=='Escape'||!current.current.fullscreen||event.defaultPrevented)return;
   if(document.querySelector('[popover]:popover-open,.qf-connection-details'))return;
   event.preventDefault();event.stopImmediatePropagation();
   if(current.current.detailsOpen)current.current.onCloseDetails();else exit();
  };
  document.addEventListener('fullscreenchange',sync);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('fullscreenchange',sync);document.removeEventListener('keydown',escape)};
 },[host]);
 function enter(){opener.current=document.activeElement as HTMLElement|null;setFullscreen(true);if(host.requestFullscreen)try{void host.requestFullscreen().catch(()=>{/* The full-window workspace remains available. */})}catch{/* Some desktop hosts do not implement the fullscreen API. */}}
 return {host,placeholder,fullscreen,toggle:()=>fullscreen?exit():enter()};
}
