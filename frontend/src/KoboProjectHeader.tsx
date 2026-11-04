import {useState} from 'react';
import {KoboUpdateHistory} from './KoboUpdateReview';
import {analysisWorkspace} from './koboApi';
import {Copy,Archive,LoaderCircle,Calculator,ClipboardCheck,Download,FolderCog,Pencil,Upload} from 'lucide-react';
import {ExcelDownloadButton} from './SelectionControls';
import KoboActionMenu from './KoboActionMenu';
import type {KoboProject} from './koboTypes';
import './koboProjectHeader.css';

export default function KoboProjectHeader({project,counts,exportDisabled,onReupload,onReview,onQualityReview,onPdf,onExcel,onRename,onIndicators,onBinaryExcel,onBackup,backupBusy,onCopyAll,copyProgress}:{onQualityReview:()=>void;onCopyAll?:()=>void;copyProgress?:string;onBackup:()=>void;backupBusy:boolean;project:KoboProject;counts:{filtered:number;total:number}|null;exportDisabled:boolean;onReupload:()=>void;onReview:()=>void;onPdf:()=>void;onExcel:()=>Promise<void>;onRename:()=>void;onIndicators:()=>void;onBinaryExcel:()=>Promise<void>}){
 const[historyOpen,setHistoryOpen]=useState(false);
 const title=project.name,custom=analysisWorkspace()==='custom',pendingNotes=project.importNotes?.filter(note=>!note.reviewed).length||0;
 return <section className="kobo-page-heading kobo-project-heading" aria-label="Analysis overview">
  <div className="kobo-project-identity"><span className="eyebrow">{custom?'CUSTOM WORKSPACE':'SURVEY WORKSPACE'}</span><div className="kobo-project-title-row"><h1 dir="auto">{title}</h1><button type="button" className="soft kobo-rename-button" aria-label={custom?'Edit project name':'Edit form name'} title={custom?'Edit project name':'Edit form name'} onClick={onRename}><Pencil aria-hidden="true"/></button></div></div>
  <div className="kobo-header-submissions" role={counts?'status':undefined} aria-label={counts?`${counts.filtered.toLocaleString()} of ${counts.total.toLocaleString()} submissions`:'Submissions'}>
   <span>{custom?'Records':'Submissions'}</span><div>{counts?<><strong>{counts.filtered.toLocaleString()}</strong>{counts.filtered!==counts.total&&<span> / {counts.total.toLocaleString()}</span>}</>:<span>Preparing…</span>}</div>
  </div>
  <div className="kobo-toolbar kobo-project-actions">
   <button type="button" className="soft" onClick={onIndicators}><Calculator aria-hidden="true"/>{project.settings.language==='ar'?'الرؤى':'Insights'}</button>
   <button type="button" className="soft" aria-haspopup="dialog" aria-label={project.settings.language==='ar'?'مراجعة':'Review'} aria-description={pendingNotes?project.settings.language==='ar'?`${pendingNotes} ملاحظات استيراد غير مراجَعة`:`${pendingNotes} unreviewed import ${pendingNotes===1?'note':'notes'}`:undefined} onClick={onQualityReview}><ClipboardCheck aria-hidden="true"/>{project.settings.language==='ar'?'مراجعة':'Review'}{pendingNotes>0&&<span className="kobo-review-note-badge">{pendingNotes} {project.settings.language==='ar'?pendingNotes===1?'ملاحظة':'ملاحظات':pendingNotes===1?'note':'notes'}</span>}</button>
   <KoboActionMenu label={custom?'Manage data':'Data source'} icon={<FolderCog aria-hidden="true"/>}><button type="button" className="soft" onClick={onReview}><Pencil aria-hidden="true"/>{custom?'Prepare data':'Review import'}</button><button type="button" className="soft" onClick={onReupload}><Upload aria-hidden="true"/>{custom?'Replace source file':'Re-upload data'}</button><button type="button" className="soft" onClick={()=>setHistoryOpen(true)}>Update history</button></KoboActionMenu>
   <KoboActionMenu label="Export" icon={<Download aria-hidden="true"/>} primary>{onCopyAll&&<button type="button" className="soft" disabled={exportDisabled||!!copyProgress} aria-busy={!!copyProgress} onClick={onCopyAll}>{copyProgress?<LoaderCircle className="kobo-restore-spinner"/>:<Copy/>}{copyProgress||'Copy all pivot tables'}</button>}<button className="soft" disabled={exportDisabled} onClick={onPdf}><Download/>Report PDF</button><ExcelDownloadButton className="soft" disabled={exportDisabled} onClick={onExcel} title="Native Excel">Native Excel</ExcelDownloadButton><ExcelDownloadButton className="soft" disabled={exportDisabled} onClick={onBinaryExcel} title="Excel - 0/1 pivots">Excel - 0/1 pivots</ExcelDownloadButton><hr className="kobo-export-separator"/><button type="button" className="soft" disabled={backupBusy} aria-busy={backupBusy} onClick={onBackup}>{backupBusy?<LoaderCircle className="kobo-restore-spinner" aria-hidden="true"/>:<Archive aria-hidden="true"/>}{backupBusy?'Creating backup...':'Back up project'}</button></KoboActionMenu>
  </div>
  {historyOpen&&<KoboUpdateHistory projectId={project.id} onClose={()=>setHistoryOpen(false)}/>}
  {backupBusy&&<p className="kobo-backup-progress" role="status"><LoaderCircle className="kobo-restore-spinner" aria-hidden="true"/>Creating backup...</p>}
 </section>;
}
