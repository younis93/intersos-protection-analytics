import './recordsTable.css';
import {ChevronLeft,ChevronRight,Search,X} from 'lucide-react';
import {useLayoutEffect,useRef,type ComponentPropsWithoutRef,type ReactNode} from 'react';
import {FilterableHeader,type RecordFilterControl} from './ColumnFilterControls';
import type {FilterColumn} from './columnFilters';

/** Shared search field used by record tables and project collections. */
export function SearchField({value,onChange,label,placeholder=label,clearable=false}:{value:string;onChange:(value:string)=>void;label:string;placeholder?:string;clearable?:boolean}){
 const input=useRef<HTMLInputElement>(null);
 return <label className="detention-table-search app-search-field"><Search aria-hidden="true"/><input ref={input} className="table-search-input" type="text" aria-label={label} placeholder={placeholder} value={value} onChange={event=>onChange(event.target.value)}/>{clearable&&value&&<button type="button" className="soft app-search-clear" aria-label={`Clear ${label.toLowerCase()}`} title="Clear search" onClick={()=>{onChange('');input.current?.focus()}}><X aria-hidden="true"/></button>}</label>;
}

export function pageCount(total:number,pageSize:number){return Math.max(1,Math.ceil(total/Math.max(1,pageSize)))}

export function Pager({page,total,onChange,compact=false,iconOnly=false,pageSize=100,variant='legal'}:{page:number;total:number;onChange:(page:number)=>void;compact?:boolean;iconOnly?:boolean;pageSize?:number;variant?:'legal'|'explorer'|'reconciliation'}){
  const pages=pageCount(total,pageSize),previous=()=>onChange(Math.max(1,page-1)),next=()=>onChange(Math.min(pages,page+1));
  if(variant==='explorer')return <footer><span>Page {page} of {pages}</span><div><button className="soft" onClick={previous} disabled={page<=1}><ChevronLeft/>Previous</button><button className="soft" onClick={next} disabled={page>=pages}>Next<ChevronRight/></button></div></footer>;
  if(variant==='reconciliation')return <footer className="legal-pager"><button className="soft" disabled={page<=1} onClick={previous}><ChevronLeft/>Previous</button><span>Page {page} of {pages}</span><button className="soft" disabled={page>=pages} onClick={next}>Next<ChevronRight/></button></footer>;
  return <div className={`legal-pager ${compact?'legal-pager-compact':''}`}><button className="soft" disabled={page<=1} onClick={previous} aria-label="Previous page" title="Previous page">{compact||iconOnly?<ChevronLeft/>:'Previous'}</button><span>Page {page} of {pages}</span><button className="soft" disabled={page>=pages} onClick={next} aria-label="Next page" title="Next page">{compact||iconOnly?<ChevronRight/>:'Next'}</button></div>;
}

export function SortableHeader({direction,onSort,children,buttonProps,filterControl,filterColumn,...props}:ComponentPropsWithoutRef<'th'>&{direction?:'asc'|'desc';onSort:()=>void;buttonProps?:ComponentPropsWithoutRef<'button'>;filterControl?:RecordFilterControl;filterColumn?:FilterColumn}){
  const button=<button {...buttonProps} onClick={onSort}>{children}</button>;
  return <th {...props} aria-sort={direction==='asc'?'ascending':direction==='desc'?'descending':'none'}>{filterControl&&filterColumn?<FilterableHeader column={filterColumn} control={filterControl}>{button}</FilterableHeader>:button}</th>;
}

export function RowSelectionCheckbox({selectedCount,total,onChange,label,disabled=false}:{selectedCount:number;total:number;onChange:(checked:boolean)=>void;label:string;disabled?:boolean}){
  const ref=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{if(ref.current)ref.current.indeterminate=selectedCount>0&&selectedCount<total},[selectedCount,total]);
  return <input ref={ref} type="checkbox" aria-label={label} disabled={disabled} checked={total>0&&selectedCount===total} onChange={event=>onChange(event.target.checked)}/>;
}

export function TableState({children,error=false,as:Container='div',...props}:ComponentPropsWithoutRef<'div'>&{children:ReactNode;error?:boolean;as?:'div'|'p'}){
  return <Container {...props} role={error?'alert':'status'}>{children}</Container>;
}
