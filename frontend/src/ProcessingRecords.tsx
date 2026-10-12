import {useLayoutEffect,useRef,useState} from 'react';
import {animateProcessingCardSize,processingCardHandoffEvent,takeProcessingCardHandoff} from './processingCardTransition';
import {Minus,Maximize2,X} from 'lucide-react';
import ProcessingFolder from './ProcessingFolder';
import ProcessingBackground from './ProcessingBackground';
import type {LegalImportProgress} from './importProgress';

const datasets:Record<string,string>={beneficiaries:'beneficiaries',assessments:'assessments',legalservices:'legal services',legalhotlines:'hotline records',awareness:'awareness records',deportationrecords:'deportation records',legalfees:'legal fees',followupslogbooks:'follow-up records'};
export default function ProcessingRecords({progress,uploadPercent,restoring=false,onCancel,onDismiss,cancelPending=false,cancelError='',initialMinimized=false}:{progress:LegalImportProgress|null;uploadPercent?:number;restoring?:boolean;onCancel?:()=>void;onDismiss?:()=>void;cancelPending?:boolean;cancelError?:string;initialMinimized?:boolean}){
  const [minimized,setMinimized]=useState(initialMinimized);
  const cardRef=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    if(minimized||!restoring)return;
    let stop=()=>{};
    const handoff=()=>{const bounds=takeProcessingCardHandoff();if(bounds&&cardRef.current){stop();stop=animateProcessingCardSize(cardRef.current,bounds);}};
    handoff();window.addEventListener(processingCardHandoffEvent,handoff);
    return()=>{window.removeEventListener(processingCardHandoffEvent,handoff);stop();};
  },[minimized,restoring]);
  const terminal=Boolean(progress&&['complete','error','cancelled'].includes(progress.state));
  const cancelling=cancelPending||progress?.state==='cancelling';
  const uploading=uploadPercent!==undefined&&!terminal;
  const active=!terminal&&!cancelling;
  const percent=uploading?uploadPercent:progress?.state==='idle'?null:progress?.percent??null;
  const detail=progress?.state==='error'?progress.error:progress?.state==='cancelled'?'Your previous data and saved source are unchanged.':cancelling?'Stopping safely. Your current data will be preserved.':uploading?'Sending selected CSV files to the local service...':progress?.state==='complete'?'Records are ready.':progress?.state==='processing'?`${progress.stage}${progress.dataset?' - '+(datasets[progress.dataset]||progress.dataset):''}`:'Preparing the processing work plan...';
  const title=progress?.state==='cancelled'?'Import cancelled':progress?.state==='error'?'Import failed':cancelling?'Cancelling...':uploading?'Uploading folder':'Processing records';
  return <div className={`legal-upload-overlay${minimized?' is-minimized':''}${active?' is-active':''}`}>
    {!minimized&&<ProcessingBackground active={active}/>}
    <section ref={cardRef} className="glass legal-upload-progress" aria-label="File processing" aria-busy={!terminal}>
      <div className="legal-processing-card-surface" aria-hidden="true"/>
      <div className="legal-processing-card-content">
      <div className="legal-processing-controls">
        {!terminal&&<button type="button" className="soft" onClick={()=>setMinimized(!minimized)}>{minimized?<Maximize2/>:<Minus/>}{minimized?'Restore':'Minimize'}</button>}
        {!terminal&&onCancel&&<button type="button" className="soft" onClick={onCancel} disabled={cancelling||progress?.canCancel===false}><X/>{cancelling?'Cancelling...':'Cancel'}</button>}
        {terminal&&onDismiss&&<button type="button" className="soft" onClick={onDismiss}><X/>Dismiss</button>}
      </div>
      <ProcessingFolder active={active}/>
      {!minimized&&<span className="eyebrow">{restoring?'LOADING LEGAL DATA':'REPLACING LEGAL DATA'}</span>}
      <div className="legal-processing-status" role="status" aria-live="polite"><h2>{title}</h2><p>{detail}</p></div>
      {percent!==null?<><strong>{percent}%</strong><div role="progressbar" aria-label={uploading?'Legal Platform file upload':'Processing Legal Platform records'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}% - ${detail}`}><i style={{width:`${percent}%`}}/></div></>:<><strong className="legal-upload-indeterminate-label">{cancelling?'Stopping...':terminal?'':'Preparing...'}</strong>{!terminal&&<div className="legal-upload-indeterminate" role="progressbar" aria-label="Preparing Legal Platform records"><i/></div>}</>}
      {cancelError&&<p className="legal-processing-error" role="alert">{cancelError}</p>}
      {!minimized&&!uploading&&percent!==null&&!terminal&&!cancelling&&<small>Completed processing work</small>}
      </div>
    </section>
  </div>;
}
