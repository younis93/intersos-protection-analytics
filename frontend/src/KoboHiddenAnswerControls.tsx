import type {KoboResult,KoboQuestionSettings,KoboConnectionNode} from './koboTypes';
import './koboHiddenAnswerControls.css';

export function KoboHiddenAnswerControls({mode,onChange,language='en',keepOriginalDisabled=false,connected=false,showLabel=false}:{
 keepOriginalDisabled?:boolean;language?:'en'|'ar';mode:'adjust'|'keep-original';
 onChange:(mode:'adjust'|'keep-original')=>void;connected?:boolean;showLabel?:boolean;
}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const label=t('Percentage base','قاعدة النسبة');
 const visible=connected?t('Follow-up respondents','مستجيبو المتابعة'):t('Visible respondents','المستجيبون الظاهرون');
 const original=connected?t('Parent respondents','مستجيبو السؤال الأصل'):t('All respondents','جميع المستجيبين');
 const visibleHint=connected?t('Use the answered follow-up question as the base.','استخدم مستجيبي سؤال المتابعة أساساً للنسبة.')
  :t('Exclude respondents with hidden answers from the base.','استبعد المستجيبين ذوي الإجابات المخفية من قاعدة النسبة.');
 const originalHint=connected?t('Use the answered parent question as the base.','استخدم مستجيبي السؤال الأصل أساساً للنسبة.')
  :t('Include respondents with hidden answers in the original base.','أدرج المستجيبين ذوي الإجابات المخفية في قاعدة النسبة الأصلية.');
 return <div className="kobo-percentage-base-control" role="group" aria-label={label}
  onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
  {showLabel&&<span className="kobo-percentage-base-label">{label}</span>}
  <div className="kobo-answer-percentage-buttons">
   <button type="button" aria-pressed={mode==='adjust'} title={visibleHint} onClick={()=>onChange('adjust')}>{visible}</button>
   <button type="button" aria-pressed={mode==='keep-original'} title={originalHint} disabled={keepOriginalDisabled} onClick={()=>onChange('keep-original')}>{original}</button>
  </div>
 </div>;
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
 return (!result.measure||result.measure.operation==='count')&&
  (!!value.hiddenAnswers?.length||(respondentBasis&&hasPercentageConnection(result,value)));
}
