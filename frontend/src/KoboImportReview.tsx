import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,FileSpreadsheet,Upload,X} from 'lucide-react';
import {koboApi} from './koboApi';
import type {KoboMapping,KoboPreview,KoboProject} from './koboTypes';
import KoboMappingReview from './KoboMappingReview';
import KoboUploadCard from './KoboUploadCard';

export default function KoboImportReview({project,onClose,onSaved,onBeforeSave,replaceFiles=false}:{project:KoboProject;replaceFiles?:boolean;onClose:()=>void;onSaved:(project:KoboProject)=>void;onBeforeSave?:()=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),token=useRef(''),request=useRef(0),formInput=useRef<HTMLInputElement>(null),dataInput=useRef<HTMLInputElement>(null);
 const[sourceForm,setSourceForm]=useState<File>(),[sourceData,setSourceData]=useState<File>();
 const[preview,setPreview]=useState<KoboPreview|null>(null),[mappings,setMappings]=useState<KoboMapping[]>([]),[policies,setPolicies]=useState<Record<string,string>>({}),[accept,setAccept]=useState(false),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const load=async(form=sourceForm,data=sourceData)=>{
  const sequence=++request.current;setBusy(true);setError('');
  try{
   const next=await koboApi.review(project.id,form,data);
   if(sequence!==request.current){void koboApi.cancelImport(next.token).catch(()=>{});return}
   const previous=token.current;token.current=next.token;if(previous)void koboApi.cancelImport(previous).catch(()=>{});
   setPreview(next);setMappings(next.mappings);setPolicies(next.policies||{});setAccept(false);
  }catch(e){if(sequence===request.current)setError(e instanceof Error?e.message:String(e))}finally{if(sequence===request.current)setBusy(false)}
 };
 const choose=(kind:'form'|'data',file:File)=>{
  if(kind==='form')setSourceForm(file);else setSourceData(file);
  setError('');setPreview(null);setAccept(false);
  request.current++;const previous=token.current;token.current='';if(previous)void koboApi.cancelImport(previous).catch(()=>{});
  if(!replaceFiles)void load(kind==='form'?file:sourceForm,kind==='data'?file:sourceData);
 };
 useEffect(()=>{const node=dialog.current;node?.showModal();if(!replaceFiles)void load();return()=>{request.current++;node?.close();if(token.current)void koboApi.cancelImport(token.current).catch(()=>{})}},[]);
 const save=async()=>{if(!preview||busy||saving)return;setSaving(true);setError('');try{await onBeforeSave?.();onSaved(await koboApi.confirm(preview.token,project.name,mappings,policies,accept))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}};
 const formCard=<KoboUploadCard title="Form" description="XLSForm (.xlsx)" format="XLSX" icon={<FileSpreadsheet aria-hidden="true"/>} file={sourceForm} emptyLabel="Using saved form"><input ref={formInput} type="file" hidden accept=".xlsx" aria-label="Replacement XLSForm" disabled={busy||saving} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose('form',file)}}/><div className="kobo-upload-card-actions"><button className="primary" type="button" disabled={busy||saving} onClick={()=>formInput.current?.click()}><Upload aria-hidden="true"/>{sourceForm?'Change file':'Choose form file'}</button></div></KoboUploadCard>;
 return <dialog ref={dialog} className="kobo-dialog glass is-wide kobo-import-dialog kobo-repair-dialog" aria-label="Review and correct import" onCancel={e=>{e.preventDefault();if(!saving)onClose()}}>
  <header><h2>{replaceFiles?'Re-upload form or data':'Review and correct import'}</h2><button type="button" className="soft" disabled={saving} aria-label="Close review" onClick={onClose}><X/></button></header>
  {(replaceFiles||preview)&&<section className="kobo-review-sources" aria-label="Saved source files">
   <div className="kobo-review-loaded">{preview?<CheckCircle2 aria-hidden="true"/>:<Upload aria-hidden="true"/>}<div><strong>{replaceFiles?preview?'Replacement files ready for review':'Replace only what you need':'Saved files loaded'}</strong><p>{replaceFiles?'Choose a new form, new response data, or both. Any file you do not replace will keep its saved version.':'No upload needed. Review your columns and answer checks below.'}</p></div></div>
   {preview&&<details className="kobo-review-source-details"><summary>Source version details</summary><div><p><strong>Form version:</strong> {preview.expectedVersion||'Not specified'}</p><p>{Object.keys(preview.sourceVersions||{}).length?`Response versions: ${Object.entries(preview.sourceVersions!).map(([version,count])=>`${version} (${count} rows)`).join(', ')}`:'No response version values were found.'}</p><p>Review the matched columns and answer checks to confirm that the saved form fits your data.</p></div></details>}
   {replaceFiles?<><div className="kobo-reupload-options">
    {formCard}
    <KoboUploadCard title="Response data" description="Excel or CSV (.xlsx, .csv)" format="XLSX / CSV" icon={<FileSpreadsheet aria-hidden="true"/>} file={sourceData} emptyLabel="Using saved data"><input ref={dataInput} type="file" hidden accept=".xlsx,.csv" aria-label="Replacement response data" disabled={busy||saving} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose('data',file)}}/><div className="kobo-upload-card-actions"><button className="primary" type="button" disabled={busy||saving} onClick={()=>dataInput.current?.click()}><Upload aria-hidden="true"/>{sourceData?'Change file':'Choose response file'}</button></div></KoboUploadCard>
   </div><p>{preview?'Review the results below, then select Apply corrections to save. Close this window to discard changes.':'Select Review files when your replacements are ready. Your saved project stays unchanged until you apply corrections.'}</p></>:<details className="kobo-review-source-details"><summary>Replace form (optional)</summary><div><p>Only use this if you have a corrected XLSForm. Your saved form is used by default.</p>{formCard}<p>Replacements are saved when you select Apply corrections. Close this window to discard changes.</p></div></details>}
  </section>}
  {!preview?<>{busy&&<p role="status">{replaceFiles?'Reading replacement files…':'Reading saved source files…'}</p>}{error&&<p className="error" role="alert">{error}</p>}{!replaceFiles&&!busy&&<button className="soft" onClick={()=>void load()}>Try again</button>}</>:<><KoboMappingReview editing preview={preview} mappings={mappings} onChange={setMappings} policies={policies} onPoliciesChange={setPolicies} acceptInvalid={accept} onAcceptInvalidChange={setAccept} busy={busy||saving} busyLabel="Applying corrections…" error={error} onCancel={onClose} onConfirm={()=>void save()}/></>}
  {!preview&&replaceFiles&&<footer className="kobo-dialog-actions"><div className="kobo-dialog-action-buttons"><button type="button" className="soft" disabled={busy||saving} onClick={onClose}>Cancel</button>{!preview&&<button type="button" className="primary" disabled={busy||saving||(!sourceForm&&!sourceData)} onClick={()=>void load()}>{busy?'Reading replacement files…':'Review files'}</button>}</div></footer>}
 </dialog>;
}
