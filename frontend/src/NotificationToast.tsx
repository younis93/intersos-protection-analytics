import {CheckCircle2,AlertCircle,X} from 'lucide-react';

export default function NotificationToast({message,label,variant='success',onDismiss}:{message:string;label?:string;variant?:'success'|'error';onDismiss?:()=>void}){
  const Icon=variant==='error'?AlertCircle:CheckCircle2;
  return message?<div className={`legal-copy-toast${variant==='error'?' legal-copy-toast-error':''}${onDismiss?' legal-copy-toast-dismissible':''}`} role={variant==='error'?'alert':'status'} aria-live={variant==='error'?'assertive':'polite'} aria-atomic="true"><Icon aria-hidden="true"/><span>{label||(variant==='error'?'Action needed':'Done')}</span><strong>{message}</strong>{onDismiss&&<button type="button" aria-label="Dismiss notification" onClick={onDismiss}><X aria-hidden="true"/></button>}</div>:null;
}
