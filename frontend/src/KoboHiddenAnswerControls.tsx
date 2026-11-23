import {useId} from 'react';
import type {KoboResult,KoboQuestionSettings,KoboConnectionNode,KoboConnectedAnswerScope} from './koboTypes';
import './koboHiddenAnswerControls.css';

export const koboRespondentGroupLabel=(language:'en'|'ar')=>
 language==='ar'?'من يُحتسب في النسبة المئوية؟':'Who counts toward the percentage?';

export const koboCompactRespondentLabel=(language:'en'|'ar',linked:boolean)=>
 language==='ar'?(linked?'مستجيبو السؤال المرتبط':'مستجيبو هذا السؤال'):(linked?'Linked question’s respondents':'This question’s respondents');

export function KoboHiddenAnswerControls({mode,onChange,language='en',keepOriginalDisabled=false,showLabel=false}:{
 keepOriginalDisabled?:boolean;language?:'en'|'ar';mode:'adjust'|'keep-original';
 onChange:(mode:'adjust'|'keep-original')=>void;showLabel?:boolean;
}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const label=koboRespondentGroupLabel(language);
 const visible=t('People who answered this question','من أجابوا عن هذا السؤال');
 const original=t('People who answered the linked question','من أجابوا عن السؤال المرتبط');
 const visibleHint=t('Calculate percentages using people who answered this question.','احسب النسب المئوية بناءً على من أجابوا عن هذا السؤال.');
 const originalHint=t('Calculate percentages using people who answered the selected linked question.','احسب النسب المئوية بناءً على من أجابوا عن السؤال المرتبط المحدد.');
 return <div className="kobo-percentage-base-control" role="group" aria-label={label}
  onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
  {showLabel&&<span className="kobo-percentage-base-label">{label}</span>}
  <div className="kobo-answer-percentage-buttons">
   <button type="button" aria-pressed={mode==='adjust'} title={visibleHint} onClick={()=>onChange('adjust')}>{visible}</button>
   <button type="button" aria-pressed={mode==='keep-original'} title={originalHint} disabled={keepOriginalDisabled} onClick={()=>onChange('keep-original')}>{original}</button>
  </div>
 </div>;
}

const hiddenAxisLabels={answers:'الإجابات المخفية',rows:'الصفوف المخفية',columns:'الأعمدة المخفية'} as const;
export function koboHiddenScopeLabel(language:'en'|'ar',axis:keyof typeof hiddenAxisLabels){
 return language==='ar'?`كيف تؤثر ${hiddenAxisLabels[axis]} في النسب المئوية`:`How hidden ${axis} affect percentages`;
}

