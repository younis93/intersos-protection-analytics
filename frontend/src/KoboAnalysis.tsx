import type {KoboReviewConfig} from './koboTypes';
import {KoboMobileWorkspaceSelector,type KoboWorkspaceSection} from './KoboWorkspaceNavigation';
import KoboWorkspaceTools,{downloadBackup} from './KoboWorkspaceTools';
import KoboValueSelector from './KoboValueSelector';
import {withValueDisplay} from './koboValueDisplay';
import {isDenseKoboChart} from './koboChartDensity';
import {editMarkColor,resultWithColors,type KoboMarkTarget} from './koboMarkColors';
import KoboReportPrompt from './KoboReportPromptDialog';
import {createPortal} from 'react-dom';
import {koboCopyCell,useKoboCopy} from './koboClipboard';
import {koboQuestionType} from './koboQuestionPresentation';
import './koboQuestionCard.css';
import './koboAnswers.css';
import './koboReportButton.css';
import KoboQuestionVisibility from './KoboQuestionVisibility';
import KoboFilterFields from './KoboFilterFields';
import KoboDataExplorer from './KoboDataExplorer';
import {mergeVisibility} from './koboVisibility';
import KoboExcelOptions,{type KoboExcelOptionsInput} from './KoboExcelOptions';
import KoboBulkCustomize from './KoboBulkCustomize';
import KoboDisplayOptions from './KoboDisplayOptions';
import {bulkQuestionChanges} from './koboBulkSettings';
import {startKoboExport} from './koboExportManager';
import {lazy,memo,Suspense,useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Copy,Columns2,ChartNoAxesCombined,Download,Eye,FolderOpen,FileSearch,LoaderCircle,FileJson,FileText,Plus,Search,Sparkles,X} from 'lucide-react';
import {AppSelect,ExcelDownloadButton} from './SelectionControls';
import {useResponseWorksheet} from './useResponseWorksheet';
import {ChartLoading} from './ChartPrimitives';
import {koboApi,koboRequest} from './koboApi';
import {koboLabel,questionDefaults,type KoboAnalysis as Analysis,type KoboMapping,type KoboPreview,type KoboProject,type KoboQuestion,type KoboQuestionSettings,type KoboResult,type KoboSettingsReview,type KoboSettings} from './koboTypes';
import './kobo.css';
import KoboMappingReview from './KoboMappingReview';
import KoboConfirmDialog from './KoboConfirmDialog';
import KoboProjects from './KoboProjects';
import KoboQuestionGroups from './KoboQuestionGroups';
import KoboImportReview from './KoboImportReview';
import KoboProjectHeader from './KoboProjectHeader';
import KoboIndicators from './KoboIndicators';
import KoboReview from './KoboReview';
import KoboSavedViews from './KoboSavedViews';
import {verifySavedViews,viewSignature} from './koboSavedViewState';
import KoboPopulationCompare from './KoboPopulationCompare';
import {verifySavedIndicators} from './koboIndicatorPersistence';
import KoboResponseFilters from './KoboResponseFilters';
import KoboRenameProject from './KoboRenameProject';
import KoboSettingsImport from './KoboSettingsImport';
import KoboSettingsSummary from './KoboSettingsSummary';
import './koboCreateProject.css';
import KoboPivotTable,{type KoboPivotTableHandle,type KoboPivotSelection} from './KoboPivotTable';
import KoboCustomize from './KoboCustomize';
import KoboCompare from './KoboCompare';
import KoboPivotRecords,{type KoboPivotRecordInput} from './KoboPivotRecords';
import {KoboRendering,KoboDeferredQuestion} from './KoboRendering';
import KoboFilePicker from './KoboFilePicker';
import KoboWorkspaceShell from './KoboWorkspaceShell';
import {KoboLoadError,KoboProjectSkeleton} from './KoboLoading';
import {AnimatedActionIcon} from './AnimatedActionIcon';
import KoboActionMenu from './KoboActionMenu';
import './koboOrganization.css';
import './koboDialogActions.css';
import './koboSearchFocus.css';

