import {assistantFields,chatFieldIds} from './localAssistantApi';
import {koboLabel,questionSettingsFor,type AssistantAnalysisRecipe,type KoboAnalysis,type KoboProject,type KoboResult,type KoboSettings} from './koboTypes';
import {resultWithPivotColumns} from './koboPivotSort';
import {displayPercent} from './koboPercentages';

export type AnalysisChoice={field?:string;breakdown?:string;overall?:boolean;hiddenAnswers?:string[];intent?:'distribution'|'compare'};
type AnswerIntent='distribution'|'count'|'percent'|'missing'|'compare'|'explain';
export type ChatContext={fields:string[];breakdown?:string;overall?:boolean;answers?:string[];hiddenAnswers?:string[]};
export type ChatAnalysisRequest={
 fields:string[];
 breakdown?:string;
 breakdowns?:string[];
 intent?:AnswerIntent;
 answers?:string[];
 hiddenAnswers?:string[];
 refreshVisibility?:boolean;
 clarification?:{target:'field'|'breakdown';options:{id:string;label:string}[]};
 message?:string;
};
export type ChatAnalysisCard={field:string;title:string;filters:string[];result?:KoboResult;message?:string;
 hiddenRows?:boolean;hiddenColumns?:boolean;filtered?:boolean;
 showChart?:boolean;
 period?:string;
 requestedBreakdown?:string;
 overall?:boolean;
 privacyWithheld?:boolean;
 grouped?:boolean;
 chatHiddenAnswers?:string[];
 recipe?:Omit<AssistantAnalysisRecipe,'id'|'name'>;
 diagnosticChoices?:{id:string;label:string;hidden:boolean}[];
 requestedAnswers?:{label:string;state:'hidden'|'absent'|'unverified'|'visible';count?:number;percent?:number|null}[]};
export type ChatAnalysisTurn={id?:string;results?:ChatAnalysisCard[];request?:ChatAnalysisRequest;choice?:AnalysisChoice;
 filterProposal?:import('./assistantProjectReview').FilterProposal;indicatorDraft?:import('./koboIndicatorTypes').KoboIndicatorDefinition};

const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
const includesLabel=(text:string,label:string)=>!!label&&(` ${text} `.includes(` ${label} `)||` ${text} `.includes(` ${label}s `));
function wordDistance(left:string,right:string){
 let previous=Array.from({length:right.length+1},(_,index)=>index);
 for(const [index,char] of Array.from(left).entries()){
  const next=[index+1];
  for(let offset=0;offset<right.length;offset++)next.push(Math.min(next[offset]+1,previous[offset+1]+1,previous[offset]+Number(char!==right[offset])));
  previous=next;
 }
 return previous[right.length];
}
const hasFilters=(settings:KoboSettings,field:string)=>{
 const cfg=settings.questions[field];
 const filters=cfg?.filterMode==='own'?cfg.ownFilters||[]:cfg?.filterMode==='additional'?[...settings.filters,...cfg.ownFilters||[]]:settings.filters;
 return filters.some(filter=>filter.values.length||filter.minimum!=null||filter.maximum!=null||filter.months?.length);
};

