import type {KoboConnectionNode,KoboProject} from './koboTypes';
import {CircleCheck,CircleMinus,Link2Off,Info} from 'lucide-react';
import './koboConditionStatus.css';
export type ConditionReviewState={status?:string;ignoredScope?:string;ignoredParts?:string[];ignoredRules?:KoboConnectionNode[];missingReferences?:string[];activeFields?:string[];activeCondition?:string|null};
export function KoboConditionStatus({condition,language}:{condition:ConditionReviewState;language:'en'|'ar'}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en,status=condition.status||'active';
 const label=({active:t('Active','نشط'),ignored:condition.ignoredScope==='project'?t('Ignored - whole project','متجاهل - المشروع بالكامل'):t('Ignored - this question','متجاهل - هذا السؤال'),adjusted:t('Partly ignored','متجاهل جزئياً'),missing:t('Missing reference','مرجع مفقود'),unchecked:t('Could not be checked','تعذّر الفحص'),setup:t('Setup needed','يلزم الإعداد'),suspended:t('Ignore suspended','التجاهل معلّق'),manual:t('Replaced by manual rule','استُبدل بشرط يدوي')} as Record<string,string>)[status]||status;
 const Icon=status==='ignored'||status==='adjusted'?CircleMinus:status==='missing'?Link2Off:status==='active'?CircleCheck:Info;
 return <span className={`kobo-condition-state is-${status}`} data-condition-state={status}><Icon aria-hidden="true"/>{label}</span>;
}
export function KoboConditionStateDetails({condition,language}:{condition:ConditionReviewState;language:'en'|'ar'}){
 const t=(en:string,ar:string)=>language==='ar'?' '+ar:en;
 return <>{!!condition.ignoredParts?.length&&<div className="kobo-condition-state-note is-ignored"><strong>{t('Ignored across this project:','متجاهل في هذا المشروع:')}</strong>{condition.ignoredParts.map((part,index)=><span key={index} dir="auto">{part}</span>)}<small>{t('Not used in Review, analysis or analysis exports. Other conditions remain active.','لا يُستخدم في المراجعة أو التحليل أو صادرات التحليل. تبقى الشروط الأخرى نشطة.')}</small></div>}{!!condition.missingReferences?.length&&<div className="kobo-condition-state-note is-missing"><strong>{t('Missing reference:','مرجع مفقود:')}</strong>{condition.missingReferences.map(ref=><code key={ref} dir="ltr">{ref}</code>)}<small>{t('This remaining condition needs repair or an explicit per-question ignore. Ignoring another condition does not resolve it.','يحتاج هذا الشرط المتبقي إلى إصلاح أو تجاهل صريح لهذا السؤال. تجاهل شرط آخر لا يحل مشكلته.')}</small></div>}{condition.status==='ignored'&&!condition.ignoredParts?.length&&<small className="kobo-condition-state-explanation">{t('Preserved in the Kobo source. Not used in this question’s Review or analysis.','محفوظ في مصدر كوبو ولا يُستخدم في مراجعة هذا السؤال أو تحليله.')}</small>}</>;
}

export function KoboConnectionStateSummary({project,question,language}:{project:KoboProject;question:string;language:'en'|'ar'}){
 const q=project.form.questions.find(q=>q.id===question);if(!q)return null;
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const shared=q.ignoredConnectionRules?.length||0,local=q.ignoredSourceConditions?.length||0;
 const missing=[...new Set((q.conditionReview||[]).filter(c=>c.status!=='ignored'&&c.status!=='manual').flatMap(c=>c.missingReferences||[]))];
 if(!shared&&!local&&!missing.length&&!q.dependencyReviewNeeded)return null;
 return <div className="kobo-connection-state-summary" aria-label={t('Connection status','حالة الارتباط')}>{!!shared&&<span className="kobo-condition-state is-ignored"><CircleMinus aria-hidden="true"/>{t(`${shared} ignored - whole project`,`${shared} متجاهل - المشروع بالكامل`)}</span>}{!!local&&<span className="kobo-condition-state is-ignored"><CircleMinus aria-hidden="true"/>{t(`${local} ignored - this question`,`${local} متجاهل - هذا السؤال`)}</span>}{!!missing.length&&<span className="kobo-condition-state is-missing"><Link2Off aria-hidden="true"/>{t(`${missing.length} missing ${missing.length===1?'reference':'references'}`,`${missing.length} مراجع مفقودة`)}</span>}{q.dependencyReviewNeeded&&<span className="kobo-condition-state is-suspended"><Info aria-hidden="true"/>{t('Ignore suspended - source changed','التجاهل معلّق - تغيّر المصدر')}</span>}</div>;
}
