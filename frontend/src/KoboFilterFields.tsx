import {dateFilterModeOptions,type DateFilterMode} from './dateFilters';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,Layers,ListFilter,ListPlus,ListMinus,RotateCcw,Search,SlidersHorizontal,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {VirtualRows} from './VirtualRows';
import {koboLabel,type KoboProject,type KoboSettings} from './koboTypes';
import {visibilityGroups,visibilityMatches,type VisibilityChanges} from './koboVisibility';
import './koboQuestionVisibility.css';

export default function KoboFilterFields({project,settings,onApply,onClose}:{project:KoboProject;settings:KoboSettings;onApply:(changes:VisibilityChanges,dateFilterModes?:Record<string,DateFilterMode>)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),all=useRef<HTMLInputElement>(null),initial=useRef(new Set(settings.filterFields));
 const[dateModes,setDateModes]=useState(settings.dateFilterModes||{});
 const modesDirty=JSON.stringify(dateModes)!==JSON.stringify(settings.dateFilterModes||{});
 const[changes,setChanges]=useState<VisibilityChanges>({});
 const[filter,setFilter]=useState(()=>({query:'',group:'@all',kind:'all',status:'all',selected:new Set(settings.filterFields)}));
 const groups=useMemo(()=>visibilityGroups(project,settings.language),[project.form,settings.language]);
 const labels=useMemo(()=>new Map(groups.map(group=>[group.id,group.path])),[groups]);
 const selected=(id:string)=>changes[id]??initial.current.has(id);
 const count=project.form.questions.filter(question=>selected(question.id)).length;
 const questions=useMemo(()=>{
  const scope=filter.group==='@all'?null:new Set(groups.find(group=>group.id===filter.group)?.questionIds||[]),order=new Map(groups.map((group,index)=>[group.id,index]));
  return project.form.questions.filter(question=>(!scope||scope.has(question.id))&&visibilityMatches(question,settings.language,labels.get(question.group)||'',filter.query,filter.kind,'all',new Set())&&(filter.status==='all'||filter.selected.has(question.id)===(filter.status==='selected'))).sort((a,b)=>(order.get(a.group)??Infinity)-(order.get(b.group)??Infinity));
 },[project.form,settings.language,groups,labels,filter]);
 const ids=questions.map(question=>question.id),matchingCount=ids.filter(selected).length;
 const added=Object.values(changes).filter(Boolean).length,removed=Object.values(changes).filter(value=>!value).length,dirty=added+removed>0||modesDirty;
 const patch=(target:string[],value:boolean)=>setChanges(current=>{const next={...current};for(const id of target){if(value===initial.current.has(id))delete next[id];else next[id]=value}return next});
 const updateFilter=(next:Partial<Pick<typeof filter,'query'|'group'|'kind'|'status'>>)=>setFilter(current=>({...current,...next,selected:new Set(project.form.questions.filter(question=>selected(question.id)).map(question=>question.id))}));
 const clear=()=>updateFilter({query:'',group:'@all',kind:'all',status:'all'});
 const typeLabels:Record<string,string>={category:'Single choice',multiple:'Multiple choice',number:'Number',date:'Date',text:'Text'};
 const groupOptions:[string,string][]=[['@all','All fields'],...groups.map(group=>[group.id,group.path] as [string,string])];
 const activeFilters=filter.query||filter.group!=='@all'||filter.kind!=='all'||filter.status!=='all';
 useEffect(()=>{const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 useEffect(()=>{if(all.current)all.current.indeterminate=matchingCount>0&&matchingCount<ids.length},[matchingCount,ids.length]);
 return <dialog ref={dialog} className="kobo-dialog glass kobo-visibility kobo-filter-field-manager" aria-label="Choose filter fields" dir="ltr" onCancel={event=>{event.preventDefault();onClose()}}>
  <header><span className="kobo-visibility-icon"><SlidersHorizontal aria-hidden="true"/></span><div><h2>{'Choose filter fields'}</h2><p>{'Choose which fields appear in Filter responses.'}</p></div><button type="button" className="soft" aria-label="Close filter field manager" onClick={onClose}><X/></button></header>
  <div className="kobo-visibility-toolbar">
   <label className="kobo-visibility-search"><Search aria-hidden="true"/><input autoFocus aria-label="Search filter fields" placeholder={'Search titles, names, IDs or groups…'} value={filter.query} onChange={event=>updateFilter({query:event.target.value})}/>{filter.query&&<button type="button" aria-label="Clear filter field search" onClick={()=>updateFilter({query:''})}><X/></button>}</label>
   <AppSelect label="Field type" value={filter.kind} options={[["all","All types"],...Object.entries(typeLabels),["metadata","Metadata"]]} onChange={kind=>updateFilter({kind})}/>
   <div className="kobo-visibility-mobile-group"><AppSelect label="Field group" searchable value={filter.group} options={groupOptions} onChange={group=>updateFilter({group})}/></div>
   <div className="kobo-visibility-status" role="group" aria-label="Filter field selection">{(['all','selected','available'] as const).map(status=><button type="button" key={status} aria-pressed={filter.status===status} onClick={()=>updateFilter({status})}>{status==='all'?('All'):status==='selected'?('Selected'):('Available')}<span>{status==='all'?project.form.questions.length:status==='selected'?count:project.form.questions.length-count}</span></button>)}</div>
   <button type="button" className="soft" disabled={!activeFilters} onClick={clear}><ListFilter aria-hidden="true"/>{'Clear filters'}</button>
  </div>
  <div className="kobo-visibility-body">
   <nav className="kobo-visibility-groups" aria-label="Filter field groups"><h3>{'FORM GROUPS'}</h3>{groupOptions.map(([id,label])=>{const group=groups.find(group=>group.id===id);return <button type="button" key={id} aria-current={filter.group===id?'true':undefined} onClick={()=>updateFilter({group:id})} style={{paddingInlineStart:12+(group?.depth||0)*12}} title={label}><Layers aria-hidden="true"/><span dir="auto">{group?.label||label}</span><small>{group?group.questionIds.filter(selected).length:count}/{group?.questionIds.length??project.form.questions.length}</small></button>})}<p>{'Counts show selected fields, including nested groups.'}</p></nav>
   <section className="kobo-visibility-content" aria-label="Filter field list">
    <div className="kobo-visibility-list-heading"><div><strong dir="auto">{filter.group==='@all'?('All fields'):labels.get(filter.group)}</strong><small role="status">{questions.length} of {project.form.questions.length} matching · {count} selected</small></div><button type="button" className="soft" disabled={!dirty} onClick={()=>{setChanges({});setDateModes(settings.dateFilterModes||{});setFilter(current=>({...current,selected:new Set(initial.current)}))}}><RotateCcw aria-hidden="true"/>{'Undo changes'}</button></div>
    <div className="kobo-visibility-bulk"><label><input ref={all} type="checkbox" aria-label="Select all matching filter fields" checked={ids.length>0&&matchingCount===ids.length} disabled={!ids.length} onChange={()=>patch(ids,matchingCount!==ids.length)}/>{'Select matching'}</label><div><button type="button" className="kobo-visibility-show kobo-visibility-show-all" disabled={matchingCount===ids.length} onClick={()=>patch(ids,true)}><ListPlus aria-hidden="true"/>{'Add all matching'}</button><button type="button" className="kobo-visibility-hide kobo-visibility-hide-all" disabled={!matchingCount} onClick={()=>patch(ids,false)}><ListMinus aria-hidden="true"/>{'Remove all matching'}</button></div></div>
    {!questions.length?<div className="kobo-visibility-empty" role="status"><Search aria-hidden="true"/><h3>{'No matching fields'}</h3><p>{'Try another title, group, type or selection filter.'}</p><button type="button" className="soft" onClick={clear}>{'Clear filters'}</button></div>:<VirtualRows items={questions} enabled={questions.length>100} estimate={110} resetKey={JSON.stringify([filter.query,filter.group,filter.kind,filter.status])} render={question=>{
     const checked=selected(question.id),detail=`kobo-filter-field-${encodeURIComponent(question.id)}`;
     return <div key={question.id}><label className={`kobo-visibility-row${checked?' is-selected':''}`}><input type="checkbox" aria-label={`Use ${question.name} (${question.id}) as filter`} aria-describedby={detail} checked={checked} onChange={()=>patch([question.id],!checked)}/><div className="kobo-visibility-question"><h3 id={detail} dir="auto">{koboLabel(question,settings.language)}</h3><p dir="auto">{question.name}{question.id!==question.name?` · ${question.id}`:''} · {labels.get(question.group)}</p><div className="kobo-visibility-badges"><span>{typeLabels[question.kind]}</span>{question.addedFromData&&<span>Added question</span>}{question.metadata&&<span>Metadata</span>}{question.identifying&&<span className="is-identifying">Identifying text</span>}{changes[question.id]!==undefined&&<span className="is-pending"><Check aria-hidden="true"/>Changed</span>}</div></div><span className="kobo-filter-field-state">{checked?('Selected'):('Available')}</span></label>{project.customConfig&&checked&&question.kind==='date'&&<div className="custom-date-mode-selection"><AppSelect label="Date filter display" ariaLabel={`Date filter display for ${koboLabel(question,settings.language)}`} value={dateModes[question.id]||'range'} options={dateFilterModeOptions} onChange={value=>setDateModes(current=>({...current,[question.id]:value as DateFilterMode}))}/></div>}</div>;
    }}/>}</section>
  </div>
  <footer className="kobo-dialog-actions"><div className="kobo-visibility-summary"><strong role="status">{dirty?`${added} to add · ${removed} to remove`:`${count} filter fields selected`}</strong><p>{'Changes affect available filter fields. Existing response filters stay active.'}</p></div><div className="kobo-dialog-action-buttons"><button type="button" className="soft" onClick={onClose}>{'Cancel'}</button><button type="button" className="primary" disabled={!dirty} onClick={()=>onApply(changes,project.customConfig?Object.fromEntries(Object.entries(dateModes).filter(([id])=>selected(id)&&project.form.questions.some(q=>q.id===id&&q.kind==='date'))):undefined)}>{'Apply changes'}</button></div></footer>
 </dialog>;
}
