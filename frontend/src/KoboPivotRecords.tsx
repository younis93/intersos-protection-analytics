import {useEffect,useRef,useState} from 'react';
import {Table2,X} from 'lucide-react';
import KoboDataExplorer from './KoboDataExplorer';
import KoboResponseFilters from './KoboResponseFilters';
import KoboFilterFields from './KoboFilterFields';
import type {KoboPivotSelection} from './KoboPivotTable';
import type {KoboProject,KoboResult,KoboSettings} from './koboTypes';
import './koboPivotRecords.css';

export type KoboPivotRecordInput={project:KoboProject;settings:KoboSettings;result:KoboResult;selection:KoboPivotSelection};
export default function KoboPivotRecords({input,onClose}:{input:KoboPivotRecordInput;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),{project,settings,result,selection}=input;
 const[localSettings,setLocalSettings]=useState(settings),[filtersOpen,setFiltersOpen]=useState(false),[chooseFields,setChooseFields]=useState(false),[error,setError]=useState('');
 const answer=selection.answer===undefined?'All answered responses':result.rows.find(row=>row.id===selection.answer)?.label||selection.answer;
 const breakdown=result.breakdowns.find(column=>column.id===selection.breakdown);
 const conditions=breakdown?(breakdown.labels||[breakdown.label]).map((label,index)=>result.breakdownFields?.[index]?`${result.breakdownFields[index].label}: ${label}`:label):[];
 useEffect(()=>{const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 return <dialog ref={dialog} className="kobo-dialog glass kobo-pivot-records" aria-label="Matching responses" dir="ltr" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}}>
  <header><span className="kobo-visibility-icon"><Table2 aria-hidden="true"/></span><div><h2>Matching responses</h2><p dir="auto">{result.label}</p></div><button type="button" className="soft" aria-label="Close matching responses" onClick={onClose}><X/></button></header>
  <div className="kobo-pivot-records-context"><span dir="auto">{answer}</span>{conditions.map((condition,index)=><span key={index} dir="auto">{condition}</span>)}<strong>{selection.count.toLocaleString(settings.language)} in pivot selection</strong><details className="kobo-pivot-records-help"><summary>About this table</summary><p>All fields in this response table are shown, including hidden questions and metadata. Response filters start with your current selections. Changes here apply only to this window; search and downloads use these filters within the pivot selection.</p></details></div>
  <div className="kobo-pivot-records-body"><KoboResponseFilters project={project} settings={localSettings} pinned={false} open={filtersOpen} onOpenChange={setFiltersOpen} onChange={setLocalSettings} onChooseFields={()=>setChooseFields(true)} onError={setError}/>{error&&<p className="error" role="alert">{error}</p>}<KoboDataExplorer project={project} settings={localSettings} groupId="@all" questionSearch="" initialScope={result.repeat} drilldown={{question:result.id,answer:selection.answer,breakdown:selection.breakdown,baseFilters:settings.filters}}/></div>
  {chooseFields&&<KoboFilterFields project={project} settings={localSettings} onApply={changes=>{setLocalSettings(current=>{const fields=new Set(current.filterFields),valid=new Set(project.form.questions.map(question=>question.id));for(const[id,selected]of Object.entries(changes))if(valid.has(id)){if(selected)fields.add(id);else fields.delete(id)}return {...current,filterFields:[...fields]}});setChooseFields(false)}} onClose={()=>setChooseFields(false)}/>}
  <footer className="kobo-dialog-actions"><button type="button" className="primary" onClick={onClose}>Close</button></footer>
 </dialog>;
}
