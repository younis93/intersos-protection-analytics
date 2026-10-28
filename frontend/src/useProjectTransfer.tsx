import {useRef,useState} from 'react';
import ProjectTransferDialog from './ProjectTransferDialog';
import NotificationToast from './NotificationToast';
import {isProtectedProject,projectUploadLimit,ProjectTransferError} from './projectProtection';

type Transfer={mode:'export'|'unlock';filename?:string;run:(password?:string)=>Promise<void>};
export function useProjectTransfer(options:{onCancelImport?:()=>void}={}){
 const[transfer,setTransfer]=useState<Transfer|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef(false),optionsRef=useRef(options);optionsRef.current=options;
 const complete=(message:string)=>{setNotice(message);setError('')};
 const exportProject=(run:Transfer['run'])=>{if(pending.current)return;pending.current=true;setError('');setNotice('');setTransfer({mode:'export',run})};
 const importProject=async(file:File,run:Transfer['run'])=>{
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');setNotice('');
  let prompted=false;
  try{
   if(file.size>projectUploadLimit)throw new Error('Choose a project file of 200 MB or smaller.');
   if(await isProtectedProject(file)){prompted=true;setTransfer({mode:'unlock',filename:file.name,run});return}
   await run();complete('Project imported successfully.');
  }catch(reason){
   if(reason instanceof ProjectTransferError&&reason.code==='password_required'){prompted=true;setTransfer({mode:'unlock',filename:file.name,run});return}
   setError(reason instanceof Error?reason.message:String(reason));
  }finally{setBusy(false);if(!prompted)pending.current=false}
 };
 const close=()=>{setTransfer(null);pending.current=false};
 const view=<>{transfer&&<ProjectTransferDialog mode={transfer.mode} filename={transfer.filename} onClose={close} onCancelBusy={transfer.mode==='unlock'&&options.onCancelImport?()=>optionsRef.current.onCancelImport?.():undefined} onSubmit={async password=>{setBusy(true);try{await transfer.run(password);complete(transfer.mode==='export'?'Project download prepared.':'Project imported successfully.')}finally{setBusy(false)}}}/>}<NotificationToast message={error||notice} variant={error?'error':'success'} onDismiss={()=>{setError('');setNotice('')}}/></>;
 return {exportProject,importProject,view,busy,error};
}
