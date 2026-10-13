import {
RotateCcw,
Search,
SlidersHorizontal
} from "lucide-react";
import { useEffect,useRef,useState,type ReactNode } from "react";
import { createPortal } from "react-dom";

export function LegalScrollControls({children,search,onSearch,onSearchSubmit,onFilters,activeCount,onClear,compactFilters,compactActions,searchPlaceholder="Search",filterLabel="Filters"}:{children:ReactNode;search?:string;onSearch?:(value:string)=>void;onSearchSubmit?:()=>void;onFilters:()=>void;activeCount:number;onClear:()=>void;compactFilters?:ReactNode;compactActions?:ReactNode;searchPlaceholder?:string;filterLabel?:string}) {
  const sentinel=useRef<HTMLSpanElement>(null),[pinned,setPinned]=useState(false),[target,setTarget]=useState<HTMLElement|null>(null);
  useEffect(()=>{setTarget(document.getElementById("legal-header-scroll-controls"))},[]);
  useEffect(()=>{
    const node=sentinel.current;if(!node)return;
    const observer=new IntersectionObserver(([entry])=>setPinned(window.innerWidth>=1280&&!entry.isIntersecting&&entry.boundingClientRect.top<0),{threshold:0});
    const resize=()=>{if(window.innerWidth<1280)setPinned(false)};
    observer.observe(node);window.addEventListener("resize",resize);
    return()=>{observer.disconnect();window.removeEventListener("resize",resize)};
  },[]);
  const compact=<div className="legal-header-scroll-controls header-filter-actions">
    {onSearch&&<label className="legal-header-search"><Search/><input className="table-search-input" value={search||""} onChange={(event)=>onSearch(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")onSearchSubmit?.()}} placeholder={searchPlaceholder}/></label>}
    {compactFilters}
    <button className="soft case-filter-button" onClick={onFilters}><SlidersHorizontal/>{filterLabel} {activeCount>0&&<b>{activeCount}</b>}</button>
    {compactActions}
    <button className="soft" onClick={onClear} disabled={!activeCount}><RotateCcw/>Reset</button>
  </div>;
  return <><span ref={sentinel} className="legal-scroll-sentinel" aria-hidden="true"/><div className={pinned?"legal-scroll-source legal-scroll-source-pinned":"legal-scroll-source"}>{children}</div>{pinned&&target&&createPortal(compact,target)}</>;
}
