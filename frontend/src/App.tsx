import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  Filter,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Palette,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  exportUrl,
  getDashboard,
  getMetadata,
  getQuality,
  checkForUpdates,
  getUpdateStatus,
  installUpdate,
  uploadWorkbook,
} from "./api";
import {
  ActiveFilters,
  AppSelect,
  ChartCard,
  FilterDrawer,
  FlowCard,
  KpiCard,
  QualityTable,
  TrendCard,
} from "./components";
import Studio from "./Studio";
import type {
  Dashboard,
  Display,
  Filters,
  Measure,
  Metadata,
  Page,
  QualityRow,
  Theme,
  UpdateCheck,
  UpdateStatus,
} from "./types";

const nav: { id: Page; label: string; icon: any }[] = [
  { id: "executive", label: "Executive", icon: BarChart3 },
  { id: "assessment", label: "Assessment", icon: ClipboardCheck },
  { id: "services", label: "Services", icon: FileCheck2 },
  { id: "deportation", label: "Deportation", icon: ShieldCheck },
  { id: "studio", label: "Analytics Studio", icon: LayoutDashboard },
  { id: "quality", label: "Data Quality", icon: Database },
];
const pageIds = new Set<Page>(nav.map(({ id }) => id));
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const pageFromUrl = (): Page => {
  const candidate = window.location.hash.replace(/^#\/?/, "") as Page;
  return pageIds.has(candidate) ? candidate : "executive";
};
const pageCopy: Record<
  Page,
  { eyebrow: string; title: string; subtitle: string }
> = {
  executive: {
    eyebrow: "",
    title: "Caseload & achievements",
    subtitle:
      "A decision-ready view of programme reach, delivery, protection trends and data confidence.",
  },
  assessment: {
    eyebrow: "ASSESSMENT CASELOAD",
    title: "Assessment portfolio",
    subtitle:
      "Distinct Assessment IDs, beneficiary reach, demographics, legal need and detention context.",
  },
  services: {
    eyebrow: "SERVICE ACHIEVEMENTS",
    title: "Legal service delivery",
    subtitle:
      "Distinct Service IDs, unique beneficiary reach, completion and documentation outcomes.",
  },
  deportation: {
    eyebrow: "PROTECTION MONITORING",
    title: "Deportation overview",
    subtitle:
      "Destinations, authorities, reasons and affected population profiles.",
  },
  studio: {
    eyebrow: "SELF-SERVICE ANALYTICS",
    title: "Analytics Studio",
    subtitle:
      "Create a professional chart or pivot table from one or two dimensions with connected filters.",
  },
  quality: {
    eyebrow: "TRUST & METHODOLOGY",
    title: "Data quality",
    subtitle:
      "Automated checks on grain, completeness, validity and join coverage.",
  },
};

type UploadPhase = "idle" | "uploading" | "processing" | "importing";
const uploadPhaseLabel = (phase: UploadPhase) => phase === "processing" ? "Processing workbook" : phase === "importing" ? "Importing dashboard" : "Uploading workbook";

function UploadRequired({onUpload, uploading, progress, phase}:{onUpload:()=>void; uploading:boolean; progress:number; phase:UploadPhase}){
  return <section className="upload-required glass"><div className="upload-required-icon"><Upload/></div><span className="eyebrow">PRIVATE, LOCAL ANALYTICS</span><h2>Upload an approved workbook</h2><p>This portable application contains no case data. Your workbook is processed locally in memory and is cleared when the application closes.</p><button className="primary" onClick={onUpload} disabled={uploading} aria-busy={uploading}>{uploading ? <><span className="button-spinner"/>{uploadPhaseLabel(phase)}… {progress}%</> : <><Upload/>Upload Excel workbook</>}</button>{uploading && <div className="upload-progress" role="progressbar" aria-label={uploadPhaseLabel(phase)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{width:`${progress}%`}}/></div>}<small>{uploading ? (phase === "uploading" ? "Sending the workbook to the local service…" : phase === "processing" ? "Validating sheets and processing workbook data…" : "Verifying the import and refreshing dashboard indicators…") : "Supported sheets: Assessments, Legal Services, and Deportation."}</small></section>
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromUrl);
  const [theme, setTheme] = useState<Theme>("glass-light");
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
  const [showHeaderFilters, setShowHeaderFilters] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheck | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const input = useRef<HTMLInputElement>(null);
  const copy = pageCopy[page];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };
  useEffect(() => {
    let active = true;
    const refreshUpdateInfo = (openWhenAvailable: boolean) => {
      checkForUpdates().then((info) => {
        if (!active) return;
        setUpdateInfo(info);
        if (openWhenAvailable && info.available) setUpdateOpen(true);
      }).catch(() => {});
    };
    refreshUpdateInfo(true);
    const timer = window.setInterval(() => refreshUpdateInfo(false), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!updateStatus || !["downloading","verifying","installing","restarting"].includes(updateStatus.phase)) return;
    const timer = window.setInterval(() => getUpdateStatus().then(setUpdateStatus).catch(() => {}), 700);
    return () => window.clearInterval(timer);
  }, [updateStatus?.phase]);
  const checkUpdates = () => checkForUpdates().then((info) => { setUpdateInfo(info); setUpdateOpen(true); }).catch(() => setUpdateOpen(true));
  const beginUpdate = () => installUpdate().then(setUpdateStatus).catch((e) => setUpdateStatus({phase:"error",progress:0,error:e.message,currentVersion:updateInfo?.currentVersion||""}));
  useEffect(() => {
    if (!window.location.hash) history.replaceState(null, "", `#/executive`);
    const syncPageFromUrl = () => setPage(pageFromUrl());
    window.addEventListener("hashchange", syncPageFromUrl);
    return () => window.removeEventListener("hashchange", syncPageFromUrl);
  }, []);
  useEffect(() => {
    document.title = `${nav.find(({id}) => id === page)?.label || "Executive"} · Protection Analytics`;
  }, [page]);
  useEffect(() => {
    Promise.all([getMetadata(), getQuality()])
      .then(([m, q]) => {
        setMetadata(m);
        setQuality(q.rows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (page === "quality" || page === "studio" || !metadata || !metadata.ready) return;
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
  useEffect(() => {
    const updateHeaderControls = () => setShowHeaderFilters(window.innerWidth >= 1280 && window.scrollY > 180);
    updateHeaderControls();
    window.addEventListener("scroll", updateHeaderControls, { passive: true });
    window.addEventListener("resize", updateHeaderControls);
    return () => {
      window.removeEventListener("scroll", updateHeaderControls);
      window.removeEventListener("resize", updateHeaderControls);
    };
  }, []);
  const available = metadata?.pages[page]?.filters || {};
  const activeCount = Object.values(filters).reduce((n, v) => n + v.length, 0);
  const headerFiltersVisible = showHeaderFilters && !["quality", "studio"].includes(page) && Boolean(metadata?.ready);

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
    <div className="app-shell">
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
        <div className="source">
          <Building2 />
          <div>
            <span>Data source</span>
            <strong>{metadata?.source || (metadata?.ready === false ? "No workbook loaded" : "Connecting…")}</strong>
            <small>
              {metadata?.loadedAt
                ? `Loaded ${new Date(metadata.loadedAt).toLocaleString()}`
                : ""}
            </small>
            <div className="sidebar-credit"><span>Designed by</span><strong>Younis Jamal</strong></div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="mobile-brand">Protection Analytics</div>
          <div className={`header-actions ${headerFiltersVisible ? "header-actions-pinned" : ""}`}>
            {headerFiltersVisible && <div className="header-filter-actions"><button className="primary" onClick={() => setDrawer(true)}><Filter/>Filters {activeCount > 0 && <b>{activeCount}</b>}</button><button className="soft" onClick={clearFilters} disabled={!activeCount}><RotateCcw/>Clear</button></div>}
            <AppSelect label="Theme" value={theme} onChange={(value) => setTheme(value as Theme)} variant="theme" icon={Palette} ariaLabel="Application theme" options={[["glass-light", "Liquid Glass Light"], ["glass-dark", "Liquid Glass Dark"], ["unhcr", "INTERSOS"], ["multicolor", "Chromatic Executive"], ["executive", "Executive Minimal"]]} />
            <button className="soft fullscreen-button" onClick={toggleFullscreen} title={fullscreen ? "Exit full screen" : "Enter full screen"} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>{fullscreen ? <Minimize2/> : <Maximize2/>}<span>{fullscreen ? "Exit full screen" : "Full screen"}</span></button>
            <button className={`soft update-button ${updateInfo?.available ? "update-available" : ""}`} onClick={checkUpdates} title={updateInfo?.available ? `Version ${updateInfo.latestVersion} is available` : "Check for updates"}><RefreshCw/><span>{updateInfo?.available ? "Update available" : "Updates"}</span>{updateInfo?.available&&<b aria-label="New update available">New</b>}</button>
            <button className="soft upload-button" onClick={() => input.current?.click()} disabled={uploading} aria-busy={uploading}>
              {uploading ? <span className="button-spinner"/> : <Upload />}
              <span>{uploading ? `${uploadPhaseLabel(uploadPhase)} ${uploadProgress}%` : "Upload workbook"}</span>
            </button>
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
          <div className="hero">
            <div>
              {copy.eyebrow && <span className="eyebrow">{copy.eyebrow}</span>}
              <h1>{copy.title}</h1>
              <p>{copy.subtitle}</p>
            </div>
          </div>
          {error && (
            <div className="error glass">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {!["quality", "studio"].includes(page) && (
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
                {page !== "executive" && (
                  <a className="soft link" href={exportUrl(page, filters)}>
                    <Download />
                    Export filtered CSV
                  </a>
                )}
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
      {metadata && !metadata.ready ? <UploadRequired onUpload={() => input.current?.click()} uploading={uploading} progress={uploadProgress} phase={uploadPhase} /> : page === "studio" && metadata ? (
            <Studio metadata={metadata} theme={theme} />
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
      {!["studio", "quality"].includes(page) && (
        <FilterDrawer
          open={drawer}
          available={available}
          filters={filters}
          onClose={() => setDrawer(false)}
          onChange={setFilters}
          onReset={clearFilters}
        />
      )}
      {updateOpen&&<div className="modal-backdrop"><section className="update-modal glass" role="dialog" aria-modal="true" aria-label="Application update"><div className="update-icon"><RefreshCw/></div><span className="eyebrow">APPLICATION UPDATE</span><h2>{updateInfo?.available?`Version ${updateInfo.latestVersion} is available`:updateInfo?.enabled===false?"Updates need configuration":updateInfo?.message?.startsWith("Unable")?"Unable to check for updates":"You’re up to date"}</h2><p>{updateInfo?.available?(updateInfo.notes||"A new signed version of Protection Analytics is ready to install."):(updateInfo?.message||`You are using version ${updateInfo?.currentVersion||"1.0.0"}.`)}</p>{updateStatus&&updateStatus.phase!=="idle"&&<div className="update-progress"><div><span>{updateStatus.phase}</span><strong>{updateStatus.progress}%</strong></div><i><b style={{width:`${updateStatus.progress}%`}}/></i>{updateStatus.error&&<em>{updateStatus.error}</em>}</div>}<div className="update-actions">{updateInfo?.available&&(!updateStatus||["idle","error"].includes(updateStatus.phase))&&<button className="primary" onClick={beginUpdate}>Update now</button>}<button className="soft" onClick={()=>setUpdateOpen(false)} disabled={Boolean(updateStatus&&["installing","restarting"].includes(updateStatus.phase))}>{updateInfo?.available?"Later":"Close"}</button></div></section></div>}
    </div>
  );
}
