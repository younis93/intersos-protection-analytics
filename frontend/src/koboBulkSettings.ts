import {questionDefaults,type KoboProject,type KoboQuestion,type KoboQuestionSettings,type KoboSettings} from './koboTypes';
export type KoboBulkDraft=Partial<Pick<KoboQuestionSettings,'appearance'|'chart'|'palette'|'colors'|'breakdowns'|'breakdownDisplay'|'answerSort'|'numericMode'|'bins'|'dateUnit'|'trendDateField'|'trendUnit'>>;
export const enabledKoboQuestions=(project:KoboProject,settings:KoboSettings)=>project.form.questions.filter(question=>!settings.hidden.includes(question.id)&&(!question.metadata||settings.metadata));
export const sharedBreakdownFields=(project:KoboProject,targets:KoboQuestion[])=>project.form.questions.filter(field=>['category','text'].includes(field.kind)&&targets.every(target=>!field.repeat||field.repeat===target.repeat));
export function sharedBulkValue<T>(values:T[]):{value:T|undefined;mixed:boolean}{
 const value=values[0];return values.every(item=>JSON.stringify(item)===JSON.stringify(value))?{value,mixed:false}:{value:undefined,mixed:true};
}
export function bulkQuestionSettings(question:KoboQuestion,settings:KoboSettings,draft:KoboBulkDraft):KoboQuestionSettings{
 const current={...questionDefaults,...settings.questions[question.id]},next={...current};
 if(draft.chart!==undefined)next.chart=draft.chart;
 if(['category','multiple','number'].includes(question.kind)){if(draft.trendDateField!==undefined)next.trendDateField=draft.trendDateField;if(draft.trendUnit!==undefined)next.trendUnit=draft.trendUnit}
 if(draft.appearance!==undefined)next.appearance={...current.appearance,...draft.appearance};
 if(draft.breakdowns!==undefined){next.pointColors={};next.breakdown='';next.breakdowns=draft.breakdowns.filter(id=>id!==question.id)}
 if(draft.breakdownDisplay!==undefined)next.breakdownDisplay=draft.breakdownDisplay;
 if(draft.answerSort!==undefined)next.answerSort=draft.answerSort;
 if(question.kind==='number'){if(draft.numericMode!==undefined)next.numericMode=draft.numericMode;if(draft.bins!==undefined)next.bins=draft.bins}
 if(question.kind==='date'&&draft.dateUnit!==undefined)next.dateUnit=draft.dateUnit;
 if(draft.palette!==undefined){next.palette=draft.palette;next.pointColors={};next.colors={...draft.colors}}
 else if(draft.colors!==undefined)next.colors={...current.colors,...draft.colors};
 if(draft.chart!==undefined||draft.breakdowns!==undefined||draft.trendDateField!==undefined){
  const breakdowns=next.breakdowns?.length?next.breakdowns:next.breakdown?[next.breakdown]:[];
  if(next.chart==='line'&&!['number','date'].includes(question.kind)&&!next.trendDateField||['pie','donut'].includes(next.chart||'')&&(breakdowns.length>0||['number','date'].includes(question.kind)))next.chart='bar';
  if(next.chart==='histogram'){if(question.kind==='number')next.numericMode='bins';else next.chart='bar'}
  if(next.chart==='heatmap'&&!breakdowns.length)next.chart='bar';
 }
 return next;
}
export function bulkQuestionChanges(project:KoboProject,settings:KoboSettings,draft:KoboBulkDraft){
 if(!Object.values(draft).some(value=>value!==undefined))return {};
 return Object.fromEntries(enabledKoboQuestions(project,settings).map(question=>[question.id,bulkQuestionSettings(question,settings,draft)]));
}
export const koboDisplayDefaults={questionSort:'form',metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true} as const;
