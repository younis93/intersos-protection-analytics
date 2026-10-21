import {Calculator,ClipboardCheck,Download,Pencil,Upload,UsersRound} from 'lucide-react';
import {ExcelDownloadButton} from './SelectionControls';
import KoboActionMenu from './KoboActionMenu';
import KoboImportNotes from './KoboImportNotes';
import type {KoboProject} from './koboTypes';
import './koboProjectHeader.css';

export default function KoboProjectHeader({project,counts,exportDisabled,onReupload,onReview,onPdf,onExcel,onRename,onIndicators,onQuality,onPopulation,onBinaryExcel}:{project:KoboProject;counts:{filtered:number;total:number}|null;exportDisabled:boolean;onReupload:()=>void;onReview:()=>void;onPdf:()=>void;onExcel:()=>Promise<void>;onRename:()=>void;onIndicators:()=>void;onBinaryExcel:()=>Promise<void>;onQuality:()=>void;onPopulation:()=>void}){
 const title=project.name;
 const showReviewTools=false;
 return <section className="kobo-page-heading kobo-project-heading" aria-label="Analysis overview">
  <div className="kobo-project-identity"><span className="eyebrow">SURVEY WORKSPACE</span><div className="kobo-project-title-row"><h1 dir="auto">{title}</h1><button type="button" className="soft kobo-rename-button" aria-label="Edit form name" title="Edit form name" onClick={onRename}><Pencil aria-hidden="true"/></button></div></div>
  <div className="kobo-header-submissions" role={counts?'status':undefined} aria-label={counts?`${counts.filtered.toLocaleString()} of ${counts.total.toLocaleString()} submissions`:'Submissions'}>
   <span>Submissions</span><div>{counts?<><strong>{counts.filtered.toLocaleString()}</strong>{counts.filtered!==counts.total&&<span> / {counts.total.toLocaleString()}</span>}</>:<span>Preparing…</span>}</div>
  </div>
  <div className="kobo-toolbar kobo-project-actions">
   {!!(project.warnings.length+project.issues.length)&&<KoboImportNotes project={project} onReview={onReview}/>}
   {showReviewTools&&<><button type="button" className="soft" onClick={onPopulation} aria-label="Compare population groups"><UsersRound aria-hidden="true"/>{project.settings.language==='ar'?'الفئات السكانية':'Population groups'}</button><button type="button" className="soft" onClick={onQuality}><ClipboardCheck aria-hidden="true"/>{project.settings.language==='ar'?'مراجعة':'Review'}</button></>}<button type="button" className="soft" onClick={onIndicators}><Calculator aria-hidden="true"/>{project.settings.language==='ar'?'المؤشرات':'Indicators'}</button>
   <button type="button" className="soft" onClick={onReupload}><Upload aria-hidden="true"/>Re-upload data</button>
   <KoboActionMenu label="Export" icon={<Download aria-hidden="true"/>} primary disabled={exportDisabled}><button className="soft" disabled={exportDisabled} onClick={onPdf}><Download/>Report PDF</button><ExcelDownloadButton className="soft" disabled={exportDisabled} onClick={onExcel} title="Native Excel">Native Excel</ExcelDownloadButton><ExcelDownloadButton className="soft" disabled={exportDisabled} onClick={onBinaryExcel} title="Excel - 0/1 pivots">Excel - 0/1 pivots</ExcelDownloadButton></KoboActionMenu>
  </div>
 </section>;
}
