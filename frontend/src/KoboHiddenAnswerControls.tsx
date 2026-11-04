import type {KoboResult,KoboQuestionSettings,KoboConnectionNode} from './koboTypes';
import './koboHiddenAnswerControls.css';

export function KoboHiddenAnswerControls({mode,onChange,language='en',keepOriginalDisabled=false}:{keepOriginalDisabled?:boolean;language?:'en'|'ar';mode:'adjust'|'keep-original';onChange:(mode:'adjust'|'keep-original')=>void}){
 return <div className="kobo-answer-percentage-buttons" role="group" aria-label={language==='ar'?'نسب الإجابات المخفية':'Hidden answer percentages'} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
  <button type="button" aria-label={language==='ar'?'ضبط النسب المئوية':'Adjust percentages'} aria-pressed={mode==='adjust'} title="Adjust percentages" onClick={()=>onChange('adjust')}>{language==='ar'?'ضبط %':'Adjust %'}</button>
  <button type="button" aria-label={language==='ar'?'الاحتفاظ بالنسب الأصلية':'Keep original percentages'} aria-pressed={mode==='keep-original'} title="Keep original percentages" disabled={keepOriginalDisabled} onClick={()=>onChange('keep-original')}>{language==='ar'?'إبقاء النسبة الأصلية':'Keep original %'}</button>
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
 return (!result.percentageMode||result.percentageMode==='legacy-respondents')&&(!result.measure||result.measure.operation==='count')&&
  (hasPercentageConnection(result,value)||!!value.hiddenAnswers?.length);
}
