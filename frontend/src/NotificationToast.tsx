import {CheckCircle2,AlertCircle,X} from 'lucide-react';
import {useEffect,useState} from 'react';
import {SURFACE_EXIT_MS,useReducedMotion} from './surfaceMotion';
import './surfaceMotion.css';

export default function NotificationToast({message,label,variant='success',onDismiss}:{message:string;label?:string;variant?:'success'|'error';onDismiss?:()=>void}){
  const reduced=useReducedMotion();
  const [retained,setRetained]=useState({message,label,variant,onDismiss});
  useEffect(()=>{
    if(message){setRetained({message,label,variant,onDismiss});return}
    if(reduced){setRetained(current=>({...current,message:''}));return}
    const timer=setTimeout(()=>setRetained(current=>({...current,message:''})),SURFACE_EXIT_MS);
    return()=>clearTimeout(timer);
  },[message,label,variant,onDismiss,reduced]);
  const notice=message?{message,label,variant,onDismiss}:retained;
  const leaving=!message;
  const Icon=notice.variant==='error'?AlertCircle:CheckCircle2;
  return notice.message&&!(leaving&&reduced)?<div key={`${notice.variant}:${notice.message}`} className={`legal-copy-toast${notice.variant==='error'?' legal-copy-toast-error':''}${notice.onDismiss?' legal-copy-toast-dismissible':''}${leaving?' is-leaving':''}`} role={leaving?undefined:notice.variant==='error'?'alert':'status'} aria-live={leaving?'off':notice.variant==='error'?'assertive':'polite'} aria-hidden={leaving||undefined} inert={leaving||undefined} aria-atomic="true"><Icon aria-hidden="true"/><span>{notice.label||(notice.variant==='error'?'Action needed':'Done')}</span><strong>{notice.message}</strong>{notice.onDismiss&&<button type="button" aria-label="Dismiss notification" onClick={notice.onDismiss}><X aria-hidden="true"/></button>}</div>:null;
}
