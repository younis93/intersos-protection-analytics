import {analysisWorkspace} from './koboApi';
import {ChartColumnIncreasing,RotateCcw} from 'lucide-react';
import {useLayoutEffect} from 'react';
import './koboLoading.css';

export function KoboModuleLoading(){
 useLayoutEffect(()=>{if(!document.documentElement.dataset.theme){try{document.documentElement.dataset.theme=localStorage.getItem('app-theme')||'glass-light'}catch{document.documentElement.dataset.theme='glass-light'}}},[]);
 return <main className="kobo-module-loading" aria-busy="true"><section className="kobo-loading-card" role="status"><span className="kobo-loading-icon"><ChartColumnIncreasing aria-hidden="true"/></span><h1>Opening {analysisWorkspace()==='custom'?'Custom Analysis':'Kobo Analysis'}</h1><p>Preparing your workspace</p><div className="kobo-loading-track" aria-hidden="true"><i/></div></section></main>;
}

export function KoboProjectSkeleton({stage,showHeader=true}:{stage:'project'|'analysis';showHeader?:boolean}){
 return <section className="kobo-project-skeleton" aria-busy="true" aria-label="Loading analysis workspace"><p className="kobo-loading-status" role="status"><span aria-hidden="true"/>{stage==='project'?'Opening project':'Preparing analysis'}</p><div aria-hidden="true" className="kobo-skeleton-layout">
  {showHeader&&<div className="kobo-skeleton-header"><div><i className="short"/><i className="title"/></div><i className="count"/><i className="actions"/></div>}
  <div className="kobo-skeleton-panel kobo-skeleton-filters"><i className="heading"/><div className="kobo-skeleton-fields"><i/><i/><i/></div></div>
  <div className="kobo-skeleton-panel kobo-skeleton-toolbar"><div><i className="heading"/><i className="actions"/></div><div><i/><i/></div></div>
  <div className="kobo-skeleton-panel kobo-skeleton-question"><i className="short"/><i className="heading"/><div className="kobo-skeleton-question-grid"><div className="kobo-skeleton-table">{Array.from({length:5},(_,index)=><i key={index}/>)}</div><div className="kobo-skeleton-chart"><i/><i/><i/><i/></div></div></div>
 </div></section>;
}

export function KoboLoadError({stage,message,onRetry}:{stage:'project'|'analysis';message:string;onRetry:()=>void}){
 return <section className="kobo-load-error" role="alert"><span className="kobo-loading-icon"><ChartColumnIncreasing aria-hidden="true"/></span><div><h2>{stage==='project'?'Project could not be opened':'Analysis could not be prepared'}</h2><p>{message}</p></div><button type="button" className="soft" onClick={onRetry}><RotateCcw aria-hidden="true"/>{stage==='project'?'Retry opening project':'Retry analysis'}</button></section>;
}