export function resolveChatAnalysis(project:KoboProject,analysis:KoboAnalysis,prompt:string,previous:ChatContext|string[]=[],selected:string[]=[],choice:AnalysisChoice={}):ChatAnalysisRequest{
 const fields=assistantFields(project,analysis);
 const context=Array.isArray(previous)?{fields:previous}:previous;
 const text=normalize(prompt);
 const explain=/\b(why|explain|interpret|recommend\w*|suggest\w*|write|draft|cleaning|implications)\b/i.test(prompt);
 const missing=/\b(missing|unanswered|blank responses|did not answer|no answer)\b/i.test(prompt);
 const percent=/\b(percent(?:age)?|proportion|share)\b|%/i.test(prompt);
 const count=/\b(how many|count|number of|do (?:i|we) have|are there|any)\b/i.test(prompt);
 const comparison=/\b(compare|versus|vs)\b/i.test(prompt);
 const chart=/\b(chart|graph|plot|visuali[sz]e)\b/i.test(prompt);
 const dataQuestion=missing||percent||count||comparison||chart||/\b(pivot|distribution|breakdown)\b/i.test(prompt);
 const by=prompt.match(/^(.*?)(?:\b(?:group(?:ed)?\s+by|break\s+(?:it\s+)?down\s+by|broken\s+down\s+by|breakdown\s+by|by))\s+(.+)$/is);
 const fieldIds=(query:string,prior:string[]=[])=>{
  const number=query.match(/\bquestion\s+(\d+)\b|^\s*(\d+)[.)]/i);
  if(number){
   const numbered=fields.filter(field=>koboLabel(field,'en').match(/^\s*(\d+)[.)]/)?.[1]===(number[1]||number[2])).map(field=>field.id);
   if(numbered.length)return numbered;
  }
  return chatFieldIds(project,analysis,query,prior);
 };
 const unhide=!choice.intent&&prompt.match(/^\s*(?:please\s+)?(?:unhide|restore(?=\s+.*\b(?:answers?|rows?)\b))\s+(.+?)(?:[.!?]+)?\s*$/i);
 if(unhide){
  const target=normalize(unhide[1].split(/\b(?:and show|and give|then show|for|in)\b/i)[0]);
  const qualifier=unhide[1].match(/\b(?:for|in)\s+(.+)/i)?.[1];
  const explicit=qualifier?fieldIds(qualifier):[];
  const ids=choice.field?[choice.field]:explicit.length?explicit:context.fields.length?context.fields:selected;
  const candidates=fields.filter(field=>ids.includes(field.id));
  if(candidates.length>1)return {fields:[],clarification:{target:'field',options:candidates.map(field=>({id:field.id,label:koboLabel(field,'en')}))}};
  const field=candidates[0];
  if(!field)return {fields:[],message:'Which question should I refresh? Include its label or question number.'};
  const all=/^(?:(?:all|the|my)\s+)?(?:(?:chat )?hidden\s+)?(?:answers?|rows?|them|it)$/.test(target);
  const named=field.choices.filter(option=>[option.name,koboLabel(option,'en')].some(label=>
   [normalize(label),normalize(label)+' answer',normalize(label)+' row'].some(value=>target.replace(/^the /,'')===value)));
  if(!all&&named.length!==1)return {fields:[],message:'Name the answer to restore, or say “unhide all answers” for this question.'};
  const hidden=field.id===context.fields[0]?context.hiddenAnswers||[]:[];
  return {fields:[field.id],intent:'distribution',refreshVisibility:true,hiddenAnswers:all?[]:hidden.filter(id=>id!==named[0].name),
   ...(field.id===context.fields[0]?(context.overall?{breakdowns:[]}:{breakdown:context.breakdown}):{})};
 }
 const exactField=fields.some(field=>{
  const label=koboLabel(field,'en').toLowerCase();
  return /\bby\b/.test(label)&&prompt.toLowerCase().includes(label);
 });
 const split=!choice.intent&&by&&!exactField&&(fieldIds(by[1],context.fields).length||fieldIds(by[2]).length||
  /\b(compare|break\s*(?:it\s+)?down|group)\b/i.test(prompt))?by:null;
 const query=split?.[1]??prompt;
 const queryText=normalize(query);
 const answersFor=(id:string)=>{
  const field=fields.find(item=>item.id===id);
  if(!field||!['category','multiple'].includes(field.kind))return [];
  const options=(field.choices||[]).flatMap(option=>[koboLabel(option,'en'),option.name]).map(normalize);
  return [...new Set(options.filter(label=>includesLabel(queryText,label)))].sort((a,b)=>b.length-a.length)
   .filter((label,index,list)=>!list.slice(0,index).some(longer=>includesLabel(longer,label)));
 };
 const explicit=fieldIds(query);
 const categoricalPrompt=/\b(do (?:i|we) have|are there|what about|how many)\b/i.test(query);
 const answerFields=(categoricalPrompt||percent||comparison)?fields.filter(field=>answersFor(field.id).length).map(field=>field.id):[];
 const recent=context.fields.filter(id=>fields.some(field=>field.id===id));
 const recentAnswers=recent.filter(id=>answerFields.includes(id));
 const followUp=dataQuestion&&(/\b(current pivot|this field|that (?:field|result|category|answer)|of them|respondents?|responses?|missing)\b/i.test(query)||
  /^(?:(?:and |show (?:me )?|give me )?(?:the )?(?:count|percentage|breakdown|distribution|chart|graph)(?: please)?|what percentage|how many(?: are there| were there| answered)?|(?:do (?:i|we) have|are there|what about)(?: any)?(?: [\p{L}\p{N}]+){1,3})$/iu.test(queryText));
 const inferred=recentAnswers.length?recentAnswers:recent.length&&(split||recent.length===1&&followUp)?recent:answerFields;
 const possible=choice.field?[choice.field]:explicit.length?explicit:inferred.length?inferred:
  selected.length&&!split?selected:fieldIds(query,context.fields);
 let breakdowns=choice.breakdown?[choice.breakdown]:split?fieldIds(split[2]):[];
 if(split&&!breakdowns.length){
  const query=normalize(split[2]).replace(/^the /,'');
  if(/^[a-z]{6,24}$/.test(query)){
   const eligible=fields.filter(field=>field.kind==='category'&&!field.repeat&&!possible.includes(field.id));
   const distances=eligible.map(field=>({id:field.id,distance:Math.min(...normalize(koboLabel(field,'en')+' '+field.name).split(' ')
    .filter(word=>word.length>=6&&Math.abs(word.length-query.length)<=2).map(word=>wordDistance(query,word)))}));
   const best=Math.min(...distances.map(item=>item.distance));
   if(best<=2)breakdowns=distances.filter(item=>item.distance===best).map(item=>item.id);
  }
 }
 const clarify=(ids:string[],target:'field'|'breakdown'):ChatAnalysisRequest=>({fields:[],clarification:{
  target,options:ids.map(id=>{const field=fields.find(item=>item.id===id)!;return {id,label:`${koboLabel(field,'en')} · ${field.name}`};}),
 }});
 const matchingLabels=new Set(possible.map(id=>fields.find(field=>field.id===id)).filter(Boolean).map(field=>koboLabel(field!,'en').toLowerCase()));
 const broad=/\b(summary|summari[sz]e|overview|highlights|main findings|key findings)\b/i.test(prompt);
 const multiple=/\b(and|versus|vs)\b|,/i.test(split?.[1]||prompt);
 if(!choice.field&&possible.length>1&&(possible===answerFields||split||!selected.length&&(matchingLabels.size<possible.length||!multiple&&!broad&&!comparison)))return clarify(possible,'field');
 if(breakdowns.length>1)return clarify(breakdowns,'breakdown');
 if(split&&!breakdowns.length)return {fields:[],message:'I could not find an eligible breakdown field. Use its label or question number.'};
 if(split&&!possible.length)return {fields:[],message:'Which field should I break down? Include its label or question number.'};
 const sameField=possible.length===1&&recent.length===1&&possible[0]===recent[0];
 const overall=!!choice.overall||!split&&!choice.breakdown&&sameField&&!explicit.length&&!!context.overall;
 const breakdownId=overall?undefined:breakdowns[0]||(sameField&&!explicit.length&&!split?context.breakdown:undefined);
 const breakdown=fields.find(field=>field.id===breakdownId);
 if(breakdown&&(breakdown.kind!=='category'||breakdown.repeat||possible.includes(breakdown.id))){
  return {fields:[],message:'Use a different single-choice field from the main form for the breakdown.'};
 }
 if(!possible.length&&dataQuestion&&/\b(responses?|respondents?|dataset|survey|pivot|missing|distribution|breakdown)\b/i.test(prompt))
  return {fields:[],message:'Which survey field should I check? Use its label or question number.'};
 let answers=possible.length===1?answersFor(possible[0]):[];
 if(!answers.length&&sameField&&!explicit.length&&(count||percent||/\bwhat about\b/i.test(prompt))){
  const target=text.match(/^(?:do (?:i|we) have|are there|what about|how many) (?:any )?(.+)$/)?.[1]?.replace(/ (?:answers|responses|respondents)$/,'');
  if(target&&!/^(?:there|responses?|respondents?|missing|answered|many|total|of them|were there)$/.test(target))answers=[target];
  else if(percent||/\b(of them|that answer|that category)\b/i.test(prompt))answers=context.answers||[];
 }
 const intent=choice.intent||(explain?'explain':missing?'missing':comparison?'compare':percent?'percent':count||answers.length?'count':
  (split||chart||/\b(show|give|distribution|breakdown|results?)\b/i.test(prompt)&&!broad)?'distribution':undefined);
 const hiddenAnswers=choice.hiddenAnswers??(sameField?context.hiddenAnswers:undefined);
 return {fields:possible.slice(0,4),...(overall?{breakdowns:[]}:breakdown?{breakdown:breakdown.id}:{}),
  ...(intent&&possible.length?{intent}:{}),...(answers.length&&!missing&&!choice.intent?{answers}:{}),...(hiddenAnswers?.length?{hiddenAnswers}:{})};
}

