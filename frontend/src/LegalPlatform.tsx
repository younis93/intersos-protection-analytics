import {formatUpdateSize,UpdateReleaseNotes} from "./UpdateReleaseNotes";
import {AnimatedNavigationIcon} from './AnimatedNavigationIcon';

import { deferredComponent } from './DeferredComponent';
import { cancelImport,getImportProgress,useImportProgress,type LegalImportProgress } from './importProgress';
import { legalPageRank } from './legalPageOrder';
import { LegalSkeleton } from './LegalSkeleton';
import NotificationToast from './NotificationToast';
import ImportSourceGuide from './ImportSourceGuide';
import ProcessingRecords from './ProcessingRecords';
import { UpdateFallbackNotice } from "./UpdateFallbackNotice";

import {
AlertTriangle,
ArrowLeft,
ArrowRight,
BriefcaseBusiness,
ChartColumnIncreasing,
CheckCircle2,
ChevronDown,
Database,
FileText,
FolderOpen,
Gavel,
Home,
LayoutDashboard,
LockKeyhole,
Mail,
Maximize2,
Megaphone,
Minimize2,
RefreshCw,
Search,
ShieldAlert,
ShieldCheck,
TableProperties,
Users
} from "lucide-react";
import { startTransition,useCallback,useEffect,useRef,useState } from "react";
import {flushSync} from 'react-dom';
import {
checkForUpdates,
getLegalMetadata,
getUpdateStatus,
installUpdate,
uploadLegalFolder
} from "./api";
import { hasLegalCore,isLegalPageAvailable,resolveLegalPage } from './legalAvailability';
import { legalLoadScheduler,type LoadStatus } from "./legalLoadScheduler";
import { LegalPage,labels } from './legalPageMetadata';
import { setLegalRevision } from "./legalQueryCache";
import type { LegalMetadata,Theme,UpdateCheck,UpdateStatus } from "./types";

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export {formatUpdateSize} from "./UpdateReleaseNotes";

export const legalRouteFromUrl = () => {
  const parts = window.location.hash
    .replace(/^#\/?legal\/?/, "")
    .split("/")
    .filter(Boolean);
  const candidate = parts[0] as LegalPage;
  return {
    page: Object.prototype.hasOwnProperty.call(labels, candidate)
      ? candidate
      : ("overview" as LegalPage),
    caseId: decodeURIComponent(parts[1] || ""),
  };
};

export const legalPageFromUrl = (): LegalPage => legalRouteFromUrl().page;

export const nav: [LegalPage, any][] = [
  ["overview", LayoutDashboard],
  ["hotline", Megaphone],
  ["legalhotlines", Megaphone],
  ["indicators", ChartColumnIncreasing],
  ["beneficiaries", Users],
  ["assessments", ShieldCheck],
  ["legalservices", BriefcaseBusiness],
  ["awareness", Megaphone],
  ["send-issues", Mail],
  ["detention", LockKeyhole],
  ["deportation", ShieldAlert],
  ["lawyer-intelligence", Gavel],
  ["studio", ChartColumnIncreasing],
  ["explorer", TableProperties],
  ["cases", Search],
];

export const latestLegalFiles = (files: File[]) => {
  const supported = new Set([
    "beneficiaries",
    "assessments",
    "legalservices",
    "followupslogbooks",
    "legalfees",
    "awareness",
    "deportationrecords",
    "legalhotlines",
  ]);
  const latest = new Map<string, { file: File; version: number }>();
  files.forEach((file) => {
    const stem = file.name.replace(/\.csv$/i, "").trim();
    const match = stem.match(/\s*\((\d+)\)\s*$/);
    const version = match ? Number(match[1]) : 0;
    const base = (match ? stem.slice(0, match.index) : stem)
      .replace(/[\s_-]+/g, "")
      .toLowerCase();
    if (!supported.has(base)) return;
    const current = latest.get(base);
    if (
      !current ||
      version > current.version ||
      (version === current.version &&
        file.lastModified > current.file.lastModified)
    )
      latest.set(base, { file, version });
  });
  return [...latest.values()].map((item) => item.file);
};

export function NavLoadStatus({label,status}:{label:string;status:LoadStatus}) {
  const [visibility,setVisibility] = useState<"visible"|"exiting"|"hidden">(() => status === "ready" ? "hidden" : "visible");
  const previousStatus = useRef(status);
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = status;
    // Returning from Home mounts indicators with cached ready statuses.
    // Only a newly observed completion should start the checkmark timer.
    if (status === "ready" && previous === "ready") return;
    setVisibility("visible");
    if (status !== "ready") return;
    const exitTimer = window.setTimeout(() => setVisibility("exiting"), 5000);
    const hideTimer = window.setTimeout(() => setVisibility("hidden"), 5350);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, [status]);
  if (status === "idle" || visibility === "hidden") return null;
  return <i className={`nav-load-status nav-load-${status}${visibility === "exiting" ? " nav-load-exiting" : ""}`} title={`${label}: ${status}`} aria-label={`${label} ${status}`}>{status === "ready" ? <CheckCircle2/> : status === "error" ? <AlertTriangle/> : null}</i>;
}

