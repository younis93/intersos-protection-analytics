export type MessageLanguage='en'|'ar'|'bilingual';
export interface SenderDetails {name:string;role:string;organization:string;signature:string}
export const blankSender:SenderDetails={name:'',role:'',organization:'',signature:''};
const key='legal-send-issues-sender-v1';
const whatsappKey='legal-send-issues-whatsapp-v1';
export function loadWhatsappLanguage():MessageLanguage{
  try{const language=JSON.parse(localStorage.getItem(whatsappKey)||'{}').language;return ['en','ar','bilingual'].includes(language)?language:'bilingual';}catch{return 'bilingual';}
}
export function saveWhatsappSettings(language:MessageLanguage,sender:SenderDetails){
  try{localStorage.setItem(whatsappKey,JSON.stringify({language}));return saveSender(sender);}catch{return false;}
}
export function loadSender():SenderDetails{
  try{const data=JSON.parse(localStorage.getItem(key)||'{}');return Object.fromEntries(Object.keys(blankSender).map(field=>[field,typeof data?.[field]==='string'?data[field]:''])) as unknown as SenderDetails;}catch{return {...blankSender};}
}
export function saveSender(details:SenderDetails){try{localStorage.setItem(key,JSON.stringify(details));return true;}catch{return false;}}
export function allowMessageReplacement(dirty:boolean,confirm:()=>boolean){return !dirty||confirm();}
export function senderSignature(details:SenderDetails){return [details.name,details.role,details.organization,details.signature].map(value=>value.trim()).filter(Boolean).join('\n');}
export function validMessageDeadline(value:string){
  if(!value)return true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');
  return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value;
}
export function messageBlockReason(lawyer:string,count:number,validContact:boolean,channel:'email'|'WhatsApp'){
  if(!lawyer)return 'Choose a lawyer.';
  if(lawyer==='Unassigned')return 'Assign a lawyer before preparing a message.';
  if(!count)return 'Select at least one finding for this lawyer.';
  if(!validContact)return channel==='email'?'Add a valid email address in Manage Lawyers.':'Add a WhatsApp number in Manage Lawyers. Iraq (+964) is added automatically.';
  return '';
}
