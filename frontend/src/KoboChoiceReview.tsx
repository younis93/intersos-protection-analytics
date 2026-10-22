import {ArrowLeft,ArrowRight,CheckCircle2,AlertCircle,LoaderCircle} from 'lucide-react';
import {useEffect,useMemo,useRef,useState} from 'react';
import {AppSelect} from './SelectionControls';
import {koboApi} from './koboApi';
import {koboLabel,type KoboChoiceComparison,type KoboMapping,type KoboPreview,type KoboQuestion,type KoboReviewChoice,type KoboReviewConfig} from './koboTypes';

export default function KoboChoiceReview({question,baseQuestion,preview,mappings,config,busy,onApply,onCancel,embedded=false,onBack,prepareFromData=false}:{question:KoboQuestion;baseQuestion:KoboQuestion;preview:KoboPreview;mappings:KoboMapping[];config:KoboReviewConfig;busy:boolean;onApply:(config:KoboReviewConfig,mappings:KoboMapping[])=>void;onCancel:()=>void;embedded?:boolean;onBack?:()=>void;prepareFromData?:boolean}){
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{if(embedded)return;const opener=document.activeElement;root.current?.scrollIntoView({block:'start'});root.current?.focus({preventScroll:true});return()=>{if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true})}},[]);
 const existing=config.choiceOverrides[question.id];
 const partition=useRef<string|null>(null),autoSeed=prepareFromData&&!baseQuestion.choices.length&&!existing;
 const choiceList=useRef<HTMLDivElement>(null),separatorInput=useRef<HTMLInputElement>(null),answerRows=useRef<HTMLDivElement>(null),consent=useRef<HTMLInputElement>(null);
 const[mode,setMode]=useState<'form'|'data'|'custom'>(existing?.mode==='form'&&!baseQuestion.choices.length?'custom':existing?.mode||(prepareFromData?'data':baseQuestion.choices.length?'form':'custom')),[choices,setChoices]=useState<KoboReviewChoice[]>(question.choices),[separator,setSeparator]=useState(existing?.separator||config.addedQuestions.find(q=>q.id===question.id)?.separator||''),[confirmedSeparator,setConfirmedSeparator]=useState(question.kind!=='multiple'||!!(existing?.separator||config.addedQuestions.find(q=>q.id===question.id)?.separator)),[data,setData]=useState<KoboChoiceComparison|null>(null),[error,setError]=useState(''),[search,setSearch]=useState(''),[limit,setLimit]=useState(30),[answerMap,setAnswerMap]=useState<Record<string,string>>({}),[ack,setAck]=useState(false),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
 const requestConfig=useMemo(()=>({...config,choiceOverrides:Object.fromEntries(Object.entries(config.choiceOverrides).filter(([id])=>id!==question.id))}),[config,question.id]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null);
  void koboApi.reviewChoices(preview.token,mappings,requestConfig,question.id,question.kind==='multiple'&&confirmedSeparator?separator:'',controller.signal).then(result=>{if(controller.signal.aborted)return;setData(result);
   if(question.kind!=='multiple'||confirmedSeparator){
    const key=question.kind==='multiple'?separator:'single';
    const initial=Object.fromEntries(result.answers.map(a=>{const saved=mappings.filter(m=>m.question===question.id&&!m.option&&a.value in (m.answerMap||{})).map(m=>m.answerMap![a.value]);return [a.value,saved.length&&saved.every(v=>v===saved[0])?saved[0]:a.matches.length===1?a.matches[0]:'__unresolved__']}));
    if(autoSeed&&partition.current!==key){setMode('data');setChoices(result.proposedChoices);setAnswerMap(Object.fromEntries(result.answers.map(a=>[a.value,a.suggestedCode])))}
    else {const samePartition=partition.current===key;setAnswerMap(previous=>samePartition?{...initial,...Object.fromEntries(Object.entries(previous).filter(([raw])=>result.answers.some(a=>a.value===raw)))}:initial)}
    partition.current=key;
   }
   setLoading(false)}).catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:String(e));setLoading(false)}});
  return()=>controller.abort();
 },[preview.token,mappings,requestConfig,question.id,confirmedSeparator,separator,retry]);
 const finalChoices=mode==='form'?baseQuestion.choices:choices;
 const finalCodes=new Set(finalChoices.map(c=>c.name));
 const choiceOptions:[string,string][]=finalChoices.map(c=>{const label=koboLabel(c,'en');return [c.name,finalChoices.filter(other=>koboLabel(other,'en')===label).length>1?`${label} · ${c.name}`:label]});
 const unresolved=(data?.answers||[]).filter(a=>!(a.value in answerMap)||answerMap[a.value]==='__unresolved__'||!!answerMap[a.value]&&!finalCodes.has(answerMap[a.value]));
 const removed=baseQuestion.choices.filter(c=>!finalCodes.has(c.name));
 const references=[...new Set(removed.flatMap(c=>{const refs=data?.settingsReferences[c.name];return Array.isArray(refs)?refs.filter((v):v is string=>typeof v==='string'):[]}))];
 const affected=(data?.answers||[]).filter(a=>answerMap[a.value]===''||a.matches.length!==1||answerMap[a.value]!==a.matches[0]).reduce((n,a)=>n+a.count,0);
 const splitBlocked=question.kind==='multiple'&&!confirmedSeparator;
 const changeMode=(next:'form'|'data'|'custom')=>{
  setMode(next);setAck(false);
  if(next==='data'&&data){setChoices(data.proposedChoices);setAnswerMap(Object.fromEntries(data.answers.map(a=>[a.value,a.suggestedCode])))}
  if(next==='custom')setChoices(mode==='form'?baseQuestion.choices:choices);
 };
 const addAnswers=(answers:NonNullable<KoboChoiceComparison['answers']>)=>{
  if(!data)return;
  const next=[...finalChoices],map={...answerMap};
  for(const answer of answers){
   if(!next.some(c=>c.name===answer.suggestedCode)){
    const suggested=data.proposedChoices.find(c=>c.name===answer.suggestedCode);
    if(suggested){
     const labels={...suggested.labels};
     const aliases=new Set(next.flatMap(c=>[c.name,...Object.values(c.labels)]).filter((v):v is string=>!!v).map(v=>v.trim().toLocaleLowerCase()));
     for(const language of Object.keys(labels) as (keyof typeof labels)[]){const original=labels[language];if(!original)continue;let suffix=1;while(aliases.has(labels[language]!.trim().toLocaleLowerCase()))labels[language]=`${original} (new choice${suffix++>1?` ${suffix-1}`:''})`}
     next.push({...suggested,labels});
    }
   }
   map[answer.value]=answer.suggestedCode;
  }
  setMode('custom');setChoices(next);setAnswerMap(map);setAck(false);
 };
 const focusChoices=()=>{const index=Math.max(0,finalChoices.findIndex(c=>!Object.values(c.labels).some(v=>v?.trim())));if(mode==='form'){setMode('custom');setChoices([...finalChoices])}requestAnimationFrame(()=>{const row=choiceList.current?.children[index] as HTMLElement|undefined;row?.scrollIntoView({block:'center'});row?.querySelector<HTMLInputElement>('input')?.focus()})};
 const focusUnresolved=()=>{setSearch('');setLimit(data?.answers.length||30);requestAnimationFrame(()=>{const row=answerRows.current?.querySelector<HTMLElement>('[data-answer-state="unresolved"]');row?.scrollIntoView({block:'center'});row?.querySelector<HTMLButtonElement>('.app-select-trigger')?.focus()})};
 const invalidLabels=finalChoices.filter(c=>!Object.values(c.labels).some(v=>v?.trim())).length;
 const invalidOption=mappings.find(m=>m.question===question.id&&m.option&&!finalCodes.has(m.option));
 const blockers:{message:string;label?:string;action?:()=>void}[]=[];
 if(loading)blockers.push({message:'Reading all source answers. Please wait.'});
 else if(error)blockers.push({message:error,label:'Retry comparison',action:()=>setRetry(n=>n+1)});
 else if(splitBlocked)blockers.push({message:'Confirm the separator to prepare individual answer choices.',label:'Review separator',action:()=>{separatorInput.current?.scrollIntoView({block:'center'});separatorInput.current?.focus()}});
 else if(data){
  if(!finalChoices.length)blockers.push({message:'No final choices exist yet. Create choices to continue.',label:data.answers.length?'Create choices from data':'Add a choice',action:()=>{if(data.answers.length)addAnswers(data.answers);else{setMode('custom');setChoices([{name:'data_'+crypto.randomUUID().replace(/-/g,''),labels:{en:''}}]);requestAnimationFrame(focusChoices)}}});
  if(invalidLabels)blockers.push({message:`${invalidLabels} ${invalidLabels===1?'choice needs a label':'choices need labels'}.`,label:'Edit choice labels',action:focusChoices});
  if(unresolved.length)blockers.push({message:`${unresolved.length} source ${unresolved.length===1?'answer needs':'answers need'} a destination choice or explicit exclusion.`,label:'Review unresolved answers',action:focusUnresolved});
  if(invalidOption)blockers.push({message:`The option column ${invalidOption.header} uses a removed choice. Restore the choice or remap the column.`});
  if(!embedded&&!ack)blockers.push({message:'Confirm that you reviewed the choices and affected settings.',label:'Review confirmation',action:()=>{consent.current?.scrollIntoView({block:'center'});consent.current?.focus()}});
 }
 const excludedCount=(data?.answers||[]).filter(a=>answerMap[a.value]==='').length;
 const excludedOccurrences=(data?.answers||[]).filter(a=>answerMap[a.value]==='').reduce((sum,a)=>sum+a.count,0);
 const mappedOccurrences=(data?.answers||[]).filter(a=>!!answerMap[a.value]&&finalCodes.has(answerMap[a.value])).reduce((sum,a)=>sum+a.count,0);
 const readyCount=(data?.answers.length||0)-unresolved.length;
 const apply=()=>{
  if(!data||unresolved.length||(!embedded&&!ack)||splitBlocked||!finalChoices.length||finalChoices.some(c=>!Object.values(c.labels).some(v=>v?.trim())))return;
  const invalidSplit=mappings.find(m=>m.question===question.id&&m.option&&!finalCodes.has(m.option));
  if(invalidSplit){setError(`The option column ${invalidSplit.header} uses a removed choice. Remap or ignore this column before removing that choice.`);return}
  const next={...config,choiceOverrides:{...config.choiceOverrides,[question.id]:{mode,choices:finalChoices,separator:question.kind==='multiple'?separator:''}}};
  onApply(next,mappings.map(m=>m.question===question.id&&!m.option?{...m,answerMap:{...Object.fromEntries(Object.entries(m.answerMap||{}).filter(([,v])=>!v||finalCodes.has(v))),...answerMap}}:m));
 };
 const rows=(data?.answers||[]).filter(a=>a.value.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <section ref={root} tabIndex={-1} className="kobo-choice-review" aria-label={`Review answer choices for ${koboLabel(question,'en')}`}>
  <header><div><h4>Review answer choices</h4><strong dir="auto">{koboLabel(question,'en')}</strong><p>These choices apply to this analysis project. Your uploaded form stays unchanged.</p></div>{!embedded&&<button className="soft" type="button" disabled={busy} onClick={onCancel}>Close choice review</button>}</header>
  {!prepareFromData&&<div className="kobo-choice-comparison"><div><h5>{config.addedQuestions.some(q=>q.id===question.id)?'Current choices':'Form choices'} ({baseQuestion.choices.length})</h5><div className="kobo-choice-scroll">{baseQuestion.choices.map(c=><p key={c.name} dir="auto">{koboLabel(c,'en')} <small>{c.name}{data?.unusedChoices.includes(c.name)?' · No answers found in data':''}</small></p>)}{!baseQuestion.choices.length&&<p>This new question has no form choices.</p>}</div></div><div><h5>Differences</h5><p>{data?`${data.answers.filter(a=>!a.matches.length).length} unrecognized answers · ${data.answers.filter(a=>a.matches.length>1).length} ambiguous answers · ${data.unusedChoices.length} unused form choices`:'Reading all source rows...'}</p><p>Unused form choices remain valid. Match data codes or labels to the final choices below.</p></div></div>}
  {question.kind==='multiple'&&<div className="kobo-separator-review"><label className="kobo-field">Separator between answers<input ref={separatorInput} aria-label="Separator between answers" value={separator} placeholder="For example: space, comma, semicolon, or |" disabled={busy} onChange={e=>{setSeparator(e.target.value);setConfirmedSeparator(false);setAck(false)}}/></label><button className="soft" disabled={busy||!separator||loading} onClick={()=>setConfirmedSeparator(true)}>Confirm separator</button><p>{confirmedSeparator?'Separator confirmed. Review the individual options below.':'Confirm the separator before preparing choices. Changing it rebuilds the suggestions.'}</p>{!!data?.examples.length&&<details open><summary>Multiple-choice answer preview</summary>{data.examples.map((ex,i)=><p key={i} dir="auto">{ex.value} → {(confirmedSeparator?ex.parts:separator?ex.value.split(separator).map(v=>v.trim()).filter(Boolean):ex.parts).join(' | ')}</p>)}</details>}</div>}
  {prepareFromData&&data&&!splitBlocked&&<div className="kobo-choice-intro" role="note"><strong>We found {data.answers.length} different {data.answers.length===1?'answer':'answers'}.</strong><p>Each will become a choice. You can keep, rename, combine, or exclude them. These are draft suggestions until you select Add question on the final review.</p></div>}
  {!splitBlocked&&<>
  <AppSelect label="CHOICES TO USE IN ANALYSIS" ariaLabel="Choices to use in analysis" disabled={busy||loading||splitBlocked} value={mode} options={[...(baseQuestion.choices.length?[["form","Use form choices"] as [string,string]]:[]),["data",prepareFromData?"Use choices from data":"Replace choices with data answers"],["custom","Customize choices"]]} onChange={v=>changeMode(v as typeof mode)}/>
  <p>{mode==='form'?'Keep the form list. Map each unrecognized answer or explicitly exclude it as blank.':mode==='data'?'Use choices derived from all observed data answers. Review the list before applying.':'Edit the final list and map equivalent source answers to the same choice.'}</p>
  <h5>Final choices used in analysis ({finalChoices.length})</h5><div ref={choiceList} className="kobo-choice-scroll">{finalChoices.map((c,i)=><div className="kobo-final-choice" key={`${i}:${c.name}`}><code>{c.name}</code>{mode==='form'?<span dir="auto">{koboLabel(c,'en')}</span>:<><label>English label<input aria-label={`English label for ${c.name}`} value={c.labels.en||c.labels.default||''} disabled={busy} onChange={e=>{setAck(false);setChoices(choices.map((a,j)=>i===j?{...a,labels:{...a.labels,en:e.target.value}}:a))}}/></label><label>Arabic label<input dir="auto" aria-label={`Arabic label for ${c.name}`} value={c.labels.ar||''} disabled={busy} onChange={e=>{setAck(false);setChoices(choices.map((a,j)=>i===j?{...a,labels:{...a.labels,ar:e.target.value}}:a))}}/></label><button className="soft" disabled={busy} onClick={()=>{setChoices(choices.filter((_,j)=>i!==j));setAck(false)}}>Remove choice</button></>}</div>)}</div>
  <div className="kobo-mapping-explicit-actions">{mode!=='form'&&<button className="soft" disabled={busy} onClick={()=>{setChoices([...choices,{name:'data_'+crypto.randomUUID().replace(/-/g,''),labels:{en:'New choice'}}]);setAck(false)}}>Add choice</button>}<button className="soft" disabled={busy||loading||!data||!unresolved.length} onClick={()=>addAnswers(unresolved)}>Add missing answers as choices</button></div>
  <h5>Review how answers will be used ({data?.answers.length||0})</h5><p>Keep an answer as its own choice, select another choice to combine equivalent answers, or explicitly exclude it from analysis.</p><label className="kobo-field">Search source answers<input aria-label="Search choice review answers" value={search} onChange={e=>{setSearch(e.target.value);setLimit(30)}}/></label>
  <div ref={answerRows}>{rows.slice(0,limit).map(a=>{const mapped=answerMap[a.value],excluded=mapped==='',ready=mapped!==undefined&&mapped!=='__unresolved__'&&(excluded||finalCodes.has(mapped));return <div className="kobo-answer-link-row kobo-answer-decision-row" key={a.value} data-answer-state={ready?excluded?'excluded':'ready':'unresolved'}><span dir="auto"><strong>{a.value}</strong><small>{a.count} occurrences</small><span className={`kobo-answer-status ${ready?excluded?'is-excluded':'is-ready':'is-unresolved'}`}>{ready?excluded?'Excluded':'Ready':'Needs a decision'}</span></span><div className="kobo-answer-destination"><AppSelect searchable label="CHOICE USED IN ANALYSIS" ariaLabel={`Final choice for ${a.value}`} disabled={busy} value={ready?mapped:'__unresolved__'} options={[["__unresolved__","Choose a destination choice"],["","Exclude from analysis"],...choiceOptions]} onChange={v=>{setAnswerMap({...answerMap,[a.value]:v});setAck(false)}}/><div className="kobo-answer-row-actions">{!ready&&<button className="soft" disabled={busy||loading} onClick={()=>addAnswers([a])}>Create a choice from this answer</button>}{!excluded&&<button className="soft" disabled={busy} onClick={()=>{setAnswerMap({...answerMap,[a.value]:''});setAck(false)}}>Exclude from analysis</button>}</div></div></div>})}</div>
  {rows.length>limit&&<button className="soft" onClick={()=>setLimit(n=>n+30)}>Show more answers ({rows.length-limit} remaining)</button>}
  </>}
  {loading&&<p role="status">Reading choices from all mapped source rows...</p>}{error&&<p className="error" role="alert">{error} <button className="soft" onClick={()=>setRetry(n=>n+1)}>Retry choice comparison</button></p>}
  <div className="kobo-choice-impact"><h5>Review changes before applying</h5><p>{finalChoices.filter(c=>!baseQuestion.choices.some(b=>b.name===c.name)).length} choices added · {finalChoices.filter(c=>baseQuestion.choices.some(b=>b.name===c.name&&JSON.stringify(b.labels)!==JSON.stringify(c.labels))).length} labels changed · {removed.length} form choices removed · {prepareFromData?`${mappedOccurrences} source answer occurrences mapped · ${excludedOccurrences} excluded`:`${affected} source answer occurrences remapped or excluded`} · {unresolved.length} answers still need a decision</p>{removed.length>0&&<p>Removed choices: {removed.map(c=>koboLabel(c,'en')).join(', ')}</p>}{references.length>0&&<><p>Saved settings referencing removed choices need review:</p><ul>{references.map(path=><li key={path}>{path}</li>)}</ul></>}{!embedded&&<label><input ref={consent} type="checkbox" checked={ack} disabled={busy||loading} onChange={e=>setAck(e.target.checked)}/> I reviewed the final choices, answer mappings, and affected settings.</label>}</div>
  <footer className={`kobo-choice-progress-footer ${blockers.length?'has-blockers':'is-ready'}`}><div className="kobo-choice-progress" aria-live="polite"><div className="kobo-choice-readiness"><span className="kobo-choice-readiness-icon" aria-hidden="true">{loading?<LoaderCircle className="kobo-setup-spinner"/>:blockers.length?<AlertCircle/>:<CheckCircle2/>}</span><strong>{loading?'Reading source answers...':splitBlocked?'Confirm answer separator':`${readyCount} of ${data?.answers.length||0} answers ready${excludedCount?` · ${excludedCount} excluded`:''}`}</strong></div>{!!blockers.length&&<ul>{blockers.map((block,i)=><li key={i}>{block.message}{block.action&&<button type="button" className="soft" disabled={busy} onClick={block.action}>{block.label}</button>}</li>)}</ul>}{!blockers.length&&<p>{embedded?'Review your question before adding it.':'Ready to apply your reviewed choices.'}</p>}</div><div className="kobo-choice-footer-actions"><button className="soft kobo-setup-cancel" disabled={busy} onClick={onCancel}>{embedded?'Cancel':'Cancel choice changes'}</button><div className="kobo-choice-navigation">{onBack&&<button className="soft kobo-setup-back" disabled={busy} onClick={onBack}><ArrowLeft aria-hidden="true"/>Back</button>}<button className="primary" disabled={busy||!data||!!blockers.length} onClick={apply}>{embedded?'Next':'Apply reviewed choices'}<ArrowRight aria-hidden="true"/></button></div></div></footer>
 </section>;
}