export function LegalPageNavigation({items,page,onNavigate,loadStatuses,sendIssuesStatus}:{items:typeof nav;page:LegalPage;onNavigate:(page:LegalPage)=>void;loadStatuses:Record<string,LoadStatus>;sendIssuesStatus:LoadStatus|'idle'}){
  const [selectedPage,setSelectedPage]=useState(page);
  const navigationFrame=useRef<number|null>(null);
  useEffect(()=>()=>{if(navigationFrame.current!==null)cancelAnimationFrame(navigationFrame.current)},[]);
  useEffect(()=>setSelectedPage(page),[page]);
  return <nav>{items.map(([id,Icon])=><button key={id} className={selectedPage===id?"active":""} onPointerEnter={()=>preloadLegalPage(id)} onFocus={()=>preloadLegalPage(id)} onClick={()=>{
    // Give the compositor an initial frame before the destination's render work.
    flushSync(()=>setSelectedPage(id));
    if(navigationFrame.current!==null)cancelAnimationFrame(navigationFrame.current);
    navigationFrame.current=requestAnimationFrame(()=>{
      navigationFrame.current=requestAnimationFrame(()=>{
        navigationFrame.current=null;
        startTransition(()=>onNavigate(id));
      });
    });
  }}>
    <AnimatedNavigationIcon page={id} Icon={Icon} active={selectedPage===id}/>
    <span>{labels[id]}</span>
    {id==="send-issues"&&sendIssuesStatus!=="idle"?<NavLoadStatus label={labels[id]} status={sendIssuesStatus}/>:loadStatuses[id]&&<NavLoadStatus label={labels[id]} status={loadStatuses[id]}/>}
  </button>)}</nav>;
}

