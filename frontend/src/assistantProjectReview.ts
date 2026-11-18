import {assistantFields,chatFieldIds} from './localAssistantApi';
import {koboLabel,type KoboAnalysis,type KoboFilter,type KoboProject,type KoboResult} from './koboTypes';
import {displayPercent} from './koboPercentages';
import {indicatorQuestion,newIndicator} from './koboIndicatorDraft';

const words=(text:string)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
const contains=(text:string,term:string)=>!!term&&` ${text} `.includes(` ${term} `);

export type FilterProposal={question:string;filters:KoboFilter[];summary:string};

export function proposeChatFilters(project:KoboProject,analysis:KoboAnalysis,prompt:string,minimum=5):FilterProposal|{message:string}|undefined{
 const split=prompt.match(/^(.*?)\s+(?:where|filtered to|only for)\s+(.+)$/i)
  ||prompt.match(/^(.*?)\s+for\s+(.+\s+respondents?)\s*\??$/i);
 const latest=/\s+from\s+(?:the\s+)?(?:latest|most recent)\s+(?:(?:survey|reporting|data collection)\s+)?round\s*\??$/i;
 if(!split&&!latest.test(prompt))return;
 if(split&&!/\b(show|give|count|compare|how many|share|percentage|pivot|distribution|chart|indicator|breakdown|results)\b/i.test(split[1])&&
  !chatFieldIds(project,analysis,split[1]).length)return;
 const fields=assistantFields(project,analysis).filter(field=>field.kind==='category'&&!field.repeat&&!field.localDerived&&!field.addedFromData);
 if(!split){
  const rounds=fields.filter(field=>/\b(round|wave)\b/i.test(koboLabel(field,'en'))&&field.choices.length);
  if(rounds.length===1){
   const field=rounds[0];
   const pivot=analysis.questions.find(result=>result.id===field.id);
   const observed=new Map(pivot?.rows.filter(row=>row.count>0).map(row=>[row.id,row.count])||[]);
   const ranked=field.choices.map(choice=>{
    const label=koboLabel(choice,'en');
    const rank=label.match(/^(?:(?:survey |reporting )?(?:round|wave)\s*)?(\d+)$/i)?.[1];
    return {choice,label,rank:rank==null?NaN:Number(rank)};
   });
   if(ranked.every(item=>Number.isFinite(item.rank))&&new Set(ranked.map(item=>item.rank)).size===ranked.length){
    const item=ranked.filter(item=>observed.has(item.choice.name)).sort((a,b)=>b.rank-a.rank)[0];
    const count=item?observed.get(item.choice.name)||0:0;
    const remainder=(pivot?.denominator||0)-count;
    if(item&&pivot&&!pivot.answerVisibility?.hiddenCount&&count>=minimum&&(remainder===0||remainder>=minimum)){
     const question=prompt.replace(latest,'');
     const segment=question.match(/^(?:show|count|how many)\s+(.+?\s+respondents?)$/i)?.[1];
     const additional=segment?proposeChatFilters(project,analysis,`Show a distribution for ${segment}`):undefined;
     const roundRule:KoboFilter={field:field.id,kind:'category',values:[item.choice.name]};
     const roundLabel=`${koboLabel(field,'en')} = ${item.label} (latest numbered round visible in the current analysis)`;
     if(additional&&'filters' in additional&&additional.filters[0].field!==field.id)return {
      question:`Show question distribution for ${koboLabel(fields.find(candidate=>candidate.id===additional.filters[0].field)!,'en')}`,
      filters:[roundRule,...additional.filters],summary:`${roundLabel}; ${additional.summary}`,
     };
     if(additional&&'message' in additional)return additional;
     return {question,filters:[roundRule],summary:roundLabel};
    }
   }
  }
  return {message:'I could not verify the latest round. Name the round directly, for example “Show needs where Survey round is Round 3.”'};
 }
 const condition=split[2].trim().replace(/[?.]$/,'').replace(/\s+respondents?$/i,'');
 const comparison=condition.match(/^(.+?)\s*(?:\s+is\s+|\s+equals\s+|=)\s*(.+)$/i);
 const matches=comparison?chatFieldIds(project,analysis,comparison[1]):[];
 const options=fields.filter(field=>!comparison||matches.includes(field.id)).flatMap(field=>field.choices
  .filter(choice=>[choice.name,koboLabel(choice,'en')].some(label=>words(label)===words(comparison?.[2]||condition)))
  .map(choice=>({field,choice})));
 if(options.length!==1)return {message:'I could not match that filter to one field and answer. Try “Show needs where Governorate is Erbil.”'};
 const {field,choice}=options[0];
 return {question:split[1],filters:[{field:field.id,kind:'category',values:[choice.name]}],
  summary:`${koboLabel(field,'en')} = ${koboLabel(choice,'en')}`};
}

export function similarAnswerFields(project:KoboProject,analysis:KoboAnalysis){
 return assistantFields(project,analysis).filter(field=>['category','multiple'].includes(field.kind)&&!field.repeat).flatMap(field=>{
  const seen=new Set<string>();
  const spellingKeys=new Set<string>();
  const duplicate=(field.choices||[]).filter(choice=>{
   const key=words(koboLabel(choice,'en'));
   if(!key)return false;
   if(seen.has(key))return true;
   const variants=key.length>=6&&key.length<=60?Array.from(key,(_letter,index)=>key.slice(0,index)+key.slice(index+1)):[];
   const similar=spellingKeys.has(key)||variants.some(variant=>seen.has(variant)||spellingKeys.has(variant));
   seen.add(key);variants.forEach(variant=>spellingKeys.add(variant));
   return similar;
  });
  return duplicate.length?[{id:field.id,label:koboLabel(field,'en'),duplicates:duplicate.length}]:[];
 }).sort((a,b)=>b.duplicates-a.duplicates);
}

