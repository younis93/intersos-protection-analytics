import {cloneElement, type ReactElement, type KeyboardEvent, useLayoutEffect, useMemo, useRef, useState} from "react";
import {rowOffsets, windowIndexes} from "./virtualWindow";

export function VirtualRows<T>({items,render,table=false,columns=1,enabled=items.length>200,estimate=42,resetKey}:{items:T[];render:(item:T,index:number)=>ReactElement;table?:boolean;columns?:number;enabled?:boolean;estimate?:number;resetKey?:string}) {
  const element=useRef<HTMLElement|null>(null),heights=useRef(new Map<number,number>());
  const [version,setVersion]=useState(0),[viewport,setViewport]=useState({top:0,height:360}),[focus,setFocus]=useState<number|null>(null);
  const previousItems=useRef(items);
  const pendingFocus=useRef<number|null>(null),pendingLastControl=useRef(false);
  const offsets=useMemo(()=>rowOffsets(items.length,heights.current,estimate),[items.length,version,estimate]);
  const indexes=enabled?windowIndexes(offsets,viewport.top,viewport.height,focus):items.map((_,index)=>index);
  useLayoutEffect(()=>{const previous=previousItems.current;previousItems.current=items;if(!table&&previous.length===items.length&&previous.every((item,index)=>item===items[index]))return;heights.current.clear();setVersion(value=>value+1);setFocus(null);const root=table?element.current?.closest<HTMLElement>(".legal-table-wrap"):element.current;if(root&&table)root.scrollTop=0},[items,table]);
  useLayoutEffect(()=>{if(!table&&element.current)element.current.scrollTop=0},[resetKey,table]);
  useLayoutEffect(()=>{
    const node=element.current,root=table?node?.closest<HTMLElement>(".legal-table-wrap"):node;
    if(!node||!root||!enabled)return;
    const update=()=>{const offset=table?(node.getBoundingClientRect().top-root.getBoundingClientRect().top+root.scrollTop):0;const next={top:Math.max(0,root.scrollTop-offset),height:root.clientHeight||360};setViewport(current=>current.top===next.top&&current.height===next.height?current:next)};
    update();root.addEventListener("scroll",update,{passive:true});
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>update()):null;
    observer?.observe(root);return()=>{root.removeEventListener("scroll",update);observer?.disconnect()};
  },[enabled,items,table]);
  useLayoutEffect(()=>{
    const node=element.current;if(!node||!enabled)return;
    const measure=()=>{let changed=false;node.querySelectorAll<HTMLElement>("[data-window-index]").forEach(row=>{const index=Number(row.dataset.windowIndex),height=row.getBoundingClientRect().height;if(height>0&&Math.abs((heights.current.get(index)||estimate)-height)>0.5){heights.current.set(index,height);changed=true}});if(changed)setVersion(value=>value+1)};
    measure();const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(measure):null;
    node.querySelectorAll<HTMLElement>("[data-window-index]").forEach(row=>observer?.observe(row));
    if(pendingFocus.current!==null){const row=node.querySelector<HTMLElement>(`[data-window-index="${pendingFocus.current}"]`);row?.querySelector<HTMLInputElement>("input")?.focus({preventScroll:true});if(pendingLastControl.current){const controls=Array.from(row?.querySelectorAll<HTMLElement>("input,button")||[]).filter(control=>control.getClientRects().length>0&&getComputedStyle(control).visibility!=="hidden");controls.at(-1)?.focus({preventScroll:true})}pendingFocus.current=null;pendingLastControl.current=false}
    return()=>observer?.disconnect();
  });
  const keyboard=(event:KeyboardEvent<HTMLElement>)=>{
    if(table||event.defaultPrevented)return;
    const index=Number((event.target as HTMLElement).closest<HTMLElement>("[data-window-index]")?.dataset.windowIndex);
    if(!Number.isFinite(index))return;
    const target=event.target as HTMLElement;
    const row=target.closest<HTMLElement>("[data-window-index]");
    const controls=Array.from(row?.querySelectorAll<HTMLElement>("input,button")||[]).filter(node=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=="hidden");
    const forwardTab=enabled&&event.key==="Tab"&&!event.shiftKey&&target===controls.at(-1)&&index<items.length-1;
    const backwardTab=event.key==="Tab"&&event.shiftKey&&target===controls[0]&&index>0;
    if(!target.matches("input[type=checkbox]")&&!forwardTab&&!backwardTab)return;
    let next=index;
    if(event.key==="ArrowDown"||forwardTab)next=Math.min(items.length-1,index+1);
    else if(event.key==="ArrowUp"||backwardTab)next=Math.max(0,index-1);
    else if(event.key==="Home")next=0;else if(event.key==="End")next=items.length-1;else return;
    event.preventDefault();
    if(!enabled){const row=element.current?.querySelector<HTMLElement>(`[data-window-index="${next}"]`);row?.querySelector<HTMLInputElement>("input")?.focus();if(backwardTab){const controls=Array.from(row?.querySelectorAll<HTMLElement>("input,button")||[]).filter(control=>control.getClientRects().length>0&&getComputedStyle(control).visibility!=="hidden");controls.at(-1)?.focus()}return}
    pendingFocus.current=next;pendingLastControl.current=backwardTab;setFocus(next);
    const root=element.current;if(root){if(offsets[next]<root.scrollTop)root.scrollTop=offsets[next];else if(offsets[next+1]>root.scrollTop+root.clientHeight)root.scrollTop=offsets[next+1]-root.clientHeight}
  };
  const gap=(height:number,key:string)=>table?<tr key={key} aria-hidden="true"><td colSpan={columns} style={{height,padding:0,border:0}}/></tr>:<div key={key} aria-hidden="true" style={{height,flexShrink:0}}/>;
  const rows:ReactElement[]=[];let previous=0;
  for(const index of indexes){if(offsets[index]>previous)rows.push(gap(offsets[index]-previous,`gap-${index}`));const row=render(items[index],index);rows.push(cloneElement(row,{key:row.key??index,"data-window-index":index} as Record<string,unknown>));previous=offsets[index+1]}
  if(previous<offsets.at(-1)!)rows.push(gap(offsets.at(-1)!-previous,"tail"));
  const handlers={onKeyDown:keyboard,onFocusCapture:(event:React.FocusEvent<HTMLElement>)=>{const row=(event.target as HTMLElement).closest<HTMLElement>("[data-window-index]");if(row)setFocus(Number(row.dataset.windowIndex))},onBlurCapture:(event:React.FocusEvent<HTMLElement>)=>{if(!element.current?.contains(event.relatedTarget as Node|null))setFocus(null)}};
  if(table)return <tbody ref={node=>{element.current=node}} {...handlers}>{rows}</tbody>;
  return <div ref={node=>{element.current=node}} {...handlers}>{rows}</div>;
}
