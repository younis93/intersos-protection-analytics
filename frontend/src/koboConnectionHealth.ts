import {connectionOperators,validRuleDate} from './koboConnectionOperators';
import {koboLabel,type KoboConnectionNode,type KoboQuestion} from './koboTypes';
export const connectionMessage=(code:string,ar:boolean)=>({
 'missing-rule-question':ar?'السؤال غير متاح - اختر بديلاً.':'Question unavailable - select a replacement.',
 'missing-rule-answer':ar?'الإجابة غير متاحة - اختر بديلاً.':'Answer unavailable - select a replacement.',
 'unsupported-condition':ar?'الشرط غير مدعوم - أعد إنشاءه يدوياً.':'Unsupported condition - rebuild it manually.',
 'incomplete-condition':ar?'أضف شرطاً لهذه المجموعة.':'Add a condition to this group.',
 'missing-rule-value':ar?'اختر إجابة أو أدخل قيمة.':'Choose an answer or enter a value.',
 'incompatible-rule-scope':ar?'السؤال في نطاق مختلف - اختر بديلاً.':'Question has an incompatible response scope - select a replacement.',
 'incompatible-rule-operator':ar?'اختر شرطاً مناسباً لنوع السؤال.':'Choose a condition suitable for this question type.',
 'missing-rule-range':ar?'أدخل حدي النطاق.':'Enter both range boundaries.',
 'reversed-rule-range':ar?'يجب أن تسبق البداية النهاية أو تساويها.':'The lower boundary must not exceed the upper boundary.',
 'invalid-rule-date':ar?'أدخل تاريخاً صالحاً.':'Enter a valid calendar date.',
 'invalid-rule-number':ar?'أدخل رقماً صالحاً.':'Enter a valid number.',
 'manual-connection-required':ar?'حدد شروط الارتباط يدوياً.':'Select connection conditions manually.',
}[code]|| (ar?'راجع سؤال قاعدة النسبة وحدده.':'Review and select the percentage base question.'));
export function ruleIssue(node:KoboConnectionNode,fields:KoboQuestion[]):string{
 if(node.type==='group')return node.rules.length?node.rules.map(n=>ruleIssue(n,fields)).find(Boolean)||'':'incomplete-condition';
 const field=fields.find(f=>f.id===node.field);if(!field)return 'missing-rule-question';
 if(['blank','not-blank'].includes(node.operator))return '';
 if(node.value===undefined||String(node.value)==='')return 'missing-rule-value';
 if(!connectionOperators(field.kind,'en').some(([op])=>op===node.operator))return 'incompatible-rule-operator';
 const range=['between','not-between'].includes(node.operator);
 if(range&&(node.value2===undefined||String(node.value2)===''))return 'missing-rule-range';
 const values=range?[node.value,node.value2]:[node.value];
 if(field.kind==='number'&&values.some(value=>!String(value).trim()||!Number.isFinite(Number(value))))return 'invalid-rule-number';
 if(field.kind==='date'&&values.some(value=>!validRuleDate(String(value))))return 'invalid-rule-date';
 if(range&&(field.kind==='number'?Number(node.value)>Number(node.value2):String(node.value)>String(node.value2)))return 'reversed-rule-range';
 if(['category','multiple'].includes(field.kind)&&field.choices?.length&&!field.choices.some(c=>c.name===String(node.value)))return 'missing-rule-answer';return '';
}
export function conditionSummary(node:KoboConnectionNode,fields:KoboQuestion[],language:'en'|'ar'):string{
 const ar=language==='ar';if(node.type==='group')return '('+node.rules.map(n=>conditionSummary(n,fields,language)).join(node.match==='all'?(ar?' و ':' AND '):(ar?' أو ':' OR '))+')';
 const field=fields.find(f=>f.id===node.field),choice=field?.choices?.find(c=>c.name===String(node.value));
 const label=connectionOperators(field?.kind,language).find(([id])=>id===node.operator)?.[1]||node.operator;
 const operator=ar?label:label.toLocaleLowerCase();
 const value=choice?koboLabel(choice,language):node.value??'…';
 return `${field?koboLabel(field,language):node.field||'…'} ${operator}${['blank','not-blank'].includes(node.operator)?'':` “${value}”${['between','not-between'].includes(node.operator)?`${ar?' و ':' and '}“${node.value2??'…'}”`:''}`}`;

}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function replacementSuggestions<T>(items:T[],reference:string,labels:(item:T)=>string[]):T[]{
 const key=normalize(reference);if(!key)return [];
 return items.map((item,index)=>({item,index,score:Math.max(0,...labels(item).map(label=>{const candidate=normalize(label);return candidate===key?2:key.length>=3&&candidate.length>=3&&(candidate.includes(key)||key.includes(candidate))?1:0}))})).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).map(x=>x.item);
}