export function protectChatResult(result:KoboResult,minimum:number,filtered:number):ChatAnalysisCard{
 const base={field:result.id,title:result.label,filters:[]};
 const small=(count:number)=>count>0&&count<minimum;
 const unsafe=(count:number,total:number)=>small(count)||small(total-count);
 const columns=new Map(result.breakdowns.map(column=>[column.id,column.denominator]));
 const protectedResult=small(filtered)||small(result.denominator)||small(result.missing)||
  small(result.total-result.denominator)||result.breakdowns.some(column=>unsafe(column.denominator,result.denominator))||
  (result.respondentBasis?.denominator!=null&&result.respondentBasis.denominator<minimum)||
  (result.answerVisibility!=null&&small(result.answerVisibility.answered-result.answerVisibility.shown))||
  [...result.rows,...result.percentageRows||[]].some(row=>unsafe(row.count,result.denominator)||
   row.series?.some(cell=>unsafe(cell.count,columns.get(cell.id)??result.denominator)));
 if(protectedResult)return {...base,privacyWithheld:true,message:'Results are withheld because a small group or complementary count could be identified.'};
 if(!result.denominator&&!result.missing)return {...base,message:'No eligible responses under the current filters.'};
 return {...base,result:{...result,statistics:{},trend:null,chartProjection:null,percentageRows:undefined,answerVisibility:undefined}};
}

