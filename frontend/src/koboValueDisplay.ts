import {questionDefaults,type KoboQuestionSettings,type KoboSettings} from './koboTypes';
import {resolveAppearance} from './koboAppearance';
export type ValueDisplay='count'|'percent'|'both';
export function withValueDisplay(settings:KoboQuestionSettings,display:ValueDisplay):KoboQuestionSettings{
 return {...settings,breakdownDisplay:display,appearance:{...settings.appearance,metric:display==='percent'?'percent':'count',labels:display}};
}
export function selectedValueDisplay(settings:KoboQuestionSettings):ValueDisplay|null{
 const table=settings.breakdownDisplay||'both',appearance=resolveAppearance(settings.appearance);
 const metric=appearance.metric==='percent'?'percent':'count';
 const labels=appearance.labels==='auto'?metric:appearance.labels;
 return metric===(table==='percent'?'percent':'count')&&labels===table?table:null;
}
export function sharedValueDisplay(settings:KoboSettings,questionIds:readonly string[]):ValueDisplay|null{
 const values=questionIds.map(id=>selectedValueDisplay({...questionDefaults,...settings.questions[id]}));
 return values.length&&values[0]&&values.every(value=>value===values[0])?values[0]:null;
}
export function allQuestionValueDisplay(settings:KoboSettings,questionIds:readonly string[],display:ValueDisplay):KoboSettings{
 return {...settings,questions:{...settings.questions,...Object.fromEntries(questionIds.map(id=>[id,withValueDisplay({...questionDefaults,...settings.questions[id]},display)]))}};
}
