import {AlertTriangle,Info} from 'lucide-react';
import './koboConditionalReview.css';

type State='open'|'ignored'|'excluded';
export type ReviewCategory='conflicts'|'checks'|'missing';
type Control={question:string;label:string;answer:string;record:string;row:number;value:unknown};
type Condition={question:string;label:string;condition:string;source:string;issues:string[];rawConditions:string[];manualRules:unknown;required?:string|null};
export function openConditionalReview(project:string,question:string,status:State='open',category:ReviewCategory='conflicts'){window.dispatchEvent(new CustomEvent('kobo-conditional-review',{detail:{project,question,status,category}}))}
export function ConditionalBadge({project,question,count,status='open',language='en',category='conflicts',findingType}:{project:string;question:string;count:number;status?:State;language?:string;category?:ReviewCategory;findingType?:string}){
 const setup=findingType==='connection-setup-needed',check=category==='checks', missing=category==='missing';
 const text=setup?(language==='ar'?'يلزم إعداد الارتباط':'Connection setup needed'):language==='ar'?(findingType==='required-missing'?'إجابة مطلوبة مفقودة':findingType==='connected-blank'?'إجابة مرتبطة اختيارية فارغة':missing?'إجابات مفقودة':check?'فحص شرط':status==='open'?'تحذيرات شرطية':status==='ignored'?'تحذيرات متجاهلة':'إجابات مستبعدة'):(findingType==='required-missing'?'Required answer missing':findingType==='connected-blank'?'Optional connected answer blank':missing?'Missing answers':check?'Condition check':status==='open'?'Conditional warnings':status==='ignored'?'Ignored warnings':'Excluded answers');
 const Icon=check||findingType==='connected-blank'?Info:AlertTriangle;
 const unit=setup?(language==='ar'?'سؤال':'question'):language==='ar'?(count===1?'إجابة':'إجابات'):(count===1?'answer':'answers');
 const accessible=check?`${text}: ${count} ${unit}`:`${text}: ${count}`;
 return <button type="button" className={`soft kobo-conditional-badge is-${status}${check?' is-condition-check':''}${findingType==='connected-blank'?' is-connected-blank':''}`} aria-label={accessible} title={accessible} onKeyDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();openConditionalReview(project,question,status,category)}}><Icon aria-hidden="true"/><span>{check?`${text} · ${count} ${unit}`:`${count} ${text}`}</span></button>;
}
export function conditionIssueText(issues:string[],language:string){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 return [...new Set(issues.map(issue=>issue==='required-metadata-unavailable'?t('The required status is unavailable. Re-upload the original form to check it.','حالة الإلزام غير متاحة. أعد تحميل الاستمارة الأصلية لفحصها.'):issue.includes('cyclic')?t('A dependency or parent link contains a cycle.','توجد حلقة في تبعيات الشروط أو روابط السجلات.'):issue.includes('parent')?t('The parent response could not be found.','تعذّر العثور على الاستجابة الأصلية.'):issue.includes('missing-rule-question')||issue.includes('reference')?t('A referenced question is unavailable.','أحد الأسئلة المشار إليها غير متاح.'):issue.includes('unsupported')?t('The app does not yet support this form expression.','لا يدعم التطبيق تعبير الاستمارة هذا بعد.'):issue.includes('scope')?t('The rule refers to an incompatible response table.','يشير الشرط إلى جدول استجابات غير متوافق.'):t('The condition or a controlling answer needs review.','يحتاج الشرط أو إحدى الإجابات المتحكمة إلى مراجعة.')))].join(' ');
}
export function ConditionTechnicalDetails({item,language}:{item:Condition;language:string}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 return <details className="kobo-conditional-technical"><summary>{t('Technical details','التفاصيل التقنية')}</summary><p>{item.source==='manual'?t('Manually configured condition','شرط محدد يدوياً'):t('Original form expressions','تعبيرات الاستمارة الأصلية')}</p>{item.rawConditions.map((expression,index)=><pre key={index} dir="ltr">{expression}</pre>)}{item.required!=null&&<><p>{t('Required rule','قاعدة الإلزام')}</p><pre dir="ltr">{item.required||t('Optional','اختياري')}</pre></>}{item.manualRules!=null&&<pre dir="ltr">{JSON.stringify(item.manualRules,null,2)}</pre>}</details>;
}
export function ConflictExplanation({condition,controls,language}:{condition:string;controls:Control[];language:string}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 return <div className="kobo-conditional-explanation"><strong>{t('This answer should be blank.','يجب أن تكون هذه الإجابة فارغة.')}</strong><p dir="auto">{t('The current answers do not meet its condition:','الإجابات الحالية لا تحقق شرط السؤال:')} {controls.map(c=>`${c.label}: ${c.answer||t('Blank','فارغة')}`).join(' · ')}</p><p dir="auto"><b>{t('Only answer this question when:','تُجاب هذه المسألة فقط عندما:')}</b> {condition}</p></div>;
}
