import {useEffect,useRef} from 'react';
import {Table2,X} from 'lucide-react';
import KoboDataExplorer from './KoboDataExplorer';
import type {KoboPivotSelection} from './KoboPivotTable';
import type {KoboProject,KoboResult,KoboSettings} from './koboTypes';
import './koboPivotRecords.css';

export type KoboPivotRecordInput={project:KoboProject;settings:KoboSettings;result:KoboResult;selection:KoboPivotSelection};
export default function KoboPivotRecords({input,onClose}:{input:KoboPivotRecordInput;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),{project,settings,result,selection}=input;
 const answer=selection.answer===undefined?'All answered responses':result.rows.find(row=>row.id===selection.answer)?.label||selection.answer;
 const breakdown=result.breakdowns.find(column=>column.id===selection.breakdown);
 const conditions=breakdown?(breakdown.labels||[breakdown.label]).map((label,index)=>result.breakdownFields?.[index]?`${result.breakdownFields[index].label}: ${label}`:label):[];
 useEffect(()=>{const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 return <dialog ref={dialog} className="kobo-dialog glass kobo-pivot-records" aria-label="Matching responses" dir="ltr" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}}>
  <header><span className="kobo-visibility-icon"><Table2 aria-hidden="true"/></span><div><h2>Matching responses</h2><p dir="auto">{result.label}</p></div><button type="button" className="soft" aria-label="Close matching responses" onClick={onClose}><X/></button></header>
  <div className="kobo-pivot-records-context"><span dir="auto">{answer}</span>{conditions.map((condition,index)=><span key={index} dir="auto">{condition}</span>)}<strong>{selection.count.toLocaleString(settings.language)} matching responses</strong><small>All fields in this response table are shown, including hidden questions and metadata. Current response filters apply; search and downloads stay within this selection.</small></div>
  <div className="kobo-pivot-records-body"><KoboDataExplorer project={project} settings={settings} groupId="@all" questionSearch="" initialScope={result.repeat} drilldown={{question:result.id,answer:selection.answer,breakdown:selection.breakdown}}/></div>
  <footer className="kobo-dialog-actions"><button type="button" className="primary" onClick={onClose}>Close</button></footer>
 </dialog>;
}
