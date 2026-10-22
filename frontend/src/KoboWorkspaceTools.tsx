import KoboGeography from './KoboGeography';
import {useEffect,useRef,useState} from 'react';
import {downloadBlob} from './koboApi';
import type {KoboAnalysis,KoboProject,KoboSettings,KoboResult} from './koboTypes';
import './koboWorkspaceTools.css';
export type WorkspaceReport=import('./koboTypes').KoboReport;
export const emptyReport:WorkspaceReport={title:'',findings:'',methodology:'',recommendations:'',questions:[]};
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const base=(import.meta.env.DEV?'http://127.0.0.1:8000':'')+'/api/kobo';
export async function downloadBackup(id:string){
 const response=await fetch(`${base}/projects/${encodeURIComponent(id)}/backup`,{credentials:'include'});
 if(!response.ok){const issue=await response.json().catch(()=>({detail:'Unable to create backup. Please retry.'}));throw new Error(typeof issue.detail==='string'?issue.detail:'Unable to create backup. Please retry.');}
 downloadBlob(await response.blob(),'project.kobo-backup.zip');
}
function ResultSummary({result}:{result:KoboResult}){
 const max=result.rows.reduce((max,row)=>Math.max(max,row.count),1);
 return <article className="glass kobo-workspace-card"><h3 dir="auto">{result.label}</h3><p>Answered {result.denominator.toLocaleString()} · Missing {result.missing.toLocaleString()}{result.repeat?' · Repeat entries':''}</p>{result.kind==='multiple'&&<small>Multiple selections allowed. Percentages may exceed 100%.</small>}<table><thead><tr><th>Answer</th><th>Count</th><th>% answered</th></tr></thead><tbody>{result.rows.map(row=><tr key={row.id}><th scope="row" dir="auto">{row.label}<span className="kobo-summary-bar" style={{width:`${row.count/max*100}%`}}/></th><td>{row.count.toLocaleString()}</td><td>{row.percent===null?'N/A':`${row.percent.toFixed(result.percentageDecimals??0)}%`}</td></tr>)}</tbody></table><small>{result.percentageBasis}{result.breakdowns.length?' · Counts shown across all breakdown categories.':''}</small></article>;
}
export default function KoboWorkspaceTools({project,settings,analysis,tab,busy,choicesOpen,onChoicesOpenChange,onChange,onSave,onApplySettings}:{project:KoboProject;settings:KoboSettings;analysis:KoboAnalysis;tab:'overview'|'geography'|'report';busy:boolean;choicesOpen:boolean;onChoicesOpenChange:(open:boolean)=>void;onChange:(s:KoboSettings)=>void;onSave:()=>Promise<void>;onApplySettings:(settings:KoboSettings)=>Promise<void>}){
 const[error,setError]=useState(''),[exporting,setExporting]=useState(false),[pdfProgress,setPdfProgress]=useState('');
 const pdfController=useRef<AbortController|null>(null);
 useEffect(()=>()=>pdfController.current?.abort(),[]);
 const report={...emptyReport,...settings.report};
 const safe=analysis.questions.filter(q=>!project.form.questions.find(f=>f.id===q.id)?.identifying);
 const ids=tab==='report'?report.questions:settings.dashboardQuestions||[];
 const selected=safe.filter(q=>ids.includes(q.id));
 const toggle=(id:string)=>{const next=ids.includes(id)?ids.filter(q=>q!==id):[...ids,id];onChange(tab==='report'?{...settings,report:{...report,questions:next}}:{...settings,dashboardQuestions:next})};
 return <section className="kobo-workspace-tools" aria-label={`${tab} workspace`}>
 {tab==='overview'&&<><h2>Project overview</h2><div className="kobo-overview-metrics">{[['All submissions',analysis.total],['Filtered submissions',analysis.filtered],['Visible questions',analysis.questions.length],['Import issues',project.issues.length]].map(([label,value])=><article className="glass" key={label}><small>{label}</small><strong>{value.toLocaleString()}</strong></article>)}</div></>}
 {tab==='geography'?<KoboGeography project={project} settings={settings} onChange={onChange} onApplySettings={onApplySettings}/>:<>
 {tab==='report'&&<><h2>Reporting workspace</h2><div className="kobo-report-fields"><label className="kobo-field">Report title<input value={report.title} maxLength={300} placeholder={project.name} onChange={e=>onChange({...settings,report:{...report,title:e.target.value}})}/></label>{(['findings','methodology','recommendations'] as const).map(key=><label className="kobo-field" key={key}>{{findings:'Findings',methodology:'Methodology and limitations',recommendations:'Recommendations'}[key]}<textarea aria-label={{findings:'Findings',methodology:'Methodology and limitations',recommendations:'Recommendations'}[key]} rows={5} maxLength={30000} value={report[key]} onChange={e=>onChange({...settings,report:{...report,[key]:e.target.value}})}/></label>)}</div><button className="primary" disabled={exporting||busy} onClick={async()=>{setExporting(true);setError('');setPdfProgress('Preparing PDF...');const controller=new AbortController();pdfController.current=controller;const snapshot=structuredClone({...analysis,questions:selected}),narrative=structuredClone(report);try{await onSave();controller.signal.throwIfAborted();const {buildKoboPdf}=await import('./koboPdf');const blob=await buildKoboPdf(project.name,snapshot,controller.signal,(_,text)=>setPdfProgress(text),false,narrative);downloadBlob(blob,`${(narrative.title.trim()||project.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}.pdf`)}catch(e){if(!controller.signal.aborted)setError(message(e))}finally{if(!controller.signal.aborted){setExporting(false);setPdfProgress('')}pdfController.current=null}}}>{exporting?'Preparing PDF...':'Download PDF report'}</button>{exporting&&<p role="status">{pdfProgress}</p>}<p>Download a PDF with your narrative, selected charts and tables, respondent bases, and current filters.</p>{error&&<p role="alert" className="error">{error}</p>}</>}
 <details key={tab} className="glass kobo-workspace-card kobo-workspace-choice-panel" open={choicesOpen} onToggle={event=>{const open=event.currentTarget.open;if(open!==choicesOpen)onChoicesOpenChange(open)}}><summary>{tab==='report'?'Select report questions':'Choose dashboard charts'} ({selected.length})</summary><div className="kobo-workspace-choices">{safe.map(q=><label key={q.id}><input type="checkbox" checked={ids.includes(q.id)} onChange={()=>toggle(q.id)}/><span dir="auto">{q.label}</span></label>)}</div></details>
 {!selected.length&&<p>Select questions above to build this {tab==='report'?'report':'dashboard'}. Identifying questions are excluded.</p>}<div className="kobo-workspace-summaries">{selected.map(q=><ResultSummary key={q.id} result={q}/>)}</div></>}
 </section>;
}