export default function LegalPlatform({onStartupReady}:{onStartupReady?:()=>void}) {
  const [metadata, setMetadataState] = useState<LegalMetadata | null>(null),
    [metadataLoading, setMetadataLoading] = useState(true),
    [requestedPage, setPageState] = useState<LegalPage>(legalPageFromUrl),
    [caseQuery, setCaseQuery] = useState(() => legalRouteFromUrl().caseId),
    [reviewCaseId, setReviewCaseId] = useState(""),
    [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("legal-sidebar-collapsed") === "true"),
    [theme, setTheme] = useState(() => localStorage.getItem("legal-platform-theme") || localStorage.getItem("app-theme") || new URLSearchParams(window.location.search).get("appTheme") || "glass-light"),
    [fullscreen, setFullscreen] = useState(false),
    [dataMenuOpen, setDataMenuOpen] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [dataRevision, setDataRevision] = useState(0),
    [loadStatuses,setLoadStatuses] = useState<Record<string,LoadStatus>>({}),
    [uploadProgress, setUploadProgress] = useState(0),
    [uploadPhase, setUploadPhase] = useState<"uploading" | "processing">(
      "uploading",
    );
  const page = metadata?.ready ? resolveLegalPage(metadata,requestedPage) as LegalPage : requestedPage;
  const setMetadata = useCallback((next: LegalMetadata | null) => {
    setLegalRevision(next?.revision || null);
    setMetadataState(next);
  }, []);
  const [importOperationId,setImportOperationId]=useState<string|null>(null);
  const restoringData=Boolean(!metadata?.ready&&(metadataLoading||metadata?.loading));
  const importProgress=useImportProgress(uploading||restoringData,uploading?importOperationId:null);
  const [processingResult,setProcessingResult]=useState<LegalImportProgress|null>(null);
  const [cancelPending,setCancelPending]=useState(false),[cancelError,setCancelError]=useState('');
  const uploadController=useRef<AbortController|null>(null);
  const cancellation=useRef<LegalImportProgress|null>(null);
  const beginImportProgress=()=>{const id=crypto.randomUUID();setImportOperationId(id);setProcessingResult(null);setCancelPending(false);setCancelError('');cancellation.current=null;return id;};
  const importFailure=(reason:any)=>{
    if(cancellation.current||reason?.name==='AbortError'||String(reason?.message||reason).includes('Import cancelled'))return;
    setProcessingResult({operationId:importOperationId,state:'error',stage:'',dataset:'',completedWork:0,totalWork:0,percent:null,error:reason?.message||String(reason)||'Unable to import data.'});
  };
  const finishImport=async()=>{
    if(cancellation.current){
      let status=cancellation.current;
      while(status.state==='cancelling'){
        await new Promise(resolve=>window.setTimeout(resolve,250));
        try{status=await getImportProgress(status.operationId)}catch{continue}
      }
      if(status.state==='cancelled'||status.state==='idle')setProcessingResult({...status,state:'cancelled'});
    }
    await new Promise(resolve=>window.setTimeout(resolve,300));
    setUploading(false);setUploadProgress(0);setCancelPending(false);uploadController.current=null;
  };
  const cancelProcessing=async()=>{
    const id=uploading?importOperationId:importProgress?.operationId;
    if(!id)return;
    setCancelPending(true);setCancelError('');
    try{
      const status=await cancelImport(id);
      if(['cancelling','cancelled'].includes(status.state)){
        cancellation.current=status;
        if(uploadPhase==='uploading'&&uploading)uploadController.current?.abort();
        if(status.state==='cancelled')setProcessingResult(status);
        if(!uploading){
          let terminal=status;
          while(terminal.state==='cancelling'){
            await new Promise(resolve=>window.setTimeout(resolve,250));
            try{terminal=await getImportProgress(id)}catch{continue}
          }
          if(terminal.state==='cancelled')setProcessingResult(terminal);
          setCancelPending(false);
        }
      }else setCancelPending(false);
    }catch(reason:any){setCancelError(reason.message);setCancelPending(false)}
  };
  useEffect(()=>{
    if((uploading||metadata?.loading&&importProgress?.source==='startup')&&(importProgress?.state==='cancelled'||importProgress?.state==='error')){
      setProcessingResult(importProgress);setCancelPending(false);
    }
  },[importProgress,uploading,metadata?.loading]);
  const [sendIssuesStatus,setSendIssuesStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheck | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const legalShell = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<number | null>(null);
  const [copiedValue, setCopiedValue] = useState("");
  useEffect(()=>legalLoadScheduler.subscribe(setLoadStatuses),[]);
  useEffect(() => {
    const showCopied = (event: Event) => {
      const text = (event as CustomEvent<string>).detail?.trim();
      if (!text) return;
      setCopiedValue(text);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedValue(""), 1800);
    };
    window.addEventListener("legal-copy", showCopied);
    return () => window.removeEventListener("legal-copy", showCopied);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = (openWhenAvailable: boolean) => checkForUpdates().then((info) => {
      if (!active) return;
      setUpdateInfo(info);
      if (openWhenAvailable && info.available) setUpdateOpen(true);
    }).catch(() => undefined);
    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), UPDATE_CHECK_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!updateStatus || !["downloading", "verifying", "installing", "restarting"].includes(updateStatus.phase)) return;
    const timer = window.setInterval(() => { void getUpdateStatus().then(setUpdateStatus).catch(() => undefined); }, 700);
    return () => window.clearInterval(timer);
  }, [updateStatus?.phase]);
  const beginUpdate = () => installUpdate().then(setUpdateStatus).catch((error: Error) => setUpdateStatus({ phase: "error", progress: 0, error: error.message, currentVersion: updateInfo?.currentVersion || "1.0.18" }));
  useEffect(() => {document.documentElement.dataset.theme=theme;localStorage.setItem("legal-platform-theme",theme);localStorage.setItem("app-theme",theme);const syncNativeTitleBar=()=>{void (window as any).pywebview?.api?.set_title_bar_theme?.(theme)};syncNativeTitleBar();window.addEventListener("pywebviewready",syncNativeTitleBar,{once:true});return()=>window.removeEventListener("pywebviewready",syncNativeTitleBar)},[theme]);
  useEffect(() => {const sync=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener("fullscreenchange",sync);return()=>document.removeEventListener("fullscreenchange",sync)},[]);
  const toggleFullscreen=async()=>{const nativeApi=(window as any).pywebview?.api;if(nativeApi?.toggle_fullscreen)setFullscreen(await nativeApi.toggle_fullscreen());else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()};
  useEffect(() => {
    const root=legalShell.current;
    if(!root)return;
    const sortTable=(event:MouseEvent) => {
      const header=(event.target as HTMLElement).closest("th");
      if(!header || !root.contains(header) || header.colSpan!==1 || header.querySelector("button") || header.classList.contains("no-sort"))return;
      const table=header.closest("table"),body=table?.tBodies?.[0];
      if(!table || !body || body.rows.length<2)return;
      const column=header.cellIndex,direction=header.getAttribute("aria-sort")==="ascending"?"descending":"ascending";
      table.querySelectorAll("th[aria-sort]").forEach((item) => {item.removeAttribute("aria-sort");item.classList.remove("table-sort-active")});
      header.setAttribute("aria-sort",direction);header.classList.add("table-sort-active");
      const comparable=(text:string) => {
        const clean=text.trim();if(!clean || clean==="—")return {kind:3,value:""};
        const numeric=Number(clean.replace(/[,٪%$]/g,""));if(Number.isFinite(numeric))return {kind:0,value:numeric};
        if(/^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/.test(clean)){const parsed=Date.parse(clean);if(Number.isFinite(parsed))return {kind:1,value:parsed}}
        return {kind:2,value:clean.toLocaleLowerCase()};
      };
      const fixedRows=Array.from(body.rows).filter((row)=>row.classList.contains("indicator-analysis-total")||row.classList.contains("indicator-grand-total"));
      const rows=Array.from(body.rows).filter((row)=>!fixedRows.includes(row));
      rows.sort((left,right) => {
        const a=comparable(left.cells[column]?.textContent || ""),b=comparable(right.cells[column]?.textContent || "");
        const result=a.kind!==b.kind?a.kind-b.kind:(typeof a.value==="number"&&typeof b.value==="number"?a.value-b.value:String(a.value).localeCompare(String(b.value),undefined,{numeric:true,sensitivity:"base"}));
        return direction==="ascending"?result:-result;
      });
      rows.forEach((row) => body.appendChild(row));fixedRows.forEach((row)=>body.appendChild(row));
    };
    root.addEventListener("click",sortTable);
    return () => root.removeEventListener("click",sortTable);
  }, []);
  useEffect(() => {
    const root=legalShell.current;
    if(!root)return;
    const copyCell=async(event:MouseEvent) => {
      const origin=event.target as HTMLElement;
      if(origin.closest("button,a,input,select,textarea,summary,[role=button]"))return;
      const target=origin.closest<HTMLElement>("td,.case-record>div,.record-fields>div>span,[data-copy-value]");
      if(!target || !root.contains(target) || target.querySelector("button,a,input,select,textarea"))return;
      const valueElement=target.matches(".case-record>div,.record-fields>div>span")?target.querySelector<HTMLElement>("strong"):target;
      const text=(target.dataset.copyValue||valueElement?.innerText||valueElement?.textContent||"").trim();
      if(!text || text==="—")return;
      try{
        await navigator.clipboard.writeText(text);
      }catch{
        const field=document.createElement("textarea");
        field.value=text;field.setAttribute("readonly","");field.style.position="fixed";field.style.opacity="0";
        document.body.appendChild(field);field.select();document.execCommand("copy");field.remove();
      }
      setCopiedValue(text);
      if(copiedTimer.current!==null)window.clearTimeout(copiedTimer.current);
      copiedTimer.current=window.setTimeout(()=>setCopiedValue(""),1800);
    };
    root.addEventListener("click",copyCell);
    return()=>{root.removeEventListener("click",copyCell);if(copiedTimer.current!==null)window.clearTimeout(copiedTimer.current)};
  },[]);
  const setPage = (next: LegalPage) => {
    legalLoadScheduler.promotePage(next);
    setPageState(next);
    window.location.hash = `/legal/${next}`;
    legalShell.current?.querySelector<HTMLElement>(":scope > main")?.scrollTo({ top: 0, behavior: "auto" });
  };
  useEffect(() => {
    let cancelled=false;
    const load=async()=>{
      let lastError:unknown;
      for(let attempt=0;attempt<3&&!cancelled;attempt++){
        const controller=new AbortController();
        const timeout=window.setTimeout(()=>controller.abort(),3000);
        try{
          const next=await getLegalMetadata(controller.signal);
          if(!cancelled)setMetadata(next);
          return;
        }catch(reason){
          lastError=reason;
          if(attempt<2)await new Promise(resolve=>window.setTimeout(resolve,250*(attempt+1)));
        }finally{window.clearTimeout(timeout)}
      }
      if(!cancelled)setError(lastError instanceof Error&&lastError.name!=="AbortError"?lastError.message:"The local service did not respond. Restart the app and try again.");
    };
    void load().finally(()=>{if(!cancelled){setMetadataLoading(false);onStartupReady?.()}});
    return()=>{cancelled=true};
  }, [onStartupReady]);
  useEffect(()=>{
    if(metadataLoading||metadata?.ready||!metadata?.loading)return;
    let cancelled=false;
    const poll=()=>getLegalMetadata().then((next)=>{if(!cancelled)setMetadata(next)}).catch(()=>{});
    const timer=window.setInterval(poll,1000);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[metadataLoading,metadata?.ready,metadata?.loading]);
  useEffect(() => {
    const sync = () => {
      const route = legalRouteFromUrl();
      startTransition(()=>setPageState(route.page));
      if (route.caseId) setCaseQuery(route.caseId);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const upload = async (files: File[]) => {
    if(uploading||restoringData)return;
    const selectedFiles = latestLegalFiles(files);
    if (!selectedFiles.length) {
      setError("No supported CSV files were found in the selected folder.");
      return;
    }
    const operationId=beginImportProgress();
    setUploading(true);
    setUploadProgress(0);
    setUploadPhase("uploading");
    setError("");
    const controller=new AbortController();uploadController.current=controller;
    try {
      const next = await uploadLegalFolder(selectedFiles, (status) => {
        setUploadPhase(status.phase);
        if (status.percent !== null) setUploadProgress(status.percent);
      }, operationId,controller.signal);
      setMetadata(next); setDataRevision((value) => value + 1);
    } catch (e: any) {
      importFailure(e);
    } finally {
      await finishImport();
    }
  };
  const selectFolder = async () => {
    if(uploading||restoringData)return;
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.choose_legal_folder || !desktopApi?.process_legal_folder) {
      folderInput.current?.click();
      return;
    }
    setError("");
    try {
      const selectedPath = await desktopApi.choose_legal_folder();
      if (!selectedPath) return;
      const operationId=beginImportProgress();
      setUploading(true);
      setUploadProgress(0);
      setUploadPhase("processing");
      const next = await desktopApi.process_legal_folder(selectedPath,operationId);
      if (next?.ready) {
        setMetadata(next); setDataRevision((value) => value + 1);
      }
    } catch (reason: any) {
      importFailure(reason);
    } finally {
      await finishImport();
    }
  };
  const refreshSelectedFolder = async () => {
    if(uploading||restoringData)return;
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.refresh_legal_folder) return;
    const operationId=beginImportProgress();
    setError("");setUploading(true);setUploadProgress(0);setUploadPhase("processing");
    try { const next = await desktopApi.refresh_legal_folder(operationId); setMetadata(next); setDataRevision((value) => value + 1); }
    catch (reason: any) { importFailure(reason); }
    finally { await finishImport(); }
  };
  const selectFiles = async () => {
    if(uploading||restoringData)return;
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.choose_legal_files || !desktopApi?.process_legal_files) { filesInput.current?.click(); return; }
    setError("");
    try {
      const paths = await desktopApi.choose_legal_files();
      if (!paths?.length) return;
      const operationId=beginImportProgress();
      setUploading(true);setUploadProgress(0);setUploadPhase("processing");
      const next = await desktopApi.process_legal_files(paths,operationId);
      setMetadata(next); setDataRevision((value) => value + 1);
    } catch (reason: any) { importFailure(reason); }
    finally { await finishImport(); }
  };
  const refreshSelectedFiles = async () => {
    if(uploading||restoringData)return;
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.refresh_legal_files) return;
    const operationId=beginImportProgress();
    setError("");setUploading(true);setUploadProgress(0);setUploadPhase("processing");
    try { const next = await desktopApi.refresh_legal_files(operationId);setMetadata(next); setDataRevision((value) => value + 1); }
    catch (reason: any) { importFailure(reason); }
    finally { await finishImport(); }
  };
  const coreAvailable=Boolean(metadata&&hasLegalCore(metadata));
  const availableNav = nav.filter(([id]) => Boolean(metadata&&isLegalPageAvailable(metadata,id)));
  useEffect(()=>{if(metadata?.ready)legalLoadScheduler.start(metadata,page)},[metadata?.ready,metadata?.revision]);
  useEffect(()=>{if(metadata?.ready)legalLoadScheduler.promotePage(page)},[metadata?.ready,page]);
  useEffect(()=>{
    if(!metadata?.ready)return;
    if(page!==requestedPage)setPage(page);
    if(!coreAvailable)setReviewCaseId('');
  },[metadata,page,requestedPage,coreAvailable]);
  const openReviewCase = (id: string) => {if(coreAvailable)setReviewCaseId(id)};
  return (
    <div ref={legalShell} className={`app-shell legal-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} onWheel={(event)=>{if(event.target!==event.currentTarget)return;event.currentTarget.querySelector("main")?.scrollBy({top:event.deltaY,left:0,behavior:"auto"})}}>
      <aside className="sidebar glass">
        <div className="brand">
          <img src="/intersos-symbol-clear.png" alt="INTERSOS" />
          <div>
            <strong>Legal Platform</strong>
            <small>Review & analytics</small>
          </div>
        </div>
        <div className="sidebar-workspace-controls"><button className="soft sidebar-fullscreen" onClick={toggleFullscreen} title={fullscreen ? "Exit full screen" : "Enter full screen"} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>{fullscreen ? <Minimize2/> : <Maximize2/>}<span>Full screen</span></button><div className={`data-source-control app-select app-select-theme ${dataMenuOpen?"open":""}`}><Database className="app-select-icon"/><span className="app-select-label">Data source</span><button className="app-select-trigger" disabled={uploading||restoringData} aria-busy={uploading} aria-haspopup="menu" aria-expanded={dataMenuOpen} onClick={() => setDataMenuOpen((current)=>!current)}><span>{uploading ? uploadPhase === "uploading" ? `Uploading ${uploadProgress}%` : "Processing records…" : "Choose source"}</span><ChevronDown/></button>{dataMenuOpen&&<><button className="data-source-backdrop" aria-label="Close data source menu" onClick={()=>setDataMenuOpen(false)}/><div className="app-select-menu data-source-menu" role="menu"><ImportSourceGuide compact/><div className="data-source-option"><button role="menuitem" onClick={()=>{setDataMenuOpen(false);selectFolder()}}><FolderOpen/><span><strong>Select folder</strong><small>Load all supported CSV files</small></span></button>{(window as any).pywebview?.api?.refresh_legal_folder&&<button className="data-source-refresh" aria-label="Refresh selected folder" title="Refresh selected folder" onClick={()=>{setDataMenuOpen(false);refreshSelectedFolder()}}><RefreshCw/></button>}</div><div className="data-source-option"><button role="menuitem" onClick={()=>{setDataMenuOpen(false);selectFiles()}}><Database/><span><strong>Select multiple CSV files</strong><small>Choose individual source files</small></span></button>{(window as any).pywebview?.api?.refresh_legal_files&&<button className="data-source-refresh" aria-label="Refresh selected CSV files" title="Refresh selected CSV files" onClick={()=>{setDataMenuOpen(false);refreshSelectedFiles()}}><RefreshCw/></button>}</div><footer><span>Current source</span><strong>{metadata?.source||"No folder loaded"}</strong></footer></div></>}</div></div>
        <div className="legal-sidebar-utilities"><button aria-label="Home" title="Home" onClick={() => {window.location.hash="/"}}><Home/><span>Home</span></button><button className="legal-menu-slide-toggle" aria-label={sidebarCollapsed ? "Expand menu" : "Slide menu left"} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "Expand menu" : "Slide menu left"} onClick={() => {setDataMenuOpen(false);setSidebarCollapsed((current) => {const next=!current;localStorage.setItem("legal-sidebar-collapsed",String(next));return next})}}><>{sidebarCollapsed?<ArrowRight/>:<ArrowLeft/>}</><span>{sidebarCollapsed ? "Expand" : "Slide left"}</span></button></div>
        <LegalPageNavigation items={availableNav} page={page} onNavigate={setPage} loadStatuses={loadStatuses} sendIssuesStatus={sendIssuesStatus}/>
      </aside>
      <main>
        <header className="topbar">
          <div className="mobile-brand">Legal Platform</div>
          <div className="header-actions">
            <div id="legal-header-scroll-controls" className="legal-header-scroll-slot"/>
            <input
              ref={folderInput}
              hidden
              type="file"
              multiple
              {...({ webkitdirectory: "", directory: "" } as any)}
              onChange={(e) => {
                const files = Array.from(e.target.files || []).filter((f) =>
                  f.name.toLowerCase().endsWith(".csv"),
                );
                e.currentTarget.value = "";
                upload(files);
              }}
            />
            <input
              ref={filesInput}
              hidden
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []).filter((f) =>
                  f.name.toLowerCase().endsWith(".csv"),
                );
                e.currentTarget.value = "";
                upload(files);
              }}
            />
          </div>
        </header>
        {/* A new source must discard every page's local results, filters and selections. */}
        <section key={metadata?.revision || "unloaded"} className="content legal-content">
          {error && (
            <div className="error glass">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {!metadata?.ready ? (
            <section className="glass legal-import-source" aria-labelledby="import-data-source-title">
              <header>
                <span className="legal-import-source-icon"><Database/></span>
                <div>
                  <span className="eyebrow">DATA SOURCE</span>
                  <h2 id="import-data-source-title">Import Legal Platform data</h2>
                  <p>Choose a folder or individual CSV files to begin your data review and analysis.</p>
                </div>
              </header>
              <ImportSourceGuide/>
              <div className="legal-import-source-options">
                <button type="button" className="legal-import-source-option" onClick={()=>void selectFolder()} disabled={uploading||restoringData}>
                  <FolderOpen/>
                  <span><strong>Select data folder</strong><small>Load all supported CSV files from one folder.</small></span>
                  <ArrowRight/>
                </button>
                <button type="button" className="legal-import-source-option" onClick={()=>void selectFiles()} disabled={uploading||restoringData}>
                  <FileText/>
                  <span><strong>Select CSV files</strong><small>Choose individual source files from different locations.</small></span>
                  <ArrowRight/>
                </button>
              </div>
            </section>
          ) : page === "overview" ? (
            <Overview metadata={metadata} theme={theme as Theme} />
          ) : [
              "beneficiaries",
              "assessments",
              "legalservices",
              "awareness",
              "legalhotlines",
            ].includes(page) ? (
            <ReviewPage key={`${page}-${dataRevision}`} dataset={page} onOpenCase={openReviewCase} />
          ) : page === "send-issues" ? (
            <SendIssues revision={String(dataRevision)} onLoadStatus={setSendIssuesStatus}/>
          ) : page === "explorer" ? (
            <Explorer key={metadata.revision} metadata={metadata} onOpenCase={openReviewCase} />
          ) : page === "hotline" ? (
            <HotlineDashboard key={`hotline-${dataRevision}`} metadata={metadata} theme={theme as Theme}/>
          ) : page === "deportation" ? (
            <LegalDeportationDashboard metadata={metadata} theme={theme as Theme}/>
          ) : page === "studio" ? (
            <LegalAnalyticsStudio metadata={metadata} theme={theme as Theme} onOpenCase={openReviewCase}/>
          ) : page === "detention" ? (
            <DetentionCases onOpenCase={openReviewCase} theme={theme} />
          ) : page === "cases" ? (
            <Cases
              metadata={metadata}
              initialQuery={caseQuery}
              onQueryUsed={() => setCaseQuery("")}
              onOpenCase={openReviewCase}
            />
          ) : page === "lawyer-intelligence" ? (
            <LawyerOverview metadata={metadata} />
          ) : <IndicatorReporting revision={dataRevision} onOpenCase={coreAvailable?openReviewCase:undefined} caseReviewOpen={Boolean(reviewCaseId)}/>}
        </section>
      </main>
      {(uploading||restoringData||cancelPending||processingResult)&&<ProcessingRecords key={importOperationId||"startup"} progress={processingResult||importProgress} uploadPercent={uploading&&uploadPhase==="uploading"?uploadProgress:undefined} restoring={!uploading} onCancel={cancelProcessing} onDismiss={()=>setProcessingResult(null)} cancelPending={cancelPending} cancelError={cancelError}/>}
      {reviewCaseId && metadata?.ready && coreAvailable && <CaseReviewModal key={metadata.revision} caseId={reviewCaseId} metadata={metadata} onClose={() => setReviewCaseId("")} />}
      <NotificationToast message={copiedValue} label="Copied"/>
      {updateOpen&&<div className="modal-backdrop"><section className="update-modal glass" role="dialog" aria-modal="true" aria-label="Application update"><div className="update-icon" data-updating={Boolean(updateStatus&&['downloading','verifying','installing','restarting'].includes(updateStatus.phase))} aria-hidden="true"><RefreshCw/></div><span className="eyebrow">APPLICATION UPDATE</span><h2>{updateInfo?.available?`Version ${updateInfo.latestVersion} is available`:updateInfo?.enabled===false?"Updates need configuration":updateInfo?.message?.startsWith("Unable")?"Unable to check for updates":"You’re up to date"}</h2>{updateInfo?.available?<UpdateReleaseNotes notes={updateInfo.notes} sizeBytes={updateInfo.sizeBytes}/>:<p>{updateInfo?.message||`You are using version ${updateInfo?.currentVersion||'1.0.18'}.`}</p>}{updateStatus&&updateStatus.phase!=="idle"&&<div className="update-progress"><div><span>{updateStatus.phase}</span><strong>{updateStatus.progress}%</strong></div><i><b style={{width:`${updateStatus.progress}%`}}/></i>{updateStatus.phase==="downloading"&&<small>Downloaded {formatUpdateSize(updateStatus.downloadedBytes)} of {formatUpdateSize(updateStatus.totalBytes||updateInfo?.sizeBytes)}</small>}{updateStatus.error&&<em>{updateStatus.error}</em>}</div>}{updateInfo?.available&&<UpdateFallbackNotice failed={updateStatus?.phase === "error"}/>}<div className="update-actions">{updateInfo?.available&&(!updateStatus||["idle","error"].includes(updateStatus.phase))&&<button className="primary" onClick={beginUpdate}>{updateStatus?.phase === "error" ? "Try again" : "Update now"}</button>}<button className="soft" onClick={()=>setUpdateOpen(false)} disabled={Boolean(updateStatus&&["installing","restarting"].includes(updateStatus.phase))}>{updateInfo?.available?"Later":"Close"}</button></div></section></div>}
    </div>
  );
}


nav.sort(([left],[right])=>legalPageRank(left)-legalPageRank(right));
const ReviewPage=deferredComponent(async ()=>({default:(await import('./LegalReviewPage')).ReviewPage}),<LegalSkeleton variant="review"/>);
const Overview=deferredComponent(async ()=>({default:(await import('./LegalOverviewPage')).Overview}),<LegalSkeleton variant="overview"/>);
const Explorer=deferredComponent(async ()=>({default:(await import('./LegalExplorerPage')).Explorer}),<LegalSkeleton variant="explorer"/>);
const HotlineDashboard=deferredComponent(async ()=>({default:(await import('./LegalHotlinePage')).HotlineDashboard}),<LegalSkeleton variant="table"/>);
const LegalDeportationDashboard=deferredComponent(async ()=>({default:(await import('./LegalDeportationPage')).LegalDeportationDashboard}),<LegalSkeleton variant="deportation"/>);
const LegalAnalyticsStudio=deferredComponent(async ()=>({default:(await import('./LegalStudioPage')).LegalAnalyticsStudio}),<LegalSkeleton variant="studio"/>);
const DetentionCases=deferredComponent(async ()=>({default:(await import('./LegalDetentionPage')).DetentionCases}),<LegalSkeleton variant="detention"/>);
const Cases=deferredComponent(async ()=>({default:(await import('./LegalCasesPage')).Cases}),<LegalSkeleton variant="cases"/>);
const LawyerOverview=deferredComponent(async ()=>({default:(await import('./LegalLawyersPage')).LawyerOverview}),<LegalSkeleton variant="lawyers"/>);
const IndicatorReporting=deferredComponent(async ()=>({default:(await import('./LegalIndicatorsPage')).IndicatorReporting}),<LegalSkeleton variant="indicator"/>);
const CaseReviewModal=deferredComponent(async ()=>({default:(await import('./LegalCaseModal')).CaseReviewModal}),<LegalSkeleton variant="table"/>);
const SendIssues=deferredComponent(()=>import('./SendIssues'),<LegalSkeleton variant="review"/>);

function preloadLegalPage(page:LegalPage){
  const modules={overview:Overview,hotline:HotlineDashboard,legalhotlines:ReviewPage,beneficiaries:ReviewPage,assessments:ReviewPage,legalservices:ReviewPage,awareness:ReviewPage,deportation:LegalDeportationDashboard,studio:LegalAnalyticsStudio,detention:DetentionCases,explorer:Explorer,cases:Cases,'lawyer-intelligence':LawyerOverview,'send-issues':SendIssues,indicators:IndicatorReporting};
  void modules[page].preload();
}
if(typeof window!=='undefined'&&window.location.hash.startsWith('#/legal'))preloadLegalPage(legalPageFromUrl());
import './workspace.css';
