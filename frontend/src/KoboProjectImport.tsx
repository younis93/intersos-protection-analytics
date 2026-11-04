import ProjectImportReview,{type ProjectImportPreview} from './ProjectImportReview';
import {useProjectTransfer} from './useProjectTransfer';
import {projectFileAccept} from './projectProtection';
import {FolderInput,LoaderCircle} from 'lucide-react';
import {useId,useRef,useState} from 'react';
import {koboRequest} from './koboApi';
import './koboWorkspaceTools.css';

export function useKoboProjectImport(onImported?: (id:string)=>void){
 const input=useRef<HTMLInputElement>(null),transfer=useProjectTransfer({importSuccessMessage:'Project file opened. Review import options.'});
 const[preview,setPreview]=useState<ProjectImportPreview|null>(null),[filename,setFilename]=useState('');
 const fileInput=<><input ref={input} type="file" accept={projectFileAccept} aria-label="Import saved project" hidden onChange={event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  void transfer.importProject(file,async password=>{
   const body=new FormData();body.append('file',file);if(password!==undefined)body.append('password',password);
   const review=await koboRequest<ProjectImportPreview>('/backups/preview',body);setFilename(file.name);setPreview(review);
  });
 }}/>{transfer.view}{preview&&<ProjectImportReview preview={preview} filename={filename} onClose={()=>setPreview(null)} onImported={id=>onImported?.(id)}/>}</>;
 return {fileInput,busy:transfer.busy||!!preview,error:transfer.error,open:()=>input.current?.click()};
}

export function KoboProjectImportButton({busy,onClick}:{busy:boolean;onClick:()=>void}){
 const[tooltipOpen,setTooltipOpen]=useState(false),descriptionId=useId();
 return <div className="kobo-backup-restore">
  <button type="button" className="soft kobo-restore-button" disabled={busy} aria-busy={busy} aria-describedby={descriptionId} onClick={()=>{setTooltipOpen(false);onClick()}} onMouseEnter={()=>setTooltipOpen(true)} onMouseLeave={()=>setTooltipOpen(false)} onFocus={()=>setTooltipOpen(true)} onBlur={()=>setTooltipOpen(false)} onKeyDown={event=>{if(event.key==='Escape')setTooltipOpen(false)}}>
   {busy?<LoaderCircle className="kobo-restore-spinner" aria-hidden="true"/>:<FolderInput aria-hidden="true"/>}<span aria-live="polite">{busy?'Importing...':'Import project'}</span>
  </button>
  <span id={descriptionId} role="tooltip" className="kobo-restore-tooltip" hidden={!tooltipOpen||busy}>Create or update a project from a ZIP or protected file. Choose whether to include its settings.</span>
 </div>;
}
