import {projectResponseError} from './projectProtection';
import KoboGeography from './KoboGeography';
import {useEffect,useMemo,useRef,useState} from 'react';
import {sortPivotRows,type PivotSort} from './koboPivotSort';
import {downloadBlob,analysisBase,analysisWorkspace,createKoboApi} from './koboApi';
import {analysisSourceNote,runAnalysisRecipe} from './assistantAnalysis';
import {assistantRequest,type AssistantStatus} from './localAssistantApi';
import {assistantChart} from './assistantChart';
import type {KoboAnalysis,KoboProject,KoboSettings,KoboResult} from './koboTypes';
import './koboWorkspaceTools.css';
export type WorkspaceReport=import('./koboTypes').KoboReport;
export const emptyReport:WorkspaceReport={title:'',findings:'',methodology:'',recommendations:'',questions:[]};
const message=(e:unknown)=>e instanceof Error?e.message:String(e);

export async function downloadBackup(id:string,password?:string,includeSettings=true){
 const response=await fetch(`${analysisBase()}/projects/${encodeURIComponent(id)}/backup`,{credentials:'include',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,includeSettings})});
 if(!response.ok){const issue=await response.json().catch(()=>({detail:'Unable to create backup. Please retry.'}));throw projectResponseError(issue.detail,'Unable to create backup. Please retry.');}
 downloadBlob(await response.blob(),`project.${analysisWorkspace()}-${includeSettings?'backup':'data-only'}.${password===undefined?'zip':'intersos'}`);
}
function ResultSummary({result,language}:{result:KoboResult;language:string}){
 const[sort,setSort]=useState<PivotSort|null>(null);
 const rows=useMemo(()=>sortPivotRows(result,sort,language),[result,sort,language]);
 const header=(metric:PivotSort['metric'],label:string)=>{
  const active=sort?.metric===metric;
  return <th scope="col" className="no-sort" aria-sort={active?(sort.direction==='asc'?'ascending':'descending'):'none'}><button type="button" className="kobo-summary-sort" aria-label={`Sort by ${label}`} onClick={()=>setSort({id:metric,label,metric,direction:active&&sort.direction==='asc'?'desc':active?'asc':metric==='answer'?'asc':'desc'})}>{label}{active&&<span aria-hidden="true">{sort.direction==='asc'?'▲':'▼'}</span>}</button></th>;
 };
 const max=result.rows.reduce((max,row)=>Math.max(max,row.count),1);
 return <article className="glass kobo-workspace-card"><h3 dir="auto">{result.label}</h3><p>Answered {result.denominator.toLocaleString()} · Missing {result.missing.toLocaleString()}{result.repeat?' · Repeat entries':''}</p>{result.kind==='multiple'&&<small>Multiple selections allowed. Percentages may exceed 100%.</small>}<table><thead><tr>{header('answer','Answer')}{header('count','Count')}{header('percent','% answered')}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row" dir="auto">{row.label}<span className="kobo-summary-bar" style={{width:`${row.count/max*100}%`}}/></th><td>{row.count.toLocaleString()}</td><td>{row.percent===null?'N/A':`${row.percent.toFixed(result.percentageDecimals??0)}%`}</td></tr>)}</tbody></table><small>{result.percentageBasis}{result.breakdowns.length?' · Counts shown across all breakdown categories.':''}</small></article>;
}
export default function KoboWorkspaceTools({project,settings,analysis,tab,busy,choicesOpen,onChoicesOpenChange,onChange,onSave,onApplySettings}:{project:KoboProject;settings:KoboSettings;analysis:KoboAnalysis;tab:'overview'|'geography'|'report';busy:boolean;choicesOpen:boolean;onChoicesOpenChange:(open:boolean)=>void;onChange:(s:KoboSettings)=>void;onSave:()=>Promise<void>;onApplySettings:(settings:KoboSettings)=>Promise<void>}){
 const[error,setError]=useState(''),[exporting,setExporting]=useState(false),[pdfProgress,setPdfProgress]=useState('');
 const[refreshing,setRefreshing]=useState(false),[refreshSummary,setRefreshSummary]=useState<Record<string,string>>({});
 const pdfController=useRef<AbortController|null>(null);
 useEffect(()=>()=>pdfController.current?.abort(),[]);
 const report={...emptyReport,...settings.report};
 const safe=analysis.questions.filter(q=>!project.form.questions.find(f=>f.id===q.id)?.identifying);
 const ids=tab==='report'?report.questions:settings.dashboardQuestions||[];
 const selected=safe.filter(q=>ids.includes(q.id));
 const toggle=(id:string)=>{const next=ids.includes(id)?ids.filter(q=>q!==id):[...ids,id];onChange(tab==='report'?{...settings,report:{...report,questions:next}}:{...settings,dashboardQuestions:next})};
 async function refreshReportResults(signal:AbortSignal){
  const attachments=report.assistantResults||[];
  if(!attachments.length)return [];
  const response=await assistantRequest('/selection',undefined,'GET',signal);
  const {smallGroupMin=5}:AssistantStatus=await response.json();
  const api=createKoboApi();
  const results:KoboResult[]=[],summaries:Record<string,string>={};
  for(const attachment of attachments){
   const {cards,answer}=await runAnalysisRecipe(project,analysis,attachment,smallGroupMin,
    (config,id,abort)=>api.previewQuestion(project.id,config,id,abort),signal);
   const card=cards[0];
   const result=card?.result&&(attachment.view==='chart'?assistantChart(card.result)?.result:card.result);
   if(!card||!result?.rows.length)
    throw new Error(`${attachment.name}: ${card?.message||'No visible data for this report result.'} Review or remove this attachment.`);
   results.push({...result,id:`assistant-report:${attachment.id}`,reportAttachment:{view:attachment.view,source:analysisSourceNote(card)}});
   summaries[attachment.id]=`${answer} ${analysisSourceNote(card)}`;
  }
  signal.throwIfAborted();
  setRefreshSummary(summaries);
  return results;
 }

 async function prepareReport(download:boolean){
  if(pdfController.current)return;
  const controller=new AbortController();
  pdfController.current=controller;
  setError('');
  if(download){setExporting(true);setPdfProgress('Refreshing report figures…');}
  else setRefreshing(true);
  const snapshot=structuredClone({...analysis,questions:selected}),narrative=structuredClone(report);
  try{
   await onSave();
   controller.signal.throwIfAborted();
   snapshot.questions.push(...await refreshReportResults(controller.signal));
   if(!download)return;
   const {buildKoboPdf}=await import('./koboPdf');
   const blob=await buildKoboPdf(project.name,snapshot,controller.signal,(_,text)=>setPdfProgress(text),false,narrative);
   downloadBlob(blob,`${(narrative.title.trim()||project.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}.pdf`);
  }catch(e){
   if(!controller.signal.aborted){setError(message(e));setRefreshSummary({});}
  }finally{
   if(!controller.signal.aborted){setExporting(false);setRefreshing(false);setPdfProgress('');}
   pdfController.current=null;
  }
 }
 return <section className="kobo-workspace-tools" aria-label={`${tab} workspace`}>
 {tab==='overview'&&<><h2>Project overview</h2><div className="kobo-overview-metrics">{[[project.customConfig?'All records':'All submissions',analysis.total],[project.customConfig?'Filtered records':'Filtered submissions',analysis.filtered],[project.customConfig?'Visible columns':'Visible questions',analysis.questions.length],['Import issues',project.issues.length]].map(([label,value])=><article className="glass" key={label}><small>{label}</small><strong>{value.toLocaleString()}</strong></article>)}</div></>}
 {tab==='geography'?<KoboGeography project={project} settings={settings} onChange={onChange} onApplySettings={onApplySettings}/>:<>
 {tab==='report'&&<><h2>Reporting workspace</h2><div className="kobo-report-fields"><label className="kobo-field">Report title<input value={report.title} maxLength={300} placeholder={project.name} onChange={e=>onChange({...settings,report:{...report,title:e.target.value}})}/></label>{(['findings','methodology','recommendations'] as const).map(key=><label className="kobo-field" key={key}>{{findings:'Findings',methodology:'Methodology and limitations',recommendations:'Recommendations'}[key]}<textarea aria-label={{findings:'Findings',methodology:'Methodology and limitations',recommendations:'Recommendations'}[key]} rows={5} maxLength={30000} value={report[key]} onChange={e=>onChange({...settings,report:{...report,[key]:e.target.value}})}/></label>)}</div>{report.assistantResults?.length?<section className="glass kobo-workspace-card"><h3>Verified report results</h3>
 <p>Refresh to preview the latest figures. PDF export refreshes them again using each result’s saved filters.</p>
 <ul>{report.assistantResults.map(item=><li key={item.id}><strong>{item.name}</strong> · {item.view==='chart'?'Chart':'Pivot table'}
  <button type="button" className="soft" disabled={busy||exporting||refreshing} aria-label={`Remove ${item.name} ${item.view}`}
   onClick={()=>onChange({...settings,report:{...report,assistantResults:report.assistantResults?.filter(result=>result.id!==item.id)}})}>Remove</button>
  {refreshSummary[item.id]&&<p>{refreshSummary[item.id]}</p>}
 </li>)}</ul>
 <button type="button" className="soft" disabled={busy||exporting||refreshing} onClick={()=>void prepareReport(false)}>Refresh report figures</button>
 {refreshing&&<p role="status">Refreshing report figures…</p>}
 </section>:null}
 <button className="primary" disabled={exporting||refreshing||busy} onClick={()=>void prepareReport(true)}>Download PDF report</button>{exporting&&<p role="status">{pdfProgress}</p>}<p>Download a PDF with your narrative, selected charts and tables, respondent bases, and current filters.</p>{error&&<p role="alert" className="error">{error}</p>}</>}
 <details key={tab} className="glass kobo-workspace-card kobo-workspace-choice-panel" open={choicesOpen} onToggle={event=>{const open=event.currentTarget.open;if(open!==choicesOpen)onChoicesOpenChange(open)}}><summary>{tab==='report'?'Select report questions':'Choose dashboard charts'} ({selected.length})</summary><div className="kobo-workspace-choices">{safe.map(q=><label key={q.id}><input type="checkbox" checked={ids.includes(q.id)} onChange={()=>toggle(q.id)}/><span dir="auto">{q.label}</span></label>)}</div></details>
 {!selected.length&&<p>Select questions above to build this {tab==='report'?'report':'dashboard'}. Identifying questions are excluded.</p>}<div className="kobo-workspace-summaries">{selected.map(q=><ResultSummary key={q.id} result={q} language={settings.language}/>)}</div></>}
 </section>;
}
