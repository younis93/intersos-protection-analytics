import {analysisRoute,analysisLabel} from './koboApi';
import KoboProjectActionIcon from './KoboProjectActionIcon';
import {useState} from 'react';
import {ArrowUpRight,ChartColumnIncreasing,Clock3,Pencil} from 'lucide-react';
import {AnimatedSectionIcon} from './AnimatedNavigationIcon';
import './koboProjectCard.css';

type Project={id:string;name:string;updated:string};

export default function KoboProjectCard({project,onDelete,onRename}:{project:Project;onDelete:()=>void;onRename:()=>void}){
 const[motion,setMotion]=useState(0);
 const saved=new Date(project.updated);
 const validDate=!Number.isNaN(saved.getTime());
 return <article className="glass kobo-project kobo-project-card" aria-label={`Project: ${project.name}`} onPointerEnter={()=>setMotion(value=>value+1)} onFocusCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setMotion(value=>value+1)}}>
  <header className="kobo-project-card-header">
   <span className="kobo-project-card-icon"><AnimatedSectionIcon key={motion} Icon={ChartColumnIncreasing} iconStyle="chart-column-increasing" size={28}/></span>
   <div className="kobo-project-card-copy"><h2 className="kobo-project-card-title" title={project.name} dir="auto">{project.name}</h2><p className="kobo-project-description">{analysisLabel('Survey analysis project','Custom analysis project')}</p><div className="kobo-project-updated"><Clock3 aria-hidden="true"/><span>Last updated</span>{validDate?<time dateTime={saved.toISOString()}>{saved.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}<span className="kobo-project-time">{saved.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}</span></time>:<span>Unavailable</span>}</div></div>
   <button className="soft kobo-project-card-edit" type="button" aria-label={`Edit name for ${project.name}`} title="Edit form name" onClick={onRename}><Pencil aria-hidden="true"/></button>
  </header>
  <footer className="kobo-project-card-actions">
   <a className="primary" href={`${analysisRoute()}/${project.id}`} aria-label={`Open analysis for ${project.name}`}><KoboProjectActionIcon type="folder"/><span>Open analysis</span><ArrowUpRight aria-hidden="true"/></a>
   <button className="soft kobo-project-delete" type="button" aria-label={`Delete ${project.name}`} title="Delete project" onClick={onDelete}><KoboProjectActionIcon type="trash"/></button>
  </footer>
 </article>;
}
