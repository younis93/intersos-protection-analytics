import NotificationToast from './NotificationToast';

export default function IssueNotice({message,error='',onDismiss}:{message:string;error?:string;onDismiss?:()=>void}){
  return <NotificationToast message={error||message} variant={error?'error':'success'} onDismiss={onDismiss}/>;
}
