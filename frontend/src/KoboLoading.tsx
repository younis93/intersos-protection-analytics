import {analysisWorkspace} from './koboApi';
import {ChartColumnIncreasing,RotateCcw} from 'lucide-react';
import {useLayoutEffect} from 'react';
import {KoboProjectsLoadingHeading} from './KoboProjectsHeading';
import KoboWorkspaceShell from './KoboWorkspaceShell';
import './koboProjectCard.css';
import './koboLoading.css';

export function KoboModuleLoading({projectMenu=false}:{projectMenu?:boolean}){
 useLayoutEffect(()=>{if(!document.documentElement.dataset.theme){try{document.documentElement.dataset.theme=localStorage.getItem('app-theme')||'glass-light'}catch{document.documentElement.dataset.theme='glass-light'}}},[]);
 if(projectMenu)return <KoboWorkspaceShell projectId="" activeWorkspace="analysis" language="en" onWorkspaceChange={()=>{}} onNavigate={route=>{window.location.hash=route}} dialogs={null}>
  <KoboProjectsLoadingHeading custom={analysisWorkspace()==='custom'}/>
  <KoboProjectMenuSkeleton/>
 </KoboWorkspaceShell>;
 return <main className="kobo-module-loading" aria-busy="true"><section className="kobo-loading-card" role="status"><span className="kobo-loading-icon"><ChartColumnIncreasing aria-hidden="true"/></span><h1>Opening {analysisWorkspace()==='custom'?'Custom Analysis':'Kobo Analysis'}</h1><p>Preparing your workspace</p><div className="kobo-loading-track" aria-hidden="true"><i/></div></section></main>;
}

export function KoboProjectMenuSkeleton(){
 return <>
  <span className="sr-only" role="status">Loading projects</span>
  <div className="glass kobo-project-toolbar kobo-menu-skeleton-toolbar kobo-skeleton-layout" aria-hidden="true">
   <i className="app-search-field"/><i className="kobo-project-count"/><i className="app-select"/>
  </div>
  <div className="kobo-projects kobo-skeleton-layout" aria-hidden="true">
   {[1,2,3].map(card=><article key={card} className="glass kobo-project kobo-project-card kobo-menu-skeleton-card">
    <header className="kobo-project-card-header"><i className="kobo-project-card-icon"/><div className="kobo-project-card-copy"><i className="kobo-project-card-title"/><i className="kobo-project-description"/><i className="kobo-project-updated"/></div><i className="kobo-project-card-edit"/></header>
    <footer className="kobo-project-card-actions"><i/><i/></footer>
   </article>)}
  </div>
 </>;
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
