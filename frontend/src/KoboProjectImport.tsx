import {FolderInput,LoaderCircle} from 'lucide-react';
import {useId,useRef,useState} from 'react';
import {koboRequest} from './koboApi';
import type {KoboProject} from './koboTypes';
import './koboWorkspaceTools.css';

export function useKoboProjectImport(onImported?: (id:string)=>void){
 const input=useRef<HTMLInputElement>(null),pending=useRef(false);
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const fileInput=<input ref={input} type="file" accept=".zip" aria-label="Import saved project ZIP" hidden onChange={async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file||pending.current)return;
  pending.current=true;setBusy(true);setError('');
  try{
   if(file.size>200*1024*1024)throw new Error('Choose a project ZIP smaller than 200 MB.');
   const body=new FormData();body.append('file',file);
   const project=await koboRequest<KoboProject>('/backups/restore',body);onImported?.(project.id);
  }catch(reason){setError(reason instanceof Error?reason.message:String(reason))}
  finally{pending.current=false;setBusy(false)}
 }}/>;
 return {fileInput,busy,error,open:()=>{if(!pending.current)input.current?.click()}};
}

export function KoboProjectImportButton({busy,onClick}:{busy:boolean;onClick:()=>void}){
 const[tooltipOpen,setTooltipOpen]=useState(false),descriptionId=useId();
 return <div className="kobo-backup-restore">
  <button type="button" className="soft kobo-restore-button" disabled={busy} aria-busy={busy} aria-describedby={descriptionId} onClick={()=>{setTooltipOpen(false);onClick()}} onMouseEnter={()=>setTooltipOpen(true)} onMouseLeave={()=>setTooltipOpen(false)} onFocus={()=>setTooltipOpen(true)} onBlur={()=>setTooltipOpen(false)} onKeyDown={event=>{if(event.key==='Escape')setTooltipOpen(false)}}>
   {busy?<LoaderCircle className="kobo-restore-spinner" aria-hidden="true"/>:<FolderInput aria-hidden="true"/>}<span aria-live="polite">{busy?'Importing...':'Import project'}</span>
  </button>
  <span id={descriptionId} role="tooltip" className="kobo-restore-tooltip" hidden={!tooltipOpen||busy}>Import a saved project ZIP with its data and settings.</span>
 </div>;
}
