import {useEffect,useMemo,useRef,useState} from 'react';
import {Columns2,Table2,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import KoboPivotTable,{type KoboPivotSelection} from './KoboPivotTable';
import type {KoboAnalysis,KoboResult} from './koboTypes';
import './koboCompare.css';

type Display='count'|'percent'|'both';
function ComparisonTable({result,analysis,group,onDrilldown}:{onDrilldown:(result:KoboResult,selection:KoboPivotSelection)=>void;result:KoboResult;analysis:KoboAnalysis;group:string}){
 const[count,setCount]=useState(100),[display,setDisplay]=useState<Display>(()=>analysis.settings.questions[result.id]?.breakdownDisplay||result.breakdownDisplay||'both');
 return <>
  <div className="kobo-compare-question"><span className="eyebrow" dir="auto">{result.name}{result.id!==result.name?` · ${result.id}`:''}</span><h3 dir="auto">{result.label}</h3><p className="kobo-compare-group" dir="auto">{group}</p>
   <div className="kobo-compare-counts"><span>{'Answered'} <strong>{result.denominator.toLocaleString(analysis.settings.language)}</strong></span><span>{'Missing'} <strong>{result.missing.toLocaleString(analysis.settings.language)}</strong></span><span>{'Total'} <strong>{result.total.toLocaleString(analysis.settings.language)}</strong></span></div>
  </div>
  {!result.denominator&&<p className="kobo-compare-message" role="status">{'No answered responses under the current filters.'}</p>}
  <KoboPivotTable onDrilldown={selection=>onDrilldown(result,selection)} result={result} language={analysis.settings.language} limit={count} display={display} onDisplayChange={setDisplay} showDisplaySelector/>
  {result.rows.length>count&&<button type="button" className="soft kobo-compare-more" onClick={()=>setCount(value=>value+100)}>{'Show more answers'} ({result.rows.length-count})</button>}
  {result.kind==='multiple'&&<p className="kobo-basis">Percentages can total more than 100%; each respondent is counted once per selected option.</p>}
 </>;
}

export default function KoboCompare({questionId,analysis,onClose,onDrilldown}:{onDrilldown:(result:KoboResult,selection:KoboPivotSelection)=>void;questionId:string;analysis:KoboAnalysis;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[selected,setSelected]=useState('');
 const current=analysis.questions.find(question=>question.id===questionId),other=analysis.questions.find(question=>question.id===selected);
 const groups=useMemo(()=>{
  const byId=new Map(analysis.groups.map(group=>[group.id,group]));
  const path=(id:string)=>{const labels:string[]=[],seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const group=byId.get(id);labels.unshift(group?.label||group?.name||id);id=group?.parent||''}return labels.join(' / ')||('General')};
  return new Map(analysis.questions.map(question=>[question.id,path(question.group)]));
 },[analysis.groups,analysis.questions]);
 const options=useMemo<[string,string][]>(()=>[['','Select a question…'],...analysis.questions.filter(question=>question.id!==questionId).map(question=>[question.id,`${question.label} · ${question.name}${question.id!==question.name?` · ${question.id}`:''} · ${groups.get(question.id)}`] as [string,string])],[analysis.questions,questionId,groups]);
 useEffect(()=>{const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 return <dialog ref={dialog} className="kobo-dialog glass kobo-compare" aria-label="Compare questions" dir="ltr" onCancel={event=>{event.preventDefault();onClose()}}>
  <header><span className="kobo-compare-icon"><Columns2 aria-hidden="true"/></span><div><h2>{'Compare questions'}</h2><p>{'Two pivot tables side by side, using your current response filters.'}</p></div><button type="button" className="soft" aria-label={'Close comparison'} onClick={onClose}><X/></button></header>
  <div className="kobo-compare-body">
   <section className="kobo-compare-panel" aria-label={'Current question'}><div className="kobo-compare-panel-heading"><Table2 aria-hidden="true"/><span>{'Current question'}</span></div>{current?<ComparisonTable onDrilldown={onDrilldown} key={current.id} result={current} analysis={analysis} group={groups.get(current.id)||''}/>:<p className="kobo-compare-message" role="status">{'This question is no longer available in the current analysis.'}</p>}</section>
   <section className="kobo-compare-panel" aria-label={'Comparison question'}><div className="kobo-compare-panel-heading"><Table2 aria-hidden="true"/><span>{'Compare with'}</span></div>
    <AppSelect label={'Comparison question'} ariaLabel={'Select a question to compare'} searchable value={selected} options={options} onChange={setSelected} disabled={options.length===1}/>
    {other?<ComparisonTable onDrilldown={onDrilldown} key={other.id} result={other} analysis={analysis} group={groups.get(other.id)||''}/>:<div className="kobo-compare-placeholder" role="status"><Columns2 aria-hidden="true"/><h3>{selected?('Question unavailable'):options.length===1?('No other questions to compare'):('Choose a question to compare')}</h3><p>{selected?('Select another question from the current analysis.'):options.length===1?('Show another question in Analysis to use comparison.'):('Search by title, name, or identifier. Questions in collapsed groups are included.')}</p></div>}
   </section>
  </div>
  <footer>{'Sorting and display changes here are temporary. Saved settings and exports stay unchanged.'}</footer>
 </dialog>;
}
