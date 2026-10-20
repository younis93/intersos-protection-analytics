import {Download,Pencil,Upload} from 'lucide-react';
import {ExcelDownloadButton} from './SelectionControls';
import KoboActionMenu from './KoboActionMenu';
import KoboImportNotes from './KoboImportNotes';
import type {KoboProject} from './koboTypes';
import './koboProjectHeader.css';

export default function KoboProjectHeader({project,counts,exportDisabled,onReupload,onReview,onPdf,onExcel,onRename}:{project:KoboProject;counts:{filtered:number;total:number}|null;exportDisabled:boolean;onReupload:()=>void;onReview:()=>void;onPdf:()=>void;onExcel:()=>Promise<void>;onRename:()=>void}){
 const title=project.name;
 return <section className="kobo-page-heading kobo-project-heading" aria-label="Analysis overview">
  <div className="kobo-project-identity"><span className="eyebrow">SURVEY WORKSPACE</span><div className="kobo-project-title-row"><h1 dir="auto">{title}</h1><button type="button" className="soft kobo-rename-button" aria-label="Edit form name" title="Edit form name" onClick={onRename}><Pencil aria-hidden="true"/></button></div></div>
  <div className="kobo-header-submissions" role={counts?'status':undefined} aria-label={counts?`${counts.filtered.toLocaleString()} of ${counts.total.toLocaleString()} submissions`:'Submissions'}>
   <span>Submissions</span><div>{counts?<><strong>{counts.filtered.toLocaleString()}</strong>{counts.filtered!==counts.total&&<span> / {counts.total.toLocaleString()}</span>}</>:<span>Preparing…</span>}</div>
  </div>
  <div className="kobo-toolbar kobo-project-actions">
   {!!(project.warnings.length+project.issues.length)&&<KoboImportNotes project={project} onReview={onReview}/>}
   <button type="button" className="soft" onClick={onReupload}><Upload aria-hidden="true"/>Re-upload data</button>
   <KoboActionMenu label="Export" icon={<Download aria-hidden="true"/>} primary disabled={exportDisabled}><button className="soft" disabled={exportDisabled} onClick={onPdf}><Download/>Report PDF</button><ExcelDownloadButton className="soft" disabled={exportDisabled} onClick={onExcel}>Native Excel</ExcelDownloadButton></KoboActionMenu>
  </div>
 </section>;
}
