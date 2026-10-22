import {AlertTriangle,CheckCircle2,ArrowRight,LoaderCircle} from 'lucide-react';
import {koboLabel,type KoboPreview} from './koboTypes';

export function answerIssuePresentation(message:string){
 if(message.includes('conflicting mapped columns'))return {kind:'conflict',title:'Source answers disagree',description:'Source columns contain different answers for the same response.'};
 if(/unknown .*choice|ambiguous .*choice/.test(message))return {kind:'choices',title:'Answers need a choice match',description:'Some answers cannot be matched to this question’s choices.'};
 const descriptions:Record<string,string>={
  'invalid numeric answer':'Some answers cannot be read as numbers. Review the source column and its question type.',
  'invalid date answer (expected ISO date)':'Some answers cannot be read as dates. Review the source values; dates should use YYYY-MM-DD.',
  'invalid split-option flag':'Some separate option columns contain values other than yes/no, true/false, or 1/0.',
  'repeat entry has no matching parent submission':'Some repeated entries cannot be connected to their main response.'
 };
 return {kind:'source',title:'Source answers need review',description:descriptions[message]||'Some source answers could not be interpreted for this question. Review the original values and source mapping.'};
}
export const answerReviewId=(qid:string)=>`kobo-answer-${encodeURIComponent(qid)}`;
type Props={preview:KoboPreview;search:string;busy:boolean;checking:boolean;checkError:string;acceptInvalid:boolean;onAccept:(v:boolean)=>void;onRetry:()=>void;onChoices:(id:string)=>void;onSources:(id:string,combined:boolean)=>void};

export default function KoboAnswerReview({preview,search,busy,checking,checkError,acceptInvalid,onAccept,onRetry,onChoices,onSources}:Props){
 const groups=new Map<string,KoboPreview['issues']>();
 for(const issue of preview.issues)groups.set(issue.question,[...(groups.get(issue.question)||[]),issue]);
 const query=search.toLocaleLowerCase();
 const visible=[...groups].filter(([id])=>{const q=preview.form.questions.find(q=>q.id===id);return `${id} ${q?koboLabel(q,'en')+' '+koboLabel(q,'ar'):''}`.toLocaleLowerCase().includes(query)});
 return <div className="kobo-answer-workspace" aria-busy={checking}>
  <header><h3 id="kobo-answer-workspace-heading" tabIndex={-1}>Answer review</h3><p>Review how answers will be interpreted before applying your changes. Counts show issues; each issue lists its affected rows.</p></header>
  {checking&&<p className="kobo-answer-state" role="status"><LoaderCircle className="spin"/>Checking updated answers. The results below are from the last completed check.</p>}
  {checkError&&<div className="kobo-answer-state" role="alert"><AlertTriangle/><span>Answer checks could not finish. {checkError}</span><button className="soft" onClick={onRetry} disabled={busy}>Retry answer checks</button></div>}
  {!checking&&!checkError&&!groups.size&&<div className="kobo-answer-clear" role="status"><CheckCircle2/><h4>Answers are ready</h4><p>No answer issues were detected. Your choices will be checked again when you apply the review.</p></div>}
  {!!groups.size&&!visible.length&&<p>No questions match your search.</p>}
  {visible.map(([qid,issues])=>{
   const question=preview.form.questions.find(q=>q.id===qid),examples=preview.examples?.[qid]||preview.linkReview?.conflicts?.[qid]?.examples||[];
   return <article className="kobo-answer-question" id={answerReviewId(qid)} tabIndex={-1} key={qid}>
    <header><AlertTriangle aria-hidden="true"/><h4 dir="auto">{question?koboLabel(question,'en'):qid}</h4><span>{issues.length} {issues.length===1?'issue':'issues'}</span></header>
    {issues.map((issue,index)=>{const info=answerIssuePresentation(issue.message);return <section className="kobo-answer-issue" key={index}><div><h5>{info.title}</h5><span className="kobo-answer-row-count">{issue.count.toLocaleString()} affected {issue.count===1?'row':'rows'}</span></div><p>{info.description}</p>
     {info.kind==='choices'&&question&&['category','multiple'].includes(question.kind)?<button className="soft" disabled={busy||checking} onClick={()=>onChoices(qid)}>Review answer choices<ArrowRight/></button>:info.kind==='conflict'?<button className="soft" disabled={busy||checking} onClick={()=>onSources(qid,true)}>Review source conflicts<ArrowRight/></button>:<button className="soft" disabled={busy||checking} onClick={()=>onSources(qid,false)}>Review source columns<ArrowRight/></button>}
    </section>})}
    <details className="kobo-answer-examples"><summary>View source examples</summary>{examples.length?<div className="kobo-answer-table"><table><thead><tr><th>Worksheet</th><th>Row</th><th>Column</th><th>Original answer</th></tr></thead><tbody>{examples.flatMap((ex,i)=>ex.values.map((v,j)=><tr key={`${i}:${j}`}><td dir="auto">{ex.sheet}</td><td>{ex.row}</td><td dir="auto">{v.column}</td><td dir="auto">{v.value===null||v.value===undefined||v.value===''?'(blank)':String(v.value)}</td></tr>))}</tbody></table></div>:<p>No source examples are available for this question. Review its mapped source columns.</p>}</details>
    <details className="kobo-column-details"><summary>Technical details</summary><p>Question ID: {qid}</p>{issues.map((issue,i)=><p key={i}>{issue.message}</p>)}</details>
   </article>;
  })}
  {!!groups.size&&<section className="kobo-answer-accept"><label><input type="checkbox" disabled={busy||checking||!!checkError} checked={acceptInvalid} onChange={e=>onAccept(e.target.checked)}/><span><strong>Accept unresolved or invalid answers as blank</strong><small>Answers that cannot be interpreted will be blank in this analysis. Resolve the issues above to retain those answers. Source conflicts still require a conflict decision.</small></span></label></section>}
 </div>;
}
