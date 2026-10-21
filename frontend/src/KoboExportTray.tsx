import {useEffect,useState} from 'react';
import {ChevronDown,Download,FileSpreadsheet,FileText,RotateCcw,X} from 'lucide-react';
import ProcessingDownload from './ProcessingDownload';
import {cancelAllKoboExports,cancelKoboExport,dismissKoboExport,downloadKoboExport,initializeKoboExports,ongoingKoboExports,retryKoboExport,useKoboExports} from './koboExportManager';
import KoboConfirmDialog from './KoboConfirmDialog';
import './koboExports.css';

export default function KoboExportTray(){
 const tasks=useKoboExports(),[minimized,setMinimized]=useState(true),[collapsed,setCollapsed]=useState(false);
 const [closeRequested,setCloseRequested]=useState(false),[closing,setClosing]=useState(false),[closeError,setCloseError]=useState(''),[recoveryError,setRecoveryError]=useState('');
 const failed=tasks.filter(task=>task.state==='error'||task.state==='interrupted').length;
 useEffect(()=>{
  void initializeKoboExports().catch(()=>setRecoveryError('Interrupted export history could not be loaded. Reopen the app to try again.'));
  const requestClose=()=>{if(!ongoingKoboExports())return true;setCloseRequested(true);return false};
  const nativeWindow=window as typeof window & {intersosRequestExportClose?:()=>boolean};
  nativeWindow.intersosRequestExportClose=requestClose;
  const unload=(event:BeforeUnloadEvent)=>{if(ongoingKoboExports()){event.preventDefault();event.returnValue=''}};
  window.addEventListener('beforeunload',unload);
  return()=>{delete nativeWindow.intersosRequestExportClose;window.removeEventListener('beforeunload',unload)};
 },[]);
 const cancelAndClose=async()=>{
  setClosing(true);setCloseError('');
  try{await cancelAllKoboExports();await (window as any).pywebview?.api?.close_after_exports();setCloseRequested(false)}
  catch(error){setCloseError(error instanceof Error?error.message:String(error))}
  finally{setClosing(false)}
 };
 useEffect(()=>{if(!tasks.length){setMinimized(true);setCollapsed(false)}},[tasks.length]);
 useEffect(()=>{if(failed){setMinimized(false);setCollapsed(false)}},[failed]);
 if(!tasks.length&&!closeRequested&&!recoveryError)return null;
 const running=tasks.filter(task=>task.state==='running'||task.state==='queued').length;
 const visible=collapsed?[]:minimized?tasks.slice(-1):tasks;
 return <>{closeRequested&&<KoboConfirmDialog title="Exports are still in progress" confirmLabel="Cancel exports and close" cancelLabel="Keep exporting" busy={closing} busyLabel="Cancelling exports…" error={closeError} onCancel={()=>{setCloseRequested(false);setCloseError('')}} onConfirm={()=>void cancelAndClose()}><p>You have {ongoingKoboExports()} ongoing export task{ongoingKoboExports()===1?'':'s'}. Keep the app open to finish, or cancel the exports before closing.</p></KoboConfirmDialog>}<aside className={`kobo-export-tray${minimized?' is-minimized':''}`} aria-label="Export files">
  {recoveryError&&<p role="alert">{recoveryError}<button onClick={()=>setRecoveryError('')}>Dismiss</button></p>}
  <header><div><ProcessingDownload active={running>0}/><strong>{running?`Exporting ${running} ${running===1?'file':'files'}`:failed?'Export needs attention':'Export files'}<small>{tasks.length} {tasks.length===1?'file':'files'} · {running?'Processing in background':failed?`${failed} failed · Review details`:'Ready to review'}</small></strong></div><div className="kobo-export-controls"><button type="button" aria-label={collapsed?'Show export files':'Collapse export files'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}><ChevronDown style={{transform:collapsed?'rotate(180deg)':undefined}}/></button></div></header>
  {!collapsed&&<div className="kobo-export-files">{minimized&&tasks.length>1&&<button className="kobo-export-show-all" onClick={()=>setMinimized(false)}>View all {tasks.length} files</button>}{visible.map(task=>{
   const active=task.state==='queued'||task.state==='running';
   return <section key={task.id} className="kobo-export-file" aria-label={task.filename} aria-busy={active}>
    <div className="kobo-export-filename">{task.format==='pdf'?<FileText/>:<FileSpreadsheet/>}<div><strong title={task.filename}>{task.filename}</strong><small>{task.format==='pdf'?'PDF':'EXCEL'} · {task.project}</small></div><span className={`kobo-export-state is-${task.state}`}>{task.state==='complete'?'Ready':task.state}</span></div>
    <p role={task.state==='error'?'alert':'status'} className={task.state==='error'?'kobo-export-error':undefined} aria-live={task.state==='error'?'assertive':'polite'}>{task.message}</p>
    {active&&<div className="kobo-export-progress"><progress max={100} {...(task.progress?{value:task.progress}:{})} aria-label={`${task.filename} progress`}/><small>{task.progress?`${task.progress}%`:'Preparing…'}</small></div>}
    {active&&task.elapsedSeconds!==undefined&&<small className="kobo-export-timing">{Math.floor(task.elapsedSeconds/60)}m {Math.floor(task.elapsedSeconds%60)}s elapsed{task.totalQuestions?` · ${task.completedQuestions||0}/${task.totalQuestions} questions`:""}{task.lastProgressSecondsAgo!==undefined&&task.lastProgressSecondsAgo>=15?` · Last progress ${Math.floor(task.lastProgressSecondsAgo)}s ago`:""}</small>}
    {task.downloadError&&<p role="alert" className="kobo-export-error">{task.downloadError}</p>}
    <footer>{active?<button disabled={task.cancelPending} onClick={()=>void cancelKoboExport(task.id)}><X/>{task.cancelPending?'Cancelling…':'Cancel'}</button>:<>{task.state==='complete'&&<button className="kobo-export-download" disabled={task.downloading} onClick={()=>void downloadKoboExport(task.id)}><Download/>{task.downloadError?'Download':'Download again'}</button>}{task.cancelError&&<button onClick={()=>void cancelKoboExport(task.id)}><RotateCcw/>Retry cancellation</button>}{!task.cancelError&&['error','cancelled','interrupted'].includes(task.state)&&<button disabled={task.retrying} onClick={()=>void retryKoboExport(task.id)}><RotateCcw/>{task.retrying?"Retrying…":"Retry"}</button>}<button disabled={task.retrying||task.cancelPending||task.cancelError} onClick={()=>dismissKoboExport(task.id)}><X/>Dismiss</button></>}</footer>
   </section>;
  })}</div>}
 </aside></>;
}
