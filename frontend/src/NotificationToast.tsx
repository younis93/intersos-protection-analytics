import {CheckCircle2} from 'lucide-react';

export default function NotificationToast({message,label='Done'}:{message:string;label?:string}){
  return message?<div className="legal-copy-toast" role="status" aria-live="polite" aria-atomic="true"><CheckCircle2 aria-hidden="true"/><span>{label}</span><strong>{message}</strong></div>:null;
}
