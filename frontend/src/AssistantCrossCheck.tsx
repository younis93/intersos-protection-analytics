import {useState} from 'react';
import {koboRequest} from './koboApi';
import {assistantFields,qualityFindings,type QualityFinding} from './localAssistantApi';
import {koboLabel,type KoboAnalysis,type KoboProject} from './koboTypes';

type Rule={first:string;second:string;when:string;expectation:'patterns'|'blank'|'answer'|'different';expected:string};
const empty:Rule={first:'',second:'',when:'',expectation:'patterns',expected:''};
type Result={withheld?:boolean;checked?:number;violations?:number;patterns?:{first:string;second:string;count:number}[]};

export function crossCheckDraft(project:KoboProject,analysis:KoboAnalysis,prompt:string):Rule{
 const match=prompt.match(/\bif\s+q(?:uestion\s*)?(\d+)\s+(?:is|=)\s+(.+?),?\s+(?:then\s+)?q(?:uestion\s*)?(\d+)\s+(?:should|must)\s+(?:be\s+)?(.+?)[.!?]*$/i);
 if(!match)return empty;
 const fields=assistantFields(project,analysis);
 const find=(number:string)=>fields.find(field=>koboLabel(field,'en').match(/^\s*(\d+)[.):]/)?.[1]===number);
 const first=find(match[1]),second=find(match[3]);
 const code=(field:typeof first,value:string)=>field?.choices.find(choice=>[choice.name,koboLabel(choice,'en')].some(label=>label.toLowerCase()===value.trim().toLowerCase()))?.name||'';
 const condition=match[4].trim();
 const expectation=/^(blank|empty|unanswered)$/i.test(condition)?'blank':/^not\s/i.test(condition)?'different':'answer';
 return {first:first?.id||'',second:second?.id||'',when:code(first,match[2]),expectation,expected:code(second,condition.replace(/^not\s+/i,''))};
}

export default function AssistantCrossCheck({project,analysis,prompt,minimum,onReview,onOpenReview}:{
 project:KoboProject;analysis:KoboAnalysis;prompt:string;minimum:number;onReview:(finding:QualityFinding)=>void;onOpenReview:()=>void;
}){
 const [rule,setRule]=useState(()=>crossCheckDraft(project,analysis,prompt));
 const [result,setResult]=useState<Result>();
 const [findings,setFindings]=useState<QualityFinding[]>();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const fields=assistantFields(project,analysis).filter(field=>field.kind==='category'&&!field.repeat);
 const options=(id:string)=>(fields.find(field=>field.id===id)?.choices||[]).filter(choice=>!analysis.settings.questions[id]?.hiddenAnswers?.includes(choice.name));
 const caption=(id:string)=>{const field=fields.find(item=>item.id===id);return field?koboLabel(field,'en'):'Choose a question';};
 const answer=(id:string,code:string)=>{const option=options(id).find(choice=>choice.name===code);return option?koboLabel(option,'en'):'Choose an answer';};
 const patch=(value:Partial<Rule>)=>{setRule(previous=>({...previous,...value}));setResult(undefined);setError('');};
 const ready=!!rule.first&&!!rule.second&&rule.first!==rule.second&&(rule.expectation==='patterns'||
  options(rule.first).some(item=>item.name===rule.when)&&(rule.expectation==='blank'||options(rule.second).some(item=>item.name===rule.expected)));
 async function load(formRules=false){
  setBusy(true);setError('');
  try{
   if(formRules){
    const permitted=new Set(assistantFields(project,analysis).map(field=>field.id));
    setFindings((await qualityFindings(project.id,analysis,new AbortController().signal))
     .filter(finding=>finding.kind==='conflicts'&&permitted.has(finding.question)));
   }else setResult(await koboRequest<Result>(`/projects/${encodeURIComponent(project.id)}/assistant/cross-check`,{settings:analysis.settings,...rule}));
  }catch(reason){setError(reason instanceof Error?reason.message:'The check could not be completed.');}
  finally{setBusy(false);}
 }
 const choiceSelect=(id:string,label:string,value:string,onChange:(value:string)=>void)=><label>{label}<select value={value} disabled={busy} onChange={event=>onChange(event.target.value)}>
  <option value="">Choose an answer</option>{options(id).map(choice=><option value={choice.name} key={choice.name}>{koboLabel(choice,'en')}</option>)}
 </select></label>;
 return <section className="assistant-card" aria-label="Check answers across questions">
  <h3>Check answers across questions</h3>
  <p>Checks use the filters in effect when this checker opened. A pattern alone does not establish an error.</p>
  <div className="assistant-actions"><button type="button" className="soft" disabled={busy} onClick={()=>void load(true)}>Check existing form rules</button>
   <button type="button" className="soft" onClick={onOpenReview}>Open data review</button></div>
  {findings&&<><h4>Rule violations from the form</h4>{findings.length?<ul className="assistant-review-list">
   {findings.map(item=><li key={item.id}><span>{caption(item.question)} · {item.title}{
    item.count>=minimum&&analysis.filtered-item.count>=minimum?` · ${item.count} affected`:''
   }</span><button type="button" className="soft" onClick={()=>onReview(item)}>Review finding</button></li>)}
  </ul>:<p>No open conflicts were found under the current filters.</p>}</>}
  <div className="assistant-result-control">
   {(['first','second'] as const).map(key=><label key={key}>{key==='first'?'First question':'Second question'}
    <select value={rule[key]} disabled={busy} onChange={event=>patch(key==='first'?{first:event.target.value,when:''}:{second:event.target.value,expected:''})}>
     <option value="">Choose a question</option>{fields.map(field=><option value={field.id} key={field.id}>{koboLabel(field,'en')}</option>)}
    </select></label>)}
   <label>Check type<select value={rule.expectation} disabled={busy} onChange={event=>patch({expectation:event.target.value as Rule['expectation']})}>
    <option value="patterns">Patterns to review</option><option value="blank">Second answer should be blank</option>
    <option value="answer">Second answer should match</option><option value="different">Second answer should differ</option>
   </select></label>
   {rule.expectation!=='patterns'&&choiceSelect(rule.first,'When the first answer is',rule.when,when=>patch({when}))}
   {['answer','different'].includes(rule.expectation)&&choiceSelect(rule.second,'Expected answer',rule.expected,expected=>patch({expected}))}
  </div>
  {ready&&rule.expectation!=='patterns'&&<p>If {caption(rule.first)} is {answer(rule.first,rule.when)}, {caption(rule.second)} should be {
   rule.expectation==='blank'?'blank':`${rule.expectation==='different'?'different from ':''}${answer(rule.second,rule.expected)}`
  }.</p>}
  <button type="button" className="primary" disabled={!ready||busy} onClick={()=>void load()}>{rule.expectation==='patterns'?'Check combinations':'Confirm and check rule'}</button>
  {busy&&<p role="status">Checking responses…</p>}
  {error&&<p role="alert">{error}</p>}
  {result&&(result.withheld?<p>Results are withheld because a small group could be identified.</p>:rule.expectation==='patterns'?
   <><h4>Patterns to review</h4>{result.patterns?.length?<><p>Least frequent visible combinations, up to eight.</p><ul>
    {result.patterns.map(item=><li key={JSON.stringify([item.first,item.second])}>{item.first} / {item.second}: {item.count} responses</li>)}
   </ul></>:<p>No visible combinations under the current filters.</p>}</>:
   <><h4>Rule violations</h4><p>{result.violations} violations among {result.checked} responses checked against your rule.</p></>)}
 </section>;
}
