import {analysisLabel} from './koboApi';
import {useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {Check,Eye,EyeOff,Layers,ListFilter,List,ListChecks,ListX,RotateCcw,Search,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {VirtualRows} from './VirtualRows';
import KoboConfirmDialog from './KoboConfirmDialog';
import KoboVisibilityStateIcon from './KoboVisibilityStateIcon';
import {koboLabel,type KoboProject,type KoboSettings,type KoboQuestion} from './koboTypes';
import {visibilityEnabled,visibilityGroups,visibilityMatches,type VisibilityChanges} from './koboVisibility';
import './koboQuestionVisibility.css';

export type KoboVisibilityOptions=Pick<KoboSettings,'metadata'|'hideEmpty'|'hideBlanks'|'hideZero'>;
const visibilityOptions=(settings:KoboSettings):KoboVisibilityOptions=>({metadata:settings.metadata,hideEmpty:settings.hideEmpty,hideBlanks:settings.hideBlanks,hideZero:settings.hideZero});

export default function KoboQuestionVisibility({project,settings,onApply,onClose,renderAnswers}:{project:KoboProject;settings:KoboSettings;onApply:(changes:VisibilityChanges,options:KoboVisibilityOptions)=>void;onClose:()=>void;renderAnswers:(question:KoboQuestion,onClose:()=>void)=>ReactNode}){
 const[tab,setTab]=useState<'questions'|'answers'>('questions'),tabId=useId();
 const[initialOptions]=useState(()=>visibilityOptions(settings)),[options,setOptions]=useState(()=>visibilityOptions(settings));
 const optionCount=(Object.keys(options) as (keyof KoboVisibilityOptions)[]).filter(key=>options[key]!==initialOptions[key]).length;
 const optionToggle=(key:keyof KoboVisibilityOptions,label:string,hint:string)=><label className="kobo-toggle"><input type="checkbox" checked={options[key]} onChange={event=>setOptions(current=>({...current,[key]:event.target.checked}))}/><span><strong>{label}</strong><small>{hint}</small></span></label>;
 const[answers,setAnswers]=useState<KoboQuestion|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),initial=useRef(new Set(settings.hidden)),selectAll=useRef<HTMLInputElement>(null);
 const[changes,setChanges]=useState<VisibilityChanges>({}),[selected,setSelected]=useState(new Set<string>()),[confirmation,setConfirmation]=useState<string[]|null>(null);
 const[filter,setFilter]=useState(()=>({query:'',group:'@all',kind:'all',status:'all',hidden:new Set(settings.hidden)}));
 const language=settings.language,groups=useMemo(()=>visibilityGroups(project,language),[project.form,language]);
 const labels=useMemo(()=>new Map(groups.map(group=>[group.id,group.path])),[groups]);
 const enabled=(id:string)=>visibilityEnabled(id,initial.current,changes);
 const questions=useMemo(()=>{
  const scope=filter.group==='@all'?null:new Set(groups.find(group=>group.id===filter.group)?.questionIds||[]);
  const order=new Map(groups.map((group,index)=>[group.id,index]));
  return project.form.questions.filter(question=>(!scope||scope.has(question.id))&&visibilityMatches(question,language,labels.get(question.group)||'',filter.query,filter.kind,filter.status,filter.hidden)).sort((a,b)=>(order.get(a.group)??Infinity)-(order.get(b.group)??Infinity));
 },[project.form,groups,labels,filter,language]);
 const enabledCount=project.form.questions.filter(question=>enabled(question.id)).length,ids=questions.map(question=>question.id);
 const selectedIds=ids.filter(id=>selected.has(id)),allSelected=ids.length>0&&selectedIds.length===ids.length;
 const showCount=Object.values(changes).filter(Boolean).length,hideCount=Object.values(changes).filter(value=>!value).length,dirty=showCount+hideCount+optionCount>0;
 const patch=(target:string[],show:boolean)=>setChanges(current=>{const next={...current};for(const id of target){if(show===!initial.current.has(id))delete next[id];else next[id]=show}return next});
 const updateFilter=(next:Partial<Pick<typeof filter,'query'|'group'|'kind'|'status'>>)=>{
  const hidden=new Set(project.form.questions.filter(question=>!enabled(question.id)).map(question=>question.id));
  setFilter(current=>({...current,...next,hidden}));setSelected(new Set());
 };
 const showMatching=()=>{if(questions.some(question=>question.identifying&&!enabled(question.id)))setConfirmation(ids);else patch(ids,true)};
 const undo=()=>{setOptions({...initialOptions});setChanges({});setSelected(new Set());setFilter(current=>({...current,hidden:new Set(initial.current)}))};
 useEffect(()=>{const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 useEffect(()=>{if(selectAll.current)selectAll.current.indeterminate=selectedIds.length>0&&!allSelected},[selectedIds.length,allSelected]);
 const typeLabels:Record<string,string>={category:'Single choice',multiple:'Multiple choice',number:'Number',date:'Date',text:'Text'};
 const groupOptions:[string,string][]=[['@all','All questions'],...groups.map(group=>[group.id,group.path] as [string,string])];
 const activeFilters=filter.query||filter.group!=='@all'||filter.kind!=='all'||filter.status!=='all';
 return <><dialog ref={dialog} className="kobo-dialog glass kobo-visibility" aria-label="Manage questions" dir="ltr" onCancel={event=>{event.preventDefault();onClose()}}>
  <header><span className="kobo-visibility-icon"><Eye aria-hidden="true"/></span><div><h2>{analysisLabel('Manage questions','Manage columns')}</h2><p>{analysisLabel('Choose which questions and answers appear in your analysis and exports.','Choose which columns and values appear in your analysis and exports.')}</p></div><button type="button" className="soft" aria-label="Close question manager" onClick={onClose}><X/></button></header>
  <div className="kobo-visibility-tabs" role="tablist" aria-label="Question manager sections">{(['questions','answers'] as const).map(value=><button key={value} type="button" role="tab" id={`${tabId}-${value}-tab`} aria-selected={tab===value} aria-controls={`${tabId}-${value}-panel`} tabIndex={tab===value?0:-1} onClick={()=>setTab(value)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'questions':event.key==='End'?'answers':value==='questions'?'answers':'questions';setTab(next);document.getElementById(`${tabId}-${next}-tab`)?.focus()}}>{value==='questions'?analysisLabel('Questions','Columns'):analysisLabel('Answer visibility','Value visibility')}</button>)}</div>
  <div className="kobo-visibility-panel kobo-visibility-questions-panel" role="tabpanel" id={`${tabId}-questions-panel`} aria-labelledby={`${tabId}-questions-tab`} hidden={tab!=='questions'}>
  <div className="kobo-visibility-toolbar">
   <label className="kobo-visibility-search"><Search aria-hidden="true"/><input autoFocus aria-label="Search managed questions" placeholder="Search titles, names, IDs or groups…" value={filter.query} onChange={event=>updateFilter({query:event.target.value})}/>{filter.query&&<button type="button" aria-label="Clear question manager search" onClick={()=>updateFilter({query:''})}><X/></button>}</label>
   <AppSelect label="Question type" value={filter.kind} options={[["all","All types"],...Object.entries(typeLabels),["metadata","Metadata"]]} onChange={kind=>updateFilter({kind})}/>
   <div className="kobo-visibility-mobile-group"><AppSelect label="Question group" searchable value={filter.group} options={groupOptions} onChange={group=>updateFilter({group})}/></div>
   <div className="kobo-visibility-status" role="group" aria-label="Question visibility filter">{(['all','enabled','hidden'] as const).map(status=><button key={status} type="button" aria-pressed={filter.status===status} onClick={()=>updateFilter({status})}>{status==='all'?'All':status==='enabled'?'Enabled':'Hidden'}<span>{status==='all'?project.form.questions.length:status==='enabled'?enabledCount:project.form.questions.length-enabledCount}</span></button>)}</div>
   <button type="button" className="soft" disabled={!activeFilters} onClick={()=>updateFilter({query:'',group:'@all',kind:'all',status:'all'})}><ListFilter aria-hidden="true"/>Clear filters</button>
  </div>
  <div className="kobo-visibility-body">
   <nav className="kobo-visibility-groups" aria-label="Question groups"><h3>FORM GROUPS</h3>{groupOptions.map(([id,label])=>{const group=groups.find(group=>group.id===id),total=group?.questionIds.length??project.form.questions.length,count=group?group.questionIds.filter(enabled).length:enabledCount;return <button type="button" key={id} aria-current={filter.group===id?'true':undefined} onClick={()=>updateFilter({group:id})} style={{paddingInlineStart:12+(group?.depth||0)*12}} title={label}><Layers aria-hidden="true"/><span dir="auto">{group?.label||label}</span><small>{count}/{total}</small></button>})}<p>Counts show enabled questions, including nested groups.</p></nav>
   <section className="kobo-visibility-content" aria-label="Question visibility list">
    <div className="kobo-visibility-list-heading"><div><strong dir="auto">{filter.group==='@all'?'All questions':labels.get(filter.group)}</strong><small role="status">{questions.length} of {project.form.questions.length} matching · {selectedIds.length} selected</small></div><button type="button" className="soft" disabled={!dirty} onClick={undo}><RotateCcw aria-hidden="true"/>Undo changes</button></div>
    <div className="kobo-visibility-bulk"><label><input ref={selectAll} type="checkbox" aria-label="Select all matching questions" checked={allSelected} disabled={!ids.length} onChange={()=>setSelected(allSelected?new Set():new Set(ids))}/>Select matching</label><div><button type="button" className="kobo-visibility-show" disabled={!selectedIds.some(id=>!enabled(id))} onClick={()=>patch(selectedIds,true)}><Eye aria-hidden="true"/>Show selected</button><button type="button" className="kobo-visibility-hide" disabled={!selectedIds.some(enabled)} onClick={()=>patch(selectedIds,false)}><EyeOff aria-hidden="true"/>Hide selected</button><button type="button" className="kobo-visibility-show kobo-visibility-show-all" disabled={!ids.some(id=>!enabled(id))} onClick={showMatching}><ListChecks aria-hidden="true"/>Show all matching</button><button type="button" className="kobo-visibility-hide kobo-visibility-hide-all" disabled={!ids.some(enabled)} onClick={()=>patch(ids,false)}><ListX aria-hidden="true"/>Hide all matching</button></div></div>
    {!questions.length?<div className="kobo-visibility-empty" role="status"><Search aria-hidden="true"/><h3>No matching questions</h3><p>Try another title, group, type or visibility filter.</p><button type="button" className="soft" onClick={()=>updateFilter({query:'',group:'@all',kind:'all',status:'all'})}>Clear filters</button></div>:<VirtualRows items={questions} enabled={questions.length>100} estimate={110} resetKey={JSON.stringify([filter.query,filter.group,filter.kind,filter.status])} render={question=>{
     const shown=enabled(question.id),changed=changes[question.id]!==undefined,blocked=shown&&question.metadata&&!options.metadata,label=koboLabel(question,language),detail=`kobo-managed-${encodeURIComponent(question.id)}`;
     return <div key={question.id} className={`kobo-visibility-row ${shown?'is-enabled':'is-hidden'}${selected.has(question.id)?' is-selected':''}${changed?' is-changed':''}`}>
      <input type="checkbox" aria-label={`Select ${question.name} (${question.id})`} aria-describedby={`${detail}-title`} checked={selected.has(question.id)} onChange={()=>setSelected(current=>{const next=new Set(current);if(next.has(question.id))next.delete(question.id);else next.add(question.id);return next})}/>
      <div className="kobo-visibility-question"><h3 id={`${detail}-title`} dir="auto">{label}</h3><p dir="auto">{question.name}{question.id!==question.name?` · ${question.id}`:''} · {labels.get(question.group)}</p><div id={detail} className="kobo-visibility-badges"><span>{typeLabels[question.kind]}</span>{question.metadata&&<span>Metadata</span>}{question.identifying&&<span className="is-identifying">Identifying text</span>}{blocked&&<span>Show metadata is off</span>}{changed&&<span className="is-pending"><Check aria-hidden="true"/>{shown?'Will be shown':'Will be hidden'}</span>}</div></div>
      <div className="kobo-visibility-row-actions"><button type="button" className="soft kobo-visibility-answers" aria-label={`View answers for ${question.name}`} onClick={()=>setAnswers(question)}><List aria-hidden="true"/><span>{'View answers'}</span></button><button type="button" role="switch" className="kobo-visibility-toggle" aria-label={`Enable ${question.name} (${question.id})`} aria-checked={shown} title={shown?'Hide this question':'Show this question'} aria-describedby={`${detail}-title ${detail}`} onClick={()=>patch([question.id],!shown)}><KoboVisibilityStateIcon hidden={!shown}/><span>{shown?'Enabled':'Hidden'}</span></button></div>
     </div>;
    }}/>}</section>
  </div>
  </div>
  <div className="kobo-visibility-panel kobo-visibility-answers-panel" role="tabpanel" id={`${tabId}-answers-panel`} aria-labelledby={`${tabId}-answers-tab`} hidden={tab!=='answers'} tabIndex={0}>
   <h3>Answer visibility</h3><p>Choose which fields, questions and answer rows appear in your analysis and exports.</p>
   <div className="kobo-toggle-grid">
    {optionToggle('metadata','Show metadata','Include technical fields from your form.')}
    {optionToggle('hideEmpty','Hide unanswered questions','Skip questions with no answered responses.')}
    {optionToggle('hideBlanks','Hide blank answers','Remove blank rows from tables and charts.')}
    {optionToggle('hideZero','Hide zero-count choices','Only show choices with responses.')}
   </div>
  </div>
  <footer className="kobo-dialog-actions"><div className="kobo-visibility-summary"><strong role="status">{dirty?[...(showCount+hideCount?[`${showCount} to enable · ${hideCount} to hide`]:[]),...(optionCount?[`${optionCount} visibility setting${optionCount===1?'':'s'} changed`]:[])].join(' · '):'No visibility changes'}</strong><p>Changes across both tabs apply together to your analysis and exports.</p></div><div className="kobo-dialog-action-buttons"><button type="button" className="soft" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!dirty} onClick={()=>onApply(changes,options)}>Apply changes</button></div></footer>
  {confirmation&&<KoboConfirmDialog title="Show identifying answers?" confirmLabel="Show matching questions" onCancel={()=>setConfirmation(null)} onConfirm={()=>{patch(confirmation,true);setConfirmation(null)}}><p>Matching identifying fields will be enabled for analysis and exports.</p><p>Your changes are saved only when you select Apply changes.</p></KoboConfirmDialog>}
 </dialog>{answers&&renderAnswers(answers,()=>setAnswers(null))}</>;
}
