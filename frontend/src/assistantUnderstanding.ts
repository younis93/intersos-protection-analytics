import type {ChatAnalysisRequest} from './assistantAnalysis';
import {assistantFields} from './localAssistantApi';
import {koboLabel,type KoboAnalysis,type KoboProject} from './koboTypes';

export function isProjectTotal(prompt:string){
 return !/\b(by|per|missing|unanswered|question|field|answered|who)\b/i.test(prompt)
  &&/^(?:(?:please )?(?:give me|show me|show|tell me|what (?:is|are)|calculate) )?(?:the )?(?:(?:grand |project )?total(?: (?:number|count))?(?: of)?|number of|count(?: of)?|how many) (?:survey |project |filtered |all )?(?:submissions?|records?|responses?)(?: (?:in total|in (?:this |the )?(?:project|survey)|(?:are|do we have|were collected)|(?:with|under) (?:the )?current filters))?[\s?.!]*$/i.test(prompt.trim());
}

export function projectTotalAnswer(analysis:KoboAnalysis,minimum:number){
 const small=(value:number)=>value>0&&value<minimum;
 if(small(analysis.filtered))return 'The submission count for this selection is withheld for privacy.';
 const count=analysis.filtered.toLocaleString('en');
 const scopedFilter=analysis.settings.filters.some(filter=>filter.values.length||filter.minimum!=null||filter.maximum!=null||filter.months?.length);
 if(!scopedFilter&&analysis.total===analysis.filtered)return `${count} submissions in the project.`;
 const scoped=`${count} submissions match the current filters.`;
 return small(analysis.total-analysis.filtered)?scoped:`${scoped} The project has ${analysis.total.toLocaleString('en')} submissions in total.`;
}

export const looksLikeProjectRequest=(question:string)=>
 /\b(?:submissions?|respondents?|responses?|forms?|questions?|survey|dataset|project data|this project|breakdown|pivot|data quality)\b/i.test(question);

export function validatedInterpretation(text:string,allowed:Set<string>,options?:{
 breakdowns:Set<string>;answers:Map<string,Map<string,string>>;
}):ChatAnalysisRequest|undefined{
 try{
  const parsed=JSON.parse(text);
  if(!Array.isArray(parsed?.fields)||!parsed.fields.length||parsed.fields.length>2||
   !parsed.fields.every((id:unknown)=>typeof id==='string'&&allowed.has(id)))return;
  const intents=new Set(['distribution','count','percent','missing','compare','explain']);
  if(!intents.has(parsed.intent)||Object.keys(parsed).some(key=>!['fields','intent','breakdown','answer'].includes(key)))return;
  const fields=[...new Set<string>(parsed.fields)];
  if(parsed.breakdown!=null&&(typeof parsed.breakdown!=='string'||fields.includes(parsed.breakdown)||!options?.breakdowns.has(parsed.breakdown)))return;
  const answer=fields.length===1&&typeof parsed.answer==='string'?options?.answers.get(fields[0])?.get(parsed.answer):undefined;
  if(parsed.answer!=null&&!answer)return;
  return {fields,intent:parsed.intent,...(parsed.breakdown?{breakdown:parsed.breakdown}:{}),...(answer?{answers:[answer]}:{})};
 }catch{return;}
}

export function duplicateQuestions(project:KoboProject,analysis:KoboAnalysis){
 const text=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/^\s*\d+[.)]\s*/,'').match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
 const matches=new Map<string,ReturnType<typeof assistantFields>>();
 for(const field of assistantFields(project,analysis)){
  const key=text(koboLabel(field,'en'));
  if(key.split(' ').length<2)continue;
  matches.set(key,[...matches.get(key)||[],field]);
 }
 return [...matches.values()].filter(fields=>fields.length>1).map(fields=>({
  label:koboLabel(fields[0],'en'),fields:fields.map(field=>field.name),
  differentChoices:new Set(fields.map(field=>JSON.stringify([field.kind,field.repeat,field.choices.map(choice=>text(koboLabel(choice,'en'))).sort()]))).size>1,
  differentLogic:new Set(fields.map(field=>JSON.stringify([field.relevant||'',field.required||'',field.choiceFilter||'',field.inheritedRelevant||[]]))).size>1,
 }));
}