export async function loadChatAnalysis(project:KoboProject,analysis:KoboAnalysis,request:ChatAnalysisRequest,minimum:number,
 load:(settings:KoboSettings,id:string,signal:AbortSignal)=>Promise<KoboResult>,signal:AbortSignal):Promise<ChatAnalysisCard[]>{
 const eligible=assistantFields(project,analysis);
 const permitted=new Set(eligible.map(field=>field.id));
 return Promise.all(request.fields.filter(id=>permitted.has(id)).map(async id=>{
  const field=eligible.find(item=>item.id===id)!;
  const title=koboLabel(field,'en');
  if(field.kind==='text')return {field:id,title,filters:[],message:'Charts and pivot tables are available for structured answers.'};
  const cfg=questionSettingsFor(field,analysis.settings.questions[id],analysis.settings.percentageDefault);
  const verifyZero=!!analysis.settings.hideZero&&!!request.answers?.length;
  const breakdowns=request.breakdowns||(request.breakdown?[request.breakdown]:(cfg.breakdowns?.length?cfg.breakdowns:cfg.breakdown?[cfg.breakdown]:[]).filter(id=>permitted.has(id)));
  const settings={...analysis.settings,...(verifyZero?{hideZero:false}:{}),language:'en' as const,questions:{...analysis.settings.questions,[id]:{
   ...cfg,calculation:null,breakdown:'',breakdowns,breakdownDisplay:'both' as const,
   hiddenAnswers:[...new Set([...(cfg.hiddenAnswers||[]),...(request.hiddenAnswers||[])])],
   trendDateField:'',
  }}};
  try{
   const result=await load(settings,id,signal);
   signal.throwIfAborted();
   if((request.breakdown||request.breakdowns?.length)&&breakdowns.some(id=>!result.breakdownFields?.some(item=>item.id===id))){
    return {field:id,title,filters:[],message:'This breakdown could not be calculated for the selected field.'};
   }
   const card=protectChatResult(result,minimum,result.cohortCount??analysis.filtered);
   const summary=result.filterMode&&result.filterMode!=='page'?result.filterSummary||[]:analysis.filterSummary;
   const ownFilters=cfg.ownFilters||[];
   const filters=result.filterMode==='own'?ownFilters:
    result.filterMode==='additional'?[...analysis.settings.filters,...ownFilters]:analysis.settings.filters;
   const visible=card.result&&resultWithPivotColumns((request.breakdown||request.breakdowns?.length)&&result.breakdowns.length
    ?{...card.result,chart:'bar'}:card.result,cfg);
   const hiddenRows=!!(settings.questions[id].hiddenAnswers?.length||result.answerVisibility?.hiddenCount);
   const filtered=hasFilters(analysis.settings,id);
   const recipe=filters.every(filter=>permitted.has(filter.field))?{
    field:id,breakdowns,hiddenAnswers:request.hiddenAnswers||[],filterMode:cfg.filterMode||'page' as const,compare:request.intent==='compare',
    filters:cfg.filterMode==='own'?[]:settings.filters,ownFilters:cfg.filterMode==='page'||!cfg.filterMode?[]:ownFilters,
    dateFilterModes:settings.dateFilterModes||{},
   }:undefined;
   const requestedAnswers=visible&&request.answers?.map<NonNullable<ChatAnalysisCard['requestedAnswers']>[number]>(target=>{
    const options=(field.choices||[]).filter(option=>[koboLabel(option,'en'),option.name].some(label=>includesLabel(target,normalize(label))));
    const rows=visible.rows.filter(row=>[row.label,row.id].some(label=>includesLabel(target,normalize(label)))||options.some(option=>option.name===row.id));
    const hidden=settings.questions[id].hiddenAnswers?.some(id=>includesLabel(target,normalize(id))||options.some(option=>option.name===id));
    const label=options.length===1?koboLabel(options[0],'en'):target;
    if(hidden)return {label,state:'hidden'};
    if(rows.length===1)return {label:rows[0].label,state:'visible',count:rows[0].count,percent:displayPercent(rows[0])};
    return {label,state:!rows.length&&!options.length&&field.choices?.length&&!field.addedFromData&&!field.localDerived?'absent':'unverified'};
   });
   const displayed=visible&&verifyZero&&visible.chart!=='histogram'?{...visible,rows:visible.rows.filter(row=>row.count)}:visible;
   const diagnosticChoices=displayed&&!field.addedFromData&&!field.localDerived&&field.choices?.length?
    field.choices.map(option=>({id:option.name,label:koboLabel(option,'en'),
     hidden:!!settings.questions[id].hiddenAnswers?.includes(option.name)})):undefined;
   return {...card,result:displayed,hiddenRows,hiddenColumns:!!visible?.pivotHasHiddenColumns,filtered,requestedAnswers,
    chatHiddenAnswers:request.hiddenAnswers,requestedBreakdown:request.breakdown,recipe,diagnosticChoices,
    grouped:breakdowns.length>0,overall:request.breakdowns?.length===0,
    filters:filters.every(filter=>permitted.has(filter.field))?summary:summary.length?['Filtered results']:[]};
  }catch(error){
   if(signal.aborted)throw error;
   return {field:id,title,filters:[],message:'The app could not calculate this result. Try again or open Analysis.'};
  }
 }));
}