export function draftChatIndicator(project:KoboProject,analysis:KoboAnalysis,prompt:string){
 const eligibility=proposeChatFilters(project,analysis,prompt);
 const source=eligibility&&'filters' in eligibility?eligibility.question:prompt;
 const split=source.match(/^(.*?)\s+(?:broken down by|by)\s+(.+)$/i);
 const base=split?.[1]||source;
 const fields=assistantFields(project,analysis).filter(field=>!field.repeat&&['category','multiple','number'].includes(field.kind));
 const ids=chatFieldIds(project,analysis,base);
 const explicit=fields.filter(field=>ids.includes(field.id));
 const breakdown=split?fields.filter(field=>field.kind==='category'&&chatFieldIds(project,analysis,split[2]).includes(field.id)):[];
 const matching=fields.filter(field=>field.kind!=='number'&&field.choices.some(choice=>contains(words(base),words(koboLabel(choice,'en')))));
 const field=(explicit.length===1?explicit:!explicit.length&&matching.length===1?matching:[])[0];
 const rule=field?indicatorQuestion(field):undefined;
 const mode=/\b(average|mean)\b/i.test(base)&&field?.kind==='number'?'numeric_average':
  /\b(sum|total)\b/i.test(base)&&field?.kind==='number'?'numeric_sum':'percentage';
 if(rule&&field&&field.kind!=='number')rule.selectedCodes=field.choices.filter(choice=>contains(words(base),words(koboLabel(choice,'en')))).map(choice=>choice.name);
 const filter=eligibility&&'filters' in eligibility?eligibility.filters[0]:undefined;
 return {draft:{...newIndicator(),name:field?`${mode==='percentage'?'Share by answer':mode==='numeric_average'?'Average':'Total'} - ${koboLabel(field,'en')}`.slice(0,200):'',
  mode:mode as 'percentage'|'numeric_sum'|'numeric_average',questions:rule?[rule]:[],eligibilityField:filter?.field,
  eligibilityCodes:filter?.values,breakdownField:breakdown.length===1?breakdown[0].id:undefined},
  note:!field||rule?.kind!=='number'&&!rule?.selectedCodes?.length||eligibility&&'message' in eligibility||split&&breakdown.length!==1
   ?'Some rules need your input. Review the question, answer conditions, eligibility, and breakdown before previewing.':
   'Review the draft definition and preview the numerator, denominator, and result before saving.'};
}

export type ReportCheckSource={label:string;result:KoboResult};
export function checkReportClaims(draft:string,sources:ReportCheckSource[]){
 const checks:{claim:string;note:string}[]=[];
 for(const claim of draft.split(/\n+|(?<=[.!?])\s+/).map(line=>line.trim()).filter(Boolean)){
  const context=words(claim);
  const candidates=sources.flatMap(({label,result})=>result.rows.filter(row=>row.id!=='__blank__'&&words(row.label).length>2&&contains(context,words(row.label))
   &&!result.breakdowns.some(group=>contains(context,words(group.label))))
   .map(row=>({label,result,row})));
  const scoped=candidates.filter(({result})=>contains(context,words(result.label)));
  const match=(scoped.length?scoped:candidates);
  const percentages=[...claim.matchAll(/\b(\d+(?:\.\d+)?)\s*%/g)];
  const denominators=[...claim.matchAll(/\b(?:out of|denominator(?: of| is)?|base(?: of| is)?|n\s*=)\s*([\d,]+)/gi)];
  const counts=[...claim.matchAll(/\b([\d,]+)\s+(?:respondents?|responses?|households?|participants?|cases?)\b/gi)]
   .filter(figure=>!denominators.some(base=>figure.index>=base.index&&figure.index<base.index+base[0].length));
  if(percentages.length||counts.length||denominators.length){
   if(match.length===1&&percentages.length<=1&&counts.length<=1&&denominators.length<=1){
    const {label,result,row}=match[0];
    const percent=displayPercent(row);
    const expectedBase=/hidden answers remain included/i.test(result.percentageBasis||'')?undefined:
     result.percentageMode==='legacy-respondents'?result.respondentBasis?.denominator??result.denominator:
     result.percentageMode==='row-total'?row.count:result.pivotTotal?.count;
    const mismatch=percentages.some(([,raw])=>percent==null||Math.abs(Number(raw)-percent)>0.5*10**-(raw.split('.')[1]?.length||0)+1e-8)
     ||counts.some(([,raw])=>Number(raw.replaceAll(',',''))!==row.count)
     ||denominators.some(([,raw])=>expectedBase!==undefined&&Number(raw.replaceAll(',',''))!==expectedBase);
    checks.push({claim,note:mismatch?`Check against ${label}. Current source shows ${row.label}: ${row.count}${percent==null?'':` (${percent}%)`}. ${result.percentageBasis||''}`
     :denominators.length&&expectedBase===undefined?`Review the denominator in ${label}. ${result.percentageBasis||'The percentage base could not be verified.'}`
     :`Figures match ${label}. Confirm that the draft describes the same filter scope.`});
   }else checks.push({claim,note:'This figure could not be tied to one source. Name the question, answer, and reporting scope.'});
  }
  if(/\b(trend|caused|led to|resulted in|statistically significant|representative)\b/i.test(claim))
   checks.push({claim,note:'This interpretation needs evidence beyond a matching figure. Check comparability, sample sizes, and whether the data supports the claim.'});
 }
 return checks;
}
