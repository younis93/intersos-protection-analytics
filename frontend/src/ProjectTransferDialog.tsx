import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,Eye,EyeOff,LockKeyhole,LoaderCircle,ShieldCheck,X} from 'lucide-react';
import {exportPasswordError,passwordLength} from './projectProtection';
import './projectTransferDialog.css';

export default function ProjectTransferDialog({mode,filename,onSubmit,onClose,onCancelBusy}:{mode:'export'|'unlock';filename?:string;onSubmit:(password?:string)=>Promise<void>;onClose:()=>void;onCancelBusy?:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),running=useRef(false),id=useId();
 const[protectedExport,setProtected]=useState(false),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const unlock=mode==='unlock',needsPassword=unlock||protectedExport;
 useEffect(()=>{const opener=document.activeElement;dialog.current?.showModal();return()=>{dialog.current?.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus()}},[]);
 const submit=async()=>{
  if(running.current)return;
  const issue=unlock?(!password?'Enter the project password.':''):protectedExport?exportPasswordError(password,confirmation):'';
  if(issue){setError(issue);return}
  running.current=true;setBusy(true);setError('');
  try{await onSubmit(needsPassword?password:undefined);setPassword('');setConfirmation('');onClose()}
  catch(reason){setError(reason instanceof Error?reason.message:'Unable to complete the project transfer.');setPassword('');setConfirmation('');dialog.current?.querySelector<HTMLInputElement>('input[type=password],input[type=text]')?.focus()}
  finally{running.current=false;setBusy(false)}
 };
 return createPortal(<dialog ref={dialog} className="glass project-transfer-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`} aria-busy={busy} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <form onSubmit={event=>{event.preventDefault();void submit()}}>
   <header><span className="project-transfer-emblem">{unlock?<LockKeyhole aria-hidden="true"/>:<ShieldCheck aria-hidden="true"/>}</span><button type="button" className="soft" aria-label="Close project transfer" disabled={busy} onClick={onClose}><X aria-hidden="true"/></button></header>
   <h2 id={`${id}-title`}>{unlock?'Unlock project':'Export project'}</h2>
   <p id={`${id}-intro`}>{unlock?'Enter the password used when this project was exported.':'Save your project data and settings in a portable backup.'}</p>
   {filename&&<p className="project-transfer-file" title={filename}>{filename}</p>}
   {!unlock&&<label className="project-protection-toggle"><span><strong>Protect with password</strong><small>Encrypt the complete project backup.</small></span><input type="checkbox" role="switch" checked={protectedExport} disabled={busy} onChange={event=>{setProtected(event.target.checked);setPassword('');setConfirmation('');setShow(false);setError('')}}/></label>}
   <fieldset disabled={busy}>
    {needsPassword&&<><label htmlFor={`${id}-password`}>Password</label><div className="project-password-input"><input id={`${id}-password`} type={show?'text':'password'} value={password} autoComplete={unlock?'current-password':'new-password'} spellCheck={false} autoCapitalize="none" aria-describedby={`${id}-help`} aria-invalid={!!error} onChange={event=>{setPassword(event.target.value);setError('')}}/><button type="button" className="soft" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(value=>!value)}>{show?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}</button></div>
    {!unlock&&<><label htmlFor={`${id}-confirmation`}>Confirm password</label><input id={`${id}-confirmation`} type={show?'text':'password'} value={confirmation} autoComplete="new-password" spellCheck={false} autoCapitalize="none" aria-invalid={!!error} onChange={event=>{setConfirmation(event.target.value);setError('')}}/></>}
    <p id={`${id}-help`} className="project-protection-help">{unlock?'Passwords are case-sensitive.':'Use at least 8 characters. A long, unique password is best.'}</p>
    <p className="project-protection-note">You will need this password to import the project. Forgotten passwords cannot be recovered.</p></>}
   </fieldset>
   {!needsPassword&&<p className="project-protection-help">Standard ZIP - anyone with the file can read its contents.</p>}
   {error&&<p className="project-transfer-error" role="alert">{error}</p>}
   {busy&&<p role="status" className="project-protection-help">{unlock?'Unlocking and importing project...':protectedExport?'Encrypting and preparing download...':'Preparing download...'}</p>}
   <footer><button type="button" className="soft" disabled={busy&&!onCancelBusy} onClick={()=>{if(busy)onCancelBusy?.();else onClose()}}>{busy&&onCancelBusy?'Cancel import':'Cancel'}</button><button type="submit" className="primary" disabled={busy||(needsPassword&&passwordLength(password)>1024)}>{busy?<LoaderCircle className="project-transfer-spinner" aria-hidden="true"/>:unlock?<LockKeyhole aria-hidden="true"/>:<Download aria-hidden="true"/>}{busy?'Working...':unlock?'Unlock and import':protectedExport?'Export protected project':'Export ZIP'}</button></footer>
  </form>
 </dialog>,document.body);
}