export function answerFromPivot(request:ChatAnalysisRequest,cards:ChatAnalysisCard[]):string|undefined{
 if(!request.intent||request.intent==='explain'||!cards.length)return;
 const format=(value:number)=>value.toLocaleString('en',{maximumFractionDigits:2});
 return cards.map(card=>{
  const {result,title}=card;
  if(!result){
   if(card.privacyWithheld&&card.grouped)return `I can’t show this breakdown because it could reveal a small group. Try the overall result or a different breakdown.`;
   return `${title.replace(/:\s*$/,'')}: ${card.message||'The result is unavailable.'}`;
  }
  const scope=card.filtered?'under the current filters':'in the current pivot';
  if(request.intent==='missing')return card.hiddenRows||card.hiddenColumns
   ?`The pivot has hidden entries for ${title}. Review in Analysis to check missing answers for the full question.`
   :`${format(result.missing)} missing answers for ${title} ${scope}.`;
  const compareGroups=request.intent==='compare'&&!!(request.breakdown||request.breakdowns?.length);
  if(compareGroups&&!result.breakdowns.length)return `There are no visible groups to compare for ${title} ${scope}.`;
  if(card.requestedAnswers?.length)return card.requestedAnswers.map(({label,state,count,percent})=>{
   if(state==='hidden')return `${label} is hidden in this pivot. Review in Analysis to check answer visibility.`;
   if(state==='absent')return `${label} is not listed as an answer option for ${title}.`;
   if(state==='unverified'||count==null)return `I couldn't verify a count for ${label} ${scope}.`;
   if(!count&&request.intent!=='percent')return `No ${label} responses were recorded ${scope}.`;
   return `${label}: ${format(count)}${percent==null?'':` (${format(percent)}%)`} ${scope}.`;
  }).join('\n');
  if(request.intent==='count')return `${format(result.denominator)} answered ${title} ${scope}.`;
  const rows=result.rows.filter(row=>row.count>0);
  if(!rows.length)return `There are no visible answer counts for ${title} ${scope}.`;
  const summary=rows.slice(0,5).map(row=>{
   const percent=displayPercent(row);
   const groups=request.intent==='compare'?result.breakdowns.slice(0,4).flatMap(column=>{
    const cell=row.series?.find(cell=>cell.id===column.id);
    if(!cell)return [];
    const share=displayPercent(cell);
    return [`${column.label}: ${format(cell.count)}${share==null?'':` (${format(share)}%)`}`];
   }):undefined;
   return `${row.label}: ${groups?.length?groups.join(', '):`${format(row.count)}${percent==null?'':` (${format(percent)}%)`}`}`;
  }).join(compareGroups?'\n':', ');
  return `${title.replace(/:\s*$/,'')} ${scope}:${compareGroups?'\n':' '}${summary}.${
   card.hiddenRows?' Some answer rows are still hidden in this view.':''
  }${rows.length>5||compareGroups&&result.breakdowns.length>4?' See the pivot for the full comparison.':''}`;
 }).join('\n');
}

