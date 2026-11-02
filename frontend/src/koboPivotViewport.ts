import {useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {useKoboCardState} from './KoboRendering';
export const pivotMetricWidth=112,pivotAnswerWidth=220;
export type PivotSlot={index:number;span:number;gap:boolean};
export function pivotColumnSlots(count:number,metrics:number,left:number,width:number,focus:number|null=null):PivotSlot[]{
 if(count*metrics<=40)return Array.from({length:count},(_,index)=>({index,span:1,gap:false}));
 const unit=metrics*pivotMetricWidth,start=Math.max(0,Math.floor((left-pivotAnswerWidth)/unit)-2),end=Math.min(count,Math.ceil((left+width)/unit)+2);
 const indexes=new Set(Array.from({length:Math.max(0,end-start)},(_,i)=>start+i));
 if(focus!==null&&focus>=0&&focus<count)indexes.add(focus);
 const slots:PivotSlot[]=[];let previous=0;
 for(const index of [...indexes].sort((a,b)=>a-b)){if(index>previous)slots.push({index:previous,span:index-previous,gap:true});slots.push({index,span:1,gap:false});previous=index+1}
 if(previous<count)slots.push({index:previous,span:count-previous,gap:true});return slots;
}
/** Local screen window only. Copy and exports continue to consume the complete result. */
export function useKoboPivotViewport(count:number,metrics:number,resetKey:string){
 const ref=useRef<HTMLDivElement>(null),store=useKoboCardState();
 const saved=store?.get('pivotScroll') as {left:number;top:number}|undefined;
 const[viewport,setViewport]=useState({left:Math.abs(saved?.left||0),width:1000});
 const[focusColumn,setFocusColumn]=useState<number|null>(null),pending=useRef<{row:string|null;column:number}|null>(null);
 const wide=count*metrics>40;
 const slots=useMemo(()=>pivotColumnSlots(count,metrics,viewport.left,viewport.width,focusColumn),[count,metrics,viewport,focusColumn]);
 const previousKey=useRef(resetKey);
 useLayoutEffect(()=>{const node=ref.current;if(!node)return;
  if(saved){node.scrollLeft=saved.left;node.scrollTop=saved.top}
  let frame=0;
  const update=()=>{store?.set('pivotScroll',{left:node.scrollLeft,top:node.scrollTop});if(!frame)frame=requestAnimationFrame(()=>{frame=0;setViewport(current=>{const next={left:Math.abs(node.scrollLeft),width:node.clientWidth};return current.left===next.left&&current.width===next.width?current:next})})};
  update();node.addEventListener('scroll',update,{passive:true});const observer=new ResizeObserver(update);observer.observe(node);
  return()=>{node.removeEventListener('scroll',update);observer.disconnect();cancelAnimationFrame(frame)};
 },[store]);
 useLayoutEffect(()=>{if(previousKey.current===resetKey)return;previousKey.current=resetKey;setFocusColumn(null);if(ref.current){ref.current.scrollTop=0;ref.current.scrollLeft=0}},[resetKey]);
 useLayoutEffect(()=>{const target=pending.current;if(!target||!ref.current)return;const row=target.row===null?'thead tr:last-child':`tbody tr[data-window-index="${target.row}"]`;const cell=ref.current.querySelector<HTMLElement>(`${row} [data-pivot-column="${target.column}"]`);if(cell){(cell.querySelector<HTMLElement>('button')||cell).focus({preventScroll:true});pending.current=null}});
 const keyboard=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(!wide||event.defaultPrevented||!['Tab','ArrowLeft','ArrowRight'].includes(event.key))return;
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-pivot-column]');if(!target)return;
  const rtl=ref.current&&getComputedStyle(ref.current).direction==='rtl';
  const backward=event.key==='Tab'?event.shiftKey:event.key===(rtl?'ArrowRight':'ArrowLeft');
  const column=Number(target.dataset.pivotColumn),next=column+(backward?-1:1);
  if(next<0||next>=count*metrics)return;
  // Intervene only at a horizontal window boundary, leaving ordinary Tab order intact.
  const nextCategory=Math.floor(next/metrics);if(slots.some(slot=>!slot.gap&&slot.index===nextCategory))return;
  event.preventDefault();pending.current={row:target.closest<HTMLElement>('tbody tr')?.dataset.windowIndex??null,column:next};setFocusColumn(nextCategory);
  if(ref.current)ref.current.scrollLeft=(rtl?-1:1)*(pivotAnswerWidth+next*pivotMetricWidth);
 };
 const focus=(event:React.FocusEvent<HTMLDivElement>)=>{const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-pivot-column]');if(cell)setFocusColumn(Math.floor(Number(cell.dataset.pivotColumn)/metrics))};
 const revealColumn=(column:number)=>{setFocusColumn(Math.floor(column/metrics));const node=ref.current;if(node)node.scrollLeft=(getComputedStyle(node).direction==='rtl'?-1:1)*Math.max(0,column*pivotMetricWidth)};
 return{ref,wide,slots,keyboard,focus,revealColumn,physicalColumns:1+slots.reduce((n,slot)=>n+(slot.gap?1:metrics),0),tableStyle:wide?{tableLayout:'fixed' as const,width:pivotAnswerWidth+count*metrics*pivotMetricWidth}:undefined};
}
