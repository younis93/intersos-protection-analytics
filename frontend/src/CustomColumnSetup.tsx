import {dateFilterModeOptions,type DateFilterMode} from './dateFilters';
import CustomPrepareData from './CustomPrepareData';
import ReuploadSettingsChoice,{ReuploadReviewNotice,type ImportReuse} from './ReuploadSettingsChoice';
import {analysisColumns,prunePreparationFilters,type Preparation,type PreparationTab,type CalculatedColumn,type ValidationRule,type ValidationResult,type DuplicateReview,type DuplicateResult} from './customPreparationState';
import CustomImportReview from './CustomImportReview';
import {columnTypes as types} from './CustomColumnControls';
import {AppSelect} from './SelectionControls';
import KoboFilePicker from './KoboFilePicker';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight,Check,Columns3,FileSpreadsheet,LoaderCircle,Search,Upload,X,Eye,Filter,RefreshCw,WandSparkles,Save,ListX} from 'lucide-react';
import {koboRequest} from './koboApi';
import type {KoboProject} from './koboTypes';
import './customAnalysis.css';

type Kind='text'|'number'|'date'|'category'|'multiple';
type Convention='auto'|'uk'|'us'|'iso';
export type CustomColumn={id:string;index:number;header:string;label:string;kind:Kind;included:boolean;group:string;dateFormat:Convention;separator:string;categories:Record<string,string>;invalidAsMissing:boolean;includeTime:boolean;timeLabel:string;preparation?:Preparation;calculated?:boolean};
export type CustomConfig={dateFilterModes?:Record<string,DateFilterMode>;worksheet:string;headerRow:number;dateFormat:Convention;columns:CustomColumn[];filterFields:string[];calculatedColumns?:CalculatedColumn[];validationRules?:ValidationRule[];duplicateReview?:DuplicateReview};
export type CustomProfile={id:string;detected:Kind;missing:number;distinct:number;values:string[];valuesTruncated:boolean;samples:string[];invalid:number;ambiguous:boolean;timeCount:number;changed?:number;examples:{row:number;value:string;reason:string}[];preview:{original:string;value:unknown;time?:string|null;prepared?:unknown}[]};
export type CustomPreview={loading?:boolean;token:string;reuse?:ImportReuse;config:CustomConfig;worksheets:string[];sourcePreview:unknown[][];rows:number;profiles:CustomProfile[];issues:{question:string;message:string;count:number}[];changes:{label:string;change:string}[];validationResults?:ValidationResult[];duplicateResult?:DuplicateResult};
const filterColumns=(config:CustomConfig)=>analysisColumns(config).filter(c=>c.included).flatMap(c=>[{id:c.id,label:c.label,kind:c.kind},...(c.kind==='date'&&c.includeTime?[{id:c.id+'__time',label:c.timeLabel.trim()||c.label+' - Time',kind:'text' as Kind}]:[])]);
const request=<T,>(path:string,body?:unknown,method?:string,signal?:AbortSignal)=>koboRequest<T>(path,body,method,signal,undefined,'custom');
function WorkflowIcon({kind,loading=false}:{kind:'read'|'prepare'|'filters'|'review'|'save';loading?:boolean}){
 const Icon=loading?LoaderCircle:({read:FileSpreadsheet,prepare:WandSparkles,filters:Filter,review:Eye,save:Save}[kind]);
 return <Icon aria-hidden="true" className={`custom-action-icon custom-action-${kind}${loading?' custom-action-loading':''}`}/>;
}
const display=(value:unknown)=>value===null||value===undefined?'Missing':Array.isArray(value)?value.join(', '):String(value);