export function KoboAnswerScopeControl({value,onChange,language,basis='follow-up',multipleChoice=false,axis='answers',showLabel=true}:{
 value?:KoboConnectedAnswerScope;onChange:(scope:KoboConnectedAnswerScope)=>void;language:'en'|'ar';basis?:'follow-up'|'respondents'|'totals'|'answer-filter';
 multipleChoice?:boolean;axis?:keyof typeof hiddenAxisLabels;showLabel?:boolean;
}){
 const ar=language==='ar';
 const item=hiddenAxisLabels[axis],label=koboHiddenScopeLabel(language,axis);
 const hintId=useId();
 const showMixedAnswerHint=(basis==='follow-up'||basis==='answer-filter')&&multipleChoice;
 const hints={
  'answer-filter':ar?['تُحتسب الاستجابات حتى إذا كانت جميع إجاباتها مخفية.','استبعد الاستجابات ذات الإجابات المخفية فقط من قاعدة النسبة.']:['Include responses whose answers are all hidden.','Exclude responses with only hidden answers from the percentage base.'],
  columns:ar?['تشمل قاعدة النسبة جميع الأعمدة.','تشمل قاعدة النسبة الأعمدة الظاهرة فقط.']:['Use all breakdown columns in the percentage base.','Use only visible breakdown columns in the percentage base.'],
  'follow-up':ar?['تُحسب الاستجابات حتى إذا كانت جميع إجاباتها مخفية.','استبعد مستجيبي المتابعة المؤهلين الذين جميع اختياراتهم مخفية.']:['Include respondents whose selections are all hidden.','Exclude eligible follow-up respondents whose selections are all hidden.'],
  respondents:ar?['استخدم قاعدة المستجيبين الأصلية.','استبعد المستجيبين ذوي الإجابات المخفية من قاعدة النسبة.']:['Use the original respondent base.','Exclude respondents with hidden answers from the percentage base.'],
  totals:ar?['تدخل الإجابات المخفية في إجماليات النسب.','تُحسب الإجماليات من الإجابات الظاهرة فقط.']:['Include hidden answers in the percentage totals.','Calculate percentage totals from visible answers.'],
 }[axis==='columns'?'columns':basis];
 const options=[
  ['all',ar?`تضمين ${item} في الحساب`:`Include hidden ${axis} in the calculation`,hints[0]],
  ['visible',ar?`استبعاد ${item} من الحساب`:`Exclude hidden ${axis} from the calculation`,hints[1]],
 ] as const;
 return <div className="kobo-percentage-base-control" role="group" aria-label={label}>
  {showLabel&&<span className="kobo-percentage-base-label">{label}</span>}
  <div className="kobo-answer-percentage-buttons">
   {options.map(([scope,caption,hint])=><button type="button" key={scope} aria-pressed={(value??'all')===scope} aria-describedby={scope==='visible'&&showMixedAnswerHint?hintId:undefined} title={hint} onClick={()=>onChange(scope)}>{caption}</button>)}
  </div>
  {showMixedAnswerHint&&<small id={hintId} className="kobo-answer-scope-hint">{ar?'يظل من اختار إجابة ظاهرة وأخرى مخفية ضمن الحساب.':'Someone who selected both a visible and a hidden answer still counts.'}</small>}
 </div>;
}

export function KoboRespondentAnswerScopeControl({mode,onChange,language,axis,showLabel}:{
 mode?:'adjust'|'keep-original';onChange:(mode:'adjust'|'keep-original')=>void;language:'en'|'ar';axis?:'answers'|'rows';showLabel?:boolean;
}){
 return <KoboAnswerScopeControl axis={axis} showLabel={showLabel} basis="respondents" language={language} value={mode==='keep-original'?'all':'visible'}
  onChange={scope=>onChange(scope==='all'?'keep-original':'adjust')}/>;
}

export const supportsConnectedAnswerScope=(result:Pick<KoboResult,'kind'>)=>['category','multiple','text'].includes(result.kind);

export function supportsAdditiveAnswerScope(result:KoboResult,mode=result.percentageMode,operation=result.measure?.operation){
 return supportsConnectedAnswerScope(result)&&!!mode&&mode!=='legacy-respondents'&&(!operation||operation==='count'||operation==='sum');
}

export function additiveAnswerScopeFor(result:KoboResult,value:KoboQuestionSettings,mode=result.percentageMode){
 if(value.additiveAnswerScope)return value.additiveAnswerScope;
 if(mode==='visible-selections')return 'visible';
 return hasPercentageConnection(result,value)||value.hiddenAnswerPercentageMode==='keep-original'?'all':'visible';
}

export function hasPercentageConnection(result:KoboResult,value:KoboQuestionSettings){
 const hasRule=(node?:KoboConnectionNode|null):boolean=>!!node&&(node.type==='rule'?!!node.field:node.rules.some(hasRule));
 if(value.connectionSource==='manual')return hasRule(value.connectionRules);
 const connections=result.connections;
 if(!connections)return false;
 if(connections.effectiveTree!==undefined)return hasRule(connections.effectiveTree);
 return connections.conditions.some(c=>c.status!=='ignored'&&c.status!=='manual')&&connections.parents.length>0;
}
export function showRespondentPercentageControls(result:KoboResult,value:KoboQuestionSettings){
 const respondentBasis=!result.percentageMode||result.percentageMode==='legacy-respondents';
 const linked=hasPercentageConnection(result,value);
 return (!result.measure||result.measure.operation==='count')&&
  respondentBasis&&(linked||!!value.hiddenAnswers?.length);
}
