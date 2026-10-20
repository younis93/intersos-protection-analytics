import {ArrowRight,FileQuestion,X} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {getDeportationCaseRecords,hasDeportationId} from './deportationCase';
import {getAwarenessCaseRecords} from './awarenessCase';
import {value} from './LegalRecordCells';
import {Pager} from './TableControls';
import type {LegalExplorerResult} from './types';
import './deportationCase.css';

export function DeportationIdButton({pnId,identifierColumn}:{pnId:unknown;identifierColumn?:string}) {
  const [open,setOpen]=useState(false);
  if(!hasDeportationId(pnId))return <>{value(pnId)}</>;
  const id=String(pnId).trim();
  return <><button type="button" className="table-action drill-case-action" aria-label={`Open deportation case ${id}`} onClick={()=>setOpen(true)}><code>{id}</code><ArrowRight aria-hidden="true"/></button>{open&&<DeportationCaseModal pnId={id} identifierColumn={identifierColumn} onClose={()=>setOpen(false)}/>}</>;
}

export function AwarenessIdButton({awarenessId,identifierColumn}:{awarenessId:unknown;identifierColumn?:string}) {
  const [open,setOpen]=useState(false);
  if(!hasDeportationId(awarenessId))return <>{value(awarenessId)}</>;
  const id=String(awarenessId).trim();
  return <><button type="button" className="table-action drill-case-action" aria-label={`Open awareness record ${id}`} onClick={()=>setOpen(true)}><code>{id}</code><ArrowRight aria-hidden="true"/></button>{open&&<DeportationCaseModal pnId={id} recordType="awareness" identifierColumn={identifierColumn} onClose={()=>setOpen(false)}/>}</>;
}

export function DeportationCaseModal({pnId,identifierColumn,onClose,recordType="deportation"}:{pnId:string;identifierColumn?:string;onClose:()=>void;recordType?:"deportation"|"awareness"}) {
  const awareness=recordType==='awareness',recordLabel=awareness?'Awareness record':'Deportation case',idLabel=awareness?'Awareness ID':'PN ID';
  const [data,setData]=useState<LegalExplorerResult|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1);
  const panel=useRef<HTMLElement>(null),closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    (awareness?getAwarenessCaseRecords:getDeportationCaseRecords)(pnId,page,controller.signal,identifierColumn).then(next=>{if(!controller.signal.aborted)setData(next)}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message||`Unable to load ${recordType} details.`)});
    return()=>controller.abort();
  },[pnId,page,identifierColumn,recordType]);
  useEffect(()=>{
    const trigger=document.activeElement as HTMLElement|null;
    const parent=trigger?.closest<HTMLElement>('[role="dialog"]');
    const wasInert=parent?.inert;
    if(parent)parent.inert=true;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeRef.current();return;}
      if(event.key!=='Tab')return;
      const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(node=>node.getClientRects().length>0);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',handleKey,true);
    return()=>{document.removeEventListener('keydown',handleKey,true);if(parent)parent.inert=Boolean(wasInert);if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  },[]);
  return createPortal(<div className="case-review-modal deportation-case-modal" role="dialog" aria-modal="true" aria-label={`${recordLabel} ${pnId}`}>
    <button className="case-modal-backdrop" aria-label={`Close ${recordType} details`} onClick={onClose}/>
    <section className="case-modal-panel" ref={panel}><header><div><span className="eyebrow">{recordLabel.toUpperCase()}</span><h2>{idLabel}: {pnId}</h2></div><button type="button" className="soft" onClick={onClose} aria-label={`Close ${recordLabel.toLowerCase()}`}><X/></button></header>
      <div className="case-modal-scroll">{error?<div className="error" role="alert">{error}</div>:!data?<div role="status" className="legal-empty">Loading {recordType} details...</div>:!data.rows.length?<div className="legal-empty"><FileQuestion/><h3>No {recordType} records found for this {idLabel}.</h3></div>:<>{data.rows.map((row,index)=><article className="glass deportation-case-record" key={String(row.__rowKey??index)}><h3>Record {(page-1)*data.pageSize+index+1}</h3><dl>{data.columns.map(column=><div key={column}><dt>{column}</dt><dd>{value(row[column])}</dd></div>)}</dl></article>)}{data.total>data.pageSize&&<Pager page={page} total={data.total} onChange={setPage}/>}</>}</div>
    </section>
  </div>,document.body);
}