export default function CustomColumnSetup({project,replaceFile=false,onClose,onSaved,onBeforeSave}:{project?:KoboProject;replaceFile?:boolean;onClose:()=>void;onSaved:(p:KoboProject,reused?:boolean)=>void;onBeforeSave?:()=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef(document.activeElement),token=useRef('');
 const[initial]=useState<CustomConfig|null>(()=>project&&!replaceFile&&project.customConfig?prunePreparationFilters(structuredClone({...project.customConfig,filterFields:project.settings.filterFields,dateFilterModes:project.settings.dateFilterModes||{}})):null);
 const[step,setStep]=useState(project&&!replaceFile?2:0),[preparationTab,setPreparationTab]=useState<PreparationTab>('cleaning'),[returnToReview,setReturnToReview]=useState(false),[name,setName]=useState(project?.name||''),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<CustomPreview|null>(()=>initial?{loading:true,token:'',config:initial,worksheets:[initial.worksheet],sourcePreview:[],rows:0,profiles:[],issues:[],changes:[]}:null),[config,setConfig]=useState<CustomConfig|null>(initial),[selected,setSelected]=useState(initial?.columns[0]?.id||''),[query,setQuery]=useState(''),[filterQuery,setFilterQuery]=useState(''),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState('');
 const[opening,setOpening]=useState(!!project&&!replaceFile),[openAttempt,setOpenAttempt]=useState(0);
 const[refreshing,setRefreshing]=useState(false);
 const[reuse,setReuse]=useState(true),[reviewReasons,setReviewReasons]=useState<string[]>([]);
 const signature=JSON.stringify(config);
 const receive=(p:CustomPreview)=>{token.current=p.token;setPreview(p);setConfig(p.config);setSelected(p.config.columns[0]?.id||'');setChecked(JSON.stringify(p.config))};
 useEffect(()=>{dialog.current?.showModal();return()=>{dialog.current?.close();if(token.current)void request(`/columns/${token.current}`,undefined,'DELETE').catch(()=>{});if(opener.current instanceof HTMLElement)opener.current.focus()}},[]);
 useEffect(()=>{
  if(!project||replaceFile)return;
  let active=true;setOpening(true);setError('');
  void (async()=>{await onBeforeSave?.();if(!active)return;return request<CustomPreview>(`/projects/${project.id}/columns`,{})})().then(p=>{
   if(!p)return;
   if(!active){void request(`/columns/${p.token}`,undefined,'DELETE').catch(()=>{});return}
   token.current=p.token;setPreview(p);setChecked(JSON.stringify(p.config));
   setConfig(current=>!current||JSON.stringify(current)===JSON.stringify(initial)?p.config:current);
   setSelected(current=>p.config.columns.some(c=>c.id===current)?current:p.config.columns[0]?.id||'');
  }).catch(e=>{if(active)setError(String(e.message||e))}).finally(()=>{if(active)setOpening(false)});
  return()=>{active=false};
 },[openAttempt]);
 useEffect(()=>{
  if(opening||(step<2||step>4)||!config||!token.current)return;
  if(signature===checked&&!error){setChecking(false);return}
  const controller=new AbortController();setChecking(true);setError('');
  const timer=setTimeout(()=>{void request<CustomPreview>(`/columns/${token.current}/configure`,config,'POST',controller.signal).then(p=>{if(!controller.signal.aborted){setPreview(p);setChecked(signature)}}).catch(e=>{if(!controller.signal.aborted)setError(String(e.message||e))}).finally(()=>{if(!controller.signal.aborted)setChecking(false)})},350);
  return()=>{clearTimeout(timer);controller.abort()};
 },[signature,step,opening]);
 const act=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const validationComplete=!!token.current&&!opening&&checked===signature&&!checking&&!!config?.columns.some(c=>c.included)&&!error;
 const valid=validationComplete&&!preview?.issues.length;
 const editFromReview=(id:string)=>{setQuery('');setReturnToReview(true);if((config?.calculatedColumns||[]).some(c=>c.id===id)){setPreparationTab('calculations');setStep(2);requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>(`[data-calculation-id="${id}"]`)?.scrollIntoView({block:'start'}))}else{setSelected(id);setPreparationTab('cleaning');setStep(2);requestAnimationFrame(()=>dialog.current?.querySelector<HTMLInputElement>('[aria-label="Column display label"]')?.focus())}};
 useEffect(()=>{const body=dialog.current?.querySelector('.custom-setup-body');if(body)body.scrollTop=0},[step]);
 const steps=['Choose file','Worksheet & header','Prepare data','Choose filters','Review & save'];
 const nextSource=()=>void act(async()=>{if(!config)return;const p=await request<CustomPreview>(`/columns/${token.current}/configure`,config);receive(p);setPreparationTab('cleaning');setStep(2)});
 const readFile=()=>{if(!file||!name.trim()||busy)return;void act(async()=>{
  await onBeforeSave?.();setReviewReasons([]);
  if(token.current){await request(`/columns/${token.current}`,undefined,'DELETE');token.current=''}
  const body=new FormData();body.append('data',file!);if(project)body.append('projectId',project.id);
  const next=await request<CustomPreview>('/columns/preview',body);receive(next);
  if(project&&replaceFile&&reuse){
   if(next.reuse?.eligible){
    try{const updated=await request<KoboProject>('/columns/confirm',{token:next.token,name,config:next.config,reuseOnly:true});token.current='';onSaved(updated,true);return}
    catch(e){setReviewReasons([e instanceof Error?e.message:String(e)]);setStep(4);return}
   }
   setReviewReasons(next.reuse?.reasons||['Review this upload before updating data.']);
   setStep(!next.config.columns.length||next.config.worksheet!==project.customConfig?.worksheet?1:4);
  }else setStep(1);
 })};
 return createPortal(<dialog ref={dialog} className="custom-setup" aria-labelledby="custom-setup-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
  <header className="custom-setup-header"><div className="custom-setup-brand"><span><Columns3/></span><div><small>CUSTOM ANALYSIS</small><h1 id="custom-setup-title">{project?'Prepare data':'Create an analysis project'}</h1></div></div><button type="button" className="soft" aria-label="Close prepare data" disabled={busy} onClick={onClose}><X/></button></header>
  <nav className="custom-steps" aria-label="Import progress">{steps.map((label,i)=><span key={label} aria-current={i===step?'step':undefined} className={i===step?'current':i<step?'done':''}><b>{i<step?<Check size={15}/>:i+1}</b>{label}</span>)}</nav>
  {error&&<p className="error custom-error" role="alert">{error}</p>}
  {error&&project&&!replaceFile&&!token.current&&<div className="custom-error"><button type="button" className="soft" disabled={opening} onClick={()=>setOpenAttempt(value=>value+1)}>Retry preview</button></div>}
  {busy&&step!==0&&<p className="custom-working" role="status"><LoaderCircle className="kobo-restore-spinner"/> {step===4?'Saving project...':'Reading and validating data...'}</p>}
  <div className="custom-setup-body" aria-busy={busy}>
   {!!reviewReasons.length&&<ReuploadReviewNotice reasons={reviewReasons}/>}
   {step===0&&<section className="custom-upload glass"><div className="custom-upload-intro"><span className="custom-upload-symbol"><FileSpreadsheet aria-hidden="true"/></span><div><h2>{replaceFile?'Replace source data':'Start with your spreadsheet'}</h2><p>Import an Excel workbook or CSV file. Your data stays on this computer.</p></div></div><label className="kobo-field">Project name<input value={name} maxLength={200} disabled={!!project||busy} onChange={e=>setName(e.target.value)}/></label>{project&&replaceFile&&<ReuploadSettingsChoice reuse={reuse} onChange={setReuse} disabled={busy}/>}<KoboFilePicker className="custom-file-picker" title="Choose an XLSX or CSV file" description="One worksheet per project" accept=".xlsx,.csv" format="XLSX / CSV" file={file} icon={<Upload/>} disabled={busy} inputLabel="Choose analysis data" onChange={chosen=>{setFile(chosen);if(!name&&chosen)setName(chosen.name.replace(/\.(xlsx|csv)$/i,''))}}/></section>}
   {step===1&&preview&&config&&<section className="custom-source"><h2>Select your data table</h2><p>Choose the worksheet and the row containing column headers. Data begins on the following row.</p><div className="custom-source-options"><AppSelect label="Worksheet" value={config.worksheet} options={preview.worksheets.map(s=>[s,s])} onChange={value=>setConfig({...config,worksheet:value})} disabled={busy} searchable/><label className="kobo-field">Header row<input type="number" min={1} max={100000} value={config.headerRow} onChange={e=>setConfig({...config,headerRow:Math.max(1,Number(e.target.value)||1)})}/></label><button type="button" className="soft" disabled={busy} aria-busy={refreshing} onClick={()=>{setRefreshing(true);void act(async()=>{receive(await request<CustomPreview>(`/columns/${token.current}/configure`,config))}).finally(()=>setRefreshing(false))}}><RefreshCw aria-hidden="true" className={`custom-action-icon custom-refresh-icon${refreshing?' custom-action-loading':''}`}/>{refreshing?'Refreshing preview...':'Refresh preview'}</button></div><div className="custom-table-wrap"><table><caption>First 20 source rows - refresh after changing worksheet</caption><tbody>{preview.sourcePreview.map((row,i)=><tr key={i} className={i+1===config.headerRow?'custom-header-row':''}><th>{i+1}</th>{row.map((v,j)=><td key={j} dir="auto"><span className="custom-source-value" title={display(v)==='Missing'?'':display(v)}>{display(v)==='Missing'?'':display(v)}</span></td>)}</tr>)}</tbody></table></div></section>}
   {step===2&&config&&preview&&<CustomPrepareData selected={selected} onSelect={setSelected} query={query} onQuery={setQuery} config={config} preview={preview} tab={preparationTab} onTab={setPreparationTab} busy={busy} onChange={next=>setConfig(prunePreparationFilters(next))}/>}
   {step===3&&config&&<section className="custom-filter-step glass"><header className="custom-panel-heading"><Filter/><div><h2>Choose filter columns</h2><p>Choose which columns appear in the analysis filter panel. No filters are selected by default.</p></div></header><div className="custom-filter-toolbar"><label className="custom-search"><Search size={17}/><input aria-label="Search filter columns" placeholder="Search columns..." value={filterQuery} onChange={e=>setFilterQuery(e.target.value)}/></label><strong role="status">{config.filterFields.length} selected</strong><button type="button" className="soft" disabled={!config.filterFields.length} onClick={()=>setConfig({...config,filterFields:[],dateFilterModes:{}})}><ListX aria-hidden="true"/>Clear selection</button></div><div className="custom-filter-list">{filterColumns(config).filter(c=>c.label.toLocaleLowerCase().includes(filterQuery.toLocaleLowerCase())).map(c=><div key={c.id} className={`custom-filter-option${config.filterFields.includes(c.id)?' selected':''}`}><label><input type="checkbox" aria-label={`Use ${c.label} as a filter`} checked={config.filterFields.includes(c.id)} onChange={e=>setConfig(prunePreparationFilters({...config,filterFields:e.target.checked?[...config.filterFields,c.id]:config.filterFields.filter(id=>id!==c.id)}))}/><span><strong dir="auto">{c.label}</strong><small>{types.find(([kind])=>kind===c.kind)?.[1]}{c.id.endsWith('__time')?' · Extracted time':''}</small></span></label>{c.kind==='date'&&config.filterFields.includes(c.id)&&<AppSelect label="Date filter display" ariaLabel={`Date filter display for ${c.label}`} value={config.dateFilterModes?.[c.id]||'range'} options={dateFilterModeOptions} onChange={value=>setConfig({...config,dateFilterModes:{...config.dateFilterModes,[c.id]:value as DateFilterMode}})}/>}</div>)}</div>{!config.filterFields.length&&<p className="custom-filter-empty">You can continue without filters and add them later using Choose fields.</p>}</section>}
   {step===4&&config&&preview&&<CustomImportReview onDuplicates={()=>{setPreparationTab('duplicates');setReturnToReview(true);setStep(2)}} onChange={setConfig} onRules={()=>{setPreparationTab('rules');setReturnToReview(true);setStep(2)}} busy={busy} config={config} preview={preview} name={name} onEdit={editFromReview} onFilters={()=>{setReturnToReview(false);setStep(3)}}/>}
  </div>
  <footer className="custom-setup-footer"><button type="button" className="soft" onClick={onClose} disabled={busy}><X aria-hidden="true"/>Cancel</button><div>{step>0&&<button type="button" className="soft" disabled={busy||opening} onClick={()=>{setReturnToReview(false);setStep(step-1)}}><ArrowLeft/>Back</button>}{step===0?<button type="button" className="primary custom-read-button" aria-busy={busy} aria-label={busy?'Reading and validating data…':project&&replaceFile&&reuse?'Update data':'Read file'} disabled={!file||!name.trim()||busy} onClick={readFile}><WorkflowIcon kind="read" loading={busy}/><span role="status" aria-live="polite" aria-atomic="true">{busy?'Reading & validating…':project&&replaceFile&&reuse?'Update data':'Read file'}</span></button>:step===1?<button type="button" className="primary" disabled={busy} onClick={nextSource}><WorkflowIcon kind="prepare" loading={busy}/>{busy?'Preparing data...':'Prepare data'}<ArrowRight aria-hidden="true" className="custom-next-arrow"/></button>:step===2?<><span className="custom-validation" role="status">{checking?'Checking values...':preview?.issues.length?`${preview.issues.length} issues need attention`:valid?'Ready to choose filters':'Review preparation settings'}</span><button type="button" className="primary" disabled={busy||!validationComplete} onClick={()=>{setStep(returnToReview?4:3);setReturnToReview(false)}}><WorkflowIcon kind={returnToReview?'review':'filters'} loading={checking}/>{returnToReview?'Return to review':'Choose filters'}<ArrowRight aria-hidden="true" className="custom-next-arrow"/></button></>:step===3?<button type="button" className="primary" disabled={busy||!validationComplete} onClick={()=>setStep(4)}><WorkflowIcon kind="review" loading={checking}/>Review<ArrowRight aria-hidden="true" className="custom-next-arrow"/></button>:<button type="button" className="primary" disabled={busy||!valid} onClick={()=>void act(async()=>{await onBeforeSave?.();const p=await request<KoboProject>('/columns/confirm',{token:token.current,name,config});token.current='';onSaved(p)})}><WorkflowIcon kind="save" loading={busy}/>{busy?'Saving project...':project?'Apply changes':'Create project'}</button>}</div></footer>
 </dialog>,document.body);
}