export function chatAnalysisEvidence(cards:ChatAnalysisCard[]){
 return cards.map(card=>{
  const result=card.result;
  if(!result)return {field:card.field,label:card.title,availability:card.message};
  const rows=result.rows;
  const breakdowns=result.breakdowns.slice(0,5);
  const columnIds=new Set(breakdowns.map(column=>column.id));
  return {field:result.id,label:result.label,answered:result.denominator,missing:card.hiddenRows?undefined:result.missing,
   visibilityNote:card.hiddenRows||card.hiddenColumns?'The listed rows and columns are visible. Other entries have been omitted from this view.':undefined,
   filtered:card.filtered,filters:card.filters,
   percentageBasis:result.percentageBasis,breakdowns:breakdowns.map(column=>({id:column.id,label:column.label,answered:column.denominator})),
   rows:rows.slice(0,12).map(row=>({
    label:row.label,count:row.count,percent:displayPercent(row),
    breakdowns:row.series?.filter(cell=>columnIds.has(cell.id)).map(cell=>({id:cell.id,count:cell.count,percent:displayPercent(cell)})),
   })),omittedRows:Math.max(0,rows.length-12),omittedBreakdowns:result.breakdowns.length-breakdowns.length};
 });
}

export async function runAnalysisRecipe(project:KoboProject,analysis:KoboAnalysis,recipe:AssistantAnalysisRecipe,minimum:number,
 load:Parameters<typeof loadChatAnalysis>[4],signal:AbortSignal){
 const eligible=new Set(assistantFields(project,analysis).map(field=>field.id));
 if([recipe.field,...recipe.breakdowns,...[...recipe.filters,...recipe.ownFilters].map(filter=>filter.field)].some(id=>!eligible.has(id)))
  throw new Error('A field used by this analysis is unavailable. Review the saved analysis and create a new one.');
 const checks=[...recipe.filters,...recipe.ownFilters].filter(filter=>filter.kind==='category'&&filter.values.length);
 if(checks.some(filter=>{
  const choices=project.form.questions.find(field=>field.id===filter.field)?.choices||[];
  return choices.length&&filter.values.some(value=>value!=='__blank__'&&!choices.some(choice=>choice.name===value));
 }))throw new Error('A saved filter option has changed. Review the filters before rerunning this analysis.');
 const cfg=analysis.settings.questions[recipe.field];
 const field=project.form.questions.find(field=>field.id===recipe.field)!;
 const settings={...analysis.settings,filters:recipe.filters,dateFilterModes:recipe.dateFilterModes,
  questions:{...analysis.settings.questions,[recipe.field]:{...questionSettingsFor(field,cfg,analysis.settings.percentageDefault),
   filterMode:recipe.filterMode,ownFilters:recipe.ownFilters}}};
 // Refresh the scope and filter captions using the app's normal analysis endpoint before previewing the pivot.
 const {createKoboApi}=await import('./koboApi');
 const fresh=await createKoboApi().analyze(project.id,settings,signal);
 const request:ChatAnalysisRequest={fields:[recipe.field],breakdowns:recipe.breakdowns,hiddenAnswers:recipe.hiddenAnswers,
  intent:recipe.compare?'compare':'distribution'};
 const cards=await loadChatAnalysis(project,fresh,request,minimum,load,signal);
 return {cards,answer:answerFromPivot(request,cards)||'This analysis returned no visible result.'};
}

