import './koboQuestionFilters.css';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,ListFilter,Search,Trash2,X} from 'lucide-react';
import {VirtualRows} from './VirtualRows';
import {questionFilterSettings} from './koboQuestionFilterState';
import {koboLabel,questionSettingsFor,type KoboFilter,type KoboProject,type KoboResult,type KoboQuestionSettings,type KoboSettings} from './koboTypes';

export default function KoboQuestionFilters({project,result,settings,onApply,onClose}:{project:KoboProject;result:KoboResult;settings:KoboSettings;onApply:(settings:KoboQuestionSettings)=>void;onClose:()=>void}){
 const question=project.form.questions.find(q=>q.id===result.id)!;
 const initial=questionSettingsFor(question,settings.questions[result.id],settings.percentageDefault);
 const[rules,setRules]=useState<KoboFilter[]>(initial.ownFilters||[]),[search,setSearch]=useState(''),[tab,setTab]=useState<'all'|'selected'>(initial.ownFilters?.length?'selected':'all');
 const ref=useRef<HTMLDialogElement>(null),searchRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;ref.current?.showModal();searchRef.current?.focus();return()=>{ref.current?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 const available=useMemo(()=>project.form.questions.filter(q=>!q.repeat||q.repeat===question.repeat||question.repeat.startsWith(q.repeat+'/')),[project.form,question.repeat]);
 const selected=new Set(rules.map(rule=>rule.field));
 const unknown=rules.filter(rule=>!available.some(q=>q.id===rule.field));
 const visible=useMemo(()=>available.filter(q=>(tab==='all'||rules.some(rule=>rule.field===q.id))&&`${koboLabel(q,settings.language)} ${q.name} ${q.id} ${q.group}`.normalize('NFC').toLocaleLowerCase().includes(search.normalize('NFC').toLocaleLowerCase())),[available,tab,rules,search,settings.language]);
 const typeLabels={category:'Single choice',multiple:'Multiple choice',number:'Number',date:'Date',text:'Text'};
 const remove=(id:string)=>{setRules(items=>items.filter(rule=>rule.field!==id))};
 return <dialog ref={ref} className="kobo-dialog glass kobo-question-filter-dialog" aria-label="Question filters" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}}>
  <header><span className="kobo-question-filter-icon"><ListFilter aria-hidden="true"/></span><div><h2>Question filters</h2><p dir="auto">{result.label}</p></div><button type="button" className="soft" aria-label="Close question filters" onClick={onClose}><X aria-hidden="true"/></button></header>
  <div className="kobo-question-filter-body">
   <label className="kobo-question-filter-search"><Search aria-hidden="true"/><input ref={searchRef} aria-label="Search question filter fields" placeholder="Search fields..." value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button type="button" aria-label="Clear field search" onClick={()=>{setSearch('');searchRef.current?.focus()}}><X aria-hidden="true"/></button>}</label>
   <div className="kobo-question-filter-toolbar"><div role="group" aria-label="Question filter fields">{(['all','selected'] as const).map(value=><button type="button" key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{value==='all'?'All fields':'Selected'}<span>{value==='all'?available.length:selected.size}</span></button>)}</div>{rules.length>0&&<button type="button" className="soft" onClick={()=>{setRules([])}}>Clear all</button>}</div>
   {unknown.map(rule=><div key={rule.field} className="kobo-question-filter-unavailable"><p role="alert">This field is unavailable: {rule.field}</p><button type="button" className="soft" onClick={()=>remove(rule.field)}><Trash2 aria-hidden="true"/>Remove filter</button></div>)}
   {!visible.length&&<p role="status" className="kobo-question-filter-empty">{search?'No matching fields.':tab==='selected'?'No filters selected. Search All fields to add one.':'No filter fields available.'}</p>}
   <VirtualRows className="kobo-question-filter-fields" items={visible} enabled={visible.length>100} estimate={76} resetKey={tab+search} render={q=>{
    const rule=rules.find(rule=>rule.field===q.id),checked=selected.has(q.id);
    return <section key={q.id} className={`kobo-question-filter-field${checked?' is-selected':''}`} data-question-filter-field={q.id}><label><input type="checkbox" aria-label={`Filter by ${koboLabel(q,settings.language)} (${q.id})`} checked={checked} onChange={()=>checked?remove(q.id):setRules(items=>[...items,{field:q.id,kind:q.kind==='number'?'number':q.kind==='date'?'date':'category',values:[]}])}/><span><strong dir="auto">{koboLabel(q,settings.language)}</strong><small dir="auto">{typeLabels[q.kind]}{q.name!==koboLabel(q,settings.language)?` · ${q.name}`:''}</small></span><span className="kobo-question-filter-selected">{checked?<><Check aria-hidden="true"/>Selected</>:'Add'}</span></label></section>;
   }}/>
  </div>
  <footer className="kobo-dialog-actions"><span role="status">{selected.size} {selected.size===1?'field selected':'fields selected'}</span><div className="kobo-dialog-action-buttons"><button type="button" className="soft" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={unknown.length>0} onClick={()=>onApply(questionFilterSettings(initial,rules))}>Apply fields</button></div></footer>
 </dialog>;
}