const Chart=lazy(()=>import('./KoboChart'));
type ProjectList={id:string;name:string;updated:string}[];
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
// Stable event callbacks keep memoized cards current without rerendering on save progress.
function useCurrentCallback<T extends (...args:any[])=>any>(callback:T):T{
 const current=useRef(callback);useLayoutEffect(()=>{current.current=callback});
 return useCallback(((...args:Parameters<T>)=>current.current(...args)) as T,[]);
}
function Dialog({title,onClose,children,wide=false,className='',copyCells=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean;className?:string;copyCells?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),clipboard=useKoboCopy();
 useEffect(()=>{const node=ref.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 useEffect(()=>{if(className.includes('kobo-create-project')){const node=ref.current;if(node){node.scrollTop=0;node.querySelector<HTMLElement>('h2')?.focus({preventScroll:true})}}},[title,className]);
 return <dialog ref={ref} {...(copyCells?clipboard.events:{})} className={`kobo-dialog glass ${wide?'is-wide':''} ${className}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}><header><h2 tabIndex={-1}>{title}</h2><button className="soft" aria-label="Close dialog" onClick={onClose}><X/></button></header>{children}{copyCells&&clipboard.notification}</dialog>;
}

function ImportProject({onClose,onImported,onError}:{onClose:()=>void;onImported:(p:KoboProject)=>void;onError:(message:string)=>void}){
 const[form,setForm]=useState<File|null>(null),[data,setData]=useState<File|null>(null),[name,setName]=useState(''),[preview,setPreview]=useState<KoboPreview|null>(null),[mappings,setMappings]=useState<KoboMapping[]>([]),[policies,setPolicies]=useState<Record<string,string>>({}),[accept,setAccept]=useState(false),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
 const[settingsFile,setSettingsFile]=useState<File|null>(null),[settingsPackage,setSettingsPackage]=useState<unknown>(null),[settingsReview,setSettingsReview]=useState<KoboSettingsReview|null>(null);
 const[reviewConfig,setReviewConfig]=useState<KoboReviewConfig>({addedQuestions:[],choiceOverrides:{}});
 const worksheet=useResponseWorksheet(data);
 const action=async(fn:()=>Promise<void>)=>{setBusy(true);setLocalError('');try{await fn()}catch(e){setLocalError(errorMessage(e))}finally{setBusy(false)}};
 const close=()=>{if(busy)return;if(preview)void koboApi.cancelImport(preview.token).catch(e=>onError(errorMessage(e)));onClose()};
 const chooseSettings=(file:File)=>void action(async()=>{
  setSettingsFile(null);setSettingsPackage(null);setSettingsReview(null);
  if(file.size>5*1024*1024)throw new Error('Choose a settings file smaller than 5 MB.');
  let pack;try{pack=JSON.parse(await file.text())}catch{throw new Error('This is not a valid JSON settings file.')}
  if(!pack||pack.format!=='kobo-settings'||pack.version!==1)throw new Error('Choose a supported Kobo settings file exported from the Settings menu.');
  setSettingsFile(file);setSettingsPackage(pack);
 });
 const[confirmWarnings,setConfirmWarnings]=useState(false);
 const pendingColumns=mappings.filter(mapping=>mapping.status==='unmatched'||mapping.status==='ambiguous');
 const missingQuestions=preview?.form.questions.filter(question=>!question.metadata&&!reviewConfig.excludedQuestionIds?.includes(question.id)&&!mappings.some(mapping=>mapping.question===question.id&&mapping.status==='matched'))||[];
 const create=(withSettings:boolean,reviewedMappings=mappings)=>void action(async()=>onImported(await koboApi.confirm(preview!.token,name,reviewedMappings,policies,accept,withSettings?settingsPackage:undefined,reviewConfig)));
 const continueImport=(reviewedMappings=mappings)=>settingsPackage?void action(async()=>setSettingsReview(await koboApi.previewImportSettings(preview!.token,reviewedMappings,policies,settingsPackage,reviewConfig))):create(false,reviewedMappings);
 const requestContinue=()=>{if(missingQuestions.length){setLocalError('Link a data column or ignore each form question without data before continuing.');return}if(pendingColumns.length||preview?.warnings.length)setConfirmWarnings(true);else continueImport()};
 const attachment=<KoboFilePicker className="kobo-create-settings" title={settingsFile?'Shared settings selected':'Start with shared settings'} description="Optional. Import chart, display, filter, and Excel settings from another project. Kobo settings file · Up to 5 MB." accept=".json,application/json" format="JSON" file={settingsFile} icon={<FileJson aria-hidden="true"/>} disabled={busy} inputLabel="Import project settings file" chooseLabel="Choose settings file" removeLabel="Remove settings file" onChange={file=>{if(file)chooseSettings(file);else{setSettingsFile(null);setSettingsPackage(null);setSettingsReview(null);setLocalError('')}}}/>;
 return <Dialog title={settingsReview?'Review shared settings':preview?'Review column mapping':'Create Kobo analysis project'} onClose={close} wide className={`kobo-create-project ${preview&&!settingsReview?'kobo-import-dialog':''}`}>
  {!preview?<><p>Upload the original Kobo XLSForm and its exported responses. Files stay on this computer.</p><label className="kobo-field">Project name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Household assessment" maxLength={200}/></label><div className="kobo-import-grid"><KoboFilePicker title="Kobo XLSForm" description="survey, choices and settings sheets" accept=".xlsx" format="XLSX" file={form} icon={<FolderOpen/>} disabled={busy} onChange={file=>{setForm(file);if(!name&&file)setName(file.name.replace(/\.xlsx$/i,''))}}/><KoboFilePicker title="Exported responses" description="Excel workbook or CSV export" accept=".xlsx,.csv" format="XLSX / CSV" file={data} icon={<ChartNoAxesCombined/>} disabled={busy} onChange={setData}>{worksheet.excel&&<div className="kobo-response-worksheet">{worksheet.loading?<p role="status">Loading worksheets...</p>:worksheet.error?<div role="alert"><p className="error">{worksheet.error}</p><button type="button" className="soft" disabled={busy} onClick={worksheet.retry}>Retry worksheets</button></div>:<><AppSelect label="Worksheet" ariaLabel="Response worksheet" value={worksheet.selected} options={worksheet.names.map(name=>[name,name])} onChange={worksheet.select} disabled={busy}/><p>Only this worksheet will be imported.</p></>}</div>}</KoboFilePicker></div>{attachment}{localError&&<p className="error" role="alert">{localError}</p>}<footer className="kobo-dialog-actions"><div className="kobo-dialog-action-buttons"><button type="button" className="soft" disabled={busy} onClick={close}>Cancel</button><button className="primary kobo-import-review-button" aria-label={busy?'Reading form and responses...':'Review import'} aria-busy={busy} disabled={!form||!data||!name.trim()||busy||!worksheet.ready} onClick={()=>void action(async()=>{const p=await koboApi.preview(form!,data!,worksheet.selected);setPreview(p);setMappings(p.mappings)})}>{busy?<LoaderCircle className="kobo-import-read-spinner" aria-hidden="true"/>:<FileSearch aria-hidden="true"/>}<span role="status" aria-live="polite">{busy?'Reading form and responses...':'Review import'}</span></button></div></footer></>:settingsReview?<>
   <p>Review the compatible settings before creating <strong dir="auto">{name}</strong>. The project and its settings will be saved together.</p><div className="kobo-create-settings-review"><KoboSettingsSummary review={settingsReview}/></div>{localError&&<p className="error" role="alert">{localError}</p>}
   <footer className="kobo-dialog-actions"><div className="kobo-dialog-action-buttons"><button type="button" className="soft" disabled={busy} onClick={()=>{setSettingsReview(null);setLocalError('')}}>Back</button><button type="button" className="soft" disabled={busy} onClick={()=>create(false)}>Create without settings</button><button type="button" className="primary" disabled={busy} onClick={()=>create(true)}>{busy?'Creating project...':'Create project with settings'}</button></div></footer>
  </>:<>{attachment}
   <KoboMappingReview reviewConfig={reviewConfig} onReviewConfigChange={setReviewConfig} allowUnresolved preview={preview} mappings={mappings} onChange={setMappings} policies={policies} onPoliciesChange={setPolicies} acceptInvalid={accept} onAcceptInvalidChange={setAccept} busy={busy} confirmLabel={settingsPackage?'Review settings':undefined} busyLabel={settingsPackage?'Reviewing shared settings...':'Saving project...'} error={localError} onCancel={close} onConfirm={requestContinue}/>
  </>}
  {confirmWarnings&&<KoboConfirmDialog title="Continue with import warnings?" confirmLabel={settingsPackage?'Ignore warnings and review settings':'Ignore warnings and create project'} onCancel={()=>setConfirmWarnings(false)} onConfirm={()=>{const reviewed=mappings.map<KoboMapping>(mapping=>mapping.status==='unmatched'||mapping.status==='ambiguous'?{...mapping,question:'',option:'',answerMap:{},mergeMode:'',status:'excluded'}:mapping);setMappings(reviewed);setConfirmWarnings(false);continueImport(reviewed)}}><p>Review these warnings before continuing.</p>{pendingColumns.length>0&&<><p><strong>{pendingColumns.length} response data {pendingColumns.length===1?'column will':'columns will'} be excluded from analysis.</strong> They have no confirmed link to a form question.</p><ul className="kobo-import-warning-columns">{pendingColumns.map(mapping=><li key={`${mapping.sheet}:${mapping.column}`} dir="auto">{preview!.sheets[mapping.sheet].name} - Column {mapping.column+1}: {mapping.header||'Untitled column'}</li>)}</ul></>}{!!preview?.warnings.length&&<details open><summary>Other import notes ({preview.warnings.length})</summary>{preview.warnings.map((warning,index)=><p key={index}>{warning}</p>)}</details>}<p>Your uploaded source files remain unchanged. Cancel to review or link these columns first.</p></KoboConfirmDialog>}
 </Dialog>;
}

function Responses({project,settings,result,onClose}:{project:KoboProject;settings:KoboSettings;result:Pick<KoboResult,'id'|'name'|'label'>;onClose:()=>void}){
 const[limit,setLimit]=useState(30);
 const[tab,setTab]=useState<'pivot'|'records'>('pivot'),[summary,setSummary]=useState<KoboResult|null>(null),[summaryError,setSummaryError]=useState(''),[retry,setRetry]=useState(0),[selection,setSelection]=useState<KoboPivotSelection|null>(null);
 const tabId=useId();
 useEffect(()=>{const controller=new AbortController();setSummary(null);setSummaryError('');void koboApi.previewQuestion(project.id,settings,result.id,controller.signal).then(value=>{if(!controller.signal.aborted)setSummary(value)}).catch(error=>{if(!controller.signal.aborted)setSummaryError(errorMessage(error))});return()=>controller.abort()},[project.id,settings,result.id,retry]);
 const[search,setSearch]=useState(''),[page,setPage]=useState(1),[rows,setRows]=useState<{id:string;row:number;value:unknown}[]>([]),[total,setTotal]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const choices=new Map(project.form.questions.find(question=>question.id===result.id)?.choices.map(choice=>[choice.name,koboLabel(choice,settings.language)])||[]);
 const answer=(value:unknown):string=>Array.isArray(value)?value.length?value.map(answer).join(', '):'Blank / unanswered':value===null||value===undefined||String(value).trim()===''?'Blank / unanswered':choices.get(String(value))||(typeof value==='object'?JSON.stringify(value):String(value));
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');const timer=setTimeout(()=>koboApi.responses(project.id,settings,result.id,search,page,controller.signal).then(r=>{if(!controller.signal.aborted){setRows(r.rows);setTotal(r.total)}}).catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)}),200);return()=>{clearTimeout(timer);controller.abort()}},[project.id,settings,result.id,search,page]);
 return <><Dialog title="View answers" onClose={onClose} wide className="kobo-answers" copyCells><div className="kobo-answers-heading"><h3 dir="auto">{result.label}</h3><p className="kobo-answers-context">{result.name} · Current response filters apply.</p></div><div className="kobo-visibility-tabs" role="tablist" aria-label="Answer preview"><button type="button" role="tab" id={`${tabId}-pivot-tab`} aria-controls={`${tabId}-pivot`} aria-selected={tab==='pivot'} tabIndex={tab==='pivot'?0:-1} onClick={()=>setTab('pivot')} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'pivot':'records';setTab(next);document.getElementById(`${tabId}-${next}-tab`)?.focus()}}}>Pivot table</button><button type="button" role="tab" id={`${tabId}-records-tab`} aria-controls={`${tabId}-records`} aria-selected={tab==='records'} tabIndex={tab==='records'?0:-1} onClick={()=>setTab('records')} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='End'?'records':'pivot';setTab(next);document.getElementById(`${tabId}-${next}-tab`)?.focus()}}}>Records</button></div><section className="kobo-answers-panel kobo-answers-pivot" role="tabpanel" id={`${tabId}-pivot`} aria-labelledby={`${tabId}-pivot-tab`} hidden={tab!=='pivot'}>{summaryError?<div role="alert"><p>{summaryError}</p><button type="button" className="soft" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:summary?<><KoboPivotTable result={summary} language={settings.language} limit={limit} display={summary.breakdownDisplay||'both'} copyable onDrilldown={setSelection}/>{summary.rows.length>limit&&<button type="button" className="soft" onClick={()=>setLimit(current=>current+100)}>Show more answers ({limit} of {summary.rows.length})</button>}</>:<p role="status">Preparing answer pivot...</p>}</section><section className="kobo-answers-panel kobo-answers-records" role="tabpanel" id={`${tabId}-records`} aria-labelledby={`${tabId}-records-tab`} hidden={tab!=='records'}><label className="kobo-search"><Search aria-hidden="true"/><input aria-label="Search answers" placeholder="Search answers…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label>{error&&<p role="alert">{error}</p>}<p role="status">{loading?'Loading answers…':`${total} recorded responses${search?' match your search':''}`}</p><div className="legal-table-wrap kobo-table-wrap" aria-busy={loading}><table><thead><tr><th className="no-sort">Source row</th><th className="no-sort">Answer</th></tr></thead><tbody>{!loading&&!error&&!rows.length?<tr><td colSpan={2}>{search?'No answers match your search.':'No recorded answers under the current filters.'}</td></tr>:rows.map(r=><tr key={r.id}><td {...koboCopyCell(String(r.row),settings.language)}>{r.row}</td><td dir="auto" {...koboCopyCell(answer(r.value),settings.language)}>{answer(r.value)}</td></tr>)}</tbody></table></div></section><footer className="kobo-dialog-actions"><div className="kobo-toolbar" style={{display:tab==='records'?undefined:'none'}}><button className="soft" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}{total?` of ${Math.ceil(total/50)}`:''}</span><button className="soft" disabled={page*50>=total||loading} onClick={()=>setPage(p=>p+1)}>Next</button></div><div className="kobo-dialog-action-buttons"><button type="button" className="primary" onClick={onClose}>Close</button></div></footer></Dialog>{selection&&summary&&<KoboPivotRecords input={{project,settings,result:summary,selection}} onClose={()=>setSelection(null)}/>}</>;
}

const QuestionCard=memo(function QuestionCard({result,question,language,breakdownDisplay,tableOnly,onConfigure,onCompare,onExcel,onPdf,onError,onBreakdownDisplay,onDrilldown,colorSettings,onChartColor}:{colorSettings:KoboQuestionSettings;onChartColor:(result:KoboResult,target:KoboMarkTarget,color:string|null)=>void;onDrilldown:(result:KoboResult,selection:KoboPivotSelection)=>void;result:KoboResult;question?:KoboQuestion;tableOnly:boolean;onBreakdownDisplay:(id:string,display:NonNullable<KoboQuestionSettings['breakdownDisplay']>)=>void;language:'en'|'ar';breakdownDisplay:NonNullable<KoboQuestionSettings['breakdownDisplay']>;onConfigure:(q:KoboResult)=>void;onCompare:(q:KoboResult)=>void;onExcel:(q:string)=>Promise<void>;onPdf:(q?:string)=>Promise<void>;onError:(s:string)=>void}){
 const[count,setCount]=useState(30);
 const chartResult=useMemo(()=>({...resultWithColors(result,colorSettings),appearance:colorSettings.appearance||result.appearance}),[result,colorSettings]);
 const applyChartColor=useCallback((target:KoboMarkTarget,color:string|null)=>onChartColor(result,target,color),[onChartColor,result]);
 const dense=!tableOnly&&isDenseKoboChart(result);
 const chart=!tableOnly&&<Suspense key="chart" fallback={<ChartLoading/>}><Chart result={chartResult} language={language} colorSettings={colorSettings} onColorApply={applyChartColor}/></Suspense>;
 const pivot=useRef<KoboPivotTableHandle>(null);
 const clipboard=useKoboCopy(),type=koboQuestionType(question,result,'en');
 const number=(v:number)=>new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(v);
 return <article {...clipboard.events} className="chart-card kobo-question glass" id={`question-${result.name}`}><header className="card-title"><div className="kobo-card-heading"><div className="kobo-question-meta"><code title={result.id}>{result.name}</code><span className="kobo-question-type" title={type.tooltip}>{type.label}</span>{result.repeat&&<span>{'Repeat entries'}</span>}</div><div className="kobo-question-title"><h3 dir="auto" {...koboCopyCell(result.label)} title="Copy question (Enter or Space)">{result.label}</h3></div><p className="kobo-question-counts"><span>{'Answered'} <strong>{number(result.denominator)}</strong></span><span>{'Missing'} <strong>{number(result.missing)}</strong></span><span>{'Total'} <strong>{number(result.total)}</strong></span></p></div><div className="kobo-question-actions"><KoboValueSelector settings={colorSettings} language={language} question={result.name} onChange={display=>onBreakdownDisplay(result.id,display)}/><button type="button" className="soft kobo-copy-table" aria-label={`Copy table for ${result.name}`} onClick={event=>{if(pivot.current)void clipboard.copy(pivot.current.copyText(),event.currentTarget,'Formatted table copied',pivot.current.copyHtml())}}><Copy aria-hidden="true"/>Copy</button><button type="button" className="soft" aria-label={`Compare ${result.name}`} onClick={()=>onCompare(result)}><Columns2 aria-hidden="true"/>{'Compare'}</button><button className="soft" aria-label={`Configure ${result.name}`} onClick={()=>onConfigure(result)}><AnimatedActionIcon type="filters"/> Customize</button></div></header>
  {!!Object.keys(result.statistics).length&&<div className="kobo-stats">{Object.entries(result.statistics).map(([key,value])=><span key={key}><small>{({count:'Count',mean:'Mean',median:'Median',min:'Minimum',max:'Maximum',standardDeviation:'Standard deviation'} as Record<string,string>)[key]}</small><strong>{number(value)}</strong></span>)}</div>}
  {!result.denominator&&<p className="kobo-notice">{'No answered responses under the current filters. Try changing or resetting filters.'}</p>}
  <div className={`kobo-question-grid${result.breakdowns.length?' has-breakdown':''}${tableOnly?' is-table-only':''}${dense?' is-dense-chart':''}`}>{dense&&chart}<div key="pivot"><KoboPivotTable onDrilldown={selection=>onDrilldown(result,selection)} ref={pivot} showCopyButton={false} copyable result={result} language={language} limit={count} display={breakdownDisplay}/>{result.rows.length>count&&<button className="soft" onClick={()=>setCount(c=>c+100)}>Show more answers ({result.rows.length-count} remaining)</button>}{result.kind==='multiple'&&<p className="kobo-basis">Percentages can total more than 100%; each respondent is counted once per selected option.</p>}</div>{!dense&&chart}</div>
  <footer className="export-buttons"><KoboActionMenu label="Export question" icon={<Download aria-hidden="true"/>}><button className="soft" disabled={!result.denominator} onClick={()=>void import('./KoboChart').then(m=>m.downloadKoboPng(chartResult,language)).catch(e=>onError(errorMessage(e)))}><Download/> Chart PNG</button><button className="soft" onClick={()=>void onPdf(result.id)}><Download/> Question PDF</button><ExcelDownloadButton className="soft" onClick={()=>onExcel(result.id)}>Pivot Excel</ExcelDownloadButton></KoboActionMenu></footer>
 {createPortal(clipboard.notification,document.body)}</article>;
});

export default function KoboAnalysis(){
 const[route,setRoute]=useState(window.location.hash),[list,setList]=useState<ProjectList>([]),[project,setProject]=useState<KoboProject|null>(null),[settings,setSettings]=useState<KoboSettings|null>(null),[analysis,setAnalysis]=useState<Analysis|null>(null),[error,setError]=useState(''),[saveStatus,setSaveStatus]=useState('Saved locally'),[importOpen,setImportOpen]=useState(false),[manager,setManager]=useState<'questions'|'filters'|null>(null),[custom,setCustom]=useState<KoboResult|null>(null);
 const[projectLoading,setProjectLoading]=useState(false),[analysisLoading,setAnalysisLoading]=useState(false);
 const[projectFailure,setProjectFailure]=useState<{id:string;message:string}|null>(null),[analysisError,setAnalysisError]=useState('');
 const[projectAttempt,setProjectAttempt]=useState(0),[analysisAttempt,setAnalysisAttempt]=useState(0);
 const loading=projectLoading||analysisLoading;
 const tableOnly=settings?.viewMode==='table';
 const[viewsOpen,setViewsOpen]=useState(false),[viewResetting,setViewResetting]=useState(false);
 const[reportOpen,setReportOpen]=useState(false);
 const[workspaceTab,setWorkspaceTab]=useState<KoboWorkspaceSection>('analysis'),[backupBusy,setBackupBusy]=useState(false);
 const[choicePanels,setChoicePanels]=useState({overview:true,report:true});
 useEffect(()=>{setWorkspaceTab('analysis');setChoicePanels({overview:true,report:true})},[route.split('/')[2]]);
 const[indicatorsOpen,setIndicatorsOpen]=useState(false),[qualityOpen,setQualityOpen]=useState(false),[populationOpen,setPopulationOpen]=useState(false),[indicatorSelection,setIndicatorSelection]=useState<string|undefined>();
 const[analysisSettingsKey,setAnalysisSettingsKey]=useState('');
 const[settingsImport,setSettingsImport]=useState(false);
 const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null),importingSettings=useRef(false);
 const[renameProject,setRenameProject]=useState<{id:string;name:string}|null>(null);
 const[compare,setCompare]=useState<{projectId:string;questionId:string}|null>(null);
 const[filtersOpen,setFiltersOpen]=useState(true),[bulkOpen,setBulkOpen]=useState(false),[excelOptions,setExcelOptions]=useState<KoboExcelOptionsInput|null>(null);
 const[reviewImport,setReviewImport]=useState(false),[replaceFiles,setReplaceFiles]=useState(false);
 const[deleteProject,setDeleteProject]=useState<ProjectList[number]|null>(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
 const removeProject=async()=>{if(!deleteProject||deleting)return;setDeleting(true);setDeleteError('');try{await koboApi.remove(deleteProject.id);setDeleteProject(null);await refreshList()}catch(e){setDeleteError(errorMessage(e))}finally{setDeleting(false)}};
 const saveChain=useRef<Promise<unknown>>(Promise.resolve()),lastSaved=useRef(''),pendingSaves=useRef(0);
 const latest=useRef<{id:string;settings:KoboSettings}|null>(null);
 latest.current=project&&settings?{id:project.id,settings}:null;
 const pid=route.split('/')[2]||'';
 const[drilldown,setDrilldown]=useState<(KoboPivotRecordInput&{projectId:string})|null>(null);
 const openPivotRecords=useCurrentCallback((result:KoboResult,selection:KoboPivotSelection)=>{if(project&&settings)setDrilldown({projectId:pid,project,settings:structuredClone(analysis?.settings||settings),result,selection})});
 const openCompare=useCurrentCallback((q:KoboResult)=>setCompare({projectId:pid,questionId:q.id}));
 useEffect(()=>{setViewsOpen(false);setPopulationOpen(false);setQualityOpen(false);setIndicatorsOpen(false);setReportOpen(false);setSettingsImport(false);setRenameProject(null);setFiltersOpen(true);setCompare(null);setDrilldown(null);setManager(null)},[pid]);
 useEffect(()=>{if(pid&&route.endsWith('/report')){const canonical=`#/kobo/${pid}`;window.history.replaceState(null,'',canonical);setRoute(canonical)}},[pid,route]);
 const refreshList=()=>koboApi.list().then(setList).catch(e=>setError(errorMessage(e)));
 useEffect(()=>{if(!pid)void refreshList()},[pid]);
 const flushLatest=useCurrentCallback(async()=>{
  const current=latest.current;if(!current||importingSettings.current)return;
  if(saveTimer.current)clearTimeout(saveTimer.current);
  const serialized=JSON.stringify(current.settings);if(serialized===lastSaved.current&&!pendingSaves.current)return;
  pendingSaves.current++;setSaveStatus('Saving...');
  const pending=saveChain.current.catch(()=>{}).then(async()=>{
   if(serialized===lastSaved.current)return;
   await koboApi.save(current.id,current.settings);
   if(latest.current?.id===current.id){lastSaved.current=serialized;if(JSON.stringify(latest.current.settings)===serialized)setSaveStatus('Saved locally')}
  }).catch(issue=>{if(latest.current?.id===current.id)setSaveStatus('Save failed');throw issue}).finally(()=>{pendingSaves.current--});
  saveChain.current=pending;await pending;
 });
 useEffect(()=>{
  const flush=()=>void flushLatest().catch(issue=>setError(errorMessage(issue)));
  const sync=()=>{flush();setRoute(window.location.hash)};
  const hidden=()=>{if(document.visibilityState==='hidden')flush()};
  const closing=()=>{const current=latest.current;if(!importingSettings.current&&!pendingSaves.current&&current&&JSON.stringify(current.settings)!==lastSaved.current)koboApi.saveOnPageHide(current.id,current.settings)};
  window.addEventListener('hashchange',sync);window.addEventListener('pagehide',closing);document.addEventListener('visibilitychange',hidden);
  document.documentElement.dataset.theme=localStorage.getItem('app-theme')||'glass-light';
  return()=>{flush();window.removeEventListener('hashchange',sync);window.removeEventListener('pagehide',closing);document.removeEventListener('visibilitychange',hidden)};
 },[]);
 useEffect(()=>{let active=true;setAnalysis(null);setProject(null);setSettings(null);setProjectFailure(null);setAnalysisError('');setAnalysisLoading(false);setProjectLoading(!!pid);if(!pid)return; koboApi.get(pid).then(p=>{if(active){setProject(p);setSettings(p.settings);lastSaved.current=JSON.stringify(p.settings);setSaveStatus('Saved locally')}}).catch(e=>{if(active)setProjectFailure({id:pid,message:errorMessage(e)})}).finally(()=>{if(active)setProjectLoading(false)});return()=>{active=false}},[pid,projectAttempt]);
 useEffect(()=>{if(!project||!settings||importingSettings.current||JSON.stringify(settings)===lastSaved.current&&!pendingSaves.current)return;setSaveStatus('Saving...');const timer=saveTimer.current=setTimeout(()=>void flushLatest().catch(issue=>setError(errorMessage(issue))),500);return()=>clearTimeout(timer)},[project?.id,settings]);
 useEffect(()=>{if(!project||project.id!==pid||!settings)return;const controller=new AbortController();setAnalysisLoading(true);setAnalysisError('');const timer=setTimeout(()=>koboApi.analyze(project.id,settings,controller.signal).then(a=>{if(!controller.signal.aborted){setAnalysis(a);setAnalysisSettingsKey(JSON.stringify(settings))}}).catch(e=>{if(!controller.signal.aborted)setAnalysisError(errorMessage(e))}).finally(()=>{if(!controller.signal.aborted)setAnalysisLoading(false)}),220);return()=>{clearTimeout(timer);controller.abort()}},[pid,project?.id,settings,analysisAttempt]);
 const change=(next:KoboSettings)=>{setSettings(next);setSaveStatus('Saving…')};
 const setTableOnly=(value:boolean)=>{if(settings)change({...settings,viewMode:value?'table':'charts'})};
 const saveNow=async()=>{await flushLatest();await saveChain.current.catch(()=>{})};
 const applySharedSettings=async(next:KoboSettings)=>{
  if(!project)return;
  importingSettings.current=true;
  if(saveTimer.current)clearTimeout(saveTimer.current);
  try{
   await saveChain.current.catch(()=>{});
   const saving=koboApi.save(project.id,next);saveChain.current=saving;await saving;
   {
    const persisted=await koboApi.get(project.id);
    verifySavedIndicators(next.indicators||[],persisted.settings.indicators);
    verifySavedViews(next.savedViews||[],persisted.settings.savedViews);
    if(viewSignature(next)!==viewSignature(persisted.settings))throw new Error('The analysis setup was not retained. Your current setup is still open. Retry the action.');
    if((next.activeViewId||'')!==(persisted.settings.activeViewId||''))throw new Error('The active saved view was not retained. Restart the backend with the latest version and retry.');
   }
   lastSaved.current=JSON.stringify(next);latest.current={id:project.id,settings:next};setSettings(next);setSaveStatus('Saved locally');
  }catch(issue){setSaveStatus('Save failed');throw issue instanceof TypeError?new Error('Could not confirm the settings save. Your changes are still open. Check the backend connection and retry.'):issue}finally{importingSettings.current=false}
 };
 const resetCurrentView=async()=>{
  const current=latest.current;if(!current?.settings.activeViewId||viewResetting)return;
  setViewResetting(true);
  try{const next=await koboRequest<KoboSettings>(`/projects/${current.id}/views/apply`,{settings:current.settings,viewId:current.settings.activeViewId});await applySharedSettings(next)}finally{setViewResetting(false)}
 };
 const navigate=async(hash:string)=>{try{await saveNow();window.location.hash=hash}catch(e){setError(errorMessage(e));setSaveStatus('Save failed')}};
 const exportExcel=useCurrentCallback(async(question='',excelMode:'native'|'binary'='native')=>{if(!project||!settings||!analysis)return;setExcelOptions({projectId:project.id,projectName:project.name,settings:structuredClone(settings),analysis,question,excelMode})});
 const exportPdf=useCurrentCallback(async(question?:string)=>{if(!project||!settings)return;startKoboExport({projectId:project.id,projectName:project.name,settings,format:'pdf',question,snapshot:analysis||undefined})});
 const changeChartColor=useCurrentCallback((result:KoboResult,target:KoboMarkTarget,color:string|null)=>{if(settings)change({...settings,questions:{...settings.questions,[result.id]:editMarkColor(result,{...questionDefaults,...settings.questions[result.id]},target,color)}})});
 const changeBreakdownDisplay=useCurrentCallback((id:string,display:NonNullable<KoboQuestionSettings['breakdownDisplay']>)=>change({...settings!,questions:{...settings!.questions,[id]:withValueDisplay({...questionDefaults,...settings!.questions[id]},display)}}));
 const reportBusy=loading||!!analysisError||!analysis||analysisSettingsKey!==JSON.stringify(settings);
 const currentProject=project?.id===pid&&settings?{...project,settings}:null;

 const renderFilters=(pinned:boolean)=>currentProject&&settings?<KoboResponseFilters project={currentProject} settings={settings} pinned={pinned} open={filtersOpen} onOpenChange={setFiltersOpen} onChange={change} onChooseFields={()=>setManager('filters')} onSavedViews={()=>setViewsOpen(true)} resettingView={viewResetting} onResetView={()=>void resetCurrentView().catch(issue=>setError(errorMessage(issue)))} onError={setError}/>:null;

 return <KoboWorkspaceShell activeWorkspace={workspaceTab} onWorkspaceChange={setWorkspaceTab} projectId={pid} language={settings?.language||'en'} onNavigate={route=>void navigate(route)} onImport={()=>setImportOpen(true)} dialogs={<>
  {viewsOpen&&currentProject&&settings&&<KoboSavedViews key={pid} project={currentProject} settings={settings} analysis={analysis||undefined} resetting={viewResetting} onResetView={resetCurrentView} onSave={applySharedSettings} onClose={()=>setViewsOpen(false)}/>}
  {populationOpen&&currentProject&&settings&&<KoboPopulationCompare project={currentProject} settings={settings} onClose={()=>setPopulationOpen(false)}/>}
  {qualityOpen&&currentProject&&settings&&<KoboReview project={currentProject} settings={settings} onClose={()=>setQualityOpen(false)} onImport={()=>{setQualityOpen(false);setReviewImport(true)}} onIndicators={id=>{setQualityOpen(false);setIndicatorSelection(id);setIndicatorsOpen(true)}}/>}
  {indicatorsOpen&&currentProject&&settings&&<KoboIndicators initialSelection={indicatorSelection} key={pid} project={currentProject} settings={settings} onSave={applySharedSettings} onClose={()=>setIndicatorsOpen(false)}/>}
  {reportOpen&&currentProject&&analysis&&<KoboReportPrompt key={pid} project={currentProject} analysis={analysis} busy={reportBusy} onClose={()=>setReportOpen(false)}/>}
  {settingsImport&&currentProject&&settings&&<KoboSettingsImport key={pid} project={currentProject} settings={settings} onClose={()=>setSettingsImport(false)} onApply={applySharedSettings}/>}
  {renameProject&&<KoboRenameProject key={renameProject.id} getProject={async()=>currentProject?.id===renameProject.id?structuredClone(currentProject):koboApi.get(renameProject.id)} onApplySettings={async next=>{if(currentProject?.id===renameProject.id)await applySharedSettings(next);else await koboApi.save(renameProject.id,next);await refreshList()}} project={renameProject} onClose={()=>setRenameProject(null)} onSaved={saved=>{setList(current=>current.map(item=>item.id===saved.id?{...item,...saved}:item).sort((a,b)=>b.updated.localeCompare(a.updated)));setProject(current=>current?.id===saved.id?{...current,name:saved.name}:current);setRenameProject(null)}}/>}
  {excelOptions&&<KoboExcelOptions input={excelOptions} onClose={()=>setExcelOptions(null)} onExport={(separateGroups,chartMetric)=>{if(!excelOptions.question&&settings)change({...settings,excelGroups:separateGroups});startKoboExport({projectId:excelOptions.projectId,projectName:excelOptions.projectName,settings:excelOptions.settings,question:excelOptions.question,format:'excel',separateGroups,chartMetric,excelMode:excelOptions.excelMode});setExcelOptions(null)}}/>}
  {reviewImport&&currentProject&&<KoboImportReview project={currentProject} replaceFiles={replaceFiles} onBeforeSave={saveNow} onClose={()=>{setReviewImport(false);setReplaceFiles(false)}} onSaved={p=>{lastSaved.current=JSON.stringify(p.settings);setProject(p);setSettings(p.settings);setSaveStatus('Saved locally');setReviewImport(false);setReplaceFiles(false);void refreshList()}}/>}
  {deleteProject&&<KoboConfirmDialog title="Delete project?" confirmLabel="Delete project" variant="danger" busy={deleting} busyLabel="Deleting…" error={deleteError} onCancel={()=>{setDeleteProject(null);setDeleteError('')}} onConfirm={()=>void removeProject()}><p>Delete <strong>{deleteProject.name}</strong> and its locally saved data?</p><p className="kobo-confirm-note">This action cannot be undone. Your original source files will stay on this computer.</p></KoboConfirmDialog>}
  {importOpen&&<ImportProject onClose={()=>setImportOpen(false)} onError={setError} onImported={p=>{setImportOpen(false);void refreshList();window.location.hash=`#/kobo/${p.id}`}}/>}
  {manager==='questions'&&currentProject&&settings&&<KoboQuestionVisibility key={pid} project={currentProject} settings={settings} renderAnswers={(question,onClose)=><Responses key={question.id} project={currentProject} settings={settings} result={{id:question.id,name:question.name,label:koboLabel(question,settings.language)}} onClose={onClose}/>} onClose={()=>setManager(null)} onApply={(changes,options)=>{change({...mergeVisibility(settings,changes,currentProject.form.questions),...options});setManager(null)}}/>}
  {manager==='filters'&&currentProject&&settings&&<KoboFilterFields key={pid} project={currentProject} settings={settings} onApply={changes=>{const fields=new Set(settings.filterFields),valid=new Set(currentProject.form.questions.map(question=>question.id));for(const[id,selected]of Object.entries(changes))if(valid.has(id)){if(selected)fields.add(id);else fields.delete(id)}change({...settings,filterFields:[...fields]});setManager(null)}} onClose={()=>setManager(null)}/>}
  {drilldown&&drilldown.projectId===pid&&<KoboPivotRecords input={drilldown} onClose={()=>setDrilldown(null)}/>}
  {compare&&compare.projectId===pid&&analysis&&<KoboCompare key={pid} questionId={compare.questionId} analysis={analysis} onDrilldown={openPivotRecords} onClose={()=>setCompare(null)}/>}
  {custom&&currentProject&&settings&&<KoboCustomize result={analysis?.questions.find(q=>q.id===custom.id)||custom} project={currentProject} settings={settings} onApply={draft=>{change({...settings,questions:{...settings.questions,[custom.id]:draft}});setCustom(null)}} onClose={()=>setCustom(null)}/>}
  {bulkOpen&&currentProject&&settings&&analysis&&<KoboBulkCustomize project={currentProject} settings={settings} analysis={analysis} onClose={()=>setBulkOpen(false)} onApply={draft=>{change({...settings,questions:{...settings.questions,...bulkQuestionChanges(currentProject,settings,draft)}});setBulkOpen(false)}}/>}
 </>}>
{error&&<div className="kobo-error glass" role="alert"><span>{error}</span><button className="soft" aria-label="Dismiss error" onClick={()=>setError('')}><X/></button></div>}
  {!pid?<KoboProjects onImported={id=>{void refreshList();window.location.hash=`#/kobo/${id}`}} projects={list} onCreate={()=>setImportOpen(true)} onRename={setRenameProject} onDelete={project=>{setDeleteError('');setDeleteProject(project)}}/>:!currentProject||!settings?projectFailure?.id===pid?<KoboLoadError stage="project" message={projectFailure.message} onRetry={()=>{setProjectFailure(null);setProjectAttempt(value=>value+1)}}/>:<KoboProjectSkeleton stage="project"/>:<>
   <KoboProjectHeader backupBusy={backupBusy} onBackup={()=>{if(backupBusy)return;setBackupBusy(true);void (async()=>{try{await saveNow();await downloadBackup(pid)}catch(e){setError(errorMessage(e))}finally{setBackupBusy(false)}})()}} onPopulation={()=>setPopulationOpen(true)} onQuality={()=>setQualityOpen(true)} onIndicators={()=>{setIndicatorSelection(undefined);setIndicatorsOpen(true)}} project={currentProject} onRename={()=>setRenameProject(currentProject)} counts={analysis} exportDisabled={loading||!analysis?.questions.length} onReupload={()=>{setReplaceFiles(true);setReviewImport(true)}} onReview={()=>setReviewImport(true)} onPdf={()=>void exportPdf()} onExcel={()=>exportExcel()} onBinaryExcel={()=>exportExcel('','binary')}/>
   <KoboMobileWorkspaceSelector value={workspaceTab} onChange={setWorkspaceTab}/>
   {workspaceTab!=='analysis'&&<><div className="kobo-filter-surface kobo-workspace-filters">{renderFilters(false)}</div>{reportBusy&&<p role="status">{analysisError?'Resolve the analysis error to view this workspace.':'Updating analysis...'}</p>}{analysis&&<KoboWorkspaceTools key={pid} project={currentProject} settings={settings} analysis={analysis} tab={workspaceTab} choicesOpen={workspaceTab==='report'?choicePanels.report:choicePanels.overview} onChoicesOpenChange={open=>{if(workspaceTab==='overview'||workspaceTab==='report')setChoicePanels(current=>({...current,[workspaceTab]:open}))}} busy={reportBusy} onChange={change} onSave={saveNow} onApplySettings={applySharedSettings}/>}</>}
   {saveStatus!=='Saved locally'&&<span className="sr-only" role="status">{saveStatus}</span>}
   {analysisError&&<KoboLoadError stage="analysis" message={analysisError} onRetry={()=>{setAnalysisError('');setAnalysisAttempt(value=>value+1)}}/>}
   {!analysis&&!analysisError&&<KoboProjectSkeleton stage="analysis" showHeader={false}/>}
   {analysis&&!analysis.filtered&&<div className="glass kobo-empty"><h2>No responses match these filters</h2><p>Adjust the filters or reset them to return to all submissions.</p><button className="primary" onClick={()=>change({...settings,filters:[]})}><AnimatedActionIcon type="reset"/> Reset filters</button></div>}{analysis&&!analysis.questions.length&&<div className="glass kobo-empty">No visible questions. Open Manage questions or change visibility controls.</div>}
   {workspaceTab==='analysis'&&<div className="kobo-results" aria-busy={loading}>{analysis&&<KoboRendering key={pid}><KoboQuestionGroups renderFilters={renderFilters} analysis={analysis} tableOnly={tableOnly} onTableOnlyChange={setTableOnly} renderTable={(groupId,questionSearch)=><KoboDataExplorer key={pid} project={currentProject} settings={settings} groupId={groupId} questionSearch={questionSearch}/>} tools={groupControls=><><button type="button" className="soft kobo-report-launch" disabled={reportBusy} onClick={()=>setReportOpen(true)}><span className="kobo-report-button-icon" aria-hidden="true"><FileText className="kobo-report-button-document"/><Sparkles className="kobo-report-button-sparkles"/></span>Prepare AI report prompt</button><button className="soft" onClick={()=>setManager("questions")}><Eye/> Manage questions</button><KoboDisplayOptions questionIds={currentProject.form.questions.map(question=>question.id)} settings={settings} onChange={change} onCustomizeAll={()=>setBulkOpen(true)} groups={groupControls} busy={loading}/></>} renderQuestion={q=><KoboDeferredQuestion question={q} tableOnly={tableOnly} eager={q.id===analysis.questions[0]?.id}><QuestionCard colorSettings={settings.questions[q.id]||questionDefaults} onChartColor={changeChartColor} result={q} tableOnly={tableOnly} question={currentProject.form.questions.find(question=>question.id===q.id)} language={settings.language} breakdownDisplay={settings.questions[q.id]?.breakdownDisplay||'both'} onConfigure={setCustom} onCompare={openCompare} onDrilldown={openPivotRecords} onExcel={exportExcel} onPdf={exportPdf} onError={setError} onBreakdownDisplay={changeBreakdownDisplay}/></KoboDeferredQuestion>}/></KoboRendering>}</div>}
  </>}
 </KoboWorkspaceShell>;
}


