import {AnimatedActionIcon} from './AnimatedActionIcon';
import {Search,X} from 'lucide-react';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {prefersReducedMotion,SURFACE_EXIT_MS} from './surfaceMotion';
import './surfaceMotion.css';
import {FilterDrawerShell,FilterSection} from './FilterDrawerShell';
import {FilterValueList} from './SelectionControls';

export interface DrawerFilterField {
  key:string;
  label:string;
  values:string[];
  selected:string[];
  onChange:(values:string[])=>void;
  formatCaption?:(value:string)=>string;
  note?:ReactNode;
  onResetSelection?:()=>void;
  defaultExpanded?:boolean;
}

/** Shared Overview layout. Pages own live selections, queries and reset semantics. */
export function SharedFilterDrawer({open=true,title,eyebrow,fields,onClose,onReset,resetDisabled,search,onSearchChange,searchLabel='Search filters',className=''}:{
  open?:boolean;title:string;eyebrow:string;fields:DrawerFilterField[];onClose:()=>void;onReset:()=>void;resetDisabled?:boolean;
  search?:string;onSearchChange?:(value:string)=>void;searchLabel?:string;className?:string;
}){
  const [localSearch,setLocalSearch]=useState('');
  const [closing,setClosing]=useState(false);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const closeCallback=useRef(onClose);closeCallback.current=onClose;
  useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
  useEffect(()=>{if(!open){clearTimeout(closeTimer.current);closeTimer.current=undefined;setClosing(false)}},[open]);
  const close=()=>{
    if(closeTimer.current!==undefined)return;
    if(prefersReducedMotion()){onClose();return}
    setClosing(true);
    closeTimer.current=setTimeout(()=>{closeTimer.current=undefined;setClosing(false);closeCallback.current()},SURFACE_EXIT_MS);
  };
  const query=search??localSearch;
  const active=fields.some(field=>field.selected.length>0);
  if(!open)return null;
  return <FilterDrawerShell className={`case-filter-drawer shared-filter-drawer ${className}${closing?' is-closing':''}`.trim()} aria-label={title} inert={closing||undefined}
    header={<header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={close} aria-label="Close filters"><X/></button></header>}
    footer={<footer><button type="button" className="soft filter-reset-button" disabled={resetDisabled??!active} onClick={onReset}><AnimatedActionIcon type="reset"/>Reset</button><button type="button" className="primary" onClick={close}>Done</button></footer>}
    backdrop={<button type="button" className={`filter-backdrop surface-backdrop${closing?' is-closing':''}`} aria-label={`Close ${title.toLowerCase()}`} onClick={close} disabled={closing}/> }>
    <label className="filter-search"><Search/><input aria-label={searchLabel} placeholder="Search filters" value={query} onChange={event=>(onSearchChange??setLocalSearch)(event.target.value)}/></label>
    <div className="case-filter-scroll">{fields.filter(field=>field.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(field=>
      <FilterSection key={field.key} label={field.label} open={field.defaultExpanded??Boolean(field.selected.length)} badge={field.selected.length>0&&<b>{field.selected.length}</b>}>
        <div><FilterValueList field={field.label} values={field.values} selected={field.selected} onChange={field.onChange} onReset={field.onResetSelection} formatCaption={field.formatCaption}/>{field.note}</div>
      </FilterSection>)}</div>
  </FilterDrawerShell>;
}
