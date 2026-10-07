import type {MessageLanguage} from './issueComposerSettings';
import type {IssueFinding} from './sendIssuesApi';

export function whatsappPhone(value:string){
  const trimmed=value.trim();
  if(!/^\+?[\d\s()-]+$/.test(trimmed))return '';
  let digits=trimmed.replace(/\D/g,'').replace(/^00/,'');
  if(!trimmed.startsWith('+')&&!trimmed.startsWith('00')&&/^0?7\d{9}$/.test(digits))digits='964'+digits.replace(/^0/,'');
  return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
}

function recordReference(row:IssueFinding):[string,string]{
  if(row.serviceId)return ['Service',row.serviceId];
  if(row.assessmentId)return ['Assessment',row.assessmentId];
  if(row.hotlineId)return ['Hotline',row.hotlineId];
  if(row.awarenessId)return ['Awareness',row.awarenessId];
  return ['Record',row.recordId||`Row ${row.row}`];
}

const arabicLabels:Record<string,string>={Case:'الحالة',Service:'الخدمة',Assessment:'التقييم',Hotline:'الخط الساخن',Awareness:'التوعية',Record:'السجل','Participant Name':'اسم المشارك','Session Topic':'موضوع الجلسة','Contact Number':'رقم الاتصال','Name':'الاسم','Date of Service Provision':'تاريخ تقديم الخدمة','Assessment ID':'معرف التقييم','Service ID':'معرف الخدمة','Case ID':'معرف الحالة','Awareness ID':'معرف التوعية','Hotline ID':'معرف الخط الساخن'};

export function whatsappMessage(lawyer:string,rows:IssueFinding[],language:MessageLanguage,settings:{deadline?:string;signature?:string}={}):string{
  const label=(en:string,ar:string)=>language==='ar'?ar:language==='bilingual'?`${en} / ${ar}`:en;
  const reference=(kind:string,id:string)=>`${label(kind,arabicLabels[kind]||kind)}: ${id}`;
  const groups=new Map<string,{heading:string;rows:IssueFinding[]}>();
  for(const row of rows){
    const [kind,id]=recordReference(row);
    const key=row.caseId?`case:${row.caseId}`:`${row.dataset}:${kind}:${id}`;
    const group=groups.get(key)||{heading:reference(row.caseId?'Case':kind,row.caseId||id),rows:[]};
    group.rows.push(row);groups.set(key,group);
  }
  const blocks=Array.from(groups.values(),group=>[
    group.heading,
    ...group.rows.map(row=>{
      const [kind,id]=recordReference(row);
      const ref=row.caseId&&(row.serviceId||row.assessmentId||row.hotlineId||row.awarenessId)?` (${reference(kind,id)})`:'';
      const fields=row.affectedFields?.length?row.affectedFields.map(field=>language==='ar'?arabicLabels[field]||field:field).join(', '):language==='ar'?row.ruleArabic||row.rule:row.rule;
      const issue=[row.rule,row.detail].filter(Boolean).join(' - ');
      const arabic=[row.ruleArabic||row.rule,row.detailArabic||row.detail].filter(Boolean).join(' - ');
      const matches=language==='ar'&&row.duplicateMatches?.length?row.duplicateMatches.map(peer=>{
        const kind=peer.awarenessId?'Awareness':peer.hotlineId?'Hotline':peer.serviceId?'Service':peer.assessmentId?'Assessment':peer.caseId?'Case':'Record';
        const id=peer.awarenessId||peer.hotlineId||peer.serviceId||peer.assessmentId||peer.caseId||'';
        return [reference(kind,id||`الصف ${peer.row}`),id?`(الصف ${peer.row})`:'',peer.name,peer.lawyer&&peer.lawyer!=='Unassigned'?peer.lawyer:'غير معين',peer.sessionTopic,peer.date].filter(Boolean).join(' - ');
      }).join('\n'):row.matchingCases;
      return [
        `- ${fields}${ref}: ${language==='ar'?arabic:issue}`,
        language==='bilingual'&&arabic!==issue?`  ${arabic}`:'',
        matches?`  ${label('Matching records and lawyers','السجلات والمحامون المطابقون')}: ${matches}`:'',
        row.rule.startsWith('Open assessment with all services closed')?`  ${label('Assessment status','حالة التقييم')}: ${row.assessmentStatus||label('Not available','غير متاح')}; ${label('Closure request','طلب الإغلاق')}: ${row.requestForClosedStatus||label('Not requested','لم يطلب')}; ${label('Linked services','الخدمات المرتبطة')}: ${row.linkedServiceCount??0}; ${label('Service statuses','حالات الخدمات')}: ${row.linkedServiceStatuses||label('Not available','غير متاح')}`:'',
      ].filter(Boolean).join('\n');
    }),
  ].join('\n'));
  return [label(`Dear ${lawyer},`,`الأستاذ/ة ${lawyer}،`),settings.deadline?`${label('Correction deadline','الموعد النهائي للتصحيح')}: ${settings.deadline}`:'',...blocks,label('Please review these issues and confirm once corrected.','يرجى مراجعة هذه الملاحظات وتأكيد إتمام التصحيح.'),settings.signature||''].filter(Boolean).join('\n\n');
}

