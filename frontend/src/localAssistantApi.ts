import {analysisWorkspace,createKoboApi,koboRequest} from './koboApi';
import {koboLabel,type AssistantAnalysisRecipe,type KoboAnalysis,type KoboProject} from './koboTypes';
import {searchSurveyDictionary} from './assistantDictionary';

export const assistantBase=(import.meta.env.DEV?'http://127.0.0.1:8000':'')+'/api/assistant';
export type Turn={question:string;answer:string};
export type FieldChange={question:string;change:string};
export type UploadBrief={at:string;changes:FieldChange[];missingIncreases:{field:string;before:number;after:number}[];beforeTotal:number;afterTotal:number};
export type ProjectAssistant={outline?:string|null;conversation?:Turn[]|null;analyses?:AssistantAnalysisRecipe[];baseline?:string;fieldHistory?:{at:string;changes:FieldChange[]}[];upload?:UploadBrief};
export type AssistantStatus={
 enabled:boolean; model:string; tested?:boolean; connected:boolean; installed:boolean;
 smallGroupMin?:number; canInstall?:boolean; installing?:boolean; installFailed?:boolean;
 modelFolder?:string; defaultModelFolder?:string; usingDefaultFolder?:boolean;
 freeGb:number|null; ramGb:number|null; models:{name:string;size:number}[];
 catalog:{name:string;size:number;ram:number;label:string}[];
};
export type QualityFinding={id:string;kind:'missing'|'conflicts'|'checks'|'other';question:string;title:string;count:number;severity?:'check'|'correction'};
export type Periods={field:string; firstFrom:string;firstTo:string;secondFrom:string;secondTo:string};

export async function assistantRequest(path:string,body?:unknown,method=body===undefined?'GET':'POST',signal?:AbortSignal){
 const multipart=body instanceof FormData;
 const response=await fetch(assistantBase+path,{method,signal,credentials:'include',
  headers:body===undefined||multipart?undefined:{'Content-Type':'application/json'},
  body:multipart?body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok){
  const issue=await response.json().catch(()=>null);
  throw new Error(typeof issue?.detail==='string'?issue.detail:'Unable to complete the assistant request.');
 }
 return response;
}

type Event = {error?:string;status?:string;digest?:string;total?:number;completed?:number;done?:boolean;message?:{content?:string}};
export async function assistantStream(path:string,body:unknown,signal:AbortSignal,receive:(event:Event)=>void){
 const response=await assistantRequest(path,body,'POST',signal);
 if(!response.body)throw new Error('The local service returned no response.');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let pending='',complete=false;
 try {
  while(true){
   const chunk=await reader.read();
   pending+=decoder.decode(chunk.value,{stream:!chunk.done});
   const lines=pending.split('\n');
   pending=lines.pop()||'';
   if(chunk.done&&pending)lines.push(pending);
   for(const line of lines){
    if(!line.trim())continue;
    const item=JSON.parse(line) as Event;
    if(item.error)throw new Error(item.error);
    complete ||= item.done===true||item.status==='success';
    receive(item);
   }
   if(chunk.done)break;
  }
 } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!complete)throw new Error('The local operation ended early. Check the connection and try again.');
}

export function projectAssistant(id:string,changes?:ProjectAssistant,signal?:AbortSignal){
 return koboRequest<ProjectAssistant>(`/projects/${encodeURIComponent(id)}/assistant`,changes,changes?'PATCH':'GET',signal);
}

export function assistantFields(project:KoboProject,analysis:KoboAnalysis){
 return project.form.questions.filter(field=>!field.identifying&&!field.metadata&&!analysis.settings.hidden.includes(field.id));
}

const commonFieldWords=new Set(['of','the','a','an','for','to','in','is','are','and','or','what','which','your',
 'you','respondent','respondents','question','field','result','results','data','report','project','table','show']);
function fieldWords(value:string){
 return value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
}

