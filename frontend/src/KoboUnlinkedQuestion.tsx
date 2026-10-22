import {useId,useRef,useState} from 'react';
import {FileSpreadsheet,Link,Minus,ArrowRight} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {canLink,linkKey,ignoredLink} from './koboImportLinks';
import {koboLabel,type KoboQuestion,type KoboMapping,type KoboPreview} from './koboTypes';

export const questionTypeLabel=(q:KoboQuestion)=>({category:'Single choice',multiple:'Multiple choice',number:'Number',date:'Date',text:'Text'})[q.kind];
export function sourceFitsQuestion(m:KoboMapping,q:KoboQuestion,preview:KoboPreview){
 const norm=(s:string)=>s.trim().toLocaleLowerCase(),name=norm(preview.sheets[m.sheet]?.name||'');
 const group=preview.form.groups.find(g=>g.repeat&&[g.id,g.name,...Object.values(g.labels)].some(a=>a&&(name===norm(a)||name.endsWith('/'+norm(a)))));
 return canLink(m,q,m.sheet===0?'':group?.id);
}
type Props={question:KoboQuestion;preview:KoboPreview;mappings:KoboMapping[];busy:boolean;onLink:(m:KoboMapping,option:string)=>void;onIgnore:()=>void};
export default function KoboUnlinkedQuestion({question:q,preview,mappings,busy,onLink,onIgnore}:Props){
 const[open,setOpen]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState(''),[option,setOption]=useState(''),[format,setFormat]=useState('');
 const id=useId(),searchRef=useRef<HTMLInputElement>(null);
 const available=mappings.filter(m=>sourceFitsQuestion(m,q,preview)),source=available.find(m=>linkKey(m)===selected),query=search.toLocaleLowerCase();
 const visible=available.filter(m=>`${m.header} ${preview.sheets[m.sheet].name}`.toLocaleLowerCase().includes(query));
 const previous=source&&preview.form.questions.find(q=>q.id===source.question),label=(question:KoboQuestion)=>koboLabel(question,'en');
 return <article className="kobo-unlinked-question" id={`kobo-unlinked-${encodeURIComponent(q.id)}`} tabIndex={-1}>
  <header><FileSpreadsheet aria-hidden="true"/><div><span className="kobo-answer-status is-unresolved">No linked data column</span><h4 dir="auto">{label(q)}</h4><small>{questionTypeLabel(q)}</small></div></header>
  <p>This question exists in the form, but no data column is currently linked to it.</p>
  <details className="kobo-column-details"><summary>Question details</summary><p>{q.id} · {q.repeat||'Main responses'}</p></details>
  <div className="kobo-unlinked-actions"><button className="soft" disabled={busy} aria-expanded={open} onClick={()=>{setOpen(v=>!v);requestAnimationFrame(()=>searchRef.current?.focus())}}><Link/>Link a data column</button><div><button className="soft" disabled={busy} onClick={onIgnore}><Minus/>Ignore question</button><small>Exclude this question from this analysis project.</small></div></div>
  {open&&<section className="kobo-unlinked-linker"><label htmlFor={id}>Search compatible data columns</label><input ref={searchRef} id={id} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search columns or worksheets..."/>
   <div className="kobo-unlinked-options" role="radiogroup" aria-label={`Data column for ${label(q)}`}>{visible.map(m=>{const old=preview.form.questions.find(q=>q.id===m.question);return <label key={linkKey(m)} className={selected===linkKey(m)?'is-selected':''}><input type="radio" name={id} checked={selected===linkKey(m)} disabled={busy} onChange={()=>{setSelected(linkKey(m));setOption(m.option&&q.choices.some(c=>c.name===m.option)?m.option:'');setFormat(m.option?'option':'')}}/><span><strong dir="auto">{m.header}</strong><small>{preview.sheets[m.sheet].name} · Column {m.column+1} · {old?`Mapped to ${label(old)}`:ignoredLink(m)?'Ignored':'Needs a decision'}</small><small>Sample answers: {preview.linkReview?.columns[linkKey(m)]?.samples.join(' · ')||'No nonblank samples available'}</small></span></label>})}</div>
   {!!available.length&&!visible.length&&<p>No compatible columns match your search.</p>}
   {!available.length&&<p>No compatible source columns are available. You can ignore this question to exclude it from this analysis.</p>}
   {source&&<div className="kobo-column-result"><h5>Link preview</h5><p><strong dir="auto">{source.header}</strong> will supply answers to <strong dir="auto">{label(q)}</strong>.</p>{previous&&<p>This column will move from {label(previous)}. If that question loses its last source, it will return to Needs a decision.</p>}
    {q.kind==='multiple'&&<><AppSelect label="Column answer format" value={format} disabled={busy} options={[["","Choose how this column stores answers"],["answers","Answers stored together"],["option","Selected/unselected flags for one choice"]]} onChange={v=>{setFormat(v);setOption('')}}/>{format==='option'&&<AppSelect label="Answer choice represented by this column" value={option} disabled={busy} options={[["","Choose an answer choice"],...q.choices.map(c=>[c.name,c.labels.en||c.labels.ar||c.labels.default||c.name] as [string,string])]} onChange={setOption}/>}</>}
    <button className="primary" disabled={busy||q.kind==='multiple'&&(!format||format==='option'&&!option)} onClick={()=>onLink(source,format==='option'?option:'')}>Link column<ArrowRight/></button></div>}
  </section>}
 </article>;
}
