import type {KoboResult,KoboQuestionSettings,KoboConnectionNode,KoboConnectedAnswerScope} from './koboTypes';
import './koboHiddenAnswerControls.css';

export function KoboHiddenAnswerControls({mode,onChange,language='en',keepOriginalDisabled=false,showLabel=false}:{
 keepOriginalDisabled?:boolean;language?:'en'|'ar';mode:'adjust'|'keep-original';
 onChange:(mode:'adjust'|'keep-original')=>void;showLabel?:boolean;
}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const label=t('Respondent group','مجموعة المستجيبين');
 const visible=t('Follow-up respondents','مستجيبو المتابعة');
 const original=t('Parent respondents','مستجيبو السؤال الأصل');
 const visibleHint=t('Use the answered follow-up question as the base.','استخدم مستجيبي سؤال المتابعة أساساً للنسبة.');
 const originalHint=t('Use the answered parent question as the base.','استخدم مستجيبي السؤال الأصل أساساً للنسبة.');
 return <div className="kobo-percentage-base-control" role="group" aria-label={label}
  onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
  {showLabel&&<span className="kobo-percentage-base-label">{label}</span>}
  <div className="kobo-answer-percentage-buttons">
   <button type="button" aria-pressed={mode==='adjust'} title={visibleHint} onClick={()=>onChange('adjust')}>{visible}</button>
   <button type="button" aria-pressed={mode==='keep-original'} title={originalHint} disabled={keepOriginalDisabled} onClick={()=>onChange('keep-original')}>{original}</button>
  </div>
 </div>;
}

export function KoboAnswerScopeControl({value,onChange,language,basis='follow-up'}:{
 value?:KoboConnectedAnswerScope;onChange:(scope:KoboConnectedAnswerScope)=>void;language:'en'|'ar';basis?:'follow-up'|'respondents'|'totals';
}){
 const ar=language==='ar',label=ar?'نطاق الإجابات':'Answer scope';
 const hints={
  'follow-up':ar?['تُحسب الاستجابات حتى إذا كانت جميع إجاباتها مخفية.','استبعد مستجيبي المتابعة المؤهلين الذين جميع اختياراتهم مخفية.']:['Include respondents whose selections are all hidden.','Exclude eligible follow-up respondents whose selections are all hidden.'],
  respondents:ar?['استخدم قاعدة المستجيبين الأصلية.','استبعد المستجيبين ذوي الإجابات المخفية من قاعدة النسبة.']:['Use the original respondent base.','Exclude respondents with hidden answers from the percentage base.'],
  totals:ar?['تدخل الإجابات المخفية في إجماليات النسب.','تُحسب الإجماليات من الإجابات الظاهرة فقط.']:['Include hidden answers in the percentage totals.','Calculate percentage totals from visible answers.'],
 }[basis];
 const options=[
  ['all',ar?'كل الإجابات':'All answers',hints[0]],
  ['visible',ar?'الإجابات الظاهرة':'Visible answers',hints[1]],
 ] as const;
 return <div className="kobo-percentage-base-control" role="group" aria-label={label}>
  <span className="kobo-percentage-base-label">{label}</span>
  <div className="kobo-answer-percentage-buttons">
   {options.map(([scope,caption,hint])=><button type="button" key={scope} aria-pressed={(value??'all')===scope} title={hint} onClick={()=>onChange(scope)}>{caption}</button>)}
  </div>
 </div>;
}

export function KoboRespondentAnswerScopeControl({mode,onChange,language}:{
 mode?:'adjust'|'keep-original';onChange:(mode:'adjust'|'keep-original')=>void;language:'en'|'ar';
}){
 return <KoboAnswerScopeControl basis="respondents" language={language} value={mode==='keep-original'?'all':'visible'}
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
