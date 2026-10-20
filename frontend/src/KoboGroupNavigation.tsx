import {createContext,useContext,useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Layers} from 'lucide-react';
import './koboGroupNavigation.css';

/** The shell provides a destination; the analysis retains its group tree and navigation state. */
export const KoboGroupNavigationHost=createContext<HTMLElement|null>(null);
type NavigationGroup={id:string;label:string;ancestors:string[];depth:number;count:number};

export function KoboSidebarGroups({groups,active,onNavigate,language}:{groups:NavigationGroup[];active:string;onNavigate:(id:string)=>void;language:'en'|'ar'}){
 const host=useContext(KoboGroupNavigationHost);
 const[collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 useEffect(()=>{const ancestors=groups.find(group=>group.id===active)?.ancestors||[];setCollapsed(current=>{if(!ancestors.some(id=>current.has(id)))return current;const next=new Set(current);ancestors.forEach(id=>next.delete(id));return next})},[groups,active]);
 if(!host)return null;
 const parents=new Set(groups.flatMap(group=>group.ancestors));
 return createPortal(<section className="kobo-sidebar-groups" dir="ltr" aria-label="Question groups">
  <h2><Layers aria-hidden="true"/>{'Question groups'}</h2>
  <div className="kobo-sidebar-group-list" role="navigation" aria-label="Form groups">
   {groups.filter(group=>!group.ancestors.some(id=>collapsed.has(id))).map(group=>{
    const branch=parents.has(group.id),open=!collapsed.has(group.id);
    return <div className="kobo-sidebar-group-row" key={group.id} style={{paddingInlineStart:Math.min(group.depth,6)*12}}>
     {branch?<button type="button" className="kobo-sidebar-branch" aria-label={`${open?('Collapse'):('Expand')} ${'navigation for'} ${group.label}`} aria-expanded={open} onClick={()=>setCollapsed(current=>{const next=new Set(current);if(next.has(group.id))next.delete(group.id);else next.add(group.id);return next})}><ChevronDown aria-hidden="true"/></button>:<span className="kobo-sidebar-branch-space"/>}
     <button type="button" className="kobo-sidebar-group-link" aria-current={active===group.id?'location':undefined} aria-label={`${'Go to group'}: ${group.label}`} title={group.label} onClick={()=>onNavigate(group.id)}><span>{group.label}</span><small aria-label={`${group.count} ${'questions'}`}>{group.count}</small></button>
    </div>;
   })}
  </div>
 </section>,host);
}
