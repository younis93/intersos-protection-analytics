import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent,type MouseEvent,type PointerEvent} from 'react';
import NotificationToast from './NotificationToast';

let sequence=0,clearActive:(()=>void)|undefined;
export async function writeKoboClipboard(text:string,host?:HTMLElement|null,html?:string){
 if(html){try{await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);return}catch{/* Keep formatted copying available in embedded browsers. */}}
 else{try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);return}catch{/* Embedded browsers may require the synchronous fallback. */}}
 const focus=document.activeElement instanceof HTMLElement?document.activeElement:null,selection=window.getSelection();
 const ranges=selection?Array.from({length:selection.rangeCount},(_,index)=>selection.getRangeAt(index).cloneRange()):[];
 const field=document.createElement('textarea');field.value=text;field.readOnly=true;field.setAttribute('aria-hidden','true');field.style.cssText='position:fixed;opacity:0;pointer-events:none;top:0;left:0';
 const container=host?.closest<HTMLElement>('dialog[open]')||focus?.closest<HTMLElement>('dialog[open]')||document.body;
 container.appendChild(field);
 const formattedCopy=(event:ClipboardEvent)=>{if(html&&event.clipboardData){event.clipboardData.setData('text/plain',text);event.clipboardData.setData('text/html',html);event.preventDefault()}};
 try{field.select();document.addEventListener('copy',formattedCopy,true);if(!document.execCommand('copy')){if(html&&navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else throw new Error('Unable to copy. Select the text and copy it manually.')}}finally{document.removeEventListener('copy',formattedCopy,true);field.remove();if(focus?.isConnected)focus.focus({preventScroll:true});if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range)}}
}

export function koboCopyCell(value:string,language='en'){
 return {tabIndex:0,'data-kobo-copy-value':value,title:'Copy this cell (Enter or Space)'};
}

export function useKoboCopy(){
 const[notice,setNotice]=useState<{message:string;variant:'success'|'error'}>({message:'',variant:'success'});
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),cell=useRef<HTMLElement|null>(null),mounted=useRef(true),drag=useRef<{x:number;y:number;moved:boolean}|null>(null);
 const reset=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=undefined;cell.current?.removeAttribute('data-kobo-copied');cell.current=null;if(mounted.current)setNotice(current=>current.message?{...current,message:''}:current)},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;reset();if(clearActive===reset)clearActive=undefined}},[reset]);
 const copy=useCallback(async(text:string,target?:HTMLElement,successMessage?:string,html?:string)=>{
  const request=++sequence;clearActive?.();clearActive=reset;reset();
  try{await writeKoboClipboard(text,target,html);if(!mounted.current||request!==sequence)return;cell.current=target||null;target?.setAttribute('data-kobo-copied','true');setNotice({message:successMessage||text,variant:'success'})}
  catch(error){if(!mounted.current||request!==sequence)return;setNotice({message:error instanceof Error?error.message:'Unable to copy this value.',variant:'error'})}
  if(mounted.current&&request===sequence)timer.current=setTimeout(()=>{reset();if(clearActive===reset)clearActive=undefined},1800);
 },[reset]);
 const targetCell=(origin:EventTarget|null,container:HTMLElement)=>{if(!(origin instanceof Element)||origin.closest('button,a,input,select,textarea,summary'))return null;const target=origin.closest<HTMLElement>('[data-kobo-copy-value]');return target&&container.contains(target)?target:null};
 const events=useMemo(()=>({
  onPointerDown:(event:PointerEvent<HTMLElement>)=>{drag.current={x:event.clientX,y:event.clientY,moved:false}},
  onPointerMove:(event:PointerEvent<HTMLElement>)=>{if(drag.current&&Math.hypot(event.clientX-drag.current.x,event.clientY-drag.current.y)>4)drag.current.moved=true},
  onPointerCancel:()=>{drag.current=null},
  onClick:(event:MouseEvent<HTMLElement>)=>{const target=targetCell(event.target,event.currentTarget);if(!target||drag.current?.moved||window.getSelection()?.toString())return;void copy(target.dataset.koboCopyValue??'',target)},
  onKeyDown:(event:KeyboardEvent<HTMLElement>)=>{if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||!['Enter',' '].includes(event.key))return;const target=targetCell(event.target,event.currentTarget);if(target){event.preventDefault();void copy(target.dataset.koboCopyValue??'',target)}},
 }),[copy]);
 return {copy,events,notification:<NotificationToast message={notice.message} label={notice.variant==='error'?'Copy failed':'Copied'} variant={notice.variant}/>};
}
