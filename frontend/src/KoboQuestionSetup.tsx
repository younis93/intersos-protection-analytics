import {addedGroupOptions,groupPath,suggestQuestionGroup} from './koboAddedQuestionGroups';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,FileSpreadsheet,LoaderCircle,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import KoboChoiceReview from './KoboChoiceReview';
import {koboApi} from './koboApi';
import {linkColumn,linkKey} from './koboImportLinks';
import {reviewForm} from './koboReviewConfig';
import {koboLabel,type KoboAddedQuestion,type KoboMapping,type KoboPreview,type KoboReviewConfig} from './koboTypes';
import './koboQuestionSetup.css';

type Draft={config:KoboReviewConfig;mappings:KoboMapping[]};
const types={text:'Text',number:'Number',date:'Date',category:'Single choice',multiple:'Multiple choice'};

export default function KoboQuestionSetup({mapping,preview,existing,mappings,config,policies,busy,onSave,onCancel}:{mapping:KoboMapping;preview:KoboPreview;existing?:KoboAddedQuestion;mappings:KoboMapping[];config:KoboReviewConfig;policies:Record<string,string>;busy:boolean;onSave:(config:KoboReviewConfig,mappings:KoboMapping[])=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef(document.activeElement),titleId=useId(),descriptionId=useId();
 const direction=useRef(opener.current instanceof HTMLElement?opener.current.closest('[dir]')?.getAttribute('dir')||document.documentElement.dir||'ltr':'ltr');
 const[qid]=useState(()=>existing?.id||'added_'+crypto.randomUUID().replace(/-/g,''));
 const[label,setLabel]=useState(existing?.label||mapping.header),[kind,setKind]=useState<string>(existing?.kind||'category');
 const[step,setStep]=useState<'details'|'choices'|'review'>('details'),[candidate,setCandidate]=useState<Draft|null>(null),[reviewed,setReviewed]=useState<Draft|null>(null),[checking,setChecking]=useState(false),[checkError,setCheckError]=useState(''),[issues,setIssues]=useState<KoboPreview['issues']>([]),[retry,setRetry]=useState(0),[validated,setValidated]=useState('');
 const norm=(s:string)=>s.trim().toLocaleLowerCase(),sheet=preview.sheets[mapping.sheet];
 const repeat=existing?existing.repeat:mapping.sheet===0?'':preview.form.groups.find(g=>g.repeat&&[g.id,g.name,...Object.values(g.labels)].some(a=>a&&(norm(sheet?.name||'')===norm(a)||norm(sheet?.name||'').endsWith('/'+norm(a)))))?.id;
 const groupOptions=useMemo(()=>addedGroupOptions(preview.form,repeat??''),[preview.form,repeat]);
 const suggestion=useMemo(()=>suggestQuestionGroup(mapping.header,preview.form,mappings,repeat??''),[mapping.header,preview.form,mappings,repeat]);
 const[group,setGroup]=useState(()=>existing?(existing.group??existing.repeat):(suggestion.suggested?.group??repeat??''));
 const groupValid=groupOptions.some(([id])=>id===group);
 const categorical=kind==='category'||kind==='multiple';
 const samples=preview.linkReview?.columns[linkKey(mapping)]?.samples||[];
 useEffect(()=>{const node=dialog.current;node?.showModal();node?.querySelector<HTMLInputElement>('[aria-label="New question label"]')?.focus();return()=>{node?.close();requestAnimationFrame(()=>{const target=opener.current instanceof HTMLElement&&opener.current.isConnected?opener.current:document.querySelector<HTMLElement>('.kobo-mapping-tabs [aria-selected="true"]');target?.focus({preventScroll:true})})}},[]);
 useEffect(()=>{if(step==='details')dialog.current?.querySelector<HTMLInputElement>('[aria-label="New question label"]')?.focus();else{const node=dialog.current?.querySelector<HTMLElement>(`[data-setup-step="${step}"]`);node?.focus({preventScroll:true});node?.scrollIntoView({block:'start'})}},[step]);
 const nextDetails=()=>{
  if(!label.trim()||!kind||repeat===undefined||!groupValid)return;
  if(!candidate){
   const question:KoboAddedQuestion={id:qid,label:label.trim(),kind:kind as KoboAddedQuestion['kind'],sheet:existing?.sheet??mapping.sheet,column:existing?.column??mapping.column,repeat,group,choices:existing?.kind===kind?existing.choices:[],separator:existing?.kind===kind?existing.separator:''};
   const nextConfig={...config,addedQuestions:[...config.addedQuestions.filter(q=>q.id!==qid),question],choiceOverrides:Object.fromEntries(Object.entries(config.choiceOverrides).filter(([id])=>id!==qid))};
   const nextMappings=(existing?mappings.map(m=>m.question===qid&&existing.kind!==kind?{...m,option:'',answerMap:{},mergeMode:'' as const}:m):linkColumn(mappings,mapping,qid)).map(m=>m.question===qid?{...m,sourceKind:'',sourceRepeat:repeat}:m);
   setCandidate({config:nextConfig,mappings:nextMappings});
  }
  setCheckError('');setStep(categorical?'choices':'review');
 };
 const finalDraft=useMemo(()=>{
  const draft=categorical?reviewed:candidate;if(!draft)return null;
  return {...draft,config:{...draft.config,addedQuestions:draft.config.addedQuestions.map(q=>q.id===qid?{...q,label:label.trim(),group}:q)}};
 },[candidate,reviewed,categorical,qid,label,group]);
 const validationSignature=JSON.stringify(finalDraft);
 useEffect(()=>{
  if(step!=='review'||!finalDraft)return;
  const controller=new AbortController();setChecking(true);setCheckError('');setIssues([]);
  void koboApi.check(preview.token,finalDraft.mappings,policies,controller.signal,finalDraft.config).then(result=>{if(!controller.signal.aborted){setIssues(result.issues.filter(i=>i.question===qid));setValidated(validationSignature);setChecking(false)}}).catch(e=>{if(!controller.signal.aborted){setCheckError(e instanceof Error?e.message:String(e));setChecking(false)}});
  return()=>controller.abort();
 },[step,finalDraft,preview.token,policies,qid,retry]);
 const candidateQuestion=candidate?reviewForm(preview.form,candidate.config).questions.find(q=>q.id===qid):undefined;
 const finalQuestion=finalDraft?reviewForm(preview.form,finalDraft.config).questions.find(q=>q.id===qid):undefined;
 const excluded=[...new Set((finalDraft?.mappings||[]).filter(m=>m.question===qid).flatMap(m=>Object.entries(m.answerMap||{}).filter(([,v])=>v==='').map(([v])=>v)))];
 const finalLabel=existing?'Save changes':'Add question';
 const steps=categorical?['Question details','Answer choices','Review']:['Question details','Review'];
 const stepIndex=step==='details'?0:step==='choices'?1:steps.length-1;
 return createPortal(<dialog ref={dialog} className="kobo-dialog glass kobo-question-setup" dir={direction.current} aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={e=>{if(e.key!=='Tab'||e.defaultPrevented)return;const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')).filter(node=>node.getClientRects().length>0);const first=nodes[0],last=nodes.at(-1);if(first&&last&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus()}}} onCancel={e=>{e.preventDefault();e.stopPropagation();if(!busy)onCancel()}}>
  <header><div><span className="eyebrow">QUESTION SETUP</span><h2 id={titleId}>{existing?'Edit added question':'Add a new question'}</h2></div><button type="button" className="soft" disabled={busy} aria-label="Close question setup" onClick={onCancel}><X/></button></header>
  <div className="kobo-question-setup-context"><p id={descriptionId}>Set up this question, then review it before adding it to your analysis.</p><ol aria-label="Question setup progress">{steps.map((name,i)=><li key={name} className={i===stepIndex?'is-current':i<stepIndex?'is-complete':''} aria-current={i===stepIndex?'step':undefined}><span>{i<stepIndex?<Check aria-hidden="true"/>:i+1}</span>{name}</li>)}</ol></div>
  <div className="kobo-question-setup-body">
   <section hidden={step!=='details'} data-setup-step="details" className="kobo-question-details">
    <div className="kobo-question-setup-source"><FileSpreadsheet aria-hidden="true"/><div><small>SOURCE COLUMN</small><strong dir="auto">{mapping.header||'Untitled column'}</strong><p>{sheet?.name||'Original source no longer available'} · Column {mapping.column+1}</p>{!!samples.length&&<div className="kobo-source-samples"><small>Sample answers</small>{samples.map((value,i)=><span key={i} dir="auto">{value}</span>)}</div>}</div></div>
    <label className="kobo-field">Question label<input aria-label="New question label" value={label} maxLength={1000} disabled={busy} onChange={e=>setLabel(e.target.value)}/></label>
    <AppSelect label="Question type" ariaLabel="New question type" disabled={busy} value={kind} options={[["","Choose a question type"],...Object.entries(types)]} onChange={value=>{if(value!==kind){setKind(value);setCandidate(null);setReviewed(null);setIssues([]);setCheckError('')}}}/>
    <AppSelect label="Question group" ariaLabel="Question group" searchable disabled={busy||repeat===undefined} value={group} options={groupOptions} onChange={setGroup}/>
    {!existing&&suggestion.candidates.length>0&&<section className="kobo-question-group-suggestion" aria-label="Group suggestions">{suggestion.suggested?<><strong>Suggested group</strong><p dir="auto">{suggestion.suggested.path}</p><small>Based on similar question: <span dir="auto">{suggestion.suggested.label}</span></small>{group!==suggestion.suggested.group&&<button type="button" className="soft" disabled={busy} onClick={()=>setGroup(suggestion.suggested!.group)}>Use suggested group</button>}</>:<><strong>Similar questions</strong><p>Choose the group that fits your new question.</p>{suggestion.candidates.map(item=><button type="button" className="soft" disabled={busy} key={item.question} onClick={()=>setGroup(item.group)}><span dir="auto">{item.label}</span><small dir="auto">{item.path}</small></button>)}</>}<p>This suggests where to place your new question. Its answers and choices are configured separately.</p></section>}
    {!groupValid&&<p className="error" role="alert">Choose an available group within this worksheet’s repeat context.</p>}
    <p>{categorical?'Next, review answer choices and how source answers map to them.':'Text, Number, and Date go directly to the final review.'}</p>
    {repeat===undefined&&<p role="alert" className="error">This worksheet does not match a form repeat group. A question cannot be added in this context.</p>}
   </section>
   {candidate&&candidateQuestion&&categorical&&<section hidden={step!=='choices'} tabIndex={-1} data-setup-step="choices"><KoboChoiceReview key={kind} embedded prepareFromData={!existing||existing.kind!==kind} question={{...candidateQuestion,labels:{en:label.trim()}}} baseQuestion={candidateQuestion} preview={preview} mappings={candidate.mappings} config={candidate.config} busy={busy} onCancel={onCancel} onBack={()=>setStep('details')} onApply={(nextConfig,nextMappings)=>{setReviewed({config:nextConfig,mappings:nextMappings});setStep('review')}}/></section>}
   {step==='review'&&finalQuestion&&<section tabIndex={-1} data-setup-step="review" className="kobo-question-final-review"><h3>Review your question</h3><dl><div><dt>Question label</dt><dd dir="auto">{label.trim()}</dd></div><div><dt>Question type</dt><dd>{types[finalQuestion.kind]}</dd></div><div><dt>Question group</dt><dd dir="auto">{groupPath(preview.form.groups,group)}</dd></div><div><dt>Source column</dt><dd dir="auto">{mapping.header}</dd></div></dl>
    {categorical&&<><h4>Final choices ({finalQuestion.choices.length})</h4><ul className="kobo-question-final-choices">{finalQuestion.choices.map(c=><li key={c.name}><strong dir="auto">{koboLabel(c,'en')}</strong><small>{c.name}</small></li>)}</ul>{kind==='multiple'&&<p>Answer separator: <code>{finalDraft?.config.choiceOverrides[qid]?.separator===' '?'Space':finalDraft?.config.choiceOverrides[qid]?.separator}</code></p>}<h4>Excluded answers ({excluded.length})</h4>{excluded.length?<ul>{excluded.map(value=><li dir="auto" key={value}>{value}</li>)}</ul>:<p>No source answers are explicitly excluded.</p>}</>}
    <p className="kobo-question-staging-note">{existing?'Save changes updates this question in the staged review.':'Add question adds this question to the staged review.'} The project is saved when you apply the overall review. Uploaded files stay unchanged.</p>
    {checking&&<p role="status"><LoaderCircle className="kobo-setup-spinner"/>Checking source answers against this question...</p>}{!!issues.length&&<div role="alert" className="error"><strong>Review these answers before continuing:</strong>{issues.map((issue,i)=><p key={i}>{issue.message} · {issue.count} affected rows</p>)}</div>}{checkError&&<p className="error" role="alert">{checkError} <button className="soft" onClick={()=>setRetry(n=>n+1)}>Retry checks</button></p>}
   </section>}
  </div>
  {step!=='choices'&&<footer className="kobo-question-setup-footer"><button type="button" className="soft" disabled={busy} onClick={onCancel}>Cancel</button><div>{step!=='details'&&<button type="button" className="soft" disabled={busy} onClick={()=>setStep(categorical?'choices':'details')}>Back</button>}{step==='details'?<button type="button" className="primary" disabled={busy||!label.trim()||!kind||repeat===undefined||!groupValid} onClick={nextDetails}>Next</button>:<button type="button" className="primary" disabled={busy||checking||validated!==validationSignature||!!checkError||!!issues.length||!finalDraft} onClick={()=>{if(finalDraft)onSave(finalDraft.config,finalDraft.mappings)}}>{finalLabel}</button>}</div></footer>}
 </dialog>,document.body);
}
