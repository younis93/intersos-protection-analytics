import type {IssuePreview} from './sendIssuesApi';

export type EmailProvider='gmail'|'outlook';
export function emailComposeUrl(provider:EmailProvider, preview:Pick<IssuePreview,'recipient'|'subject'>){
  const query=new URLSearchParams(provider==='gmail'
    ?{view:'cm',fs:'1',to:preview.recipient,su:preview.subject}
    :{to:preview.recipient,subject:preview.subject});
  return (provider==='gmail'?'https://mail.google.com/mail/u/0/?':'https://outlook.office.com/mail/deeplink/compose?')+query;
}

export async function openIssueEmail(provider:EmailProvider, preview:IssuePreview, validate:()=>Promise<void>, copy:()=>Promise<void>){
  const desktop=(window as any).pywebview?.api;
  // Reserve a browser tab during the click so asynchronous validation cannot block the popup.
  const popup=desktop?.open_issue_email_in_chrome?null:window.open('about:blank','_blank');
  if(popup)popup.opener=null;
  try{
    if(!desktop?.open_issue_email_in_chrome&&!popup)throw new Error('Allow pop-ups to open your email, or use Copy email.');
    await validate();
    await copy();
    if(desktop?.open_issue_email_in_chrome){
      const opened=await desktop.open_issue_email_in_chrome(provider,preview.recipient,preview.subject);
      if(!opened)throw new Error('Unable to open Chrome. Use Copy email or Download email draft.');
    }else if(popup)popup.location.href=emailComposeUrl(provider,preview);
  }catch(reason){popup?.close();throw reason;}
}
