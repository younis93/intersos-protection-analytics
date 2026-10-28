import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCheck,ChevronRight,Copy,FileText,Layers,ListX,LoaderCircle,RotateCcw,Search,ShieldCheck,SlidersHorizontal,Sparkles,TextSelect,X} from 'lucide-react';
import {buildKoboReportPrompt,prepareReportAnalysis,prepareReportQuestions,reportDisaggregationFields,reportQuestionOptions,reportQualityWarnings,type ReportDisaggregationMode,type PreparedReportAnalysis} from './koboReportPrompt';
import {useKoboCopy} from './koboClipboard';
import {ReportPreferences,ReportOverrideSettings,ReportPresets} from './KoboReportOptionsPanel';
import {defaultReportOptions,reportPresetStorageKey,reportPurposes,reportLanguages,restoreReportPreset,type ReportOptions,type ReportOverrides} from './koboReportOptions';
import {analysisWorkspace,koboApi} from './koboApi';
import {koboLabel,type KoboAnalysis,type KoboProject} from './koboTypes';
import './koboReportPrompt.css';
import KoboConfirmDialog from './KoboConfirmDialog';

const kinds={category:'Single choice',multiple:'Multiple choice',number:'Numeric',date:'Date',text:'Totals only'};
export default function KoboReportPrompt({project,analysis,busy,onClose}:{project:KoboProject;analysis:KoboAnalysis;busy:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),textarea=useRef<HTMLTextAreaElement>(null),clipboard=useKoboCopy();
 const[search,setSearch]=useState(''),[selected,setSelected]=useState<Set<string>>(()=>new Set()),[preview,setPreview]=useState(false);
 const[mode,setMode]=useState<ReportDisaggregationMode>('none'),[fields,setFields]=useState<string[]>([]),[fieldSearch,setFieldSearch]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const[options,setOptions]=useState<ReportOptions>(defaultReportOptions),[overrides,setOverrides]=useState<ReportOverrides>({});
 const[draft,setDraft]=useState<{text:string;generated:string;source:KoboAnalysis}|null>(null),[confirmation,setConfirmation]=useState<'regenerate'|'reset'|null>(null);
 const[prepared,setPrepared]=useState<{source:KoboAnalysis;key:string;analysis:PreparedReportAnalysis}|null>(null);
 const questions=useMemo(()=>reportQuestionOptions(project,analysis),[project.form,analysis]);
 const ids=useMemo(()=>new Set(questions.map(question=>question.id)),[questions]);
 const chosen=useMemo(()=>[...selected].filter(id=>ids.has(id)),[selected,ids]);
 const candidates=useMemo(()=>reportDisaggregationFields(project),[project.form]);
 const available=useMemo(()=>new Set(candidates.map(field=>field.id)),[candidates]);
 const validFields=useMemo(()=>fields.filter(id=>available.has(id)),[fields,available]);
 const validOverrides=useMemo(()=>Object.fromEntries(Object.entries(overrides).filter(([id])=>chosen.includes(id)&&questions.some(q=>q.id===id&&q.kind!=='text')).map(([id,values])=>[id,values.filter(field=>available.has(field)&&field!==id).slice(0,3)])),[overrides,chosen,questions,available]);
 const key=JSON.stringify([mode,chosen,validFields,validOverrides]),ready=prepared?.source===analysis&&prepared.key===key;
 const query=search.trim().normalize('NFC').toLocaleLowerCase(),fieldQuery=fieldSearch.trim().normalize('NFC').toLocaleLowerCase();
 const matches=questions.filter(question=>`${question.label} ${question.name} ${question.id}`.normalize('NFC').toLocaleLowerCase().includes(query));
 const shownFields=candidates.filter(field=>`${koboLabel(field,analysis.settings.language)} ${field.name}`.normalize('NFC').toLocaleLowerCase().includes(fieldQuery));
 const needsPreparation=mode==='custom'||chosen.some(id=>!analysis.questions.some(q=>q.id===id));
 const valid=chosen.length>0&&(mode!=='custom'||validFields.length>0||Object.keys(validOverrides).length>0),working=busy||(preview&&needsPreparation&&valid&&!ready&&!error);
 const report=needsPreparation?(ready?prepared.analysis:null):analysis;
 const prompt=useMemo(()=>busy||!valid||!report?'':buildKoboReportPrompt(project,report,chosen,mode,options),[project,report,chosen,mode,busy,valid,options]);
 const warnings=useMemo(()=>reportQualityWarnings(project,report||analysis,chosen,mode,options.quality),[project,report,analysis,chosen,mode,options.quality]);
 useEffect(()=>{setSelected(current=>{const next=new Set([...current].filter(id=>ids.has(id)));return next.size===current.size?current:next})},[ids]);
 useEffect(()=>{setFields(current=>current.filter(id=>available.has(id)))},[available]);
 useEffect(()=>{
  if(!preview||busy||!needsPreparation||!valid)return;
  const controller=new AbortController();setError('');
  const load=(settings:KoboAnalysis['settings'],id:string,signal:AbortSignal)=>koboApi.previewQuestion(project.id,settings,id,signal);
  void prepareReportQuestions(project,analysis,chosen,load,controller.signal,mode)
   .then(source=>mode==='custom'?prepareReportAnalysis(source,chosen,validFields,load,controller.signal,validOverrides):{...source,reportEvidence:[]})
   .then(result=>{if(!controller.signal.aborted)setPrepared({source:analysis,key,analysis:result})})
   .catch(issue=>{if(!controller.signal.aborted){controller.abort();setError(issue instanceof Error?issue.message:String(issue))}});
  return()=>controller.abort();
  // The key captures question and field selections without restarting on presentation changes.
 },[analysis,project.id,key,preview,busy,mode,retry,valid,needsPreparation]);
 useEffect(()=>{const node=dialog.current,opener=document.activeElement;node?.showModal();return()=>{node?.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true})}},[]);
 useEffect(()=>{if(preview&&prompt)textarea.current?.focus({preventScroll:true})},[preview,Boolean(prompt)]);
 const edited=Boolean(draft&&draft.text!==draft.generated);
 useEffect(()=>{
  if(!preview||working||!prompt)return;
  if(draft&&edited&&(draft.generated!==prompt||draft.source!==analysis)){setConfirmation('regenerate');return}
  if(!draft||draft.generated!==prompt||draft.source!==analysis)setDraft({text:prompt,generated:prompt,source:analysis});
 },[preview,prompt,working,analysis]);
 const resetPrompt=()=>{if(edited)setConfirmation('reset');else setDraft({text:prompt,generated:prompt,source:analysis})};
 const toggle=(id:string)=>setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next});
 return <dialog ref={dialog} className="kobo-dialog glass kobo-report-prompt" aria-label="Prepare AI report prompt" dir="ltr" onCancel={event=>{event.preventDefault();onClose()}}>
  <header className="kobo-report-header"><span className="kobo-report-icon"><FileText aria-hidden="true"/></span><div><span className="eyebrow">SURVEY REPORT BUILDER</span><h2>Prepare AI report prompt</h2><p>Choose main fields to analyse and shared fields to compare their results.</p></div><button type="button" className="soft" aria-label="Close report prompt" onClick={onClose}><X/></button></header>
  <nav className="kobo-report-steps" aria-label="Report preparation steps"><span className={!preview?'is-current':'is-complete'} aria-current={!preview?'step':undefined}><b>{preview?<Check aria-hidden="true"/>:'1'}</b>Select & configure</span><ChevronRight aria-hidden="true"/><span className={preview?'is-current':''} aria-current={preview?'step':undefined}><b>2</b>Review & copy</span><small>{reportPurposes[options.purpose]} · {reportLanguages[options.language]}</small></nav>
  <div className="kobo-report-body">
   <section className="kobo-report-main" aria-label={preview?'Review report prompt':'Choose report questions'}>
    {preview?<>
     <div className="kobo-report-section-heading is-preview"><div><h3>Review your prompt</h3><p>Edit any part of this prompt, then copy it into ChatGPT or your preferred AI. Tables use Markdown.</p></div><div className="kobo-dialog-action-buttons"><button type="button" className="soft kobo-report-reset-prompt" disabled={!prompt||working} onClick={resetPrompt}><RotateCcw aria-hidden="true"/>Reset prompt</button><button type="button" className="soft kobo-report-select-text" disabled={!draft?.text||working} onClick={()=>{textarea.current?.focus();textarea.current?.select()}}><TextSelect aria-hidden="true"/>Select text</button></div></div>
     {options.quality.enabled&&<details className="kobo-report-quality-preview"><summary>Evidence quality: {warnings.length} {warnings.length===1?'flag':'flags'} to review</summary><p>Review aids only. Missing response threshold: {options.quality.missingPercent}%; small answered base: below {options.quality.smallBase}.</p>{warnings.length?<ul>{warnings.map((warning,index)=><li key={index} dir="auto">{warning}</li>)}</ul>:<p>No flags under these thresholds. This does not establish data quality or representativeness.</p>}{working&&<p>Comparison checks will finish when the selected evidence is ready.</p>}</details>}
     {!valid?<div className="kobo-report-empty" role="status"><h3>Review your field selection</h3><p>Select at least one main field and configure shared or individual disaggregation before preparing this prompt.</p></div>:working?<div className="kobo-report-empty" role="status"><LoaderCircle className="kobo-report-spinner" aria-hidden="true"/><h3>{busy?'Waiting for current results':mode==='custom'?'Preparing disaggregated results':'Preparing selected results'}</h3><p>Calculating aggregate tables and group denominators for your selected questions.</p></div>:error&&needsPreparation?<div className="kobo-report-empty" role="alert"><h3>Could not prepare report evidence</h3><p>{error}</p><button type="button" className="soft" onClick={()=>{setError('');setRetry(value=>value+1)}}>Try again</button></div>:<textarea ref={textarea} value={draft?.text??prompt} onChange={event=>setDraft(current=>({text:event.target.value,generated:current?.generated??prompt,source:current?.source??analysis}))} aria-label="Prompt preview" spellCheck={false}/>}
    </>:<>
     <div className="kobo-report-section-heading"><div><h3>Main fields</h3><p>Choose what the report should analyse, including added questions. Hidden and empty questions are available here; results are calculated in preview.</p></div><span className="kobo-report-count" role="status">{chosen.length} selected</span></div>
     <label className="kobo-report-search"><Search aria-hidden="true"/><input autoFocus aria-label="Search questions" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search questions..."/>{search&&<button type="button" aria-label="Clear question search" onClick={()=>setSearch('')}><X/></button>}</label>
     <div className="kobo-report-selection-actions"><span>{matches.length} {query?'matching':'available'} questions</span><button type="button" className="kobo-report-select-all" disabled={busy||!matches.length} onClick={()=>setSelected(current=>new Set([...current,...matches.map(question=>question.id)]))}><CheckCheck aria-hidden="true"/>Select all matching</button><button type="button" className="kobo-report-clear-selection" disabled={!chosen.length} onClick={()=>setSelected(new Set())}><ListX aria-hidden="true"/>Clear selection</button></div>
     {busy&&<p className="kobo-report-status" role="status">Updating analysis. Prompt preparation is available when current results are ready.</p>}
     <div className="kobo-report-question-list" role="group" aria-label="Select report questions" aria-busy={busy}>
      {matches.map(question=><label key={question.id} className={selected.has(question.id)?'is-selected':''}><input type="checkbox" disabled={busy} checked={selected.has(question.id)} onChange={()=>toggle(question.id)}/><span><strong dir="auto">{question.label}</strong><small><span><Layers aria-hidden="true"/>{analysis.groups.find(group=>group.id===question.group)?.label||'General'}</span><span>{kinds[question.kind]}</span>{question.addedFromData&&<span>Added question</span>}<span>{question.denominator===undefined?'Results prepared in preview':`${question.denominator.toLocaleString()} answered`}</span></small></span></label>)}
      {!matches.length&&<div className="kobo-report-empty" role="status"><Search aria-hidden="true"/><h3>No matching questions</h3><p>Try another question title or clear your search. Identifying fields are excluded.</p></div>}
     </div>
    </>}
   </section>
   <aside className="kobo-report-settings" aria-label="Report settings">
    <section className="kobo-report-summary"><span className="eyebrow">YOUR REPORT</span><h3 dir="auto">{project.name}</h3><div><span><strong>{analysis.filtered.toLocaleString()}</strong><small>Filtered submissions</small></span><span><strong>{chosen.length}</strong><small>Main fields</small></span><span><strong>{mode==='custom'?validFields.length:0}</strong><small>Shared disaggregation fields</small></span></div><p>{analysis.settings.filters.length?`${analysis.settings.filters.length} active ${analysis.settings.filters.length===1?'filter':'filters'} included`:'All responses · No active filters'}</p></section>
    <fieldset className="kobo-report-disaggregation"><legend><SlidersHorizontal aria-hidden="true"/>Disaggregation</legend><p>Choose how to compare results for each main field.</p>
     {([{id:'none',title:'Overall results',detail:'Summaries without demographic comparisons.'},{id:'current',title:'Current question breakdowns',detail:'Use breakdowns already set on each question.'},{id:'custom',title:'Choose shared disaggregation fields',detail:'Apply up to 3 fields to every main field, with a separate comparison for each.'}] as const).map(option=><label key={option.id} className={`kobo-report-mode${mode===option.id?' is-selected':''}`}><input type="radio" name="report-disaggregation" value={option.id} checked={mode===option.id} disabled={busy} onChange={()=>{setMode(option.id);setError('')}}/><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}
     {mode==='custom'&&<div className="kobo-report-fields"><div className="kobo-report-field-chips">{validFields.map(id=><span key={id}><span dir="auto">{koboLabel(candidates.find(field=>field.id===id)!,analysis.settings.language)}</span><button type="button" disabled={busy} aria-label={`Remove disaggregation ${koboLabel(candidates.find(field=>field.id===id)!,analysis.settings.language)}`} onClick={()=>setFields(current=>current.filter(field=>field!==id))}><X aria-hidden="true"/></button></span>)}</div><label className="kobo-report-search"><Search aria-hidden="true"/><input aria-label="Search disaggregation fields" value={fieldSearch} onChange={event=>setFieldSearch(event.target.value)} placeholder="Search disaggregation fields..."/></label><div className="kobo-report-field-options" role="group" aria-label="Disaggregation fields">{shownFields.map(field=><label key={field.id}><input type="checkbox" checked={validFields.includes(field.id)} disabled={busy||(!validFields.includes(field.id)&&validFields.length>=3)} onChange={()=>setFields(current=>current.includes(field.id)?current.filter(id=>id!==field.id):[...current,field.id])}/><span dir="auto">{koboLabel(field,analysis.settings.language)}</span></label>)}{!shownFields.length&&<p>{candidates.length?'No matching disaggregation fields.':'No eligible single-choice disaggregation fields are available.'}</p>}</div><small>{validFields.length}/3 fields · Single-choice fields only. Each is compared separately. A main field is not compared against itself.</small></div>}
    </fieldset>
    {mode==='custom'&&<ReportOverrideSettings questions={questions.filter(q=>chosen.includes(q.id))} fields={candidates} language={analysis.settings.language} overrides={validOverrides} onChange={setOverrides} disabled={busy}/>}
    <ReportPreferences options={options} onChange={setOptions} disabled={busy}/>
    <ReportPresets key={reportPresetStorageKey(analysisWorkspace(),project.id)} storageKey={reportPresetStorageKey(analysisWorkspace(),project.id)} snapshot={{mainFields:chosen,mode,fields:validFields,overrides:validOverrides,options}} disabled={busy} onLoad={preset=>{
     const restored=restoreReportPreset(preset,ids,available);setSelected(new Set(restored.mainFields));setFields(restored.fields);setMode(restored.mode);setOverrides(restored.overrides);setOptions(restored.options);setError('');
     return restored.omitted?'Preset loaded. Unavailable or identifying fields were omitted; review your selection.':'Preset loaded with current data and filters.';
    }}/>
    <div className="kobo-report-privacy"><ShieldCheck aria-hidden="true"/><p><strong>Aggregate evidence only</strong>Free-text answers and identifying fields are excluded. These report choices do not change your analysis settings or send data to an AI.</p></div>
   </aside>
  </div>
  <footer className="kobo-dialog-actions"><p>{!chosen.length?'Select at least one main field to get started.':mode==='custom'&&!valid?'Choose shared disaggregation fields or customise a main field.':preview?(working?'Preparing the selected report evidence...':error&&needsPreparation?'Retry the analysis before copying.':'Ready to copy with ChatGPT-compatible Markdown tables.'):'Executive summary, findings, comparisons, limitations & recommendations.'}</p><div className="kobo-dialog-action-buttons"><button type="button" className="soft" onClick={()=>preview?setPreview(false):onClose()}>{preview?<><ArrowLeft aria-hidden="true"/>Edit selection</>:'Cancel'}</button>{preview?<button type="button" className="primary" disabled={!valid||working||!draft?.text.trim()||Boolean(confirmation)||Boolean(error&&needsPreparation)} onClick={event=>void clipboard.copy(draft?.text||'',event.currentTarget,'Report prompt copied')}><Copy aria-hidden="true"/>Copy prompt</button>:<button type="button" className="primary" disabled={busy||!valid} onClick={()=>{setError('');setPreview(true)}}><Sparkles aria-hidden="true"/>Preview prompt<ArrowRight aria-hidden="true"/></button>}</div></footer>
  {confirmation&&<KoboConfirmDialog title={confirmation==='reset'?'Reset your prompt?':'Regenerate your prompt?'} confirmLabel={confirmation==='reset'?'Reset prompt':'Regenerate prompt'} onCancel={()=>{if(confirmation==='regenerate')setPreview(false);setConfirmation(null)}} onConfirm={()=>{setDraft({text:prompt,generated:prompt,source:analysis});setConfirmation(null)}}><p>{confirmation==='reset'?'Your edits will be replaced with the generated prompt.':'Your question selection, disaggregation, or source results changed. Regenerating will replace your edited prompt with the updated evidence.'}</p></KoboConfirmDialog>}
  {clipboard.notification}
 </dialog>;
}
