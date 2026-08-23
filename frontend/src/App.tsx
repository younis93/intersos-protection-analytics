import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  Filter,
  Home,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Palette,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  TableProperties,
  Upload,
} from "lucide-react";
import {
  exportUrl,
  downloadExcelUrl,
  getDashboard,
  getMetadata,
  getQuality,
  uploadWorkbook,
} from "./api";
import {
  ActiveFilters,
  ExcelDownloadButton,
  AppSelect,
  ChartCard,
  FilterDrawer,
  FlowCard,
  KpiCard,
  QualityTable,
  TrendCard,
} from "./components";
import Studio from "./Studio";
import DataExplorer from "./DataExplorer";
import type {
  Dashboard,
  Display,
  Filters,
  Measure,
  Metadata,
  Page,
  QualityRow,
  Theme,
} from "./types";

const nav: { id: Page; label: string; icon: any }[] = [
  { id: "executive", label: "Executive", icon: BarChart3 },
  { id: "assessment", label: "Assessment", icon: ClipboardCheck },
  { id: "services", label: "Services", icon: FileCheck2 },
  { id: "deportation", label: "Deportation", icon: ShieldCheck },
  { id: "studio", label: "Analytics Studio", icon: LayoutDashboard },
  { id: "explorer", label: "Data Explorer", icon: TableProperties },
  { id: "quality", label: "Data Quality", icon: Database },
];
const pageIds = new Set<Page>(nav.map(({ id }) => id));
const pageFromUrl = (): Page => {
  const candidate = window.location.hash.replace(/^#\/?/, "") as Page;
  return pageIds.has(candidate) ? candidate : "executive";
};

type UploadPhase = "idle" | "uploading" | "processing" | "importing";
const uploadPhaseLabel = (phase: UploadPhase) => phase === "processing" ? "Processing workbook" : phase === "importing" ? "Importing dashboard" : "Uploading workbook";

function UploadRequired({onUpload, uploading, progress, phase}:{onUpload:()=>void; uploading:boolean; progress:number; phase:UploadPhase}){
  return <section className="upload-required glass"><div className="upload-required-icon"><Upload/></div><span className="eyebrow">PRIVATE, LOCAL ANALYTICS</span><h2>Upload an approved workbook</h2><p>This portable application contains no case data. Your workbook is processed locally in memory and is cleared when the application closes.</p><button className="primary" onClick={onUpload} disabled={uploading} aria-busy={uploading}>{uploading ? <><span className="button-spinner"/>{uploadPhaseLabel(phase)}… {progress}%</> : <><Upload/>Upload Excel workbook</>}</button>{uploading && <div className="upload-progress" role="progressbar" aria-label={uploadPhaseLabel(phase)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{width:`${progress}%`}}/></div>}<small>{uploading ? (phase === "uploading" ? "Sending the workbook to the local service…" : phase === "processing" ? "Validating sheets and processing workbook data…" : "Verifying the import and refreshing dashboard indicators…") : "Supported sheets: Assessments, Legal Services, and Deportation."}</small></section>
}

function AnalyticsUnavailable(){
  return <section className="upload-required glass workspace-unavailable"><div className="upload-required-icon"><Database/></div><span className="eyebrow">LOCAL SERVICE UNAVAILABLE</span><h2>Protection Analytics is not connected</h2><p>The analytics workspace could not reach its local service. Please restart the application, then try opening this workspace again.</p><button className="primary" onClick={()=>window.location.reload()}><RefreshCw/>Try again</button></section>
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromUrl);
  const [theme, setTheme] = useState<Theme>(() => {
    const startupTheme = new URLSearchParams(window.location.search).get("appTheme") as Theme | null;
    return (localStorage.getItem("app-theme") as Theme) || startupTheme || "glass-light";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("analytics-sidebar-collapsed") === "true");
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [quality, setQuality] = useState<QualityRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [measure, setMeasure] = useState<Measure>("records");
  const [display, setDisplay] = useState<Display>("both");
  const [drawer, setDrawer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [fullscreen, setFullscreen] = useState(false);
  const [dataSourceOpen, setDataSourceOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);


  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("app-theme",theme);
    let attempts=0, timer:number|undefined, cancelled=false;
    const syncNativeTitleBar=async()=>{
      try{
        const nativeApi=(window as any).pywebview?.api;
        if(nativeApi?.set_title_bar_theme && await nativeApi.set_title_bar_theme(theme))return;
      }catch{/* The window can reject DWM updates while it is still being created. */}
      if(!cancelled&&attempts++<50)timer=window.setTimeout(()=>void syncNativeTitleBar(),100);
    };
    void syncNativeTitleBar();
    const onNativeReady=()=>void syncNativeTitleBar();
    window.addEventListener("pywebviewready",onNativeReady,{once:true});
    return()=>{cancelled=true;window.removeEventListener("pywebviewready",onNativeReady);if(timer)window.clearTimeout(timer)};
  }, [theme]);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const toggleFullscreen = async () => {
    const nativeApi = (window as any).pywebview?.api;
    if (nativeApi?.toggle_fullscreen) {
      setFullscreen(await nativeApi.toggle_fullscreen());
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  };
  useEffect(() => {
    const syncPageFromUrl = () => setPage(pageFromUrl());
    window.addEventListener("hashchange", syncPageFromUrl);
    return () => window.removeEventListener("hashchange", syncPageFromUrl);
  }, []);
  useEffect(() => {
    document.title = `${nav.find(({id}) => id === page)?.label || "Executive"} · Protection Analytics`;
  }, [page]);
  useEffect(() => {
    getMetadata()
      .then(setMetadata)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(()=>{
    if(!metadata?.loading||metadata.ready)return;
    const timer=window.setInterval(()=>getMetadata().then(setMetadata).catch(()=>{}),1000);
    return()=>window.clearInterval(timer);
  },[metadata?.loading,metadata?.ready]);
  useEffect(()=>{
    if(!metadata?.ready)return;
    getQuality().then((result)=>setQuality(result.rows)).catch((e)=>setError(e.message));
  },[metadata?.ready,metadata?.source]);
  useEffect(() => {
    if (page === "quality" || page === "studio" || page === "explorer" || !metadata || !metadata.ready) return;
    if (!dash) setLoading(true);
    else setRefreshing(true);
    getDashboard(page, filters, page === "executive" ? "records" : measure)
      .then(setDash)
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [page, filters, measure, metadata]);
  useEffect(() => {
    setFilters({});
    setDash(null);
  }, [page]);
  const available = metadata?.pages[page]?.filters || {};
  const activeCount = Object.values(filters).reduce((n, v) => n + v.length, 0);
  const headerFiltersVisible = false;

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadPhase("uploading");
    setError("");
    try {
      const imported = await uploadWorkbook(file, (progress) => {
        setUploadProgress(progress);
        setUploadPhase(progress >= 90 ? "processing" : "uploading");
      });
      setUploadPhase("importing");
      setUploadProgress(97);
      if (!imported.source || !imported.pages?.assessment || !imported.pages?.services || !imported.pages?.deportation) {
        throw new Error("The server did not return complete workbook metadata. Please close older app windows and try again.");
      }
      const activated = { ...imported, ready: true };
      setFilters({});
      setDash(null);
      setMetadata(activated);
      try {
        const q = await getQuality();
        setQuality(q.rows);
      } catch {
        setQuality([]);
      }
      setUploadProgress(100);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadPhase("idle");
    }
  }
  const selectWorkbook = async () => {
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.choose_analytics_workbook || !desktopApi?.process_analytics_workbook) { input.current?.click(); return; }
    const selectedPath = await desktopApi.choose_analytics_workbook();
    if (!selectedPath) return;
    setUploading(true);setUploadProgress(100);setUploadPhase("processing");setError("");
    try { const imported=await desktopApi.process_analytics_workbook(selectedPath);setFilters({});setDash(null);setMetadata(imported);setQuality((await getQuality()).rows); }
    catch (e:any) { setError(e.message); }
    finally { setUploading(false);setUploadProgress(0);setUploadPhase("idle"); }
  };
  const refreshSelectedWorkbook = async () => {
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.refresh_analytics_workbook) return;
    setUploading(true);setUploadProgress(100);setUploadPhase("processing");setError("");
    try { const imported=await desktopApi.refresh_analytics_workbook();setFilters({});setDash(null);setMetadata(imported);setQuality((await getQuality()).rows); }
    catch (e:any) { setError(e.message); }
    finally { setUploading(false);setUploadProgress(0);setUploadPhase("idle"); }
  };
  const selectChart = (field: string, value: string) =>
    setFilters((f) => ({
      ...f,
      [field]: f[field]?.includes(value)
        ? f[field].filter((x) => x !== value)
        : [...(f[field] || []), value],
    }));
  const selectMonths = (field: string, values: string[], replace = false) =>
    setFilters((f) => ({
      ...f,
      [field]: replace
        ? values
        : Array.from(new Set([...(f[field] || []), ...values])),
    }));
  const clearFilters = () => setFilters({});

  return (
    <div className={`app-shell analytics-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <div className="ambient a1" />
      <div className="ambient a2" />
      <aside className="sidebar glass">
        <div className="brand">
          <div className="brand-mark" aria-label="Protection Analytics">
            <img src="/intersos-symbol-clear.png" alt="INTERSOS" />
          </div>
          <div>
            <strong>Protection Analytics</strong>
          </div>
        </div>
        <div className="sidebar-workspace-controls"><button className="soft sidebar-fullscreen" onClick={toggleFullscreen} title={fullscreen ? "Exit full screen" : "Enter full screen"} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>{fullscreen ? <Minimize2/> : <Maximize2/>}<span>Full screen</span></button><div className={`data-source-control app-select app-select-theme ${dataSourceOpen?"open":""}`}><Database className="app-select-icon"/><span className="app-select-label">Data source</span><button className="app-select-trigger" disabled={uploading} aria-busy={uploading} aria-haspopup="menu" aria-expanded={dataSourceOpen} onClick={()=>setDataSourceOpen((current)=>!current)}><span>{uploading ? "Refreshing…" : "Workbook"}</span></button>{dataSourceOpen&&<><button className="data-source-backdrop" aria-label="Close data source menu" onClick={()=>setDataSourceOpen(false)}/><div className="app-select-menu data-source-menu" role="menu"><button role="menuitem" onClick={()=>{setDataSourceOpen(false);selectWorkbook()}}><Upload/><span><strong>Select Excel workbook</strong><small>Choose a new Protection Analytics file</small></span></button>{(window as any).pywebview?.api?.refresh_analytics_workbook&&<button role="menuitem" onClick={()=>{setDataSourceOpen(false);refreshSelectedWorkbook()}}><RefreshCw/><span><strong>Refresh selected workbook</strong><small>Reload the file used last time</small></span></button>}<footer><span>Current source</span><strong>{metadata?.source||"No workbook loaded"}</strong></footer></div></>}</div></div>
        <div className="legal-sidebar-utilities"><button aria-label="Home" title="Home" onClick={() => {window.location.hash="/"}}><Home/><span>Home</span></button><button aria-label={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"} onClick={() => setSidebarCollapsed((current) => {const next=!current;localStorage.setItem("analytics-sidebar-collapsed",String(next));return next})}><ArrowLeft/><span>{sidebarCollapsed ? "Expand" : "Minimize"}</span></button></div>
        <nav>
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => {
                  setPage(n.id);
                  window.location.hash = `/${n.id}`;
                  window.scrollTo({ top: 0, behavior: "auto" });
                }}
              >
                <Icon />
                <span>{n.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <div className="mobile-brand">Protection Analytics</div>
          <div className={`header-actions ${headerFiltersVisible ? "header-actions-pinned" : ""}`}>
            {headerFiltersVisible && <div className="header-filter-actions"><button className="primary" onClick={() => setDrawer(true)}><Filter/>Filters {activeCount > 0 && <b>{activeCount}</b>}</button><button className="soft" onClick={clearFilters} disabled={!activeCount}><RotateCcw/>Clear</button></div>}
            <input
              ref={input}
              hidden
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                upload(file);
              }}
            />
          </div>
        </header>
        <section className="content">
          {error && (
            <div className="error glass">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {!["quality", "studio", "explorer"].includes(page) && (
            <>
              <div className={`toolbar ${headerFiltersVisible ? "toolbar-header-active" : ""}`}>
                <button className="primary" onClick={() => setDrawer(true)}>
                  <Filter />
                  Filters {activeCount > 0 && <b>{activeCount}</b>}
                </button>
                <button
                  className="soft clear-button"
                  onClick={clearFilters}
                  disabled={!activeCount}
                >
                  <RotateCcw />
                  Clear all filters
                </button>
                {page !== "executive" && <ExcelDownloadButton className="soft" onClick={()=>downloadExcelUrl(exportUrl(page, filters),`${page}.xlsx`)}/>}
                <div className="toolbar-metrics">
                  {page !== "executive" && (
                    <AppSelect label="Measure" value={measure} onChange={(value) => setMeasure(value as Measure)} disabled={page === "deportation"} options={[["records", page === "services" ? "Service IDs" : page === "deportation" ? "PN IDs" : "Assessment IDs"], ...(page !== "deportation" ? [["beneficiaries", "Unique beneficiaries"] as [string, string]] : [])]} />
                  )}
                  <AppSelect label="Display" value={display} onChange={(value) => setDisplay(value as Display)} options={[["both", "# + %"], ["count", "Count #"], ["percent", "Percentage %"]]} />
                </div>
              </div>
              <ActiveFilters
                filters={filters}
                onRemove={(f, v) =>
                  setFilters((x) => ({
                    ...x,
                    [f]: x[f].filter((y) => y !== v),
                  }))
                }
              />
            </>
          )}
      {metadata && !metadata.ready && metadata.loading ? <div className="loading"><div/><span>Restoring local analytics data…</span></div> : metadata && !metadata.ready ? <UploadRequired onUpload={selectWorkbook} uploading={uploading} progress={uploadProgress} phase={uploadPhase} /> : !metadata && !loading ? <AnalyticsUnavailable/> : page === "studio" && metadata ? (
            <Studio metadata={metadata} theme={theme} />
          ) : page === "explorer" && metadata ? (
            <DataExplorer metadata={metadata} />
          ) : loading ? (
            <div className="loading">
              <div />
              <span>Preparing trusted analytics…</span>
            </div>
          ) : page === "quality" ? (
            <QualityTable rows={quality} />
          ) : (
            dash && (
              <div
                className={`dashboard-content ${refreshing ? "refreshing" : ""}`}
              >
                <div className="refresh-indicator">Updating filters…</div>
                <div className="kpi-grid">
                  {dash.kpis.filter((k) => page !== "executive" || !["Service coverage", "Beneficiaries served"].includes(k.label)).map((k) => (
                    <KpiCard key={k.label} {...k} />
                  ))}
                </div>
                <div className="dashboard-grid">
                  <TrendCard
                    rows={page === "assessment" && dash.openTrend ? dash.openTrend : dash.trend}
                    comparisonRows={page === "services" ? dash.completionTrend : page === "assessment" ? dash.closedTrend : undefined}
                    primaryLabel={page === "assessment" || page === "services" ? "Open" : undefined}
                    comparisonLabel={page === "assessment" ? "Closed" : "Completed"}
                    display={display}
                    theme={theme}
                    selected={filters.month || []}
                    onSelect={(months, replace) =>
                      selectMonths("month", months, replace)
                    }
                    onRemove={(month) => setFilters((current) => ({...current, month: (current.month || []).filter((item) => item !== month)}))}
                    title={
                      page === "services"
                        ? "Services opened and completed over time"
                        : page === "assessment"
                          ? "Open and closed assessments over time"
                        : page === "executive"
                          ? "Assessment caseload over time"
                          : "Activity over time"
                    }
                  />
                  {page === "deportation" && dash.flow && dash.flow.length > 0 && <FlowCard rows={dash.flow} theme={theme} />}
                  {dash.charts.map((c) => (
                    <ChartCard
                      key={c.id}
                      chart={c}
                      display={display}
                      theme={theme}
                      onSelect={selectChart}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </section>
      </main>
      {!["studio", "quality", "explorer"].includes(page) && (
        <FilterDrawer
          open={drawer}
          available={available}
          filters={filters}
          onClose={() => setDrawer(false)}
          onChange={setFilters}
          onReset={clearFilters}
        />
      )}
    </div>
  );
}
