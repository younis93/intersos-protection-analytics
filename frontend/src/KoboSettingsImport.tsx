import {useEffect,useRef,useState} from 'react';
import {FileJson,Upload,X} from 'lucide-react';
import {koboApi} from './koboApi';
import type {KoboProject,KoboSettings,KoboSettingsReview} from './koboTypes';
import './koboSettingsImport.css';
import KoboSettingsSummary from './KoboSettingsSummary';
import KoboUploadCard from './KoboUploadCard';

export default function KoboSettingsImport({project,settings,onClose,onApply}:{project:KoboProject;settings:KoboSettings;onClose:()=>void;onApply:(settings:KoboSettings)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),[review,setReview]=useState<KoboSettingsReview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[file,setFile]=useState<File|null>(null);
 useEffect(()=>{const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;dialog.current?.showModal();return()=>{dialog.current?.close();opener?.isConnected&&opener.focus({preventScroll:true})}},[]);
 const read=async(file?:File)=>{if(!file)return;setReview(null);setFile(file);setError('');setBusy(true);try{if(file.size>5*1024*1024)throw new Error('Choose a settings file smaller than 5 MB.');const pack=JSON.parse(await file.text());setReview(await koboApi.previewSettings(project.id,settings,pack))}catch(issue){setError(issue instanceof SyntaxError?'This is not a valid JSON settings file.':issue instanceof Error?issue.message:String(issue))}finally{setBusy(false)}};
 return <dialog ref={dialog} className="kobo-dialog glass kobo-settings-import" aria-label="Import settings" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <header><div><span className="eyebrow">SHARED CONFIGURATION</span><h2>Import settings</h2></div><button type="button" className="soft" disabled={busy} aria-label="Close import settings" onClick={onClose}><X/></button></header>
  <div className="kobo-settings-import-body"><p>Apply a shared configuration to <strong dir="auto">{project.name}</strong>. Your response data stays unchanged.</p>
   <KoboUploadCard className="kobo-settings-file" label="Settings file selection" title={file?'Selected settings file':'Choose a Kobo settings file'} description="Kobo settings file · Up to 5 MB" format="JSON" icon={<FileJson aria-hidden="true"/>} file={file}>
    <input ref={input} hidden type="file" accept=".json,application/json" disabled={busy} aria-label="Settings file" onChange={event=>{const chosen=event.target.files?.[0];event.target.value='';void read(chosen)}}/>
    <div className="kobo-upload-card-actions"><button type="button" className="primary kobo-settings-file-choose" disabled={busy} onClick={()=>input.current?.click()}><Upload aria-hidden="true"/>{file?'Change file':'Choose settings file'}</button></div>
   </KoboUploadCard>
   {busy&&<p role="status">{review?'Saving settings…':'Reviewing compatibility…'}</p>}{error&&<p className="error" role="alert">{error}</p>}
   {review&&<KoboSettingsSummary review={review}/>}
  </div><footer className="kobo-dialog-actions"><p>Only compatible settings will be applied.</p><div className="kobo-dialog-action-buttons"><button type="button" className="soft" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!review||busy} onClick={async()=>{if(!review)return;setBusy(true);setError('');try{await onApply(review.settings);onClose()}catch(issue){setError(issue instanceof Error?issue.message:String(issue))}finally{setBusy(false)}}}><Upload aria-hidden="true"/>Apply settings</button></div></footer>
 </dialog>;
}
