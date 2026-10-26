import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,FileJson,LoaderCircle,Pencil,Upload,X} from 'lucide-react';
import {koboApi,analysisLabel} from './koboApi';
import KoboSettingsImport from './KoboSettingsImport';
import KoboUploadCard from './KoboUploadCard';
import type {KoboProject,KoboSettings} from './koboTypes';
import './koboRenameProject.css';

export default function KoboRenameProject({project,onClose,onSaved,getProject,onApplySettings}:{project:{id:string;name:string};onClose:()=>void;onSaved:(project:{id:string;name:string;updated:string})=>void;getProject?:()=>Promise<KoboProject>;onApplySettings?:(settings:KoboSettings)=>Promise<void>}){
 const[name,setName]=useState(project.name),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[settingsProject,setSettingsProject]=useState<KoboProject|null>(null),[settingsMessage,setSettingsMessage]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),id=useId();
 useEffect(()=>{const node=dialog.current,opener=document.activeElement;node?.showModal();input.current?.select();return()=>{node?.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true})}},[]);
 const save=async()=>{if(busy||!name.trim())return;setBusy(true);setError('');try{onSaved(await koboApi.rename(project.id,name.trim()))}catch(reason){setError(reason instanceof Error?reason.message:String(reason));setBusy(false)}};
 const sharedSettings=async(action:'import'|'export')=>{
  if(busy)return;setBusy(true);setError('');setSettingsMessage('');
  try{const current=await (getProject?getProject():koboApi.get(project.id));if(action==='import')setSettingsProject(current);else{await koboApi.exportSettings(current.id,current.name,current.settings);setSettingsMessage('Settings file downloaded.')}}catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}
 };
 return createPortal(<><dialog ref={dialog} className="kobo-dialog glass kobo-rename-project" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <form onSubmit={event=>{event.preventDefault();void save()}}>
   <header><span className="kobo-rename-icon"><Pencil aria-hidden="true"/></span><button type="button" className="soft" aria-label="Close rename dialog" disabled={busy} onClick={onClose}><X aria-hidden="true"/></button></header>
   <h2 id={`${id}-title`}>{analysisLabel('Edit form','Edit project')}</h2><p id={`${id}-description`}>{analysisLabel('Manage the form name and share its analysis settings.','Manage the project name and share its analysis settings.')}</p>
   <label htmlFor={`${id}-name`}>{analysisLabel('Form name','Project name')}</label><input ref={input} id={`${id}-name`} value={name} onChange={event=>setName(event.target.value)} maxLength={200} required disabled={busy} autoFocus dir="auto" aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined}/>
   {error&&<p id={`${id}-error`} className="error" role="alert">{error}</p>}
   <KoboUploadCard className="kobo-edit-settings" label="Shared analysis settings" title="Analysis settings" description="Charts, filters, display options, Excel choices, indicator definitions and saved views. Settings file · Up to 5 MB." format="JSON" icon={<FileJson aria-hidden="true"/>}><div className="kobo-upload-card-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void sharedSettings('import')}><Upload aria-hidden="true"/>Import settings</button><button type="button" className="soft" disabled={busy} onClick={()=>void sharedSettings('export')}><Download aria-hidden="true"/>Export settings</button></div>{settingsMessage&&<p role="status">{settingsMessage}</p>}</KoboUploadCard>
   <footer><button type="button" className="soft" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy||!name.trim()}>{busy&&<LoaderCircle className="button-spin" aria-hidden="true"/>}{busy?'Saving…':'Save name'}</button></footer>
  </form>
 </dialog>{settingsProject&&<KoboSettingsImport project={settingsProject} settings={settingsProject.settings} onClose={()=>setSettingsProject(null)} onApply={async settings=>{if(onApplySettings)await onApplySettings(settings);else await koboApi.save(project.id,settings);setSettingsMessage('Analysis settings imported and saved.')}}/>}</>,document.body);
}
