import {RotateCcw,Search,X} from 'lucide-react';
import {useState,type ReactNode} from 'react';
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
}

/** Shared Overview layout. Pages own live selections, queries and reset semantics. */
export function SharedFilterDrawer({open=true,title,eyebrow,fields,onClose,onReset,resetDisabled,search,onSearchChange,searchLabel='Search filters',className=''}:{
  open?:boolean;title:string;eyebrow:string;fields:DrawerFilterField[];onClose:()=>void;onReset:()=>void;resetDisabled?:boolean;
  search?:string;onSearchChange?:(value:string)=>void;searchLabel?:string;className?:string;
}){
  const [localSearch,setLocalSearch]=useState('');
  const query=search??localSearch;
  const active=fields.some(field=>field.selected.length>0);
  if(!open)return null;
  return <FilterDrawerShell className={`case-filter-drawer shared-filter-drawer ${className}`.trim()} aria-label={title}
    header={<header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close filters"><X/></button></header>}
    footer={<footer><button type="button" className="soft filter-reset-button" disabled={resetDisabled??!active} onClick={onReset}><RotateCcw/>Reset</button><button type="button" className="primary" onClick={onClose}>Done</button></footer>}
    backdrop={<button type="button" className="filter-backdrop" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}/> }>
    <label className="filter-search"><Search/><input aria-label={searchLabel} placeholder="Search filters" value={query} onChange={event=>(onSearchChange??setLocalSearch)(event.target.value)}/></label>
    <div className="case-filter-scroll">{fields.filter(field=>field.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(field=>
      <FilterSection key={field.key} label={field.label} open={Boolean(field.selected.length)} badge={field.selected.length>0&&<b>{field.selected.length}</b>}>
        <div><FilterValueList field={field.label} values={field.values} selected={field.selected} onChange={field.onChange} formatCaption={field.formatCaption}/>{field.note}</div>
      </FilterSection>)}</div>
  </FilterDrawerShell>;
}