export function analysisSourceNote(card:ChatAnalysisCard){
 const result=card.result;
 return [`Source: ${card.title} (${card.field}).`,card.filters.length?`Filters: ${card.filters.join(', ')}.`:
  card.filtered?'Current filters apply.':'No active filters for this result.',
  result?`Answered: ${result.denominator.toLocaleString('en')}. ${result.percentageBasis||''}`:card.message,
  card.hiddenRows?'Some answer rows are hidden.':'',card.hiddenColumns?'Some breakdown columns are hidden.':''].filter(Boolean).join(' ');
}

export function comparisonChecks(card:ChatAnalysisCard){
 const result=card.result;
 if(!result?.breakdownFields?.length)return [];
 const groups=result.breakdowns;
 const bases=groups.map(group=>group.denominator);
 return [groups.length<2?'Fewer than two visible groups can be compared.':'Groups use the same source question, answer options, and filter scope.',
  new Set(bases).size>1?'Group sample sizes differ. Check the group bases and percentage definition when comparing.':'',
  card.hiddenRows||card.hiddenColumns?'Some rows or columns are hidden; this comparison covers the visible groups.':'',
  !card.hiddenRows&&!card.hiddenColumns&&result.missing?'Some in-scope records did not answer. Group bases describe the answered records.':'',
  result.kind==='multiple'?'Multiple answers were allowed for each respondent.':''].filter(Boolean);
}

export function resultDiagnostics(card:ChatAnalysisCard){
 if(!card.result)return [card.message||'The result is unavailable.'];
 const single=card.result.rows.filter(row=>row.count>0).length===1;
 return [card.filtered?'Active filters restrict which records can appear. Review the filter scope before making claims about the full project.':
  'No active filters apply to this result.',
  card.hiddenRows||card.hiddenColumns?'The pivot has hidden entries. Review in Analysis to check their visibility.':'The pivot has no manually hidden answer rows or breakdown columns.',
  ...(card.requestedAnswers||[]).flatMap(({label,state,count})=>state==='absent'?[label+' is absent from the form choices.']:
   state==='hidden'?[label+' is hidden in the pivot.']:state==='visible'&&count===0?[label+' was verified at zero in this scope.']:[]),
  single?'Only one visible answer has a recorded count. Check the source question and answer options before interpreting the result.':''].filter(Boolean);
}

export function diagnoseOption(card:ChatAnalysisCard,input:string){
 const query=normalize(input);
 if(!query||!card.result||!card.diagnosticChoices)return '';
 const matches=card.diagnosticChoices.filter(choice=>[choice.id,choice.label].some(value=>normalize(value)===query));
 if(matches.length>1)return 'More than one form option uses that name. Enter the answer code to distinguish them.';
 const option=matches[0];
 if(!option)return 'That option is not listed in the current form.';
 if(option.hidden)return `${option.label} is hidden in this pivot.`;
 const row=card.result.rows.find(row=>row.id===option.id);
 if(!row)return `${option.label} is defined in the form but absent from the visible pivot. It may be outside the filters or omitted by display settings.`;
 return `${option.label}: ${row.count.toLocaleString('en')} recorded in the current pivot.`;
}
