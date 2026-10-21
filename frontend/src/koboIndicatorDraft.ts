import type {KoboForm,KoboQuestion} from './koboTypes';
import type {KoboIndicatorDefinition,KoboIndicatorQuestion} from './koboIndicatorTypes';

export function newIndicator():KoboIndicatorDefinition{return {id:crypto.randomUUID(),name:'',description:'',higherMeaning:'',scope:'',questions:[],reviewIssues:[]}}
export function indicatorQuestion(question:KoboQuestion):KoboIndicatorQuestion{return {question:question.id,kind:question.kind as KoboIndicatorQuestion['kind'],weight:1,points:Object.fromEntries(question.choices.map(choice=>[choice.name,null])),multipleMethod:null,ranges:[]}}
export function indicatorScopes(form:KoboForm,scope:string){
 const groups=new Map(form.groups.map(group=>[group.id,group])),allowed=new Set([scope,'']),seen=new Set<string>();let current=scope;
 while(current&&!seen.has(current)){seen.add(current);current=groups.get(current)?.parent||'';if(groups.get(current)?.repeat)allowed.add(current)}
 return allowed;
}
export function indicatorDraftError(draft:KoboIndicatorDefinition){
 if(!draft.name.trim())return 'Enter an indicator name.';
 const mode=draft.mode||'score';
 if(mode==='score'&&!draft.higherMeaning.trim())return 'Explain what a higher score means.';
 if(!draft.questions.length)return 'Select at least one scoring question.';
 for(const rule of draft.questions){
  if(mode.startsWith('numeric_')){if(rule.kind!=='number')return 'Numeric calculations require numeric questions.';continue}
  if(mode==='percentage'){
   if(rule.kind==='number'&&!rule.ranges.length)return 'Add at least one numeric condition range.';
   if(rule.kind!=='number'&&!rule.selectedCodes?.length)return 'Select the answers that meet each question condition.';
   continue;
  }
  if(!Number.isFinite(rule.weight)||rule.weight<=0)return 'Every question must have a positive weight.';
  if(rule.kind==='number'){
   if(!rule.ranges.length)return 'Add numeric scoring ranges for every numeric question.';
   if(rule.ranges.some(range=>!Number.isFinite(range.points)||range.points<0))return 'Assign non-negative points to every numeric range.';
  }else{
   if(!Object.keys(rule.points).length||Object.values(rule.points).some(points=>points===null||!Number.isFinite(points)||points<0))return 'Assign points explicitly to every answer option.';
   if(rule.kind==='multiple'&&!rule.multipleMethod)return 'Choose a scoring method for every multiple-choice question.';
  }
 }
 return '';
}

export function indicatorResultLabel(mode= 'score'){return mode==='percentage'?'Responses meeting conditions':mode==='numeric_sum'?'Total value':mode==='numeric_average'?'Average value':'Average score'}
export function indicatorResultText(result:import('./koboIndicatorTypes').KoboIndicatorResult,language:string){const value=result.value===undefined?result.average:result.value;return value===null?'No complete results':value.toLocaleString(language,{minimumFractionDigits:1,maximumFractionDigits:1})+(result.mode==='percentage'?'%':!result.mode||result.mode==='score'?' / 100':'')}
