import {useEffect,useState} from 'react';
import {ChevronDown,Download,FileSpreadsheet,FileText,RotateCcw,X} from 'lucide-react';
import ProcessingDownload from './ProcessingDownload';
import {cancelKoboExport,dismissKoboExport,downloadKoboExport,retryKoboExport,useKoboExports} from './koboExportManager';
import './koboExports.css';

export default function KoboExportTray(){
 const tasks=useKoboExports(),[minimized,setMinimized]=useState(true),[collapsed,setCollapsed]=useState(false);
 const failed=tasks.filter(task=>task.state==='error').length;
 useEffect(()=>{if(!tasks.length){setMinimized(true);setCollapsed(false)}},[tasks.length]);
 useEffect(()=>{if(failed){setMinimized(false);setCollapsed(false)}},[failed]);
 if(!tasks.length)return null;
 const running=tasks.filter(task=>task.state==='running'||task.state==='queued').length;
 const visible=collapsed?[]:minimized?tasks.slice(-1):tasks;
 return <aside className={`kobo-export-tray${minimized?' is-minimized':''}`} aria-label="Export files">
  <header><div><ProcessingDownload active={running>0}/><strong>{running?`Exporting ${running} ${running===1?'file':'files'}`:failed?'Export needs attention':'Export files'}<small>{tasks.length} {tasks.length===1?'file':'files'} · {running?'Processing in background':failed?`${failed} failed · Review details`:'Ready to review'}</small></strong></div><div className="kobo-export-controls"><button type="button" aria-label={collapsed?'Show export files':'Collapse export files'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}><ChevronDown style={{transform:collapsed?'rotate(180deg)':undefined}}/></button></div></header>
  {!collapsed&&<div className="kobo-export-files">{minimized&&tasks.length>1&&<button className="kobo-export-show-all" onClick={()=>setMinimized(false)}>View all {tasks.length} files</button>}{visible.map(task=>{
   const active=task.state==='queued'||task.state==='running';
   return <section key={task.id} className="kobo-export-file" aria-label={task.filename} aria-busy={active}>
    <div className="kobo-export-filename">{task.format==='pdf'?<FileText/>:<FileSpreadsheet/>}<div><strong title={task.filename}>{task.filename}</strong><small>{task.format==='pdf'?'PDF':'EXCEL'} · {task.project}</small></div><span className={`kobo-export-state is-${task.state}`}>{task.state==='complete'?'Ready':task.state}</span></div>
    <p role={task.state==='error'?'alert':'status'} className={task.state==='error'?'kobo-export-error':undefined} aria-live={task.state==='error'?'assertive':'polite'}>{task.message}</p>
    {active&&<div className="kobo-export-progress"><progress max={100} {...(task.progress?{value:task.progress}:{})} aria-label={`${task.filename} progress`}/><small>{task.progress?`${task.progress}%`:'Preparing…'}</small></div>}
    {task.downloadError&&<p role="alert" className="kobo-export-error">{task.downloadError}</p>}
    <footer>{active?<button disabled={task.cancelPending} onClick={()=>void cancelKoboExport(task.id)}><X/>{task.cancelPending?'Cancelling…':'Cancel'}</button>:<>{task.state==='complete'&&<button className="kobo-export-download" disabled={task.downloading} onClick={()=>void downloadKoboExport(task.id)}><Download/>{task.downloadError?'Download':'Download again'}</button>}{task.cancelError&&<button onClick={()=>void cancelKoboExport(task.id)}><RotateCcw/>Retry cancellation</button>}{!task.cancelError&&['error','cancelled'].includes(task.state)&&<button onClick={()=>retryKoboExport(task.id)}><RotateCcw/>Retry</button>}<button onClick={()=>dismissKoboExport(task.id)}><X/>Dismiss</button></>}</footer>
   </section>;
  })}</div>}
 </aside>;
}
