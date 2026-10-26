import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,FileSpreadsheet,FileSearch,LoaderCircle,Upload,X} from 'lucide-react';
import {koboApi} from './koboApi';
import type {KoboMapping,KoboPreview,KoboProject,KoboReviewConfig} from './koboTypes';
import KoboMappingReview from './KoboMappingReview';
import KoboUploadCard from './KoboUploadCard';
import KoboConfirmDialog from './KoboConfirmDialog';
import ReuploadSettingsChoice,{ReuploadReviewNotice} from './ReuploadSettingsChoice';

export default function KoboImportReview({project,onClose,onSaved,onBeforeSave,replaceFiles=false}:{project:KoboProject;replaceFiles?:boolean;onClose:()=>void;onSaved:(project:KoboProject,reused?:boolean)=>void;onBeforeSave?:()=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),token=useRef(''),request=useRef(0),formInput=useRef<HTMLInputElement>(null),dataInput=useRef<HTMLInputElement>(null);
 const[confirmSaved,setConfirmSaved]=useState(false),[loadMode,setLoadMode]=useState<'saved'|'replacement'>('saved'),[loadedMode,setLoadedMode]=useState<'saved'|'replacement'>('saved'),[failedLoad,setFailedLoad]=useState(false);
 const[reuse,setReuse]=useState(true),[reviewReasons,setReviewReasons]=useState<string[]>([]);
 const[sourceForm,setSourceForm]=useState<File>(),[sourceData,setSourceData]=useState<File>();
 const[preview,setPreview]=useState<KoboPreview|null>(null),[mappings,setMappings]=useState<KoboMapping[]>([]),[policies,setPolicies]=useState<Record<string,string>>({}),[accept,setAccept]=useState(false),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const[reviewConfig,setReviewConfig]=useState<KoboReviewConfig>({addedQuestions:[],choiceOverrides:{}});
 const load=async(mode:'saved'|'replacement',form?:File,data?:File)=>{
  const sequence=++request.current;setBusy(true);setError('');setFailedLoad(false);setLoadMode(mode);setReviewReasons([]);
  try{
   await onBeforeSave?.();
   if(sequence!==request.current)return;
   const next=await koboApi.review(project.id,mode==='saved'?undefined:form,mode==='saved'?undefined:data);
   if(sequence!==request.current){void koboApi.cancelImport(next.token).catch(()=>{});return}
   const previous=token.current;token.current=next.token;if(previous)void koboApi.cancelImport(previous).catch(()=>{});
   setLoadedMode(mode);if(mode==='saved'){setSourceForm(undefined);setSourceData(undefined)}
   const showReview=()=>{setPreview(next);setReviewConfig(next.reviewConfig||{addedQuestions:[],choiceOverrides:{}});setMappings(next.mappings);setPolicies(next.policies||{});setAccept(false)};
   if(mode==='replacement'&&replaceFiles&&reuse){
    if(next.reuse?.eligible){
     setSaving(true);
     try{const updated=await koboApi.confirm(next.token,project.name,next.mappings,next.policies||{},false,undefined,next.reviewConfig,true);token.current='';onSaved(updated,true);return}
     catch(e){showReview();setReviewReasons([e instanceof Error?e.message:String(e)]);setError('');return}
     finally{setSaving(false)}
    }
    setReviewReasons(next.reuse?.reasons||['Review this upload before updating data.']);
   }
   showReview();
  }catch(e){if(sequence===request.current){setFailedLoad(true);setError(e instanceof Error?e.message:String(e))}}finally{if(sequence===request.current)setBusy(false)}
 };
 const choose=(kind:'form'|'data',file:File)=>{
  if(kind==='form')setSourceForm(file);else setSourceData(file);
  setError('');setFailedLoad(false);setPreview(null);setAccept(false);setReviewReasons([]);
  request.current++;const previous=token.current;token.current='';if(previous)void koboApi.cancelImport(previous).catch(()=>{});
  if(!replaceFiles)void load('replacement',kind==='form'?file:sourceForm,kind==='data'?file:sourceData);
 };
 useEffect(()=>{const node=dialog.current,opener=document.activeElement;node?.showModal();if(!replaceFiles)void load('saved');return()=>{request.current++;node?.close();if(token.current)void koboApi.cancelImport(token.current).catch(()=>{});if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true})}},[]);
 useEffect(()=>{
  if(!preview||busy||saving)return;
  const frame=requestAnimationFrame(()=>{
   const target=dialog.current?.querySelector<HTMLElement>(reviewReasons.length?'.reupload-review-notice':'.kobo-mapping-tabs [aria-selected="true"]');
   target?.focus({preventScroll:true});target?.scrollIntoView({block:'start'});
  });
  return()=>cancelAnimationFrame(frame);
 },[preview?.token,busy,saving]);
 const reviewSaved=()=>{
  if(busy||saving)return;
  const dirty=preview&&(JSON.stringify(mappings)!==JSON.stringify(preview.mappings)||JSON.stringify(policies)!==JSON.stringify(preview.policies||{})||JSON.stringify(reviewConfig)!==JSON.stringify(preview.reviewConfig||{addedQuestions:[],choiceOverrides:{}})||accept||!!dialog.current?.querySelector('.kobo-choice-review'));
  if(sourceForm||sourceData||dirty)setConfirmSaved(true);else void load('saved');
 };
 const save=async()=>{if(!preview||busy||saving)return;setSaving(true);setError('');try{await onBeforeSave?.();onSaved(await koboApi.confirm(preview.token,project.name,mappings,policies,accept,undefined,reviewConfig))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}};
 const formCard=<KoboUploadCard title="Form" description="XLSForm (.xlsx)" format="XLSX" icon={<FileSpreadsheet aria-hidden="true"/>} file={sourceForm} emptyLabel="Using saved form"><input ref={formInput} type="file" hidden accept=".xlsx" aria-label="Replacement XLSForm" disabled={busy||saving} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose('form',file)}}/><div className="kobo-upload-card-actions"><button className="primary" type="button" disabled={busy||saving} onClick={()=>formInput.current?.click()}><Upload aria-hidden="true"/>{sourceForm?'Change file':'Choose form file'}</button></div></KoboUploadCard>;
 return <dialog ref={dialog} className="kobo-dialog glass is-wide kobo-import-dialog kobo-repair-dialog" aria-label="Review and correct import" onCancel={e=>{e.preventDefault();if(!saving)onClose()}}>
  <header><h2>{replaceFiles?'Re-upload form or data':'Review and correct import'}</h2><button type="button" className="soft" disabled={saving} aria-label="Close review" onClick={onClose}><X/></button></header>
  <div className="kobo-review-scroll" role="region" aria-label="Import review content" tabIndex={0}>
  {(replaceFiles||preview)&&<section className="kobo-review-sources" aria-label="Saved source files">
   <div className="kobo-review-loaded">{preview?<CheckCircle2 aria-hidden="true"/>:<Upload aria-hidden="true"/>}<div><strong>{replaceFiles?preview?(loadedMode==='saved'?'Current saved files ready for review':'Replacement files ready for review'):'Replace only what you need':'Saved files loaded'}</strong><p>{replaceFiles?'Choose a new form, new response data, or both. Any file you do not replace will keep its saved version.':'No upload needed. Review your columns and answer checks below.'}</p></div></div>
   {preview&&<details className="kobo-review-source-details"><summary>Source version details</summary><div><p><strong>Form version:</strong> {preview.expectedVersion||'Not specified'}</p><p>{Object.keys(preview.sourceVersions||{}).length?`Response versions: ${Object.entries(preview.sourceVersions!).map(([version,count])=>`${version} (${count} rows)`).join(', ')}`:'No response version values were found.'}</p><p>Review the matched columns and answer checks to confirm that the saved form fits your data.</p></div></details>}
   {replaceFiles?<><ReuploadSettingsChoice reuse={reuse} onChange={setReuse} disabled={busy||saving}/><section className="kobo-review-current-files" aria-label="Review current saved files"><div><strong>Review current saved files</strong><p>Review the form and response data currently saved in this project. No new upload is needed.</p></div><button className="soft" type="button" aria-label="Review current saved files" aria-busy={busy&&loadMode==='saved'} disabled={busy||saving} onClick={reviewSaved}>{busy&&loadMode==='saved'?<LoaderCircle className="kobo-read-spinner" aria-hidden="true"/>:<FileSearch aria-hidden="true"/>}{busy&&loadMode==='saved'?'Reading saved files...':'Review current saved files'}</button></section><div className="kobo-reupload-options">
    {formCard}
    <KoboUploadCard title="Response data" description="Excel or CSV (.xlsx, .csv)" format="XLSX / CSV" icon={<FileSpreadsheet aria-hidden="true"/>} file={sourceData} emptyLabel="Using saved data"><input ref={dataInput} type="file" hidden accept=".xlsx,.csv" aria-label="Replacement response data" disabled={busy||saving} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose('data',file)}}/><div className="kobo-upload-card-actions"><button className="primary" type="button" disabled={busy||saving} onClick={()=>dataInput.current?.click()}><Upload aria-hidden="true"/>{sourceData?'Change file':'Choose response file'}</button></div></KoboUploadCard>
   </div><p>{preview?'Review the results below, then select Apply corrections to save. Close this window to discard changes.':reuse?'Select Update data to validate your file and reuse the previous settings. Changes or issues will open review.':'Select Review files when your replacements are ready. Your saved project stays unchanged until you apply corrections.'}</p></>:<details className="kobo-review-source-details"><summary>Replace form (optional)</summary><div><p>Only use this if you have a corrected XLSForm. Your saved form is used by default.</p>{formCard}<p>Replacements are saved when you select Apply corrections. Close this window to discard changes.</p></div></details>}
  </section>}
  {!!reviewReasons.length&&<ReuploadReviewNotice reasons={reviewReasons}/>}
  {busy&&<p role="status">{loadMode==='saved'?'Reading current saved files...':'Reading replacement files...'}</p>}
  {failedLoad&&<div className="kobo-review-load-error" role="alert"><p>Could not load {loadMode==='saved'?'the current saved files':'replacement files'}. {error}</p><button className="soft" type="button" disabled={busy||saving} onClick={()=>void load(loadMode,sourceForm,sourceData)}>Retry {loadMode==='saved'?'saved files':'replacement files'}</button></div>}
  {!preview?<>{!failedLoad&&error&&<p className="error" role="alert">{error}</p>}{!replaceFiles&&!busy&&!failedLoad&&<button className="soft" onClick={()=>void load('saved')}>Try again</button>}</>:<><KoboMappingReview key={preview.token} reviewConfig={reviewConfig} onReviewConfigChange={setReviewConfig} editing preview={preview} mappings={mappings} onChange={setMappings} policies={policies} onPoliciesChange={setPolicies} acceptInvalid={accept} onAcceptInvalidChange={setAccept} busy={busy||saving} busyLabel="Applying corrections…" error={failedLoad?'':error} onCancel={onClose} onConfirm={()=>void save()}/></>}
  {!preview&&replaceFiles&&<footer className="kobo-dialog-actions"><div className="kobo-dialog-action-buttons"><button type="button" className="soft" disabled={busy||saving} onClick={onClose}>Cancel</button>{!preview&&<button type="button" className="primary" disabled={busy||saving||(!sourceForm&&!sourceData)} onClick={()=>void load('replacement',sourceForm,sourceData)}>{busy?'Reading replacement files…':reuse?'Update data':'Review files'}</button>}</div></footer>}
  </div>
  {confirmSaved&&<KoboConfirmDialog title="Review saved files instead?" confirmLabel="Discard draft and review saved files" onCancel={()=>setConfirmSaved(false)} onConfirm={()=>{setConfirmSaved(false);void load('saved')}}><p>Your selected replacement files and any staged review changes will be discarded when the saved files load successfully. Your saved project stays unchanged.</p></KoboConfirmDialog>}
 </dialog>;
}