export function chatFieldIds(project:KoboProject,analysis:KoboAnalysis,prompt:string,previous:string[]=[]){
 const fields=assistantFields(project,analysis);
 const words=fieldWords(prompt);
 const promptPhrase=` ${words.join(' ')} `;
 const queryWords=new Set(words.map(word=>word==='gender'?'sex':word));
 const results=new Map(analysis.questions.map(result=>[result.id,result.label]));
 const matches=fields.map(field=>{
  const candidates=[koboLabel(field,'en'),field.name,field.id,results.get(field.id)||''];
  const score=Math.max(0,...candidates.map(candidate=>{
   const tokens=fieldWords(candidate);
   const meaningful=tokens.filter(word=>word.length>=3&&!commonFieldWords.has(word)&&!/^\d+$/.test(word));
   if(!meaningful.length)return 0;
   if(promptPhrase.includes(` ${tokens.join(' ')} `))return 10+meaningful.length;
   const shared=meaningful.filter(word=>queryWords.has(word==='gender'?'sex':word)).length;
   return shared===meaningful.length?3+shared:shared>=2?shared:0;
  }));
  return {id:field.id,score};
 }).filter(match=>match.score>0).sort((left,right)=>right.score-left.score);
 if(matches.length){
  const threshold=matches[0].score>=10?10:matches[0].score;
  return matches.filter(match=>match.score>=threshold).slice(0,4).map(match=>match.id);
 }
 const dictionary=searchSurveyDictionary(fields,analysis,prompt);
 const best=dictionary[0]?.hit||0;
 if(best>=10)return dictionary.filter(entry=>entry.hit===best).slice(0,4).map(entry=>entry.field.id);
 const eligible=new Set(fields.map(field=>field.id));
 if(/\b(percent(?:age)?|count|denominator|those|that result|breakdown|these figures|what about)\b/i.test(prompt)){
  const prior=previous.filter(id=>eligible.has(id));
  if(prior.length)return prior;
 }
 if(/\b(project|survey|results|findings|dataset)\b/i.test(prompt)&&/\b(summary|summarize|overview|highlights|main|key)\b/i.test(prompt)){
  const preferred=[...analysis.settings.report?.questions||[],...analysis.settings.dashboardQuestions||[],...results.keys()];
  return [...new Set(preferred)].filter(id=>eligible.has(id)&&results.has(id)).slice(0,4);
 }
 return [];
}

export function fieldEvidence(project:KoboProject,analysis:KoboAnalysis,selected:string[],minimum=5){
 return assistantFields(project,analysis).filter(field=>selected.includes(field.id)).map(field=>{
  const result=analysis.questions.find(item=>item.id===field.id);
  const metadata={id:field.id,label:koboLabel(field,'en'),type:field.type,required:field.required,
   condition:field.relevant,addedFromData:field.addedFromData||field.localDerived,
   choices:field.addedFromData||field.localDerived||analysisWorkspace()==='custom'?undefined:
    field.choices.slice(0,30).map(choice=>koboLabel(choice,'en'))};
  if(!result||field.kind==='text')return metadata;
  const rows=field.kind==='category'||field.kind==='multiple'?result.rows:[];
  const small=(number:number)=>number>0&&number<minimum;
  if(analysis.filtered<minimum||result.denominator<minimum||small(result.missing)||
   small(result.total-result.denominator)||rows.some(row=>small(row.count)||small(result.denominator-row.count)))
   return {...metadata,withheld:'Small group or complementary count'};
  const hasBreakdown=Boolean(result.breakdownFields?.length||result.breakdowns.length);
  return {...metadata,total:result.total,missing:result.missing,denominator:result.denominator,
   percentageBasis:result.percentageBasis,multiple:field.kind==='multiple',filterScope:result.filterMode||'page',
   rows:hasBreakdown?undefined:rows.filter(row=>row.count>0).slice(0,35)
    .map(row=>({label:row.label,count:row.count,percent:row.displayPercent??row.percent})),
   displayLimit:rows.length>35?'Only the first 35 answer categories are supplied.':undefined};
 });
}

export async function qualityFindings(id:string,analysis:KoboAnalysis,signal:AbortSignal){
 const response=await koboRequest<{groups:QualityFinding[]}>(`/projects/${encodeURIComponent(id)}/data-review`,{
  settings:{...analysis.settings,language:'en'},pageSize:1,status:'open',
 },'POST',signal);
 return response.groups;
}

export async function comparePeriods(id:string,analysis:KoboAnalysis,periods:Periods,signal:AbortSignal){
 const {field,firstFrom,firstTo,secondFrom,secondTo}=periods;
 if(!field||!firstFrom||!firstTo||!secondFrom||!secondTo||firstFrom>firstTo||secondFrom>secondTo)
  throw new Error('Choose a date field and two valid date ranges.');
 const api=createKoboApi(analysisWorkspace());
 const filters=analysis.settings.filters.filter(filter=>filter.field!==field);
 const questions=Object.fromEntries(Object.entries(analysis.settings.questions).map(([key,settings])=>
  [key,{...settings,filterMode:'page' as const,ownFilters:[]}]));
 const settings={...analysis.settings,language:'en' as const,questions,dateFilterModes:{
  ...analysis.settings.dateFilterModes,[field]:'range' as const,
 }};
 const analyze=(minimum:string,maximum:string)=>api.analyze(id,{
  ...settings,filters:[...filters,{field,kind:'date',minimum,maximum,values:[]}],
 },signal);
 return Promise.all([analyze(firstFrom,firstTo),analyze(secondFrom,secondTo)]);
}
