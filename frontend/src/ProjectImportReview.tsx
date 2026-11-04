import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FolderInput,LoaderCircle,X} from 'lucide-react';
import {analysisWorkspace,koboRequest} from './koboApi';
import KoboUpdateReview,{type UpdateMatching} from './KoboUpdateReview';
import type {KoboProject} from './koboTypes';
import './projectTransferDialog.css';

export type ProjectImportPreview={token:string;name:string;includesSettings:boolean;records:number;fields:number;projects:{id:string;name:string;updated:string}[]};
export default function ProjectImportReview({preview,filename,onClose,onImported}:{preview:ProjectImportPreview;filename:string;onClose:()=>void;onImported:(id:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),id=useId(),running=useRef(false),cleanup=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),workspace=useRef(analysisWorkspace()).current;
 const[target,setTarget]=useState(''),[updating,setUpdating]=useState(false),[policy,setPolicy]=useState<'file'|'defaults'|'keep'>(preview.includesSettings?'file':'defaults'),[matching,setMatching]=useState<UpdateMatching|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checking,setChecking]=useState(true),[settingsIssues,setSettingsIssues]=useState<string[]>([]);
 const destination=preview.projects.find(project=>project.id===target);
 const choice={projectId:updating?target:'',settingsPolicy:policy,expectedUpdated:updating?destination?.updated||'':''};
 const close=()=>{if(running.current)return;void koboRequest(`/backups/${preview.token}`,undefined,'DELETE').catch(()=>{});onClose()};
 useEffect(()=>{clearTimeout(cleanup.current);const opener=document.activeElement;dialog.current?.showModal();return()=>{dialog.current?.close();cleanup.current=setTimeout(()=>{void koboRequest(`/backups/${preview.token}`,undefined,'DELETE',undefined,undefined,workspace).catch(()=>{})},0);if(opener instanceof HTMLElement&&opener.isConnected)opener.focus()}},[preview.token,workspace]);
 useEffect(()=>{
  if(updating)return;
  const controller=new AbortController();setChecking(true);setSettingsIssues([]);setError('');
  void koboRequest<{settingsIssues:string[]}>(`/backups/${preview.token}/review`,{settingsPolicy:policy},'POST',controller.signal).then(result=>setSettingsIssues(result.settingsIssues)).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Unable to check project settings.')}).finally(()=>{if(!controller.signal.aborted)setChecking(false)});
  return()=>controller.abort();
 },[preview.token,policy,updating]);
 const submit=async()=>{
  if(running.current||(updating?(!destination||!matching):(checking||!!settingsIssues.length)))return;
  running.current=true;setBusy(true);setError('');
  try{const project=await koboRequest<KoboProject>(`/backups/${preview.token}/confirm`,{...choice,matching});onImported(project.id);onClose()}
  catch(reason){setError(reason instanceof Error?reason.message:'Unable to import this project.')}
  finally{running.current=false;setBusy(false)}
 };
 const selectMode=(update:boolean)=>{setUpdating(update);setTarget('');setPolicy(update?'keep':preview.includesSettings?'file':'defaults');setMatching(null);setError('')};
 return createPortal(<dialog ref={dialog} className="glass project-transfer-dialog project-import-review" aria-labelledby={`${id}-title`} aria-busy={busy} onCancel={event=>{event.preventDefault();close()}}>
  <header><span className="project-transfer-emblem"><FolderInput aria-hidden="true"/></span><button type="button" className="soft" aria-label="Close project import" disabled={busy} onClick={close}><X aria-hidden="true"/></button></header>
  <h2 id={`${id}-title`}>Import project</h2><p>Review the destination and settings before applying.</p>
  <p className="project-transfer-file"><strong dir="auto">{filename}</strong><br/>{preview.records.toLocaleString()} records · {preview.fields.toLocaleString()} fields · {preview.includesSettings?'Data and settings':'Data only'}</p>
  <fieldset className="project-content-options" disabled={busy}><legend>Destination</legend>
   <label><input type="radio" name={`${id}-destination`} checked={!updating} onChange={()=>selectMode(false)}/><span><strong>Create new project</strong><small dir="auto">{preview.name}</small></span></label>
   <label><input type="radio" name={`${id}-destination`} checked={updating} disabled={!preview.projects.length} onChange={()=>selectMode(true)}/><span><strong>Update existing project</strong><small>Replace its dataset and keep its project name.</small></span></label>
  </fieldset>
  {updating&&<label className="project-destination">Project to update<select aria-label="Project to update" disabled={busy} value={target} onChange={event=>{setTarget(event.target.value);setMatching(null);setError('')}}><option value="">Choose a project</option>{preview.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
  <fieldset className="project-content-options" disabled={busy}><legend>Settings</legend>
   <label><input type="radio" name={`${id}-settings`} checked={policy===(updating?'keep':'defaults')} onChange={()=>{setPolicy(updating?'keep':'defaults');setMatching(null)}}/><span><strong>{updating?'Keep current settings':'Use default settings'}</strong><small>{updating?'Retain compatible analysis settings in the destination.':'Start a fresh analysis with corrected and cleaned data.'}</small></span></label>
   <label><input type="radio" name={`${id}-settings`} checked={policy==='file'} disabled={!preview.includesSettings} onChange={()=>{setPolicy('file');setMatching(null)}}/><span><strong>Use settings from file</strong><small>{preview.includesSettings?updating?'Replace the destination analysis settings.':'Restore the saved project setup.':'Unavailable - this file contains data only.'}</small></span></label>
  </fieldset>
  {updating&&destination&&<fieldset disabled={busy}><KoboUpdateReview key={`${target}:${policy}`} endpoint={`/backups/${preview.token}/review`} body={choice} keepSettings={policy==='keep'} onDecision={setMatching}/></fieldset>}
  {!updating&&checking&&<p role="status">Checking project settings...</p>}
  {!updating&&settingsIssues.length>0&&<div className="project-transfer-error" role="alert"><strong>Settings need attention</strong>{settingsIssues.map(issue=><p key={issue}>{issue}</p>)}<p>Choose default settings to start a fresh analysis.</p></div>}
  <p className="project-protection-help" aria-live="polite">{updating?destination?`Update ${destination.name}`:'Choose a destination project':`Create ${preview.name}`} · {policy==='keep'?'Keep current settings':policy==='file'?'Use settings from file':'Use default settings'}</p>
  {error&&<p className="project-transfer-error" role="alert">{error}</p>}
  {busy&&<p role="status">Applying project import...</p>}
  <footer><button type="button" className="soft" disabled={busy} onClick={close}>Cancel</button><button type="button" className="primary" disabled={busy||(updating?(!destination||!matching):(checking||!!settingsIssues.length))} onClick={()=>void submit()}>{busy?<LoaderCircle className="project-transfer-spinner" aria-hidden="true"/>:<FolderInput aria-hidden="true"/>}{updating?'Apply update':'Create project'}</button></footer>
 </dialog>,document.body);
}