export interface WhatsappPart {body:string;text:string;label:string}
export const WHATSAPP_PART_LIMIT=4000;
export function whatsappPartLabel(index:number,total:number,language:MessageLanguage){
  const en=`Part ${index} of ${total}`,ar=`الجزء ${index} من ${total}`;
  return language==='ar'?ar:language==='bilingual'?`${en} / ${ar}`:en;
}
export function splitWhatsappMessage(message:string,language:MessageLanguage):WhatsappPart[]{
  if(!message.trim())return [];
  const chars=Array.from(message);
  if(chars.length<=WHATSAPP_PART_LIMIT)return [{body:message,text:message,label:whatsappPartLabel(1,1,language)}];
  let total=2,bodies:string[]=[];
  // Reserve the longest numbered header, then settle the number of parts.
  for(;;){
    const capacity=WHATSAPP_PART_LIMIT-Array.from(whatsappPartLabel(total,total,language)+'\n\n').length;
    bodies=[];
    for(let offset=0;offset<chars.length;){
      let take=Math.min(capacity,chars.length-offset);
      if(offset+take<chars.length){
        const window=chars.slice(offset,offset+take).join('');
        for(const boundary of ['\n\n','\n- ','\n',' ']){
          const position=window.lastIndexOf(boundary);
          if(position>0){take=Array.from(window.slice(0,position+(boundary==='\n- '?1:boundary.length))).length;break;}
        }
      }
      bodies.push(chars.slice(offset,offset+take).join(''));offset+=take;
    }
    if(total===bodies.length)break;
    total=bodies.length;
  }
  return bodies.map((body,index)=>{const label=whatsappPartLabel(index+1,total,language);return {body,label,text:label+'\n\n'+body};});
}

// Count Unicode code points, including all whitespace in the copied text.
export function whatsappCharacterCount(message:string){return Array.from(message).length;}

export async function copyWhatsappMessage(message:string,validate:()=>Promise<unknown>){
  if(!message.trim())throw new Error('Enter or regenerate a message before copying.');
  await validate();
  try{await navigator.clipboard.writeText(message);}
  catch{throw new Error('Unable to copy the message. Select and copy the text manually from Edit message text.');}
}

export async function openIssueWhatsapp(phone:string,message:string,validate:()=>Promise<unknown>){
  const recipient=whatsappPhone(phone);
  if(!recipient)throw new Error('Enter a valid WhatsApp number. Iraq (+964) is added automatically for local numbers.');
  const desktop=(window as any).pywebview?.api;
  const nativeOpen=desktop?.open_issue_whatsapp;
  const popup=nativeOpen?null:window.open('about:blank','_blank');
  if(popup)popup.opener=null;
  try{
    if(!nativeOpen&&!popup)throw new Error('Allow pop-ups to open WhatsApp, or use Copy message.');
    await copyWhatsappMessage(message,validate);
    if(nativeOpen){
      if(!await desktop.open_issue_whatsapp(recipient))throw new Error('Unable to open WhatsApp. Use Copy message and open WhatsApp manually.');
    }else if(popup)popup.location.href='https://web.whatsapp.com/send?phone='+recipient;
  }catch(reason){popup?.close();throw reason;}
}
