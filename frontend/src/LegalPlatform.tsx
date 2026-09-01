import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Backpack,
  BarChart3,
  ChartColumnIncreasing,
  BriefcaseBusiness,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Database,
  Download,
  Expand,
  Eraser,
  FileText,
  FileQuestion,
  FolderOpen,
  Gavel,
  Home,
  LockKeyhole,
  LayoutDashboard,
  Megaphone,
  Maximize2,
  Minimize2,
  RotateCcw,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  Tent,
  Users,
  X,
} from "lucide-react";
import {
  exportLegalCases,
  exportLegalDetentionReconciliation,
  exportLegalExplorer,
  exportLegalIndicators,
  exportLegalNarrative,
  exportTableWorkbook,
  exportTableWorkbookSheets,
  checkForUpdates,
  getLegalCase,
  getLegalCaseFilters,
  getLegalExplorer,
  getLegalExplorerFilters,
  getLegalDetention,
  getDetentionWorkbookSheets,
  getLegalLawyers,
  getRepresentationCaseLoad,
  getLegalMetadata,
  getLegalDeportationDashboard,
  getLegalStudio,
  getLegalAnalyticsDashboard,
  getLegalIndicators,
  getLegalIntelligence,
  getLegalReview,
  getUpdateStatus,
  installUpdate,
  getDuplicateExclusions,
  createDuplicateExclusion,
  createDuplicateExclusionsBulk,
  importDuplicateExclusions,
  restoreDuplicateExclusion,
  duplicateExclusionsExportUrl,
  downloadExcelUrl,
  legalAttachmentDownloadUrl,
  legalExportUrl,
  legalReviewExportUrl,
  reconcileLegalDetention,
  uploadLegalFolder,
} from "./api";
import Studio from "./Studio";
import type { LegalIntelligence, RepresentationCaseLoad, RepresentationCaseLoadService } from "./api";
import type { Dashboard, DuplicateExclusion, IndicatorReport, IndicatorReportGroup, IndicatorReportItem, IndicatorSection, LegalAnalyticsDashboard, LegalExplorerResult, LegalFlag, LegalMetadata, LegalReview, Metadata, Theme, UpdateCheck, UpdateStatus } from "./types";
import { ActiveFilters, AppSelect, ChartCard, CheckboxMultiSelect, ExcelDownloadButton, FilterDrawer, formatProjectLabel, KpiCard, TrendCard } from "./components";
import {formatFilterMonth, formatTableValue} from "./dateFormat";
import {mapIntensity,projectGovernorates,type MapFeature} from "./iraqMap";
import { exportSvgChart } from "./chartExport";

type LegalPage =
  | "overview"
  | "beneficiaries"
  | "assessments"
  | "legalservices"
  | "awareness"
  | "deportation"
  | "studio"
  | "detention"
  | "explorer"
  | "cases"
  | "lawyer-intelligence"
  | "indicators";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const formatUpdateSize = (bytes?: number) => `${((bytes || 0) / 1_000_000).toFixed(1)} MB`;
const EXCLUDABLE_BENEFICIARY_RULES = new Set([
  "Possible duplicate name",
  "Possible duplicate contact and name",
  "Invalid contact number",
  "Marital status below 18",
  "Spouse below 18",
]);
const AMAL_HIDDEN_ASSESSMENT_RULES = new Set([
  "Detention/immigration inconsistency",
  "Detained beneficiary has counselling only",
  "Detention Governorate mismatch",
  "Detained beneficiary below 10 years",
]);
const ASSESSMENT_REVIEW_TAIL_RULES = new Set([
  "Pending assessment",
  "Type of document in Assessments vs Services",
  "Representation while not detained",
  "Detention/immigration inconsistency",
]);
const LEGAL_SERVICES_REVIEW_FIRST_RULES = [
  "Duplicate service",
  "Duplicate service without Assessment ID",
  "Current and previous month duplicate",
  "Legal service date after today",
];
const EXCLUSION_RULE_OPTIONS = [
  "Possible duplicate name",
  "Possible duplicate contact and name",
  "Invalid contact number",
  "Marital status below 18",
  "Spouse below 18",
];
const exclusionRuleClass = (rule: string) => rule === "Possible duplicate name" || rule === "Possible duplicate contact and name" ? "duplicates" : rule === "Invalid contact number" ? "contacts" : rule === "Marital status below 18" ? "marital" : "spouse";
const labels: Record<LegalPage, string> = {
  overview: "Overview",
  beneficiaries: "Beneficiaries Review",
  assessments: "Assessments Review",
  legalservices: "Legal Services Review",
  awareness: "Awareness Review",
  deportation: "Deportation",
  studio: "Analytics Studio",
  detention: "Detention",
  explorer: "Data Explorer",
  cases: "Beneficiary Cases",
  "lawyer-intelligence": "Lawyer Overview",
  indicators: "Indicator Reporting",
};
const displayReviewRule = (rule: string) => rule === "Possible duplicate contact and name"
  ? "Possible duplicate contact and name (UNHCR, ID, ASSIST or spouse name required)"
  : rule;
const announceLegalCopy = (value: string) => window.dispatchEvent(new CustomEvent<string>("legal-copy", { detail: value }));
const descriptions: Record<LegalPage, string> = {
  overview:
    "A clear picture of data volume, review priorities and the issues requiring attention.",
  beneficiaries:
    "Review identity, contact, age and case-readiness issues with recommended corrective actions.",
  assessments:
    "Inspect assessment continuity, service coverage and detention-related consistency checks.",
  legalservices:
    "Find duplicate services and broken assessment relationships before reporting.",
  awareness: "Review duplicate participants and invalid contact information.",
  deportation: "Deportation analysis from the Legal Platform deportation CSV.",
  studio: "Visual analysis based on Legal Platform source files.",
  detention:
    "Review detention circumstances, locations, authorities, charges and current case status from Assessments.",
  explorer:
    "Search and filter every loaded Legal Platform dataset without changing source records.",
  cases:
    "Follow a beneficiary from registration through assessments, services, follow-ups and fees.",
  "lawyer-intelligence": "A combined view of lawyer workload, service delivery and case complexity across legal teams.",
  indicators: "Reserved for the indicator reporting framework and definitions.",
};
const REVIEW_CHECK_METHODS: Record<string, { columns: string[]; logic: string }> = {
  "Possible duplicate name": { columns: ["Name (Filter Color Red)", "Project"], logic: "Normalizes names, groups them within the permitted project group, then compares the configured leading characters (or exact names when Exact matches is enabled)." },
  "Possible duplicate contact and name": { columns: ["Contact Number", "Name (Filter Color Red)", "# UNHCR", "ID Number", "Individual Number ASSISIT", "Spouse name", "Project"], logic: "Within the permitted project group, flags records with the same nonblank normalized contact number, at least 90% full-name similarity, and one populated identity marker on each record." },
  "Invalid contact number": { columns: ["Contact Number / Phone Number"], logic: "Keeps normalized phone numbers that are not blank, one digit, or 11 digits, after excluding configured system prefixes." },
  "Case without assessment": { columns: ["Case ID", "# total assessments"], logic: "Flags beneficiaries whose total assessment count is zero." },
  "Invalid age": { columns: ["Age", "Date of Birth", "Spouse DoB"], logic: "Flags missing, non-numeric, negative, or implausible age values, plus nonblank Spouse DoB values that are invalid or after today." },
  "Marital status below 18": { columns: ["Marital Status", "Date of Birth"], logic: "Flags married beneficiaries whose current age calculated from date of birth is below 18." },
  "Spouse below 18": { columns: ["Marital Status", "Spouse DoB"], logic: "Flags partnered beneficiaries whose spouse current age calculated from Spouse DoB is below 18." },
  "Check Community Type vs Nationality": { columns: ["Community Type", "Nationality", "Project"], logic: "Checks permitted Community Type/Nationality combinations and the IDP AMAL Camp project requirement." },
  "Beneficiary has multiple assessments": { columns: ["Beneficiary ID", "Date of Assessment", "Assessment Status"], logic: "Flags assessments repeated in the same assessment month, or Open assessments when the beneficiary has two or more Open assessments." },
  "Selected month with previous assessment": { columns: ["Beneficiary ID", "Date of Assessment", "Created On"], logic: "From Created On August 2026 onward, flags repeated assessment history except an immediate previous-month assessment created on days 1–4 of the following month." },
  "Assessment without services": { columns: ["# Total Services", "Assessment ID", "Legal Services: Assessment ID"], logic: "Flags zero Total Services; when that column is unavailable, flags assessments with no linked service." },
  "Pending assessment": { columns: ["Assessment Status"], logic: "Filters Assessment Status values containing Pending." },
  "Open counselling-only assessment": { columns: ["Assessment Status", "Type of Legal Service Needed"], logic: "Filters Open assessments whose requested service includes counselling but not assistance or representation." },
  "Detention/immigration inconsistency": { columns: ["Community Type", "Date of Assessment", "Is the beneficiary detained", "Is it an immigration related charge"], logic: "Applies to 2026+ refugee assessments and flags inconsistent detention and immigration-charge responses." },
  "Blank legal service need": { columns: ["Type of Legal Service Needed"], logic: "Flags blank or whitespace-only legal-service-need values." },
  "Detained beneficiary has counselling only": { columns: ["Assessment ID", "Is the beneficiary detained", "Is it an immigration related charge", "Legal Services: Type of Service Provided"], logic: "Flags detained immigration cases with linked services containing counselling only." },
  "Adult representation without counselling": { columns: ["Age", "Created On", "Type of Legal Service Needed", "Legal Services: Type of Service Provided"], logic: "From 2026 onward, flags adults requesting both representation and counselling when linked legal services have no counselling." },
  "Representation while not detained": { columns: ["Community Type", "Created On", "Is the beneficiary detained", "Legal Services: Type of Service Provided"], logic: "Flags non-IDP, not-detained assessments created in 2026 or later with linked assistance or representation services." },
  "Detained beneficiary below 10 years": { columns: ["Is the beneficiary detained", "Date of Birth"], logic: "Flags detained assessment records where the current age calculated from Date of Birth is below 10." },
  "Type of document in Assessments vs Services": { columns: ["Date of Assessment", "Type of Documents to be issued", "Legal Services: Type of Document", "Assessment ID"], logic: "For assessments dated in 2026 or later, compares requested assessment documents with Type of Document across all linked legal services and identifies the missing side." },
  "Type of Legal Service in Assessment vs Services": { columns: ["Date of Assessment", "Type of Legal Service Needed", "Legal Services: Type of Service Provided", "Assessment ID"], logic: "For assessments dated in 2026 or later, flags requested legal service types that are missing from every linked legal service." },
  "Duplicate service": { columns: ["Beneficiary ID", "Assessment ID", "Type of Service Provided", "Type of Document"], logic: "Flags repeated nonblank combinations of Beneficiary ID, Assessment ID, Type of Service Provided, and Type of Document." },
  "Duplicate service without Assessment ID": { columns: ["Beneficiary ID", "Type of Service Provided", "Type of Document"], logic: "Flags repeated nonblank combinations of Beneficiary ID, Type of Service Provided, and Type of Document across all Assessment IDs." },
  "Detention Governorate mismatch": { columns: ["Detention Governorate", "Project", "Project Location"], logic: "Flags an assessment when its Detention Governorate does not match either its Project or Project Location governorate." },
  "Assessment date after today": { columns: ["Date of Assessment", "Date of the released or deported", "Date of Detention", "Date of Assessment Closure", "Date of the Request"], logic: "Flags any populated assessment date that is later than today." },
  "Current and previous month duplicate": { columns: ["Beneficiary ID", "Date of Service Provision", "Created On"], logic: "From Created On August 2026 onward, flags repeated service history in the selected provision month, except an immediate previous-month service created on days 1-4 of the following month." },
  "Orphaned assessment relationship": { columns: ["Legal Services: Assessment ID", "Assessments: Assessment ID"], logic: "Flags service Assessment IDs that do not exist in the imported Assessments file." },
  "Missing Type of Document": { columns: ["Type of Document"], logic: "Flags blank or whitespace-only Type of Document values." },
  "Legal service date after today": { columns: ["Date of Service Provision", "Date Service Completed", "Date of Issuance"], logic: "Flags any populated legal-service date that is later than today." },
  "Duplicate participant in session": { columns: ["Participant Name", "Session Topic"], logic: "Normalizes participant names and flags duplicate name/session-topic pairs." },
  "Possible duplicate participant name": { columns: ["Participant Name", "Session Topic"], logic: "Normalizes names and flags repeated participants only when their duplicate records are in different session topics." },
};

function LegalScrollControls({children,search,onSearch,onSearchSubmit,onFilters,activeCount,onClear,compactFilters,searchPlaceholder="Search",filterLabel="Filters"}:{children:ReactNode;search?:string;onSearch?:(value:string)=>void;onSearchSubmit?:()=>void;onFilters:()=>void;activeCount:number;onClear:()=>void;compactFilters?:ReactNode;searchPlaceholder?:string;filterLabel?:string}) {
  const sentinel=useRef<HTMLSpanElement>(null),[pinned,setPinned]=useState(false),[target,setTarget]=useState<HTMLElement|null>(null);
  useEffect(()=>{setTarget(document.getElementById("legal-header-scroll-controls"))},[]);
  useEffect(()=>{
    const node=sentinel.current;if(!node)return;
    const observer=new IntersectionObserver(([entry])=>setPinned(window.innerWidth>=1280&&!entry.isIntersecting&&entry.boundingClientRect.top<0),{threshold:0});
    const resize=()=>{if(window.innerWidth<1280)setPinned(false)};
    observer.observe(node);window.addEventListener("resize",resize);
    return()=>{observer.disconnect();window.removeEventListener("resize",resize)};
  },[]);
  const compact=<div className="legal-header-scroll-controls header-filter-actions">
    {onSearch&&<label className="legal-header-search"><Search/><input className="table-search-input" value={search||""} onChange={(event)=>onSearch(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")onSearchSubmit?.()}} placeholder={searchPlaceholder}/></label>}
    {compactFilters}
    <button className="soft case-filter-button" onClick={onFilters}><SlidersHorizontal/>{filterLabel} {activeCount>0&&<b>{activeCount}</b>}</button>
    <button className="soft" onClick={onClear} disabled={!activeCount}><RotateCcw/>Clear</button>
  </div>;
  return <><span ref={sentinel} className="legal-scroll-sentinel" aria-hidden="true"/><div className={pinned?"legal-scroll-source legal-scroll-source-pinned":"legal-scroll-source"}>{children}</div>{pinned&&target&&createPortal(compact,target)}</>;
}
const legalRouteFromUrl = () => {
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
const legalPageFromUrl = (): LegalPage => legalRouteFromUrl().page;
const nav: [LegalPage, any][] = [
  ["overview", LayoutDashboard],
  ["indicators", ChartColumnIncreasing],
  ["beneficiaries", Users],
  ["assessments", ShieldCheck],
  ["legalservices", BriefcaseBusiness],
  ["awareness", Megaphone],
  ["detention", LockKeyhole],
  ["deportation", ShieldAlert],
  ["lawyer-intelligence", Gavel],
  ["studio", ChartColumnIncreasing],
  ["explorer", TableProperties],
  ["cases", Search],
];
const value = (input: unknown) => formatTableValue(input);
function TableSelectionActions({selected,filename,onClear,showActions=true,iconOnly=false,onDownloadAll,onDownloadSelected}:{selected:Map<string,Record<string,unknown>>;filename:string;onClear:()=>void;showActions?:boolean;iconOnly?:boolean;onDownloadAll?:()=>Promise<void>;onDownloadSelected?:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const rows=Array.from(selected.values()).map((row)=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith("__")))),columns=Array.from(new Set(rows.flatMap((row)=>Object.keys(row)))),hasSelection=rows.length>0,downloadLabel=hasSelection?"Download selected records":"Download all filtered records";
  const download=async()=>{setBusy(true);try{if(hasSelection){if(onDownloadSelected)await onDownloadSelected();else await exportTableWorkbook(filename,columns,rows)}else await onDownloadAll?.()}finally{setBusy(false)}};
  return <div className={`table-selection-actions${iconOnly?" icon-only":""}`}><span>{rows.length} selected</span>{showActions&&<><button className="soft" disabled={!rows.length} onClick={onClear} aria-label="Clear selected records" title="Clear selected records">{iconOnly?<RotateCcw/>:"Clear selection"}</button><ExcelDownloadButton onClick={download} busy={busy} disabled={!hasSelection&&!onDownloadAll} title={downloadLabel}>{iconOnly?null:(hasSelection?"Download selected":"Download all")}</ExcelDownloadButton></>}</div>;
}

const duplicatePalette = [
  "var(--review-duplicate-1)", "var(--review-duplicate-2)",
  "var(--review-duplicate-3)", "var(--review-duplicate-4)",
  "var(--review-duplicate-5)", "var(--review-duplicate-6)",
  "var(--review-duplicate-7)", "var(--review-duplicate-8)",
];
const duplicateColor = (key = "") => duplicatePalette[[...key].reduce((total, char) => total + char.charCodeAt(0), 0) % duplicatePalette.length];

const latestLegalFiles = (files: File[]) => {
  const supported = new Set([
    "beneficiaries",
    "assessments",
    "legalservices",
    "followupslogbooks",
    "legalfees",
    "awareness",
    "deportationrecords",
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

function Pager({
  page,
  total,
  onChange,
  compact = false,
  iconOnly = false,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / 100));
  return (
    <div className={`legal-pager ${compact ? "legal-pager-compact" : ""}`}>
      <button
        className="soft"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
        title="Previous page"
      >
        {compact || iconOnly ? <ChevronLeft /> : "Previous"}
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button
        className="soft"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
        title="Next page"
      >
        {compact || iconOnly ? <ChevronRight /> : "Next"}
      </button>
    </div>
  );
}

type SkeletonVariant =
  | "overview"
  | "review"
  | "explorer"
  | "detention"
  | "deportation"
  | "studio"
  | "cases"
  | "lawyers"
  | "indicator"
  | "table";

function LegalSkeleton({
  variant,
  compact = false,
  embedded = false,
}: {
  variant: SkeletonVariant;
  compact?: boolean;
  embedded?: boolean;
}) {
  const rows = embedded && variant === "explorer" ? 14 : compact ? 3 : variant === "cases" ? 4 : 6;
  const table = (count = rows, kind = "") => <div className={`skeleton-table ${kind}`}><div className="skeleton-table-head" />{Array.from({ length: count }, (_, i) => <div className="skeleton-table-row" key={i}><i/><i/><i/><i/></div>)}</div>;
  const toolbar = (kind = "", controls = 4) => <div className={`skeleton-toolbar ${kind}`} aria-hidden="true">{Array.from({length:controls},(_,i)=><i key={i}/>)}</div>;
  const kpis = (count: number, kind = "") => <div className={`skeleton-kpis ${kind}`}>{Array.from({ length: count }, (_, i) => <div className="skeleton-card" key={i}><i/><i/><i/></div>)}</div>;
  const charts = (count: number, wide = true, kind = "") => <div className={`skeleton-chart-grid ${kind}`}>{Array.from({ length: count }, (_, i) => <div className={`skeleton-chart ${wide && i === 0 ? "wide" : ""}`} key={i}><i/><i/><b/></div>)}</div>;
  const tablePanel=(kind:string,count=rows)=><div className={`skeleton-table-panel ${kind}`}>{table(count,kind)}</div>;
  const dashboard = (cardCount: number, chartCount: number, kind = "") => <>{toolbar(kind)}{kpis(cardCount,kind)}{charts(chartCount,true,kind)}</>;
  const pageContent = (() => {
    if (embedded) return <>{variant === "explorer" && <div className="skeleton-explorer-heading"><i/><i/></div>}{table()}</>;
    if (compact) return table();
    switch (variant) {
      case "overview": return <><div className="skeleton-overview-banner skeleton-banner" />{kpis(4,"overview")}<div className="skeleton-overview-grid">{charts(2,true,"overview")}<div className="skeleton-map"/><>{tablePanel("overview",5)}</></div></>;
      case "deportation": return <>{toolbar("deportation",6)}{kpis(4,"deportation")}{charts(2,true,"deportation")}{tablePanel("deportation",6)}</>;
      case "detention": return <><div className="skeleton-tabs detention"><i/><i/></div>{toolbar("detention",6)}{kpis(4,"detention")}{charts(3,false,"detention")}{tablePanel("detention",7)}</>;
      case "lawyers": return <>{toolbar("lawyers",6)}{kpis(8,"lawyers")}<div className="skeleton-profile"><i/><i/><i/></div>{charts(3,false,"lawyers")}{tablePanel("lawyers",6)}{tablePanel("lawyers monthly",5)}</>;
      case "studio": return <><div className="skeleton-tabs"><i/><i/><i/><i/><i/></div>{toolbar("studio",6)}{kpis(4,"studio")}{charts(3,true,"studio")}{tablePanel("studio",7)}</>;
      case "review": return <><div className="skeleton-review-selector"><i/><i/><i/></div>{toolbar("review",4)}<div className="skeleton-review-tables">{Array.from({length:3},(_,i)=><div className="skeleton-review-table" key={i}>{table(4,"review")}</div>)}</div></>;
      case "explorer": return <><>{toolbar("explorer",5)}</>{tablePanel("explorer",10)}<div className="skeleton-pager"><i/><i/></div></>;
      case "cases": return <><div className="skeleton-case-search"><div className="skeleton-case-heading"><i/><i/></div>{toolbar("cases",4)}</div><div className="skeleton-case-grid">{Array.from({length:rows},(_,i)=><div className="skeleton-case-card" key={i}><i/><i/><i/><i/></div>)}</div></>;
      case "indicator": return <><div className="skeleton-tabs indicator"><i/><i/></div>{toolbar("indicator",6)}<div className="skeleton-indicator-groups">{Array.from({length:3},(_,i)=><div className="skeleton-indicator-group" key={i}><i/><i/>{table(3,"indicator")}</div>)}</div></>;
      default: return table();
    }
  })();
  return (
    <section
      className={`legal-skeleton legal-skeleton-${variant}${compact ? " compact" : ""}${embedded ? " embedded" : ""}`}
      role="status"
      aria-label="Loading page content"
      aria-busy="true"
    >
      {pageContent}
      <span className="sr-only">Loading content</span>
    </section>
  );
}

function AppStartupLoadingScreen() {
  return <section className="app-startup-loading" role="status" aria-live="polite" aria-label="Starting Iraq Data Analysis">
    <div className="app-startup-loading-ambient" />
    <div className="app-startup-loading-card glass">
      <div className="app-startup-loading-mark"><img src="/intersos-symbol-clear.png" alt="INTERSOS" /></div>
      <span className="eyebrow">IRAQ DATA ANALYSIS</span>
      <h1>Preparing your workspace</h1>
      <p>Starting the secure local application.</p>
      <div className="app-startup-loading-progress" aria-hidden="true"><i /></div>
      <footer><ShieldCheck /><span>Local and private data workspace</span></footer>
    </div>
  </section>;
}

function ReviewPage({
  dataset,
  onOpenCase,
}: {
  dataset: string;
  onOpenCase: (caseId: string) => void;
}) {
  return (
    <ReviewPageBody
      dataset={dataset}
      onOpenCase={onOpenCase}
      comparisonMonth=""
    />
  );
}

function FindingTable({
  dataset,
  rule,
  search,
  nameCompareChars,
  allowNameVariations,
  exactMatchesOnly,
  onExactMatchesOnlyChange,
  ignoreCourtVerdict,
  onIgnoreCourtVerdictChange,
  filters,
  comparisonMonth,
  onOpenCase,
  findingRevision,
  onFindingCountChange,
  onFindingContextMenu,
  onBulkExclude,
}: {
  dataset: string;
  rule: string;
  search: string;
  nameCompareChars: number;
  allowNameVariations: boolean;
  exactMatchesOnly: boolean;
  onExactMatchesOnlyChange: (value: boolean) => void;
  ignoreCourtVerdict: boolean;
  onIgnoreCourtVerdictChange: (value: boolean) => void;
  filters: Record<string, string>;
  comparisonMonth: string;
  onOpenCase: (caseId: string) => void;
  findingRevision: number;
  onFindingCountChange: (rule: string, count: number) => void;
  onFindingContextMenu: (event: React.MouseEvent, row: LegalFlag) => void;
  onBulkExclude: (rows: LegalFlag[]) => void;
}) {
  const [result, setResult] = useState<LegalReview | null>(null),
    [page, setPage] = useState(1),
    [helpOpen, setHelpOpen] = useState(false),
    [error, setError] = useState(""),
    [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const selectVisibleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPage(1);
  }, [dataset, rule, search, filters, comparisonMonth, nameCompareChars, allowNameVariations, exactMatchesOnly, findingRevision]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    getLegalReview(
      dataset,
      search,
      rule,
      page,
      filters,
      comparisonMonth,
      nameCompareChars,
      allowNameVariations,
      exactMatchesOnly,
      controller.signal,
    )
      .then((x) => {
        if (controller.signal.aborted) return;
        setResult(x);
        setError("");
        if (EXCLUDABLE_BENEFICIARY_RULES.has(rule) && rule !== "Possible duplicate name") onFindingCountChange(rule, x.total);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [dataset, rule, search, page, filters, comparisonMonth, nameCompareChars, allowNameVariations, exactMatchesOnly, findingRevision]);
  const copyDuplicateName=async(name:string)=>{
    if(!name)return;
    try{await navigator.clipboard.writeText(name)}catch{const field=document.createElement("textarea");field.value=name;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();document.execCommand("copy");field.remove()}
    announceLegalCopy(name);
  };
  const visibleRows=(result?.rows||[]).filter((row)=>!ignoreCourtVerdict || !/court verdict|\bother\b|اخرى/i.test(row.typeOfDocument||""));
  const rowKey = (row: LegalFlag, index: number) => `${row.recordId || row.row}|${row.caseId}|${row.assessmentId}|${row.serviceId}|${row.awarenessId}|${index}`;
  const isExcludable = (row: LegalFlag) => (dataset === "assessments" && Boolean(row.assessmentId)) || (dataset === "legalservices" && Boolean(row.serviceId)) || (dataset === "awareness" && Boolean(row.awarenessId || row.name)) || (dataset === "beneficiaries" && Boolean(row.caseId));
  const excludableRows = visibleRows.filter(isExcludable);
  const selectedRows = visibleRows.filter((row, index) => isExcludable(row) && selectedRowKeys.includes(rowKey(row, index)));
  const allVisibleSelected = excludableRows.length > 0 && selectedRows.length === excludableRows.length;
  useEffect(() => {
    setSelectedRowKeys([]);
  }, [dataset, rule, search, page, filters, comparisonMonth, nameCompareChars, allowNameVariations, exactMatchesOnly, findingRevision, ignoreCourtVerdict]);
  useEffect(() => {
    if (selectVisibleRef.current) selectVisibleRef.current.indeterminate = selectedRows.length > 0 && !allVisibleSelected;
  }, [selectedRows.length, allVisibleSelected]);
  return (
    <section className="glass finding-table-section">
      <header>
        <div className="finding-title-wrap">
          <button className="finding-help-button" type="button" aria-label={`How to check ${rule}`} title="How to check" aria-expanded={helpOpen} onClick={() => setHelpOpen((current) => !current)}><CircleHelp /></button>
          <div><h3>{displayReviewRule(rule)}</h3></div>
        </div>
        <div className="finding-table-pagination">
          {rule === "Possible duplicate name" && (
            <label className="exact-match-filter">
              <input type="checkbox" checked={exactMatchesOnly} onChange={(event) => onExactMatchesOnlyChange(event.target.checked)} />
              <span>Only 100% matches</span>
            </label>
          )}
          {(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID") && <label className="exact-match-filter"><input type="checkbox" checked={ignoreCourtVerdict} onChange={(event)=>onIgnoreCourtVerdictChange(event.target.checked)}/><span>Ignore Court Verdict and Other</span></label>}
          <div className="indicator-total-block finding-total">
            <strong>{visibleRows.length.toLocaleString()}</strong>
            <span>Total</span>
          </div>
        </div>
      </header>
      {selectedRows.length > 0 && (
        <div className="review-bulk-action-bar" role="status">
          <span><b>{selectedRows.length}</b> selected</span>
          <button className="soft" onClick={() => setSelectedRowKeys([])}>Clear selection</button>
          <button className="review-bulk-exclude" onClick={() => onBulkExclude(selectedRows)}><Ban /> Exclude selected</button>
        </div>
      )}
      {helpOpen && (() => { const method=REVIEW_CHECK_METHODS[rule] || {columns:["Imported source record"],logic:"Flags records matching this review rule."}; return <aside className="finding-check-guidance" role="note"><CircleHelp /><div><strong>Detection methodology</strong><p>{method.logic}</p><div className="finding-method-columns"><span>Columns checked</span>{method.columns.map((column) => <b key={column}>{column}</b>)}</div></div></aside>; })()}
      {error && <div className="error">{error}</div>}
      {!result ? (
        <LegalSkeleton variant="table" compact />
      ) : result.total === 0 ? (
        <div className="review-clear compact">
          <CheckCircle2 />
          <div>
            <h3>No matching records</h3>
            <p>No cases match this finding and the active filters.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="legal-table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="review-selection-column"><input ref={selectVisibleRef} aria-label={`Select visible records for ${displayReviewRule(rule)}`} type="checkbox" disabled={!excludableRows.length} checked={allVisibleSelected} onChange={(event) => setSelectedRowKeys(event.target.checked ? visibleRows.map((row, index) => isExcludable(row) ? rowKey(row, index) : "").filter(Boolean) : [])} /></th>
                  <th>Finding detail</th>
                  <th>Recommended action</th>
                  <th>Lawyer</th>
                  <th>Priority</th>
                  <th>Project</th>
                  <th>Project location</th>{rule === "Detention Governorate mismatch" && <th>Detention Governorate mismatch</th>}
                  <th>Name</th>
                  {(rule === "Marital status below 18" || rule === "Spouse below 18") && <th>Marital status</th>}
                  {rule === "Spouse below 18" && <><th>Spouse name</th><th>Spouse date of birth</th><th>Spouse current age</th></>}
                  <th>Phone number</th>
                  {dataset === "beneficiaries" && <th>Date of birth</th>}
                  {dataset === "awareness" ? (
                    <><th>Awareness ID</th><th>Session topic</th></>
                  ) : (
                    <><th>Case ID</th><th>Assessment</th>{dataset === "assessments" && <th>Date of assessment</th>}{rule === "Open counselling-only assessment" && <><th>Assessment status</th><th>Type of Legal Service Needed</th></>}{rule === "Detention/immigration inconsistency" && <><th>Is the beneficiary detained</th><th>Is it an immigration related charge?</th></>}{rule === "Detained beneficiary below 10 years" && <><th>Is the beneficiary detained</th><th>Date of birth</th><th>Current age</th></>}{rule === "Selected month with previous assessment" && <th>Created On</th>}{rule === "Representation while not detained" && <th>Type of documents to be issued</th>}{rule === "Type of document in Assessments vs Services" && <><th>Finding</th><th>Assessment documents</th><th>Service documents</th></>}{rule === "Type of Legal Service in Assessment vs Services" && <><th>Assessment service needed</th><th>Service type provided</th></>}{(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID") && <><th>Beneficiary ID</th><th>Type of Service Provided</th><th>Type of Document</th><th>Please specify the Court Verdict</th><th>Type of Document if Other</th><th>Legal Concern Specified</th><th>Legal Concern</th></>}<th>Service</th></>
                  )}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => (
                  <tr key={`${r.row}-${i}`} className={(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID" || rule === "Beneficiary has multiple assessments" || rule === "Duplicate participant in session") && r.duplicateGroup ? "duplicate-service-row" : ""} style={(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID" || rule === "Beneficiary has multiple assessments" || rule === "Duplicate participant in session") && r.duplicateGroup ? { background: duplicateColor(r.duplicateGroup) } : undefined} onContextMenu={(event) => {
                    if ((dataset === "assessments" && r.assessmentId) || (dataset === "legalservices" && r.serviceId) || (dataset === "awareness" && (r.awarenessId || r.name)) || (dataset === "beneficiaries" && r.caseId)) onFindingContextMenu(event, r);
                  }}>
                    <td className="review-selection-column"><input aria-label={`Select ${r.name || r.caseId || r.assessmentId || r.serviceId || r.awarenessId || "record"}`} type="checkbox" disabled={!isExcludable(r)} checked={selectedRowKeys.includes(rowKey(r, i))} onChange={() => setSelectedRowKeys((current) => current.includes(rowKey(r, i)) ? current.filter((key) => key !== rowKey(r, i)) : [...current, rowKey(r, i)])} /></td>
                    <td>{r.detail}</td>
                    <td className="action-cell">{r.action}</td>
                    <td>
                      <strong>{r.lawyer || "Unassigned"}</strong>
                    </td>
                    <td>
                      <span
                        className={`severity severity-${r.severity.toLowerCase()}`}
                      >
                        {r.severity}
                      </span>
                    </td>
                    <td>{r.project ? formatProjectLabel(r.project) : "—"}</td>
                    <td>{r.location || "—"}</td>{rule === "Detention Governorate mismatch" && <td>{r.detentionGovernorate || "Missing"}</td>}
                    <td
                      className={r.duplicateGroup ? `duplicate-name-cell ${r.nameMatchMode === "exact" ? "exact-duplicate-name" : "variation-duplicate-name"}` : ""}
                      style={r.duplicateGroup && r.nameMatchMode !== "exact" ? { background: `linear-gradient(90deg, ${duplicateColor(r.duplicateGroup)} 0%, ${duplicateColor(r.duplicateGroup)} ${r.duplicateSimilarity ?? 90}%, color-mix(in srgb,var(--panel-strong) 42%,transparent) ${r.duplicateSimilarity ?? 90}%, transparent 100%)` } : undefined}
                      onCopy={(event) => {
                        event.preventDefault();
                        event.clipboardData.setData("text/plain", r.name || "");
                        if (r.name) announceLegalCopy(r.name);
                      }}
                    >
                      {r.name?<button type="button" className="duplicate-name-copy" onClick={()=>void copyDuplicateName(r.name)} title="Copy beneficiary name" aria-label={`Copy ${r.name}`}>{r.name}</button>:<strong>Not provided</strong>}
                      {r.duplicateSimilarity !== undefined && <span className="duplicate-match-badge" aria-hidden="true">{r.duplicateSimilarity}% match</span>}
                      {r.nameMatchMode === "exact" && <span className="exact-duplicate-badge" aria-hidden="true">Exact duplicate</span>}
                    </td>
                    {(rule === "Marital status below 18" || rule === "Spouse below 18") && <td>{r.maritalStatus || "—"}</td>}
                    {rule === "Spouse below 18" && <><td><strong>{r.spouseName || "Not provided"}</strong></td><td>{r.spouseDateOfBirth || "—"}</td><td>{r.spouseAge ?? "—"}</td></>}
                    <td>{r.phone || "—"}</td>
                    {dataset === "beneficiaries" && <td>{r.dateOfBirth || "—"}{rule === "Marital status below 18" && r.beneficiaryAge !== null && r.beneficiaryAge !== undefined ? ` (${r.beneficiaryAge})` : ""}</td>}
                    {dataset === "awareness" ? (
                      <><td>{r.awarenessId || r.recordId || "—"}</td><td>{r.sessionTopic || "—"}</td></>
                    ) : (
                      <><td>{r.caseId || "—"}</td><td>{r.assessmentId || "—"}</td>{dataset === "assessments" && <td>{r.assessmentDate || "—"}</td>}{rule === "Open counselling-only assessment" && <><td>{r.assessmentStatus || "—"}</td><td>{r.legalServiceNeeded || "—"}</td></>}{rule === "Detention/immigration inconsistency" && <><td>{r.beneficiaryDetained || "—"}</td><td>{r.immigrationRelatedCharge || "—"}</td></>}{rule === "Detained beneficiary below 10 years" && <><td>{r.beneficiaryDetained || "—"}</td><td>{r.dateOfBirth || "—"}</td><td>{r.beneficiaryAge ?? "—"}</td></>}{rule === "Selected month with previous assessment" && <td>{r.createdOn || "—"}</td>}{rule === "Representation while not detained" && <td>{r.typeOfDocument || "—"}</td>}{rule === "Type of document in Assessments vs Services" && <><td>{r.comparisonFinding || "—"}</td><td>{r.assessmentDocuments || "—"}</td><td>{r.serviceDocuments || "—"}</td></>}{rule === "Type of Legal Service in Assessment vs Services" && <><td>{r.requestedServiceTypes || "—"}</td><td>{r.providedServiceTypes || "—"}</td></>}{(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID") && <><td>{r.caseId || "—"}</td><td>{r.serviceTypeProvided || "—"}</td><td>{r.typeOfDocument || "—"}</td><td>{r.courtVerdictDetail || "—"}</td><td>{r.otherDocumentDetail || "—"}</td><td>{r.legalConcernSpecified || "—"}</td><td>{r.legalConcern || "—"}</td></>}<td>{r.serviceId || "—"}</td></>
                    )}
                    <td>
                      {r.caseId && (
                        <button
                          className="table-action"
                          onClick={() => onOpenCase(r.caseId)}
                        >
                          Open case
                          <ArrowRight />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ReviewPageBody({
  dataset,
  onOpenCase,
  comparisonMonth,
}: {
  dataset: string;
  onOpenCase: (caseId: string) => void;
  comparisonMonth: string;
}) {
  const [summary, setSummary] = useState<LegalReview | null>(null),
    [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [nameCompareChars, setNameCompareChars] = useState(15),
    [appliedNameCompareChars, setAppliedNameCompareChars] = useState(15),
    [allowNameVariations, setAllowNameVariations] = useState(false),
    [exactMatchesOnly, setExactMatchesOnly] = useState(true),
    [ignoreCourtVerdict, setIgnoreCourtVerdict] = useState(false),
    [selectedRules, setSelectedRules] = useState<string[]>([]),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [drawer, setDrawer] = useState(false),
    [excludedDuplicates, setExcludedDuplicates] = useState<DuplicateExclusion[]>([]),
    [excludedManagerOpen, setExcludedManagerOpen] = useState(false),
    [exclusionCandidates, setExclusionCandidates] = useState<LegalFlag[] | null>(null),
    [exclusionImportOpen, setExclusionImportOpen] = useState(false),
    [exclusionFile, setExclusionFile] = useState<File | null>(null),
    [exclusionImportRules, setExclusionImportRules] = useState<string[]>([]),
    [exclusionImportResult, setExclusionImportResult] = useState(""),
    [duplicateMenu, setDuplicateMenu] = useState<{x:number;y:number;row:LegalFlag} | null>(null),
    [findingRevisions, setFindingRevisions] = useState<Record<string, number>>({}),
    [findingCounts, setFindingCounts] = useState<Record<string, number>>({}),
    [reviewActionsOpen, setReviewActionsOpen] = useState(false),
    [exclusionRuleFilter, setExclusionRuleFilter] = useState(""),
    [selectedExcludedFindings, setSelectedExcludedFindings] = useState<string[]>([]),
    [restoreConfirmation, setRestoreConfirmation] = useState<DuplicateExclusion[] | null>(null),
    [exclusionSort, setExclusionSort] = useState<{key:string;direction:"asc"|"desc"}>({key:"rule",direction:"asc"}),
    [exclusionBusy, setExclusionBusy] = useState(false),
    [initialized, setInitialized] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setSelectedRules([]);
    setInitialized(false);
    setFilters({});
    setIgnoreCourtVerdict(false);
  }, [dataset]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedNameCompareChars(nameCompareChars), 250);
    return () => window.clearTimeout(timer);
  }, [nameCompareChars]);
  const loadExcludedDuplicates = () => getDuplicateExclusions().then((result) => setExcludedDuplicates(result.rows)).catch(() => setExcludedDuplicates([]));
  useEffect(() => {
    void loadExcludedDuplicates();
  }, [dataset]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    getLegalReview(
      dataset,
      debouncedSearch,
      "",
      1,
      filters,
      comparisonMonth,
      appliedNameCompareChars,
      allowNameVariations,
      false,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setSummary(result);
        if (!initialized) {
          const beneficiaryDefaults = ["Possible duplicate name", "Possible duplicate contact and name", "Invalid contact number", "Case without assessment", "Invalid age"];
          const assessmentDeferredDefaults = new Set(["Representation while not detained", "Detention/immigration inconsistency", "Detained beneficiary below 10 years"]);
          const awarenessDeferredDefaults = new Set(["Possible duplicate participant name"]);
          const defaults = dataset === "beneficiaries"
            ? beneficiaryDefaults.filter((rule) => (result.ruleCounts[rule] || 0) > 0)
            : Object.entries(result.ruleCounts).filter(([rule, count]) => count > 0 && (dataset !== "assessments" || !assessmentDeferredDefaults.has(rule)) && (dataset !== "awareness" || !awarenessDeferredDefaults.has(rule))).map(([rule]) => rule);
          setSelectedRules(defaults);
          setInitialized(true);
        }
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message || "Unable to load review data.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [dataset, debouncedSearch, filters, comparisonMonth, appliedNameCompareChars, allowNameVariations]);
  const amalProjectOnly = dataset === "assessments" && ((filters.project && /\bamal\b/i.test(filters.project)) || (!filters.project && Boolean(summary?.filterOptions.project?.length) && summary!.filterOptions.project.every((project) => /\bamal\b/i.test(project)))),
    rules = Object.entries(summary?.ruleCounts || {}).map(([rule, count]) => [rule, EXCLUDABLE_BENEFICIARY_RULES.has(rule) && rule !== "Possible duplicate name" && findingCounts[rule] !== undefined ? findingCounts[rule] : count] as const).filter(([rule]) => !amalProjectOnly || !AMAL_HIDDEN_ASSESSMENT_RULES.has(rule)),
    orderedRules = dataset === "assessments" ? [...rules.filter(([rule]) => !ASSESSMENT_REVIEW_TAIL_RULES.has(rule)), ...rules.filter(([rule]) => ASSESSMENT_REVIEW_TAIL_RULES.has(rule))] : dataset === "legalservices" ? [...LEGAL_SERVICES_REVIEW_FIRST_RULES.map((rule) => rules.find(([name]) => name === rule)).filter((item): item is typeof rules[number] => Boolean(item)), ...rules.filter(([rule]) => !LEGAL_SERVICES_REVIEW_FIRST_RULES.includes(rule))] : rules,
    activeFilters = Object.values(filters).filter(Boolean).length,
    visibleExcludedFindings = excludedDuplicates.filter((entry) => (entry.dataset || "beneficiaries") === dataset && (!exclusionRuleFilter || entry.rule === exclusionRuleFilter));
  useEffect(() => {
    if (amalProjectOnly) setSelectedRules((current) => current.filter((rule) => !AMAL_HIDDEN_ASSESSMENT_RULES.has(rule)));
  }, [amalProjectOnly]);
  const sortedExcludedFindings = [...visibleExcludedFindings].sort((left,right) => {
    const value=(entry:DuplicateExclusion) => exclusionSort.key === "identifier" ? entry.identifierValue || entry.caseId : exclusionSort.key === "page" ? entry.dataset || "beneficiaries" : String(entry[exclusionSort.key as keyof DuplicateExclusion] || "");
    const result=value(left).localeCompare(value(right),undefined,{numeric:true,sensitivity:"base"}); return exclusionSort.direction === "asc" ? result : -result;
  });
  const toggleExclusionSort = (key:string) => setExclusionSort((current) => ({key,direction:current.key === key && current.direction === "asc" ? "desc" : "asc"}));
  const exclusionKey = (entry: DuplicateExclusion) => `${entry.dataset || "beneficiaries"}|${entry.rule}|${entry.identifierType || "caseId"}|${entry.identifierValue || entry.caseId}`;
  const restoreExcludedEntries = async (selected: DuplicateExclusion[]) => {
    if (!selected.length) return;
    setExclusionBusy(true);
    try {
      let latest:{rows:DuplicateExclusion[];count:number}|null=null;
      for (const entry of selected) latest=await restoreDuplicateExclusion(entry.identifierValue || entry.caseId,entry.rule,entry.dataset || "",entry.identifierType || "");
      if (latest) setExcludedDuplicates(latest.rows);
      setSelectedExcludedFindings([]);
      setFindingRevisions((current)=>Object.fromEntries(selected.map((entry)=>[entry.rule,(current[entry.rule]||0)+1])));
      setRestoreConfirmation(null);
    } finally { setExclusionBusy(false); }
  };
  const toggleRule = (rule: string) =>
    setSelectedRules((current) =>
      current.includes(rule)
        ? current.filter((x) => x !== rule)
        : [...current, rule],
    );
  const toggleFilter = (key: string, item: string) =>
    setFilters((current) => ({
      ...current,
      [key]: current[key] === item ? "" : item,
    }));
  const exclusionIdentity = (row: LegalFlag) => dataset === "assessments" ? ["assessmentId",row.assessmentId] : dataset === "legalservices" ? ["serviceId",row.serviceId] : dataset === "awareness" ? ["awarenessId",row.awarenessId || row.name] : ["caseId",row.caseId];
  const excludeFindings = async () => {
    if (!exclusionCandidates?.length) return;
    setExclusionBusy(true);
    try {
      const records = exclusionCandidates.map((candidate) => {
        const [identifierType,identifierValue] = exclusionIdentity(candidate);
        return { caseId: candidate.caseId, dataset, identifierType, identifierValue, rule: candidate.rule, name: candidate.name, project: candidate.project, source: `${labels[dataset as LegalPage]} Review` };
      });
      const result = records.length === 1
        ? await createDuplicateExclusion(records[0])
        : await createDuplicateExclusionsBulk(records);
      setExcludedDuplicates(result.rows);
      setFindingRevisions((current) => ({ ...current, ...Object.fromEntries(exclusionCandidates.map((candidate) => [candidate.rule, (current[candidate.rule] || 0) + 1])) }));
      setExclusionCandidates(null);
    } finally { setExclusionBusy(false); }
  };
  const restoreExcludedFinding = async (caseId: string, rule: string, item?: DuplicateExclusion) => {
    setExclusionBusy(true);
    try {
      const result = await restoreDuplicateExclusion(caseId, rule, item?.dataset || "", item?.identifierType || "");
      setExcludedDuplicates(result.rows);
      setFindingRevisions((current) => ({ ...current, [rule]: (current[rule] || 0) + 1 }));
    } finally { setExclusionBusy(false); }
  };
  return (
    <>
      {busy && !summary && (
        <LegalSkeleton variant="review" />
      )}
      {error && (
        <div className="error glass">
          {error}
          <button onClick={() => setFilters((current) => ({ ...current }))}>
            Retry
          </button>
        </div>
      )}
      <div className="glass review-finding-selector">
        <header>
          <div className="review-selector-actions">
            <h3>Choose review tables</h3>
          </div>
          <div className="review-selector-buttons">
            <button
              className="soft review-selector-button select-all-button"
              onClick={() => setSelectedRules(orderedRules.map(([rule]) => rule))}
            >
              <CheckCheck /> Select all
            </button>
            <button className="soft review-selector-button clear-selection-button" onClick={() => { setSelectedRules([]); setFilters({}); }}>
              <Eraser /> Clear
            </button>
            {true && (
              <div className="review-actions-wrap review-selector-exclude-actions">
                <button className="soft review-selector-button review-actions-toggle" aria-expanded={reviewActionsOpen} aria-haspopup="menu" onClick={() => setReviewActionsOpen((value) => !value)}>
                  <Ban /> Exclude
                </button>
                {reviewActionsOpen && <div className="review-actions-menu finding-exclusion-menu" role="menu">
                  <button className="all-findings" role="menuitem" onClick={() => { setExclusionRuleFilter(""); setSelectedExcludedFindings([]); setReviewActionsOpen(false); setExcludedManagerOpen(true); void loadExcludedDuplicates(); }}>Excluded findings for this page <b>{visibleExcludedFindings.length}</b></button>
                  <button className="all-findings" role="menuitem" onClick={() => { setExclusionImportRules([]); setReviewActionsOpen(false); setExclusionImportOpen(true); }}>Import exclusions</button>
                </div>}
              </div>
            )}
          </div>
        </header>
        <div>
          {orderedRules.map(([rule, count]) => (
            <label className="finding-check" key={rule}>
              <input
                type="checkbox"
                checked={selectedRules.includes(rule)}
                onChange={() => toggleRule(rule)}
              />
              <span>{displayReviewRule(rule)}</span>
              <b>{count.toLocaleString()}</b>
            </label>
          ))}
        </div>
      </div>
      <LegalScrollControls search={search} onSearch={setSearch} searchPlaceholder="Search records" onFilters={()=>setDrawer(true)} activeCount={activeFilters} onClear={()=>setFilters({})}>
      <div className="legal-toolbar review-toolbar professional-review-toolbar">
        <label>
          <Search />
          <input
            className="table-search-input"
            placeholder="Search records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {dataset === "beneficiaries" && (
          <section className={`name-sensitivity-panel${exactMatchesOnly ? " disabled" : ""}`} title={exactMatchesOnly ? "Name matching controls are ignored while only 100% matches is selected." : undefined}>
            <div className="name-match-title">
              <span>NAME MATCHING</span>
              <strong>Duplicate names</strong>
            </div>
            <label className="name-similarity-slider">
              <span className="sr-only">Characters compared</span>
              <input aria-label="Characters compared" type="range" min="10" max="30" step="1" value={nameCompareChars} disabled={exactMatchesOnly} style={{background:`linear-gradient(90deg, var(--blue) 0%, var(--blue) ${((nameCompareChars - 10) / 20) * 100}%, color-mix(in srgb,var(--blue) 14%,var(--line)) ${((nameCompareChars - 10) / 20) * 100}%, color-mix(in srgb,var(--blue) 14%,var(--line)) 100%)`}} onChange={(e) => setNameCompareChars(Number(e.target.value))} />
            </label>
            <b className="name-character-value" key={nameCompareChars}>{nameCompareChars} chars</b>
            <label className="name-variation-option">
              <input type="checkbox" checked={allowNameVariations} disabled={exactMatchesOnly} onChange={(e) => setAllowNameVariations(e.target.checked)} />
              <span>Spelling variations</span>
            </label>
            {summary?.nameRecordCount === 0 ? (
              <small className="name-empty-message">No beneficiary names are loaded. Choose a folder containing beneficiary names to use duplicate-name matching.</small>
            ) : summary?.eligibleNameRecordCount === 0 ? (
              <small className="name-empty-message">No names are long enough for {appliedNameCompareChars} characters. Move the slider lower to include shorter names.</small>
            ) : null}
          </section>
        )}
        <button
          className="soft case-filter-button"
          onClick={() => setDrawer(true)}
        >
          <SlidersHorizontal />
          All filters{activeFilters > 0 && <b>{activeFilters}</b>}
        </button>
        <ExcelDownloadButton disabled={selectedRules.length === 0} onClick={()=>downloadExcelUrl(legalReviewExportUrl(dataset, comparisonMonth, appliedNameCompareChars, allowNameVariations, exactMatchesOnly, selectedRules, filters, debouncedSearch, ignoreCourtVerdict),`${dataset}-review-findings.xlsx`)}/>
      </div>
      </LegalScrollControls>
      {selectedRules.length === 0 ? (
        <div className="glass review-empty-selection">
          <FileQuestion />
          <h3>Select one or more findings</h3>
          <p>Each selected finding will appear in its own table.</p>
        </div>
      ) : (
        <div className="finding-tables">
          {selectedRules.map((rule) => (
            <FindingTable
              key={rule}
              dataset={dataset}
              rule={rule}
              search={debouncedSearch}
              nameCompareChars={appliedNameCompareChars}
              allowNameVariations={allowNameVariations}
              exactMatchesOnly={exactMatchesOnly}
              onExactMatchesOnlyChange={setExactMatchesOnly}
              ignoreCourtVerdict={ignoreCourtVerdict}
              onIgnoreCourtVerdictChange={setIgnoreCourtVerdict}
              filters={filters}
              comparisonMonth={comparisonMonth}
              onOpenCase={onOpenCase}
              findingRevision={findingRevisions[rule] || 0}
              onFindingCountChange={(findingRule, count) => setFindingCounts((current) => ({ ...current, [findingRule]: count }))}
              onFindingContextMenu={(event, row) => { event.preventDefault(); setDuplicateMenu({ x: event.clientX, y: event.clientY, row }); }}
              onBulkExclude={(rows) => setExclusionCandidates(rows)}
            />
          ))}
        </div>
      )}
      {duplicateMenu && (
        <>
          <button className="duplicate-context-backdrop" aria-label="Close duplicate actions" onClick={() => setDuplicateMenu(null)} />
          <div className="duplicate-context-menu" style={{ left: duplicateMenu.x, top: duplicateMenu.y }} role="menu">
            <button role="menuitem" onClick={() => { setExclusionCandidates([duplicateMenu.row]); setDuplicateMenu(null); }}>
              Exclude this record from this finding
            </button>
          </div>
        </>
      )}
      {exclusionCandidates?.length && (
        <div className="duplicate-exclusion-modal">
          <button className="case-modal-backdrop" aria-label="Cancel exclusion" onClick={() => setExclusionCandidates(null)} />
          <section className="duplicate-exclusion-panel">
            <span className="eyebrow">REVIEW FINDING</span>
            <h2>Exclude {exclusionCandidates.length === 1 ? "this record" : `${exclusionCandidates.length} records`}?</h2>
            <p>{exclusionCandidates.length === 1 ? <>This record will be hidden only from <strong>{exclusionCandidates[0].rule}</strong> and its related Excel rows.</> : <>These records will be hidden only from <strong>{exclusionCandidates[0].rule}</strong> and its related Excel rows.</>} The source CSV remains unchanged.</p>
            {exclusionCandidates.length === 1 && <dl><div><dt>Finding</dt><dd>{exclusionCandidates[0].rule}</dd></div><div><dt>Case ID</dt><dd>{exclusionCandidates[0].caseId}</dd></div><div><dt>Name</dt><dd>{exclusionCandidates[0].name || "Not provided"}</dd></div><div><dt>Project</dt><dd>{exclusionCandidates[0].project || "Not provided"}</dd></div></dl>}
            <footer><button className="soft" onClick={() => setExclusionCandidates(null)} disabled={exclusionBusy}>Cancel</button><button className="primary" onClick={excludeFindings} disabled={exclusionBusy}>{exclusionBusy ? "Saving…" : exclusionCandidates.length === 1 ? "Exclude record" : `Exclude ${exclusionCandidates.length} records`}</button></footer>
          </section>
        </div>
      )}
      {excludedManagerOpen && createPortal(
        <div className="duplicate-exclusion-modal" role="dialog" aria-modal="true" aria-label="Local exclusion register">
          <button className="case-modal-backdrop" aria-label="Close excluded findings" onClick={() => setExcludedManagerOpen(false)} />
          <section className="duplicate-exclusion-panel duplicate-exclusion-manager">
            <header><div><span className="eyebrow">LOCAL EXCLUSION REGISTER</span><h2>{labels[dataset as LegalPage]} - {exclusionRuleFilter || "Excluded findings"} ({visibleExcludedFindings.length})</h2></div><button onClick={() => setExcludedManagerOpen(false)}><X /></button></header>
            <p>Only exclusions for this review page are shown. Restoring a record returns it only to its selected finding when it still meets that finding’s rule.</p>
            <div className="excluded-findings-actions"><a className="soft link" href={duplicateExclusionsExportUrl()}><Download /> Export Excel</a><button className="soft" disabled={!selectedExcludedFindings.length || exclusionBusy} onClick={() => setRestoreConfirmation(sortedExcludedFindings.filter((entry) => selectedExcludedFindings.includes(exclusionKey(entry))))}>Restore selected ({selectedExcludedFindings.length})</button></div>
            <div className="legal-table-wrap"><table className="excluded-findings-table"><thead><tr><th><input aria-label="Select all excluded findings" type="checkbox" checked={sortedExcludedFindings.length>0 && sortedExcludedFindings.every((entry)=>selectedExcludedFindings.includes(exclusionKey(entry)))} onChange={(event) => setSelectedExcludedFindings(event.target.checked ? sortedExcludedFindings.map(exclusionKey) : [])} /></th>{[["rule","Finding"],["identifier","Identifier"],["name","Name"],["project","Project"],["excludedAt","Date excluded"],["source","Source context"]].map(([key,label]) => <th key={key}><button onClick={() => toggleExclusionSort(key)}>{label}{exclusionSort.key === key ? exclusionSort.direction === "asc" ? " ▲" : " ▼" : " ↕"}</button></th>)}<th></th></tr></thead><tbody>{sortedExcludedFindings.length ? sortedExcludedFindings.map((entry) => <tr key={exclusionKey(entry)}><td><input aria-label={`Select ${entry.identifierValue || entry.caseId}`} type="checkbox" checked={selectedExcludedFindings.includes(exclusionKey(entry))} onChange={() => setSelectedExcludedFindings((current) => current.includes(exclusionKey(entry)) ? current.filter((key) => key !== exclusionKey(entry)) : [...current,exclusionKey(entry)])} /></td><td><span className={`excluded-finding-tag ${exclusionRuleClass(entry.rule)}`}>{entry.rule}</span></td><td>{entry.identifierValue || entry.caseId}</td><td>{entry.name || "—"}</td><td>{entry.project ? formatProjectLabel(entry.project) : "—"}</td><td>{entry.excludedAt ? new Date(entry.excludedAt).toLocaleString() : "—"}</td><td>{entry.source || "—"}</td><td><button className="soft" onClick={() => setRestoreConfirmation([entry])} disabled={exclusionBusy}>Restore</button></td></tr>) : <tr><td colSpan={8}>No records are excluded on this review page.</td></tr>}</tbody></table></div>
          </section>
        </div>,
        document.body,
      )}
      {restoreConfirmation && createPortal(
        <div className="duplicate-exclusion-modal" role="dialog" aria-modal="true" aria-label="Confirm restore exclusions">
          <button className="case-modal-backdrop" aria-label="Cancel restore" onClick={() => !exclusionBusy && setRestoreConfirmation(null)} />
          <section className="duplicate-exclusion-panel restore-confirmation-panel">
            <span className="eyebrow">CONFIRM RESTORE</span>
            <h2>Restore {restoreConfirmation.length === 1 ? "this exclusion" : `${restoreConfirmation.length} exclusions`}?</h2>
            <p>The restored record{restoreConfirmation.length === 1 ? "" : "s"} will appear again only when it still matches the relevant review finding. Source files will not be changed.</p>
            <footer><button className="soft" disabled={exclusionBusy} onClick={() => setRestoreConfirmation(null)}>Cancel</button><button className="primary" disabled={exclusionBusy} onClick={() => void restoreExcludedEntries(restoreConfirmation)}>{exclusionBusy ? "Restoring…" : "Confirm restore"}</button></footer>
          </section>
        </div>, document.body,
      )}
      {exclusionImportOpen && createPortal(
        <div className="duplicate-exclusion-modal" role="dialog" aria-modal="true" aria-label="Import exclusions">
          <button className="case-modal-backdrop" aria-label="Close exclusion import" onClick={() => setExclusionImportOpen(false)} />
          <section className="duplicate-exclusion-panel exclusion-import-panel">
            <header className="exclusion-import-header"><div><span className="eyebrow">BULK EXCLUSIONS</span><h2>Import IDs for selected findings</h2></div><button className="exclusion-modal-close" aria-label="Close import exclusions" title="Close" onClick={() => setExclusionImportOpen(false)}><X /></button></header>
            <p>Choose the finding tables to exclude from, then upload CSV or Excel. The app automatically uses {dataset === "beneficiaries" ? "Case ID or Beneficiary ID" : dataset === "assessments" ? "Assessment ID" : dataset === "legalservices" ? "Service ID" : "Awareness ID"} from the file.</p>
            <div className="exclusion-import-rules"><span>Exclude from these tables</span>{orderedRules.map(([rule]) => <label key={rule}><input type="checkbox" checked={exclusionImportRules.includes(rule)} onChange={() => setExclusionImportRules((current) => current.includes(rule) ? current.filter((item) => item !== rule) : [...current, rule])} /><span>{rule}</span></label>)}</div>
            <label className="exclusion-file-picker" htmlFor="exclusion-import-file"><span>Choose file</span><small>{exclusionFile?.name || "CSV, XLSX, or XLS"}</small></label>
            <input id="exclusion-import-file" className="exclusion-file-input" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { setExclusionFile(event.target.files?.[0] || null); setExclusionImportResult(""); }} />
            {exclusionImportResult && <p className="exclusion-import-success" role="status"><CheckCircle2 />{exclusionImportResult}</p>}
            <footer><button className="soft" onClick={() => setExclusionImportOpen(false)}>Cancel</button><button className="primary" disabled={!exclusionFile || !exclusionImportRules.length || exclusionBusy} onClick={async () => { if (!exclusionFile) return; setExclusionBusy(true); try { const type=dataset === "assessments" ? "assessmentId" : dataset === "legalservices" ? "serviceId" : dataset === "awareness" ? "awarenessId" : "caseId"; const result=await importDuplicateExclusions(exclusionFile,dataset,type,exclusionImportRules); setExcludedDuplicates(result.rows); setExclusionImportResult(`Successfully imported ${result.imported} exclusion${result.imported === 1 ? "" : "s"} from ${result.column}. ${result.duplicates} already existed; ${result.invalid} invalid.`); setFindingRevisions((current)=>Object.fromEntries(exclusionImportRules.map((rule)=>[rule,(current[rule]||0)+1]))); } finally { setExclusionBusy(false); } }}>{exclusionBusy ? "Importing…" : "Import exclusions"}</button></footer>
          </section>
        </div>, document.body,
      )}
      {drawer && (
        <>
          <button
            className="filter-backdrop"
            aria-label="Close filters"
            onClick={() => setDrawer(false)}
          />
          <aside className="case-filter-drawer">
            <header>
              <div>
                <span className="eyebrow">REVIEW FILTERS</span>
                <h2>Filter all finding tables</h2>
              </div>
              <button onClick={() => setDrawer(false)}>
                <X />
              </button>
            </header>
            <div className="case-filter-scroll review-checkbox-filters">
              {(["project", "location", "date"] as const).map(
                (key) => (
                  <details key={key} open>
                    <summary>
                      <span>
                        {key === "location" ? "Project location" : key === "date" ? ({beneficiaries:"Date of identification",assessments:"Date of assessment",legalservices:"Date of Service Provision",awareness:"Date of awareness"}[dataset] || "Date") : "Project"}
                      </span>
                      {filters[key] && <b>1</b>}
                      <ChevronDown />
                    </summary>
                    <div>
                      {summary?.filterOptions?.[key]?.map((item) => (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={filters[key] === item}
                            onChange={() => toggleFilter(key, item)}
                          />
                          <span>{key === "project" ? formatProjectLabel(item) : item}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ),
              )}
            </div>
            <footer>
              <button
                className="soft"
                onClick={() => setFilters({})}
                disabled={!activeFilters}
              >
                Clear all
              </button>
              <button className="primary" onClick={() => setDrawer(false)}>
                Apply filters {activeFilters > 0 && `(${activeFilters})`}
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

function LegacyReviewPageBody({
  dataset,
  onOpenCase,
  comparisonMonth,
}: {
  dataset: string;
  onOpenCase: (caseId: string) => void;
  comparisonMonth: string;
}) {
  const [result, setResult] = useState<LegalReview | null>(null),
    [search, setSearch] = useState(""),
    [rule, setRule] = useState(""),
    [page, setPage] = useState(1),
    [similarity, setSimilarity] = useState(90),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    getLegalReview(
      dataset,
      search,
      rule,
      page,
      filters,
      comparisonMonth,
      15,
      false,
    )
      .then(setResult)
      .catch((e) => setError(e.message));
  }, [dataset, search, rule, page, similarity, filters, comparisonMonth]);
  const updateFilter = (key: string, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  return (
    <>
      <div className="review-groups">
        {Object.entries(result?.ruleCounts || {}).map(([name, count]) => (
          <button
            key={name}
            className={rule === name ? "active" : ""}
            onClick={() => {
              setRule(rule === name ? "" : name);
              setPage(1);
            }}
          >
            <span>{name}</span>
            <strong>{count.toLocaleString()}</strong>
          </button>
        ))}
      </div>
      <div className="legal-toolbar review-toolbar">
        <label>
          <Search />
          <input
            className="table-search-input"
            placeholder="Search records"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {(["project", "location", "date"] as const).map((key) => (
          <select
            key={key}
            value={filters[key] || ""}
            onChange={(e) => updateFilter(key, e.target.value)}
          >
            <option value="">
              All {key === "location" ? "locations" : key === "date" ? "dates" : "projects"}
            </option>
            {result?.filterOptions?.[key]?.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        ))}
        {dataset === "beneficiaries" && (
          <label className="similarity-control">
            <span>Name similarity {similarity}%</span>
            <input
              type="range"
              min="70"
              max="100"
              value={similarity}
              onChange={(e) => {
                setSimilarity(Number(e.target.value));
                setPage(1);
              }}
            />
          </label>
        )}
        <ExcelDownloadButton onClick={()=>downloadExcelUrl(legalReviewExportUrl(dataset, comparisonMonth, 15, false),`${dataset}-review-findings.xlsx`)}/>
      </div>
      {error && <div className="error glass">{error}</div>}
      <div className="glass legal-table-card">
        <div className="legal-card-heading">
          <div>
            <strong>{result?.total.toLocaleString() || 0}</strong>
            <span> issues require review</span>
          </div>
          <small>
            Grouped by finding · correct confirmed issues in the source platform
          </small>
        </div>
        {result?.total === 0 ? (
          <div className="review-clear">
            <CheckCircle2 />
            <h3>No findings for this selection</h3>
            <p>The loaded records passed the active review rules.</p>
          </div>
        ) : (
          <>
            <div className="legal-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lawyer</th>
                    <th>Priority</th>
                    <th>Project</th>
                    <th>Project location</th>
                    <th>Name</th>
                    <th>Phone number</th>
                    <th>Case ID</th>
                    <th>Assessment</th>
                    <th>Service</th>
                    <th>Review finding</th>
                    <th>Recommended action</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result?.rows.map((r, i) => (
                    <tr key={`${r.row}-${r.rule}-${i}`}>
                      <td>
                        <strong>{r.lawyer || "Unassigned"}</strong>
                      </td>
                      <td>
                        <span
                          className={`severity severity-${r.severity.toLowerCase()}`}
                        >
                          {r.severity}
                        </span>
                      </td>
                      <td>{r.project ? formatProjectLabel(r.project) : "—"}</td>
                      <td>{r.location || "—"}</td>
                      <td onCopy={(event) => {
                        event.preventDefault();
                        event.clipboardData.setData("text/plain", r.name || "");
                      }}>
                        <strong>{r.name || "Not provided in source"}</strong>
                      </td>
                      <td>{r.phone || "—"}</td>
                      <td>{r.caseId || "—"}</td>
                      <td>{r.assessmentId || "—"}</td>
                      <td>{r.serviceId || "—"}</td>
                      <td>
                        <strong>{r.rule}</strong>
                        <small className="row-reference">{r.detail}</small>
                      </td>
                      <td className="action-cell">{r.action}</td>
                      <td>
                        {r.caseId && (
                          <button
                            className="table-action"
                            onClick={() => onOpenCase(r.caseId)}
                          >
                            Open case
                            <ArrowRight />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result && (
              <Pager page={page} total={result.total} onChange={setPage} />
            )}
          </>
        )}
      </div>
    </>
  );
}

function LegalDeportationDashboard({metadata,theme}:{metadata:LegalMetadata;theme:Theme}){
  const [dash,setDash]=useState<Dashboard|null>(null),[error,setError]=useState(""),[filters,setFilters]=useState<Record<string,string[]>>({}),[drawer,setDrawer]=useState(false),[display,setDisplay]=useState<"both"|"count"|"percent">("both"),[refreshing,setRefreshing]=useState(false);
  useEffect(()=>{let active=true;setError("");setRefreshing(true);getLegalDeportationDashboard(filters).then((data)=>{if(active)setDash(data)}).catch((reason)=>{if(active)setError(reason.message||"Unable to load deportation data.")}).finally(()=>{if(active)setRefreshing(false)});return()=>{active=false}},[metadata.source,filters]);
  const activeCount=Object.values(filters).reduce((count,values)=>count+values.length,0),clear=()=>setFilters({});
  if(error)return <section className="glass legal-empty"><ShieldAlert/><h2>Unable to load Deportation</h2><p>{error}</p><button className="primary" onClick={()=>window.location.reload()}><RefreshCw/>Retry</button></section>;
  if(!dash)return <LegalSkeleton variant="deportation"/>;
  const selectChart=(field:string,value:string)=>setFilters((current)=>({...current,[field]:current[field]?.includes(value)?current[field].filter((item)=>item!==value):[...(current[field]||[]),value]}));
  const dashboardFilterOptions=dash.filterOptions||{};
  const quickFields=Object.keys(dashboardFilterOptions).filter((field)=>field!=="__reviewStyle"&&(/project/i.test(field)||/date.*deportation.*knowledge/i.test(field))).sort((left,right)=>(/project.*location/i.test(left)?1:/date/i.test(left)?2:0)-(/project.*location/i.test(right)?1:/date/i.test(right)?2:0));
  const quickLabel=(field:string)=>/project.*location/i.test(field)?"Project location":/date/i.test(field)?"Date Of Deportation Knowledge":"Project";
  return <section className={`legal-deportation-dashboard dashboard-content ${refreshing?"refreshing":""}`}><LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={clear}><div className="toolbar deportation-top-toolbar"><div className="deportation-quick-filters">{quickFields.map((field)=><CheckboxMultiSelect key={field} hideLabel label={quickLabel(field)} values={dashboardFilterOptions[field]||[]} selected={filters[field]||[]} onChange={(items)=>setFilters((current)=>({...current,[field]:items}))}/>)}</div><div className="deportation-toolbar-actions"><button className="soft detention-filter-clear" onClick={clear} disabled={!activeCount}><RotateCcw/>Clear</button><button className="primary" onClick={()=>setDrawer(true)}><SlidersHorizontal/>Filters {activeCount>0&&<b>{activeCount}</b>}</button></div><div className="toolbar-metrics"><AppSelect label="Display" value={display} onChange={(value)=>setDisplay(value as "both"|"count"|"percent")} options={[["both","# + %"],["count","Count #"],["percent","Percentage %"]]}/></div></div></LegalScrollControls><ActiveFilters filters={filters} onRemove={(field,value)=>setFilters((current)=>({...current,[field]:current[field].filter((item)=>item!==value)}))}/><div className="refresh-indicator">Updating filters…</div><div className="kpi-grid">{dash.kpis.map((item)=><KpiCard key={item.label} {...item}/>)}</div><div className="dashboard-grid"><TrendCard rows={dash.trend} display={display} theme={theme} selected={filters.Month||[]} onSelect={(months,replace)=>setFilters((current)=>({...current,Month:replace?months:Array.from(new Set([...(current.Month||[]),...months]))}))} onRemove={(month)=>setFilters((current)=>({...current,Month:(current.Month||[]).filter((item)=>item!==month)}))} title="Activity over time" subtitle="Date of deportation"/>{dash.charts.map((chart)=><ChartCard key={chart.id} chart={chart} display={display} theme={theme} onSelect={selectChart}/>)}</div><DeportationRecordsTable filters={filters}/><FilterDrawer open={drawer} available={dashboardFilterOptions} filters={filters} onClose={()=>setDrawer(false)} onChange={setFilters} onReset={clear}/></section>;
}

function DeportationRecordsTable({filters}:{filters:Record<string,string[]>}){
  const [result,setResult]=useState<LegalExplorerResult|null>(null),[search,setSearch]=useState(""),[page,setPage]=useState(1),[sortColumn,setSortColumn]=useState(""),[sortDirection,setSortDirection]=useState<"asc"|"desc">("asc"),[selected,setSelected]=useState<Map<string,Record<string,unknown>>>(new Map());
  useEffect(()=>{getLegalExplorer("deportationrecords",search,page,filters,sortColumn,sortDirection).then(setResult).catch(()=>setResult(null))},[filters,search,page,sortColumn,sortDirection]);
  return <section className="glass legal-table-card deportation-records-table"><div className="legal-card-heading"><label className="detention-table-search"><Search/><input className="table-search-input" value={search} onChange={(event)=>{setSearch(event.target.value);setPage(1)}} placeholder="Search deportation records"/></label><div className="indicator-total-block detention-table-total"><strong>{result?.total.toLocaleString()||0}</strong><span>Total</span></div><TableSelectionActions selected={selected} filename="selected-deportation-records.xlsx" onClear={()=>setSelected(new Map())} onDownloadAll={()=>exportLegalExplorer("xlsx","deportationrecords",search,filters)} iconOnly/>{result&&<Pager compact page={page} total={result.total} onChange={setPage}/>}</div><div className="legal-table-wrap"><table><thead><tr><th><input aria-label="Select visible deportation records" type="checkbox" checked={Boolean(result?.rows.length)&&result!.rows.every((row:any)=>selected.has(String(row.__rowKey)))} onChange={(event)=>setSelected((current)=>{const next=new Map(current);result?.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(event.target.checked)next.set(key,row);else next.delete(key)});return next})}/></th>{result?.columns.map((column)=><th key={column}><button onClick={()=>{setSortColumn(column);setSortDirection(sortColumn===column&&sortDirection==="asc"?"desc":"asc");setPage(1)}}>{column}</button></th>)}</tr></thead><tbody>{result?.rows.map((row:any,index)=><tr key={index}><td><input aria-label="Select deportation record" type="checkbox" checked={selected.has(String(row.__rowKey))} onChange={()=>setSelected((current)=>{const next=new Map(current),key=String(row.__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>{result.columns.map((column)=><td key={column}>{value(row[column])}</td>)}</tr>)}</tbody></table></div></section>;
}

function LegalAnalyticsStudio({metadata,theme,onOpenCase}:{metadata:LegalMetadata;theme:Theme;onOpenCase:(id:string)=>void}){
  const sectionIcons:Record<string,ReactNode>={assessments:<CheckCheck/>,legalservices:<BriefcaseBusiness/>,beneficiaries:<Users/>,awareness:<Megaphone/>,builder:<BarChart3/>};
  const sections=[...["assessments","legalservices","beneficiaries"].map((id)=>[id,labels[id as LegalPage].replace(" Review","")] as [string,string]),...(metadata.availability.awareness?[["awareness","Awareness"] as [string,string]]:[]),["builder","Custom Builder"] as [string,string]];
  const [section,setSection]=useState("assessments"),[sectionState,setSectionState]=useState<Record<string,{filters:Record<string,string[]>;search:string;page:number;sortColumn:string;sortDirection:"asc"|"desc"}>>({});
  const sheets=metadata.sheets;
  const hideDetentionInfo=metadata.features?.detention===false;
  const isDetentionField=(field:string)=>/detain|immigration related charge/i.test(field);
  const studioSheets=sheets.map((sheet)=>sheet.id==="assessments"&&hideDetentionInfo?{...sheet,columns:sheet.columns.filter((column)=>!isDetentionField(column))}:sheet);
  const studioMetadata:Metadata={ready:true,source:metadata.source,loadedAt:null,pages:Object.fromEntries(studioSheets.map((sheet)=>[sheet.id,{rows:sheet.rows,filters:Object.fromEntries(sheet.columns.map((column)=>[column,[]])),dimensions:sheet.columns}]))};
  const state=sectionState[section]||{filters:{},search:"",page:1,sortColumn:"",sortDirection:"asc" as const};
  const update=(patch:Partial<typeof state>)=>setSectionState((current)=>({...current,[section]:{...state,...patch}}));
  return <div className="legal-analytics-studio"><nav className="glass studio-section-tabs" aria-label="Analytics Studio sections">{sections.map(([id,label])=><button className={section===id?"active":""} key={id} onClick={()=>setSection(id)}>{sectionIcons[id]}<span>{label}</span></button>)}</nav>{section==="builder"?<Studio metadata={studioMetadata} theme={theme} sourceOptions={studioSheets.map((sheet)=>[sheet.id,sheet.name])} studioLoader={getLegalStudio} excludeFields={hideDetentionInfo?isDetentionField:undefined}/>:<LegalAnalyticsSection dataset={section} theme={theme} state={state} update={update} onOpenCase={onOpenCase}/>}</div>;
}

function LegacyLegalAnalyticsSection({dataset,theme,state,update}:{dataset:string;theme:Theme;state:{filters:Record<string,string[]>;search:string;page:number;sortColumn:string;sortDirection:"asc"|"desc"};update:(patch:Partial<typeof state>)=>void}){
  const [data,setData]=useState<LegalAnalyticsDashboard|null>(null),[busy,setBusy]=useState(true),[drawer,setDrawer]=useState(false),[error,setError]=useState(""),[selectedRows,setSelectedRows]=useState<Map<string,Record<string,unknown>>>(new Map());
  useEffect(()=>{const controller=new AbortController();setBusy(true);setError("");getLegalAnalyticsDashboard({dataset,...state,pageSize:100},controller.signal).then(setData).catch((reason)=>{if(reason.name!=="AbortError")setError(reason.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[dataset,state.filters,state.search,state.page,state.sortColumn,state.sortDirection]);
  const active=Object.values(state.filters).reduce((sum,values)=>sum+values.length,0),toggle=(column:string,value:string)=>update({page:1,filters:{...state.filters,[column]:state.filters[column]?.includes(value)?state.filters[column].filter((item)=>item!==value):[...(state.filters[column]||[]),value]}});
  const formatKpi=(item:{value:number;format:string})=>item.format==="percent"?`${(item.value*100).toFixed(1)}%`:item.value.toLocaleString();
  const quickHints:Record<string,string[]>={assessments:["project","project location","assessment status","month"],legalservices:["project","project location","service status","month"],beneficiaries:["project","project location","nationality","month"],awareness:["project","project location","community type","month"]};
  const quickColumns=(quickHints[dataset]||[]).map((hint)=>Object.keys(data?.filterOptions||{}).find((column)=>column.trim().toLowerCase()===hint||column.trim().toLowerCase().includes(hint))).filter((column):column is string=>Boolean(column));
  const setQuick=(column:string,values:string[])=>update({page:1,filters:{...state.filters,[column]:values}});
  return <section className={`studio-fixed-section ${busy?"refreshing":""}`}><LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={active} onClear={()=>update({filters:{},page:1})}><div className="glass studio-fixed-toolbar"><button className="primary" onClick={()=>setDrawer(true)}><SlidersHorizontal/>Filters {active>0&&<b>{active}</b>}</button><button className="soft" disabled={!active} onClick={()=>update({filters:{},page:1})}><RotateCcw/>Clear</button><button className="soft" onClick={()=>void exportLegalExplorer("xlsx",dataset,state.search,state.filters)}><Download/>Excel</button></div></LegalScrollControls>{error&&<div className="error glass">{error}</div>}{data?.warnings.length?<details className="glass studio-source-warnings"><summary>{data.warnings.length} unavailable source field{data.warnings.length===1?"":"s"}</summary>{data.warnings.map((warning)=><p key={warning}>{warning}</p>)}</details>:null}<div className="legal-kpis">{(data?.kpis||[]).map((item)=><div className="glass legal-kpi" key={item.label}><span>{item.label}</span><strong>{formatKpi(item)}</strong><small>Active filters</small></div>)}</div><div className="dashboard-grid"><TrendCard rows={data?.trend||[]} display="both" theme={theme} selected={state.filters.Month||[]} onSelect={(months,replace)=>update({page:1,filters:{...state.filters,Month:replace?months:Array.from(new Set([...(state.filters.Month||[]),...months]))}})} title="Activity over time" subtitle="Based on the section source date"/>{(data?.charts||[]).map((chart)=><ChartCard key={chart.id} chart={chart} display="both" theme={theme} onSelect={(field,value)=>toggle(field,value)}/>)}</div><div className="glass legal-table-card studio-records-table"><div className="legal-card-heading"><div><strong>{data?.matchedRows.toLocaleString()||0}</strong><span> filtered records</span></div><TableSelectionActions selected={selectedRows} filename={`${dataset}-selected.xlsx`} onClear={()=>setSelectedRows(new Map())} onDownloadAll={()=>exportLegalExplorer("xlsx",dataset,state.search,state.filters)}/><label className="studio-table-search"><Search/><input value={state.search} placeholder={`Search ${dataset} data`} onChange={(event)=>update({search:event.target.value,page:1})}/></label></div><div className="legal-table-wrap"><table><thead><tr><th><input aria-label="Select visible records" type="checkbox" checked={Boolean(data?.rows.length)&&data!.rows.every((row:any)=>selectedRows.has(String(row.__rowKey)))} onChange={(event)=>setSelectedRows((current)=>{const next=new Map(current);data?.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(event.target.checked)next.set(key,row);else next.delete(key)});return next})}/></th>{data?.columns.map((column)=><th key={column}><button onClick={()=>update({page:1,sortColumn:column,sortDirection:state.sortColumn===column&&state.sortDirection==="asc"?"desc":"asc"})}>{column} {state.sortColumn===column?(state.sortDirection==="asc"?"▲":"▼"):"↕"}</button></th>)}</tr></thead><tbody>{data?.rows.map((row:any,index)=><tr key={index}><td><input aria-label="Select record" type="checkbox" checked={selectedRows.has(String(row.__rowKey))} onChange={()=>setSelectedRows((current)=>{const next=new Map(current),key=String(row.__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>{data.columns.map((column)=><td key={column}>{value(row[column])}</td>)}</tr>)}</tbody></table></div>{data&&<Pager page={state.page} total={data.matchedRows} onChange={(page)=>update({page})}/>}</div>{drawer&&<><button className="filter-backdrop" aria-label="Close filters" onClick={()=>setDrawer(false)}/><aside className="case-filter-drawer"><header><div><span className="eyebrow">ANALYTICS FILTERS</span><h2>Filter this section</h2></div><button onClick={()=>setDrawer(false)}><X/></button></header><div className="case-filter-scroll review-checkbox-filters">{Object.entries(data?.filterOptions||{}).map(([column,values])=><details key={column} open={Boolean(state.filters[column]?.length)}><summary><span>{column}</span>{state.filters[column]?.length>0&&<b>{state.filters[column].length}</b>}<ChevronDown/></summary><div>{values.map((item)=><label key={item}><input type="checkbox" checked={state.filters[column]?.includes(item)||false} onChange={()=>toggle(column,item)}/><span>{item}</span></label>)}</div></details>)}</div><footer><button className="soft" onClick={()=>update({filters:{},page:1})}>Clear all</button><button className="primary" onClick={()=>setDrawer(false)}>Apply filters</button></footer></aside></>}</section>;
}

function LegalAnalyticsSection({dataset,theme,state,update,onOpenCase}:{dataset:string;theme:Theme;state:{filters:Record<string,string[]>;search:string;page:number;sortColumn:string;sortDirection:"asc"|"desc"};update:(patch:Partial<typeof state>)=>void;onOpenCase:(id:string)=>void}){
  const [data,setData]=useState<LegalAnalyticsDashboard|null>(null),[busy,setBusy]=useState(true),[drawer,setDrawer]=useState(false),[filterSearch,setFilterSearch]=useState(""),[error,setError]=useState(""),[selected,setSelected]=useState<Map<string,Record<string,unknown>>>(new Map());
  useEffect(()=>{const controller=new AbortController();setBusy(true);setError("");getLegalAnalyticsDashboard({dataset,...state,pageSize:100},controller.signal).then(setData).catch((reason)=>{if(reason.name!=="AbortError")setError(reason.message||"Unable to load this section.")}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[dataset,state.filters,state.search,state.page,state.sortColumn,state.sortDirection]);
  const active=Object.values(state.filters).reduce((sum,values)=>sum+values.length,0),setFilter=(column:string,values:string[])=>update({page:1,filters:{...state.filters,[column]:values}}),clear=()=>update({page:1,filters:{}});
  const hints:Record<string,string[]>={assessments:["project","project location","assessment status","month"],legalservices:["project","project location","service status","month"],beneficiaries:["project","project location","nationality","month"],awareness:["project","project location","community type","month"]};
  const optionKeys=Object.keys(data?.filterOptions||{}),quick=(hints[dataset]||[]).map((hint)=>optionKeys.find((key)=>key.trim().toLowerCase()===hint||key.trim().toLowerCase().includes(hint))).filter((key):key is string=>Boolean(key));
  const kpi=(item:{value:number;format:string})=>item.format==="percent"?`${(item.value*100).toFixed(1)}%`:item.value.toLocaleString();
  const toolbarFilterLabel=(column:string)=>column.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g,"").replace(/\s*[-–,:/]\s*$/,"").replace(/\s{2,}/g," ").trim()||"Filter";
  return <section className={`studio-fixed-section ${busy?"refreshing":""}`}>
    <LegalScrollControls filterLabel="All filters" onFilters={()=>setDrawer(true)} activeCount={active} onClear={clear}>
      <div className="glass studio-quick-toolbar">
      <div className="studio-quick-fields">{quick.map((column)=><CheckboxMultiSelect key={column} hideLabel label={toolbarFilterLabel(column)} values={data?.filterOptions[column]||[]} selected={state.filters[column]||[]} onChange={(values)=>setFilter(column,values)}/>)}</div>
      <div className="studio-quick-actions"><button className="soft detention-filter-clear" disabled={!active} onClick={clear}><RotateCcw/>Clear</button><button className="primary" onClick={()=>setDrawer(true)}><SlidersHorizontal/>All filters {active>0&&<b>{active}</b>}</button><button className="primary studio-excel" onClick={()=>void exportLegalExplorer("xlsx",dataset,state.search,state.filters)}><Download/>Excel</button></div>
    </div>
    </LegalScrollControls>
    {error&&<div className="error glass">{error}</div>}
    {busy&&data&&<div className="studio-section-refreshing" role="status"><span/><span>Updating analysis…</span></div>}
    {busy&&!data?<div className="glass studio-section-loading" role="status"><div/><span>Loading analysis…</span></div>:data&&<><div className="legal-kpis">{data.kpis.map((item)=><div className="glass legal-kpi" key={item.label}><span>{item.label}</span><strong>{kpi(item)}</strong><small>Active filters</small></div>)}</div>
    <div className="dashboard-grid"><TrendCard rows={data.trend} display="both" theme={theme} selected={state.filters.Month||[]} onSelect={(months,replace)=>setFilter("Month",replace?months:Array.from(new Set([...(state.filters.Month||[]),...months])))} title="Activity over time" subtitle="Based on the section source date"/>{data.charts.map((chart)=><ChartCard key={`${chart.id}-${chart.title}`} chart={chart} display="both" theme={theme} onSelect={(field,item)=>setFilter(field,state.filters[field]?.includes(item)?state.filters[field].filter((value)=>value!==item):[...(state.filters[field]||[]),item])}/>)}</div>
    <div className="glass legal-table-card studio-records-table"><div className="legal-card-heading"><label className="studio-table-search"><Search/><input value={state.search} placeholder={`Search ${dataset} data`} onChange={(event)=>update({search:event.target.value,page:1})}/></label><div className="indicator-total-block detention-table-total"><strong>{data.matchedRows.toLocaleString()}</strong><span>Total</span></div><TableSelectionActions selected={selected} filename={`${dataset}-selected.xlsx`} onClear={()=>setSelected(new Map())} iconOnly/><Pager compact page={state.page} total={data.matchedRows} onChange={(page)=>update({page})}/></div><div className="legal-table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select visible records" checked={Boolean(data.rows.length)&&data.rows.every((row:any)=>selected.has(String(row.__rowKey)))} onChange={(event)=>setSelected((current)=>{const next=new Map(current);data.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(event.target.checked)next.set(key,row);else next.delete(key)});return next})}/></th>{data.columns.map((column)=><th key={column}><button onClick={()=>update({page:1,sortColumn:column,sortDirection:state.sortColumn===column&&state.sortDirection==="asc"?"desc":"asc"})}>{column} {state.sortColumn===column?(state.sortDirection==="asc"?"▲":"▼"):"↕"}</button></th>)}</tr></thead><tbody>{data.rows.map((row:any,index)=><tr key={index}><td><input type="checkbox" aria-label="Select record" checked={selected.has(String(row.__rowKey))} onChange={()=>setSelected((current)=>{const next=new Map(current),key=String(row.__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>{data.columns.map((column)=><td key={column}>{column==="Beneficiary ID"||column==="Case ID"?<button className="table-action" onClick={()=>onOpenCase(String(row[column]||""))}>{value(row[column])}<ArrowRight/></button>:value(row[column])}</td>)}</tr>)}</tbody></table></div></div></>}
    {drawer&&<><button className="filter-backdrop" aria-label="Close Analytics Studio filters" onClick={()=>setDrawer(false)}/><aside className="case-filter-drawer analytics-filter-drawer"><header><div><span className="eyebrow">ANALYTICS STUDIO FILTERS</span><h2>Filter {dataset==="legalservices"?"Legal Services":dataset[0].toUpperCase()+dataset.slice(1)}</h2></div><button onClick={()=>setDrawer(false)} aria-label="Close filters"><X/></button></header><label className="filter-search"><Search/><input value={filterSearch} onChange={(event)=>setFilterSearch(event.target.value)} placeholder="Search filters"/></label><div className="case-filter-scroll">{Object.entries(data?.filterOptions||{}).filter(([column])=>column.toLowerCase().includes(filterSearch.toLowerCase())).map(([column,values])=><details key={column} open={Boolean(state.filters[column]?.length)}><summary><span>{column}</span>{state.filters[column]?.length>0&&<b>{state.filters[column].length}</b>}<ChevronDown/></summary><div>{values.map((item)=><label key={item}><input type="checkbox" checked={state.filters[column]?.includes(item)||false} onChange={()=>setFilter(column,state.filters[column]?.includes(item)?state.filters[column].filter((value)=>value!==item):[...(state.filters[column]||[]),item])}/><span>{formatFilterMonth(item)}</span></label>)}</div></details>)}</div><footer><button className="soft" disabled={!active} onClick={clear}>Clear all</button><button className="primary" onClick={()=>setDrawer(false)}>Apply filters {active>0&&`(${active})`}</button></footer></aside></>}
  </section>;
}

type ExplorerExportTask={preparing:boolean;error:string};
let explorerExportTask:ExplorerExportTask={preparing:false,error:""};
let explorerExportController:AbortController|null=null;
const explorerExportListeners=new Set<(task:ExplorerExportTask)=>void>();
const notifyExplorerExportTask=()=>explorerExportListeners.forEach((listener)=>listener(explorerExportTask));
const subscribeExplorerExportTask=(listener:(task:ExplorerExportTask)=>void)=>{explorerExportListeners.add(listener);return()=>{explorerExportListeners.delete(listener)}};
const startExplorerExportTask=(dataset:string,search:string,filters:Record<string,string[]>)=>{
  if(explorerExportTask.preparing)return;
  const controller=new AbortController();explorerExportController=controller;explorerExportTask={preparing:true,error:""};notifyExplorerExportTask();
  void exportLegalExplorer("xlsx",dataset,search,filters,controller.signal).catch((reason:any)=>{if(reason?.name!=="AbortError")explorerExportTask={preparing:false,error:reason?.message||"Excel export failed."}}).finally(()=>{if(explorerExportController!==controller)return;explorerExportController=null;if(explorerExportTask.preparing)explorerExportTask={preparing:false,error:""};notifyExplorerExportTask()});
};
const cancelExplorerExportTask=()=>{explorerExportController?.abort();explorerExportController=null;explorerExportTask={preparing:false,error:""};notifyExplorerExportTask()};

function Explorer({
  metadata,
  initialDataset,
  onOpenCase = (id: string) => {
    window.location.hash = `/legal/cases/${encodeURIComponent(id)}`;
  },
}: {
  metadata: LegalMetadata;
  initialDataset?: string;
  onOpenCase?: (id: string) => void;
}) {
  const [dataset, setDataset] = useState(initialDataset || metadata.sheets[0]?.id || ""),
    [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [page, setPage] = useState(1),
    [sortColumn,setSortColumn]=useState(""),
    [sortDirection,setSortDirection]=useState<"asc"|"desc">("asc"),
    [drawer, setDrawer] = useState(false),
    [filterSearch, setFilterSearch] = useState(""),
    [filters, setFilters] = useState<Record<string, string[]>>({}),
    [options, setOptions] = useState<{ name: string; values: string[] }[]>([]),
    [result, setResult] = useState<LegalExplorerResult | null>(null),
    [selectedRows,setSelectedRows]=useState<Map<string,Record<string,unknown>>>(new Map()),
    [exportTask,setExportTask]=useState(explorerExportTask),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(()=>subscribeExplorerExportTask(setExportTask),[]);
  useEffect(()=>{if(exportTask.error)setError(exportTask.error)},[exportTask.error]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (dataset) {
      setBusy(true);
      setError("");
      getLegalExplorer(dataset, debouncedSearch, page, filters,sortColumn,sortDirection)
        .then(setResult)
        .catch((reason) => setError(reason.message || "Unable to load dataset."))
        .finally(() => setBusy(false));
    }
  }, [dataset, debouncedSearch, page, filters, sortColumn, sortDirection]);
  useEffect(() => {
    if (dataset)
      getLegalExplorerFilters(dataset).then((x) => setOptions(x.columns));
  }, [dataset]);
  const datasetOrder=["beneficiaries","assessments","legalservices","followupslogbooks","legalfees","deportationrecords","awareness"],
    orderedSheets=[...metadata.sheets].sort((left,right)=>datasetOrder.indexOf(left.id)-datasetOrder.indexOf(right.id)),
    activeCount = Object.values(filters).reduce((n, x) => n + x.length, 0),
    toggle = (column: string, item: string) => {
      setFilters((current) => ({
        ...current,
        [column]: current[column]?.includes(item)
          ? current[column].filter((x) => x !== item)
          : [...(current[column] || []), item],
      }));
      setPage(1);
    };
  const download=async()=>{setError("");startExplorerExportTask(dataset,search,filters)};
  const displayedRows = [...(result?.rows || [])].sort(
    (left, right) => Number(selectedRows.has(String((right as any).__rowKey))) - Number(selectedRows.has(String((left as any).__rowKey))),
  );
  return (
    <>
      {error && <div className="error glass">{error}</div>}
      <LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={()=>{setFilters({});setPage(1)}}>
      <div className="legal-toolbar explorer-sticky-controls">
        <AppSelect label="Dataset" value={dataset} options={orderedSheets.map((sheet)=>[sheet.id,`${sheet.name} (${sheet.rows.toLocaleString()})`])} onChange={(next)=>{setDataset(next);setFilters({});setSortColumn("");setSortDirection("asc");setPage(1)}}/>
        <span className="explorer-toolbar-spacer" aria-hidden="true"/>
        <button
          className="soft case-filter-button"
          onClick={() => setDrawer(true)}
        >
          <SlidersHorizontal />
          All filters{activeCount > 0 && <b>{activeCount}</b>}
        </button>
        <button className="soft explorer-sticky-clear" disabled={!activeCount} onClick={()=>{setFilters({});setPage(1)}}>
          <RotateCcw />
          Clear
        </button>
        <button className={`primary explorer-sticky-export${exportTask.preparing?" is-preparing":""}`} aria-busy={exportTask.preparing} aria-label={exportTask.preparing?"Cancel Excel download":"Download Excel"} title={exportTask.preparing?"Cancel Excel download":"Download Excel"} onClick={()=>{if(exportTask.preparing)cancelExplorerExportTask();else download()}}><span className="explorer-sticky-export-content"><Download/>Excel</span>{exportTask.preparing&&<><span className="button-spinner explorer-sticky-export-spinner" aria-hidden="true"/><span className="explorer-sticky-export-cancel"><X/>Cancel</span></>}</button>
      </div>
      </LegalScrollControls>
      {activeCount > 0 && (
        <div className="explorer-active-filters">
          <span>
            {activeCount} active filter{activeCount === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => {
              setFilters({});
              setPage(1);
            }}
          >
            Clear all
          </button>
        </div>
      )}
      {busy && !result && <LegalSkeleton variant="explorer" embedded />}
      {!(busy && !result) && <div className="glass legal-table-card compact-explorer">
        <div className="legal-card-heading">
          <label className="explorer-table-search"><Search/><input className="table-search-input" placeholder="Search data" value={search} onChange={(event)=>{setSearch(event.target.value);setPage(1)}}/></label>
          <div className="indicator-total-block detention-table-total"><strong>{result?.total.toLocaleString() || 0}</strong><span>Total</span></div>
          <TableSelectionActions selected={selectedRows} filename={`${dataset}-selected.xlsx`} onClear={()=>setSelectedRows(new Map())} onDownloadAll={download} iconOnly/>
          {result && <Pager compact page={page} total={result.total} onChange={setPage}/>}
        </div>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr><th><input aria-label="Select all filtered records" type="checkbox" checked={Boolean(result?.total)&&selectedRows.size===result!.total} onChange={async(event)=>{if(!event.target.checked){setSelectedRows(new Map());return;}const all=await getLegalExplorer(dataset,debouncedSearch,1,filters,sortColumn,sortDirection,result?.total||100,);setSelectedRows(new Map(all.rows.map((row:any)=>[String(row.__rowKey),row])));}}/></th>
                {result?.columns.map((c) => (
                  <th key={c}><button className={sortColumn===c?"active":""} onClick={()=>{const direction=sortColumn===c&&sortDirection==="asc"?"desc":"asc";setSortColumn(c);setSortDirection(direction);setPage(1)}}><span>{c}</span><b>{sortColumn===c?(sortDirection==="asc"?"▲":"▼"):"↕"}</b></button></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, i) => (
                <tr key={i}><td><input aria-label="Select record" type="checkbox" checked={selectedRows.has(String((row as any).__rowKey))} onChange={()=>setSelectedRows((current)=>{const next=new Map(current),key=String((row as any).__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>
                  {result?.columns.map((c) => (
                    <td key={c}>
                      {(dataset === "beneficiaries" && c === "Case ID") || (["assessments","legalservices","followupslogbooks","legalfees"].includes(dataset) && c === "Beneficiary ID") ? (
                        <button
                          className="table-action"
                          onClick={() => onOpenCase(String(row[c] || ""))}
                        >
                          {value(row[c])}
                          <ArrowRight />
                        </button>
                      ) : (
                        renderCell(row[c], c)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
      {drawer && (
        <>
          <button
            className="filter-backdrop"
            aria-label="Close filters"
            onClick={() => setDrawer(false)}
          />
          <aside className="case-filter-drawer">
            <header>
              <div>
                <span className="eyebrow">DATA FILTERS</span>
                <h2>
                  Filter {metadata.sheets.find((s) => s.id === dataset)?.name}
                </h2>
              </div>
              <button onClick={() => setDrawer(false)}>
                <X />
              </button>
            </header>
            <label className="filter-search">
              <Search />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search filters"
              />
            </label>
            <div className="case-filter-scroll">
              {options
                .filter((x) =>
                  x.name.toLowerCase().includes(filterSearch.toLowerCase()),
                )
                .map((option) => (
                  <details
                    key={option.name}
                    open={Boolean(filters[option.name]?.length)}
                  >
                    <summary>
                      <span>{option.name}</span>
                      {filters[option.name]?.length > 0 && (
                        <b>{filters[option.name].length}</b>
                      )}
                      <ChevronDown />
                    </summary>
                    <div>
                      {option.values.map((item) => (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={
                              filters[option.name]?.includes(item) || false
                            }
                            onChange={() => toggle(option.name, item)}
                          />
                          <span>{formatFilterMonth(item)}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
            </div>
            <footer>
              <button
                className="soft"
                onClick={() => {
                  setFilters({});
                  setPage(1);
                }}
                disabled={!activeCount}
              >
                Clear all
              </button>
              <button className="primary" onClick={() => setDrawer(false)}>
                Apply filters {activeCount > 0 && `(${activeCount})`}
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

function LegacyExplorer({
  metadata,
  onOpenCase = (id: string) => {
    window.location.hash = `/legal/cases/${encodeURIComponent(id)}`;
  },
}: {
  metadata: LegalMetadata;
  onOpenCase?: (id: string) => void;
}) {
  const [dataset, setDataset] = useState(metadata.sheets[0]?.id || ""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [drawer, setDrawer] = useState(false),
    [filterSearch, setFilterSearch] = useState(""),
    [filters, setFilters] = useState<Record<string, string[]>>({}),
    [options, setOptions] = useState<{ name: string; values: string[] }[]>([]),
    [result, setResult] = useState<LegalExplorerResult | null>(null);
  useEffect(() => {
    if (dataset) {
      getLegalExplorer(dataset, search, page, filters).then(setResult);
      getLegalExplorerFilters(dataset).then((x) => setOptions(x.columns));
    }
  }, [dataset, search, page, filters]);
  const activeCount = Object.values(filters).reduce((n, x) => n + x.length, 0),
    toggle = (column: string, item: string) =>
      setFilters((current) => ({
        ...current,
        [column]: current[column]?.includes(item)
          ? current[column].filter((x) => x !== item)
          : [...(current[column] || []), item],
      }));
  return (
    <>
      <div className="legal-toolbar explorer-sticky-controls">
        <select
          value={dataset}
          onChange={(e) => {
            setDataset(e.target.value);
            setFilters({});
            setPage(1);
          }}
        >
          {metadata.sheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.rows.toLocaleString()})
            </option>
          ))}
        </select>
        <label>
          <Search />
          <input
            className="table-search-input"
            placeholder="Search data"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          className="soft case-filter-button"
          onClick={() => setDrawer(true)}
        >
          <SlidersHorizontal />
          All filters{activeCount > 0 && <b>{activeCount}</b>}
        </button>
        <ExcelDownloadButton className="soft" onClick={()=>downloadExcelUrl(legalExportUrl(dataset),`${dataset}.xlsx`)}/>
      </div>
      <div className="glass legal-table-card compact-explorer">
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                {result?.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.rows.map((row, i) => (
                <tr key={i}>
                  {result.columns.map((c) => (
                    <td key={c}>
                      {dataset === "beneficiaries" && c === "Case ID" ? (
                        <button
                          className="table-action"
                          onClick={() => onOpenCase(String(row[c] || ""))}
                        >
                          {value(row[c])}
                          <ArrowRight />
                        </button>
                      ) : (
                        renderCell(row[c], c)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result && (
          <Pager page={page} total={result.total} onChange={setPage} />
        )}
      </div>
      {drawer && (
        <>
          <button
            className="filter-backdrop"
            aria-label="Close filters"
            onClick={() => setDrawer(false)}
          />
          <aside className="case-filter-drawer">
            <header>
              <div>
                <span className="eyebrow">DATA FILTERS</span>
                <h2>
                  Filter {metadata.sheets.find((s) => s.id === dataset)?.name}
                </h2>
              </div>
              <button onClick={() => setDrawer(false)}>
                <X />
              </button>
            </header>
            <label className="filter-search">
              <Search />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search filters"
              />
            </label>
            <div className="case-filter-scroll">
              {options
                .filter((x) =>
                  x.name.toLowerCase().includes(filterSearch.toLowerCase()),
                )
                .map((option) => (
                  <details
                    key={option.name}
                    open={Boolean(filters[option.name]?.length)}
                  >
                    <summary>
                      <span>{option.name}</span>
                      {filters[option.name]?.length > 0 && (
                        <b>{filters[option.name].length}</b>
                      )}
                      <ChevronDown />
                    </summary>
                    <div>
                      {option.values.map((item) => (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={
                              filters[option.name]?.includes(item) || false
                            }
                            onChange={() => toggle(option.name, item)}
                          />
                          <span>{formatFilterMonth(item)}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
            </div>
            <footer>
              <button
                className="soft"
                onClick={() => setFilters({})}
                disabled={!activeCount}
              >
                Clear all
              </button>
              <button className="primary" onClick={() => setDrawer(false)}>
                Apply filters {activeCount > 0 && `(${activeCount})`}
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

function SecuredDocumentActions({ url }: { url: string }) {
  const [downloadState, setDownloadState] = useState<
    "idle" | "downloading" | "failed"
  >("idle");
  const [viewerOpen, setViewerOpen] = useState(false);
  const pdf = /\.pdf(?:\?|$)/i.test(url);
  const filename = decodeURIComponent(url.split("?")[0].split("/").pop() || "Secured document");

  const download = async () => {
    if (downloadState === "downloading") return;
    setDownloadState("downloading");
    try {
      const response = await fetch(legalAttachmentDownloadUrl(url));
      if (!response.ok) throw new Error("The document could not be downloaded.");
      const attachment = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename =
        disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
        "secured-document";
      const objectUrl = URL.createObjectURL(attachment);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setDownloadState("idle");
    } catch {
      setDownloadState("failed");
    }
  };

  return (
    <>
      <span className="attachment-actions">
        <button
          className="attachment-preview-trigger"
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Preview ${filename}`}
        >
          {pdf ? (
            <iframe src={url} title="PDF thumbnail" loading="lazy" />
          ) : (
            <img src={url} alt="Document thumbnail" loading="lazy" />
          )}
          <span>Preview</span>
        </button>
        <button type="button" onClick={() => setViewerOpen(true)}>
          View
        </button>
        <button
          type="button"
          onClick={download}
          disabled={downloadState === "downloading"}
          aria-busy={downloadState === "downloading"}
        >
          {downloadState === "downloading" ? (
            <>
              <span className="attachment-download-spinner" aria-hidden="true" />
              Downloading…
            </>
          ) : downloadState === "failed" ? (
            "Try again"
          ) : (
            "Download"
          )}
        </button>
      </span>
      {viewerOpen &&
        createPortal(
          <div className="attachment-viewer-modal" role="dialog" aria-modal="true" aria-label={`Preview ${filename}`}>
            <button className="case-modal-backdrop" aria-label="Close document preview" onClick={() => setViewerOpen(false)} />
            <section className="attachment-viewer-panel">
              <header>
                <div>
                  <span>SECURED DOCUMENT</span>
                  <h2>{filename}</h2>
                  <p>{pdf ? "PDF preview" : "Image preview"}</p>
                </div>
                <div className="attachment-viewer-actions">
                  <a href={url} target="_blank" rel="noreferrer">Open in browser</a>
                  <button className="icon" type="button" onClick={() => setViewerOpen(false)} aria-label="Close document preview"><X /></button>
                </div>
              </header>
              <div className="attachment-viewer-content">
                {pdf ? <iframe src={url} title={filename} /> : <img src={url} alt={filename} />}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

function renderCell(input: unknown, column = "") {
  const text = value(input);
  if (/^https?:\/\//i.test(text)) {
    const secured = /secured documents files/i.test(column),
      pdf = /\.pdf(?:\?|$)/i.test(text),
      image = !pdf && (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(text) || secured);
    return (
      <span
        className={`legal-link-cell ${image || pdf ? "image-attachment" : ""}`}
      >
        {secured ? (
          <SecuredDocumentActions url={text} />
        ) : (
          <a href={text} target="_blank" rel="noreferrer">
            Open attachment
          </a>
        )}
      </span>
    );
  }
  return text;
}
function englishOnly(input: unknown) {
  const values = String(input || "")
    .split(",")
    .map((part) =>
      (part.split(/[\u0600-\u06ff]/)[0] || "")
        .replace(/[\s,\-/–—]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return Array.from(new Set(values)).join(", ") || "Not specified";
}
function DetentionCases({
  onOpenCase,
  theme,
}: {
  onOpenCase: (caseId: string) => void;
  theme: any;
}) {
  const [page, setPage] = useState(1),
    [recordSearch,setRecordSearch]=useState(""),
    [recordSortColumn,setRecordSortColumn]=useState(""),
    [recordSortDirection,setRecordSortDirection]=useState<"asc"|"desc">("asc"),
    [selectedRecords,setSelectedRecords]=useState<Map<string,Record<string,unknown>>>(new Map()),
    [filters, setFilters] = useState<Record<string, string[]>>({}),
    [tab, setTab] = useState<"analysis" | "records" | "reconcile">("analysis"),
    [drawer, setDrawer] = useState(false),
    [data, setData] = useState<Awaited<
      ReturnType<typeof getLegalDetention>
    > | null>(null),
    [busy, setBusy] = useState(false),
    [comparisonMonths, setComparisonMonths] = useState<string[]>([]),
    [comparisonProjects, setComparisonProjects] = useState<string[]>([]),
    [comparisonFile, setComparisonFile] = useState<File | null>(null),
    [comparisonSheets, setComparisonSheets] = useState<string[]>([]),
    [comparisonSheet, setComparisonSheet] = useState(""),
    [sheetBusy, setSheetBusy] = useState(false),
    [comparisonBusy, setComparisonBusy] = useState(false),
    [comparisonExporting, setComparisonExporting] = useState(false),
    [tableExporting, setTableExporting] = useState(false),
    [comparisonResult, setComparisonResult] = useState<Awaited<ReturnType<typeof reconcileLegalDetention>> | null>(null),
    [drillMenu, setDrillMenu] = useState<{x:number;y:number}|null>(null),
    [error, setError] = useState("");
  const drillMenuRef=useRef<HTMLDivElement>(null);
  useEffect(() => {
    let current=true;
    setBusy(true);
    setError("");
    getLegalDetention(tab==="records"?recordSearch:"", page, filters,tab==="records"?recordSortColumn:"",recordSortDirection)
      .then((result)=>{if(current)setData(result)})
      .catch((reason) => {if(current)setError(reason.message || "Unable to load detention records.")})
      .finally(() => {if(current)setBusy(false)});
    return()=>{current=false};
  }, [page, filters, tab, recordSearch, recordSortColumn, recordSortDirection]);
  const updateFilter = (label: string, selections: string[]) => {
    setFilters((current) => ({
      ...current,
      [label]: selections,
    }));
    setPage(1);
  };
  const activeCount=Object.values(filters).reduce((sum,items)=>sum+items.length,0);
  const quickFilterLabels=["Project","Project location","Date of Assessment","Date of the released","Current status","Type of Released","Nationality"];
  const quickFilters=()=>quickFilterLabels.map((label)=><CheckboxMultiSelect key={label} label={label} values={data?.filterOptions?.[label]||[]} selected={filters[label]||[]} onChange={(items)=>updateFilter(label,items)} hideLabel/>);
  const availableMonths=(data?.trend||[]).map((row)=>row.month).reverse();
  useEffect(()=>{
    const selected=filters.month||[];
    if(selected.length)setComparisonMonths(selected);
    else if(!comparisonMonths.length&&availableMonths.length)setComparisonMonths([availableMonths[0]]);
  },[filters.month,data?.trend]);
  useEffect(()=>{if(filters.Project?.length)setComparisonProjects(filters.Project)},[filters.Project]);
  const chooseComparisonFile=async(file:File|null)=>{
    setComparisonFile(file);setComparisonResult(null);setComparisonSheets([]);setComparisonSheet("");
    if(!file)return;
    setSheetBusy(true);setError("");
    try{const result=await getDetentionWorkbookSheets(file);setComparisonSheets(result.sheets);setComparisonSheet(result.selected)}
    catch(reason:any){setComparisonFile(null);setError(reason.message||"Unable to read workbook sheets.")}
    finally{setSheetBusy(false)}
  };
  const compareWorkbook=async()=>{
    if(!comparisonFile||!comparisonMonths.length||!comparisonProjects.length||!comparisonSheet)return;
    setComparisonBusy(true);setError("");
    try{setComparisonResult(await reconcileLegalDetention(comparisonFile,comparisonMonths,comparisonProjects,comparisonSheet))}
    catch(reason:any){setError(reason.message||"Unable to compare the workbook.")}
    finally{setComparisonBusy(false)}
  };
  const exportComparison=async()=>{
    if(!comparisonFile||!comparisonMonths.length||!comparisonSheet)return;
    setComparisonExporting(true);
    try{await exportLegalDetentionReconciliation(comparisonFile,comparisonMonths,comparisonProjects,comparisonSheet)}
    catch(error:any){setError(error.message||"Could not export comparison issues.")}
    finally{setComparisonExporting(false)}
  };
  const exportDetentionTable=async()=>{
    if(!data||tableExporting)return;
    setTableExporting(true);
    try{
      const pageSize=500,pages=Math.ceil(data.total/pageSize);
      const results=await Promise.all(Array.from({length:pages},(_,index)=>getLegalDetention(recordSearch,index+1,filters,recordSortColumn,recordSortDirection)));
      const columns=[...data.columns,"Case ID"];
      const rows=results.flatMap((result)=>result.rows.map((row)=>Object.fromEntries(columns.map((column)=>[column,column==="Case ID"?row.caseId:row[column]]))));
      await exportTableWorkbook("detention-cases.xlsx",columns,rows);
    }catch(reason:any){setError(reason.message||"Could not export detention table data.")}
    finally{setTableExporting(false)}
  };
  const openFilteredRecords=(event:React.MouseEvent<HTMLDivElement>)=>{
    const target=event.target as HTMLElement;
    if(target.closest("button,a,input,select"))return;
    if(!target.closest(".chart-card,.detention-map,.detention-breakdown"))return;
    event.preventDefault();
    const width=226,height=108,padding=10;
    setDrillMenu({x:Math.max(padding,Math.min(event.clientX,window.innerWidth-width-padding)),y:Math.max(padding,Math.min(event.clientY,window.innerHeight-height-padding))});
  };
  useEffect(()=>{
    if(!drillMenu)return;
    const outside=(event:PointerEvent)=>{if(!drillMenuRef.current?.contains(event.target as Node))setDrillMenu(null)};
    const keyboard=(event:KeyboardEvent)=>{if(event.key==="Escape")setDrillMenu(null)};
    const dismiss=()=>setDrillMenu(null);
    window.addEventListener("pointerdown",outside);window.addEventListener("keydown",keyboard);window.addEventListener("scroll",dismiss,true);window.addEventListener("resize",dismiss);
    return()=>{window.removeEventListener("pointerdown",outside);window.removeEventListener("keydown",keyboard);window.removeEventListener("scroll",dismiss,true);window.removeEventListener("resize",dismiss)};
  },[drillMenu]);
  return (
    <div className={`detention-page ${busy ? "detention-busy" : ""} ${tab==="records" ? "records-tab" : ""}`}>
      {busy && !data && (
        <LegalSkeleton variant="detention" />
      )}
      {error && <div className="error glass">{error}</div>}
      <nav className="glass detention-tabs" aria-label="Detention views">
        <button className={tab==="analysis"?"active":""} onClick={()=>setTab("analysis")}><BarChart3/>Analysis</button>
        <button className={tab==="records"?"active":""} onClick={()=>setTab("records")}><TableProperties/>Detention detail table</button>
        <button className={tab==="reconcile"?"active":""} onClick={()=>setTab("reconcile")}><ShieldCheck/>Monthly Excel reconciliation</button>
      </nav>
      {tab!=="reconcile"&&<LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={()=>{setFilters({});setPage(1)}}>
      <div className="glass detention-toolbar">
        {quickFilters()}
        <div className="detention-toolbar-actions"><button className="soft detention-filter-clear" disabled={!activeCount} onClick={()=>{setFilters({});setPage(1)}}><RotateCcw/>Clear</button><button className="primary" onClick={()=>setDrawer(true)}><SlidersHorizontal/>Filters {activeCount>0&&<b>{activeCount}</b>}</button></div>
      </div>
      </LegalScrollControls>}
      {tab==="analysis"&&<>
      <div className="legal-kpis detention-kpis">
        {(data?.kpis || []).map((kpi) => (
          <div className="glass legal-kpi" key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.value.toLocaleString()}</strong>
            <small>Assessment records</small>
          </div>
        ))}
      </div>
      </>}
      {tab==="analysis"&&<div className="detention-analysis-view" onContextMenu={openFilteredRecords}>
      {(data?.trend?.length || 0) > 0 ? <TrendCard rows={(data?.trend||[]).map((row)=>({label:row.month,count:row.detainedAssessments,percent:0}))} comparisonRows={(data?.trend||[]).map((row)=>({label:row.month,count:row.released,percent:0}))} primaryLabel="Detained assessments" comparisonLabel="Released" display="count" theme={theme} selected={filters.month || []} onSelect={(months,replace)=>updateFilter("month",replace?months:Array.from(new Set([...(filters.month||[]),...months])))} onRemove={(month)=>updateFilter("month",(filters.month||[]).filter((item)=>item!==month))} title="Detained assessments and releases" subtitle="Detained by assessment date; released by release date when current status contains Released"/> : <section className="glass detention-trend detention-trend-empty"><BarChart3/><div><strong>Detained assessments and releases</strong><span>No valid assessment or qualifying release dates are available for the active filters.</span></div></section>}
      <IraqDetentionMapMetrics items={data?.map?.items||[]} selected={filters["Detention governorate"]||[]} onSelect={(values)=>{const current=filters["Detention governorate"]||[],remove=values.length>0&&values.every((value)=>current.includes(value));updateFilter("Detention governorate",remove?current.filter((value)=>!values.includes(value)):Array.from(new Set([...current,...values])))}}/>
      <div className="detention-breakdown-grid">
        {(data?.charts || []).map((chart) => {const total=chart.items.reduce((sum,item)=>sum+item.count,0);return <ChartCard key={chart.id} chart={{id:chart.id,title:chart.title,kind:"bar",multiChoice:false,rows:chart.items.map((item)=>({label:item.label,count:item.count,percent:total?item.count/total:0}))}} display="both" theme={theme} onSelect={(field,item)=>updateFilter(field,filters[field]?.includes(item)?filters[field].filter((value)=>value!==item):[...(filters[field]||[]),item])}/>})}
      </div>
      </div>}
      {tab==="records"&&
        <div className="glass legal-table-card detention-table-card">
        <div className="legal-card-heading">
          <label className="detention-table-search"><Search/><input className="table-search-input" value={recordSearch} onChange={(event)=>{setRecordSearch(event.target.value);setPage(1)}} placeholder="Search detention cases"/></label>
          <div className="indicator-total-block detention-table-total"><strong>{data?.total.toLocaleString() || 0}</strong><span>Total</span></div>
          <TableSelectionActions selected={selectedRecords} filename="selected-detention-records.xlsx" onClear={()=>setSelectedRecords(new Map())} onDownloadAll={exportDetentionTable} iconOnly/>{data&&<Pager compact page={page} total={data.total} onChange={setPage}/>} 
        </div>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr><th><input aria-label="Select visible detention records" type="checkbox" checked={Boolean(data?.rows.length)&&data!.rows.every((row:any)=>selectedRecords.has(String(row.__rowKey)))} onChange={(event)=>setSelectedRecords((current)=>{const next=new Map(current);data?.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(event.target.checked)next.set(key,row);else next.delete(key)});return next})}/></th>
                {data?.columns.map((column) => (
                  <th key={column}><button className={recordSortColumn===column?"active":""} onClick={()=>{const direction=recordSortColumn===column&&recordSortDirection==="asc"?"desc":"asc";setRecordSortColumn(column);setRecordSortDirection(direction);setPage(1)}}><span>{column}</span><b>{recordSortColumn===column?(recordSortDirection==="asc"?"▲":"▼"):"↕"}</b></button></th>
                ))}
                <th className="detention-action-heading">Case action</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((row, index) => (
                <tr key={`${row.caseId || "case"}-${index}`}><td><input aria-label="Select detention record" type="checkbox" checked={selectedRecords.has(String((row as any).__rowKey))} onChange={()=>setSelectedRecords((current)=>{const next=new Map(current),key=String((row as any).__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>
                  {data.columns.map((column) => (
                    <td key={column}>{value(row[column])}</td>
                  ))}
                  <td>
                    {Boolean(row.caseId) && (
                      <button
                        className="table-action"
                        onClick={() => onOpenCase(String(row.caseId))}
                      >
                        Open case
                        <ArrowRight />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      }
      {tab==="reconcile"&&<section className="glass detention-reconciliation">
        <header><div><span className="eyebrow">MONTHLY COMPARISON</span><h3>Compare detention records with Excel</h3><p>Records are matched by Case ID. The results show IDs available only in Assessments, only in Excel, and rows with a missing Case ID.</p></div></header>
        <div className="reconciliation-controls">
          <div className="reconciliation-month-select"><CheckboxMultiSelect label="Assessment months" values={availableMonths} selected={comparisonMonths} onChange={(months)=>{setComparisonMonths(months);setComparisonResult(null)}}/></div>
          <div className="reconciliation-project-select"><CheckboxMultiSelect label="Projects" values={data?.filterOptions?.Project||[]} selected={comparisonProjects} onChange={(projects)=>{setComparisonProjects(projects);setComparisonResult(null)}}/></div>
          <label className="reconciliation-file"><span>Comparison workbook</span><input type="file" accept=".xlsx" onChange={(event)=>chooseComparisonFile(event.target.files?.[0]||null)}/><b><FolderOpen/>{sheetBusy?"Reading worksheets…":comparisonFile?.name||"Choose Excel file"}</b></label>
          <div className="reconciliation-sheet-select"><AppSelect label="Worksheet" value={comparisonSheet} disabled={!comparisonSheets.length||sheetBusy} options={comparisonSheets.map((sheet)=>[sheet,sheet])} onChange={(sheet)=>{setComparisonSheet(sheet);setComparisonResult(null)}}/></div>
          <button className="primary" disabled={!comparisonMonths.length||!comparisonProjects.length||!comparisonFile||!comparisonSheet||comparisonBusy||sheetBusy} onClick={compareWorkbook}>{comparisonBusy?<><span className="button-spinner"/>Comparing…</>:<>Compare selected month{comparisonMonths.length===1?"":"s"}<ArrowRight/></>}</button>
        </div>
        <p className="reconciliation-help">Project filtering is applied from Assessments. If the workbook has no Project column, all Excel rows for the selected month remain visible so Case IDs found only in Excel are not hidden. For matching Case IDs, Date of Birth and Detention Governorate are compared directly alongside arrest, release, authority, charges, nationality and legal-service fields.</p>
        {comparisonResult&&<>
          <div className="reconciliation-summary">
            <div><span>Platform records</span><strong>{comparisonResult.platformRecords.toLocaleString()}</strong></div>
            <div><span>Workbook records</span><strong>{comparisonResult.comparisonRecords.toLocaleString()}</strong></div>
            <div className={comparisonResult.missingCaseIds?.assessments||comparisonResult.missingCaseIds?.excel?"unmatched":"matched"}><span>Missing Case IDs</span><strong>{((comparisonResult.missingCaseIds?.assessments||0)+(comparisonResult.missingCaseIds?.excel||0)).toLocaleString()}</strong></div>
            <div className="matched"><span>Fully matched</span><strong>{comparisonResult.matched.toLocaleString()}</strong></div>
            <div className={comparisonResult.unmatched?"unmatched":"matched"}><span>Needs review</span><strong>{comparisonResult.unmatched.toLocaleString()}</strong></div>
          </div>
          <div className="reconciliation-export"><ExcelDownloadButton className="soft" onClick={exportComparison} busy={comparisonExporting} disabled={!comparisonResult.rows.length}>Download issues (Excel)</ExcelDownloadButton><small>Assessment Lawyer is used first; the Excel Lawyer is used only when the Assessment value is blank.</small></div>
          {comparisonResult.warnings.length>0&&<details className="reconciliation-warnings"><summary>{comparisonResult.warnings.length} workbook column warning{comparisonResult.warnings.length===1?"":"s"}</summary>{comparisonResult.warnings.map((warning)=><p key={warning}>{warning}</p>)}</details>}
          <div className="legal-table-wrap reconciliation-table"><table><thead><tr><th className="no-sort">Note group</th><th className="no-sort">Beneficiary ID</th><th className="no-sort">Name</th><th className="no-sort">Different field</th><th className="no-sort">Assessment value</th><th className="no-sort">Excel value</th><th className="no-sort">Action</th></tr></thead><tbody>{comparisonResult.rows.length?Array.from(new Set(comparisonResult.rows.map((row)=>row.note))).flatMap((note,groupIndex)=>{
            const groupRows=comparisonResult.rows.filter((row)=>row.note===note);
            const groupLineCount=groupRows.reduce((count,row)=>count+Math.max(1,row.differences?.length||0),0);
            let firstGroupLine=true;
            return groupRows.flatMap((row)=>{
              const differences=row.differences?.length?row.differences:[{field:"Record",assessment:"—",excel:"—"}];
              return differences.map((difference,differenceIndex)=>{
                const showGroup=firstGroupLine;firstGroupLine=false;
                return <tr className={`reconciliation-group reconciliation-group-${groupIndex%6}`} key={`${row.beneficiaryId}-${difference.field}-${differenceIndex}`}>
                  {showGroup&&<td className="reconciliation-note-group" rowSpan={groupLineCount}><div className="reconciliation-note-group-content"><strong>{note}</strong><small>{groupRows.length} case{groupRows.length===1?"":"s"}</small></div></td>}
                  {differenceIndex===0?<><td rowSpan={differences.length}>{row.beneficiaryId}</td><td rowSpan={differences.length}>{value(row.name)}</td></>:null}
                  <td><span className="reconciliation-field">{difference.field}</span></td><td className="reconciliation-assessment-value">{value(difference.assessment)}</td><td className="reconciliation-excel-value">{value(difference.excel)}</td>
                  {differenceIndex===0?<td rowSpan={differences.length}>{row.caseAvailable&&<button className="table-action" onClick={()=>onOpenCase(row.beneficiaryId)}>Open case<ArrowRight/></button>}</td>:null}
                </tr>;
              });
            });
          }):<tr><td colSpan={7}><div className="reconciliation-empty"><CheckCircle2/><strong>All records match for {comparisonResult.month}</strong></div></td></tr>}</tbody></table></div>
        </>}
      </section>}
      {drawer&&<><button className="filter-backdrop" aria-label="Close filters" onClick={()=>setDrawer(false)}/><aside className="case-filter-drawer"><header><div><span className="eyebrow">DETENTION FILTERS</span><h2>Filter detention cases</h2></div><button onClick={()=>setDrawer(false)}><X/></button></header><div className="case-filter-scroll review-checkbox-filters">{Object.entries(data?.filterOptions||{}).map(([label,values])=><details key={label} open={Boolean(filters[label]?.length)}><summary><span>{label}</span>{filters[label]?.length>0&&<b>{filters[label].length}</b>}<ChevronDown/></summary><div>{values.map((item)=><label key={item}><input type="checkbox" checked={filters[label]?.includes(item)||false} onChange={()=>updateFilter(label,filters[label]?.includes(item)?filters[label].filter((value)=>value!==item):[...(filters[label]||[]),item])}/><span>{/date/i.test(label)?formatFilterMonth(item):item}</span></label>)}</div></details>)}</div><footer><button className="soft" disabled={!activeCount} onClick={()=>{setFilters({});setPage(1)}}>Clear all</button><button className="primary" onClick={()=>setDrawer(false)}>Apply filters {activeCount>0&&`(${activeCount})`}</button></footer></aside></>}
      {drillMenu&&createPortal(<div ref={drillMenuRef} className="detention-drill-menu" role="menu" aria-label="Chart table options" style={{left:drillMenu.x,top:drillMenu.y}}><span>Filtered records</span><button role="menuitem" autoFocus onClick={()=>{setDrillMenu(null);setPage(1);setTab("records")}}><TableProperties/><div><strong>Open detail table</strong><small>Keep all active filters</small></div><ArrowRight/></button><button role="menuitem" className="cancel" onClick={()=>setDrillMenu(null)}><X/>Cancel</button></div>,document.body)}
    </div>
  );
}

function IraqDetentionMapMetrics({items,selected,onSelect,showFooter=true,expandable=true,showHeader=true}:{items:{label:string;count:number;detained:number;released:number;values:string[]}[];selected:string[];onSelect:(values:string[])=>void;showFooter?:boolean;expandable?:boolean;showHeader?:boolean}) {
  const [geojson,setGeojson]=useState<any>(null),[error,setError]=useState(""),[hover,setHover]=useState<{name:string;x:number;y:number;below:boolean}|null>(null),[expanded,setExpanded]=useState(false),[pivotOpen,setPivotOpen]=useState(false);
  const stageRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{fetch("/iraq-governorates.geojson").then((response)=>{if(!response.ok)throw new Error("Map boundaries could not be loaded.");return response.json()}).then(setGeojson).catch((reason)=>setError(reason.message||"Map boundaries could not be loaded."))},[]);
  if(error)return <section className="glass detention-map detention-trend-empty"><div><strong>Detention cases by governorate</strong><span>{error}</span></div></section>;
  if(!geojson)return <section className="glass detention-map detention-map-loading"><div className="button-spinner"/><span>Loading Iraq governorate map…</span></section>;
  const shapes=projectGovernorates((geojson.features||[]) as MapFeature[]),byName=new Map(items.map((item)=>[item.label,item])),max=Math.max(1,...items.map((item)=>item.detained));
  const detainedTotal=items.reduce((sum,item)=>sum+item.detained,0);
  const activate=(name:string)=>{const item=byName.get(name);if(item?.values?.length)onSelect(item.values)};
  const showPointer=(name:string,event:{clientX:number;clientY:number})=>{const bounds=stageRef.current?.getBoundingClientRect();if(!bounds)return;const rawY=event.clientY-bounds.top;setHover({name,x:Math.max(112,Math.min(bounds.width-112,event.clientX-bounds.left)),y:Math.max(28,rawY-12),below:rawY<190})};
  const showKeyboard=(name:string,label:[number,number])=>{const bounds=stageRef.current?.getBoundingClientRect();if(!bounds)return;const rawY=bounds.height*label[1]/700;setHover({name,x:Math.max(112,Math.min(bounds.width-112,bounds.width*label[0]/760)),y:Math.max(28,rawY),below:rawY<190})};
  const hoveredItem=hover?byName.get(hover.name):undefined;
  return <><section className="glass detention-map">
    {showHeader&&<header><div><h3>Detention cases by governorate</h3><p>2026 only · Detained uses assessment date; Released uses release date and a current status containing Released</p></div><div className="detention-map-header-actions"><strong>{items.reduce((sum,item)=>sum+item.detained,0).toLocaleString()}</strong><div className="chart-actions"><div className="export-buttons"><button onClick={()=>{const svg=stageRef.current?.querySelector("svg");if(svg)void exportSvgChart(svg,"detention-cases-by-governorate","png")}}><Download/>PNG</button><button onClick={()=>{const svg=stageRef.current?.querySelector("svg");if(svg)void exportSvgChart(svg,"detention-cases-by-governorate","pdf")}}><FileText/>PDF</button></div><button className="expand-button map-pivot-button" onClick={()=>setPivotOpen(true)}><Expand/>Pivot table</button>{expandable&&<button className="expand-button" onClick={()=>setExpanded(true)}><Maximize2/>Expand</button>}</div></div></header>}
    <div className="detention-map-stage" ref={stageRef}>
      <svg className="detention-map-svg" viewBox="0 0 760 700" role="img" aria-label="Detained assessments and qualifying releases by Iraq governorate">
        <g className="detention-map-paths">{shapes.map((shape)=>{const item=byName.get(shape.name),detained=item?.detained||0,released=item?.released||0,interactive=Boolean(item?.values?.length),active=Boolean(item?.values?.some((value)=>selected.includes(value)));return <path key={shape.name} className={`detention-map-region map-intensity-${mapIntensity(detained,max)} ${interactive?"interactive":""} ${active?"selected":""}`} d={shape.path} fillRule="evenodd" role={interactive?"button":undefined} tabIndex={interactive?0:undefined} aria-label={`${shape.name}: ${detained} detained assessments and ${released} released${active?", selected":""}`} aria-pressed={interactive?active:undefined} onPointerEnter={(event)=>showPointer(shape.name,event)} onPointerMove={(event)=>showPointer(shape.name,event)} onPointerLeave={()=>setHover(null)} onFocus={()=>showKeyboard(shape.name,shape.label)} onBlur={()=>setHover(null)} onClick={()=>interactive&&activate(shape.name)} onKeyDown={(event)=>{if(interactive&&(event.key==="Enter"||event.key===" ")){event.preventDefault();activate(shape.name)}}}><title>{shape.name}: {detained.toLocaleString()} detained assessments; {released.toLocaleString()} released</title></path>})}</g>
        <g className="detention-map-labels" aria-hidden="true">{shapes.map((shape)=>{const detained=byName.get(shape.name)?.detained||0;return <text key={shape.name} x={shape.label[0]} y={shape.label[1]} textAnchor="middle"><tspan x={shape.label[0]}>{shape.name}</tspan>{detained>0&&<tspan className="map-count" x={shape.label[0]} dy="13">{detained.toLocaleString()}</tspan>}</text>})}</g>
      </svg>
      {hover&&<div className={`detention-map-tooltip${hover.below?" below":""}`} style={{left:hover.x,top:hover.y}} role="status"><strong>{hover.name}</strong><div><span className="assessment"><i/>Detained assessments<b>{(hoveredItem?.detained||0).toLocaleString()}</b></span><small>Based on Date of Assessment</small></div><div><span className="release"><i/>Released<b>{(hoveredItem?.released||0).toLocaleString()}</b></span><small>Release date + Released status</small></div></div>}
      <div className="detention-map-legend" aria-label="Detained assessment color scale"><span>Detained assessments</span>{[0,1,2,3,4,5].map((level)=><i key={level} className={`map-intensity-${level}`}/>)}<small>Low</small><small>High</small></div>
    </div>
    {showFooter&&<footer>{selected.length?<span>{selected.length} governorate value{selected.length===1?"":"s"} selected</span>:<span>All governorates</span>}</footer>}
  </section>{pivotOpen&&createPortal(<div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Detention governorate pivot table"><button className="case-modal-backdrop" aria-label="Close pivot table" onClick={()=>setPivotOpen(false)}/><section className="indicator-modal-panel map-pivot-modal"><header><div><span>INTERACTIVE DETAIL</span><h2>Detention cases by governorate</h2><p>Counts and percentages use the active detention filters.</p></div><div className="pivot-actions"><button className="primary pivot-download" onClick={()=>void exportTableWorkbook("detention-governorate-pivot.xlsx",["Governorate","Detained assessments","Released","Share of detained assessments"],items.map((item)=>({Governorate:item.label,"Detained assessments":item.detained,Released:item.released,"Share of detained assessments":`${(item.detained/Math.max(detainedTotal,1)*100).toFixed(1)}%`})))}><Download/>Excel</button><button className="icon" onClick={()=>setPivotOpen(false)} aria-label="Close pivot table"><X/></button></div></header><div className="indicator-modal-scroll"><div className="table-wrap"><table><thead><tr><th>Governorate</th><th>Detained assessments</th><th>Released</th><th>Share of detained assessments</th></tr></thead><tbody>{items.map((item)=><tr key={item.label}><td>{item.label}</td><td>{item.detained.toLocaleString()}</td><td>{item.released.toLocaleString()}</td><td>{(item.detained/Math.max(detainedTotal,1)*100).toFixed(1)}%</td></tr>)}<tr className="indicator-analysis-total"><td>Total</td><td>{detainedTotal.toLocaleString()}</td><td>{items.reduce((sum,item)=>sum+item.released,0).toLocaleString()}</td><td>{detainedTotal?"100.0%":"0.0%"}</td></tr></tbody></table></div></div></section></div>,document.body)}{expanded&&createPortal(<div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Expanded detention governorate map"><button className="case-modal-backdrop" aria-label="Close map" onClick={()=>setExpanded(false)}/><section className="indicator-modal-panel"><header><div><span>2026 DETENTION ANALYSIS</span><h2>Detention cases by governorate</h2><p>Hover a governorate for detained assessments and released cases.</p></div><button className="icon" onClick={()=>setExpanded(false)} aria-label="Close map"><X/></button></header><div className="indicator-modal-scroll"><IraqDetentionMapMetrics items={items} selected={selected} onSelect={onSelect} showFooter={false} expandable={false} showHeader={false}/></div></section></div>,document.body)}</>;
}

function IraqDetentionMap({items,selected,onSelect}:{items:{label:string;count:number;values:string[]}[];selected:string[];onSelect:(values:string[])=>void}) {
  const [geojson,setGeojson]=useState<any>(null),[error,setError]=useState("");
  useEffect(()=>{fetch("/iraq-governorates.geojson").then((response)=>{if(!response.ok)throw new Error("Map boundaries could not be loaded.");return response.json()}).then(setGeojson).catch((reason)=>setError(reason.message||"Map boundaries could not be loaded."))},[]);
  if(error)return <section className="glass detention-map detention-trend-empty"><div><strong>Detention cases by governorate</strong><span>{error}</span></div></section>;
  if(!geojson)return <section className="glass detention-map detention-map-loading"><div className="button-spinner"/><span>Loading Iraq governorate map…</span></section>;
  const features=(geojson.features||[]) as MapFeature[],shapes=projectGovernorates(features),byName=new Map(items.map((item)=>[item.label,item])),max=Math.max(1,...items.map((item)=>item.count));
  const activate=(name:string)=>{const item=byName.get(name);if(item?.values?.length)onSelect(item.values)};
  return <section className="glass detention-map"><header><div><h3>Detention cases by governorate</h3><p>Based on Detention Governorate / محافظة الاحتجاز · Click a governorate to filter all detention analysis</p></div><strong>{items.reduce((sum,item)=>sum+item.count,0).toLocaleString()}</strong></header><div className="detention-map-stage"><svg className="detention-map-svg" viewBox="0 0 760 700" role="img" aria-label="Detention cases by Iraq governorate">{shapes.map((shape)=>{const item=byName.get(shape.name),count=item?.count||0,interactive=Boolean(item?.values?.length),active=Boolean(item?.values?.some((value)=>selected.includes(value)));return <g key={shape.name} className={`detention-map-region ${interactive?"interactive":""} ${active?"selected":""}`} role={interactive?"button":undefined} tabIndex={interactive?0:undefined} aria-label={`${shape.name}: ${count} detention cases${active?", selected":""}`} aria-pressed={interactive?active:undefined} onClick={()=>interactive&&activate(shape.name)} onKeyDown={(event)=>{if(interactive&&(event.key==="Enter"||event.key===" ")){event.preventDefault();activate(shape.name)}}}><path className={`map-intensity-${mapIntensity(count,max)}`} d={shape.path} fillRule="evenodd"><title>{shape.name}: {count.toLocaleString()} detention cases</title></path><text x={shape.label[0]} y={shape.label[1]} textAnchor="middle"><tspan x={shape.label[0]}>{shape.name}</tspan>{count>0&&<tspan className="map-count" x={shape.label[0]} dy="13">{count.toLocaleString()}</tspan>}</text></g>})}</svg><div className="detention-map-legend" aria-label="Map color scale"><span>Cases</span>{[0,1,2,3,4,5].map((level)=><i key={level} className={`map-intensity-${level}`}/>) }<small>Low</small><small>High</small></div></div><footer>{selected.length?<span>{selected.length} governorate value{selected.length===1?"":"s"} selected</span>:<span>All governorates</span>}</footer></section>;
}

function DetentionTrendChart({rows}:{rows:{month:string;detainedAssessments:number;released:number}[]}) {
  if(!rows.length)return <section className="glass detention-trend detention-trend-empty"><BarChart3/><div><strong>Detention and release trend</strong><span>No valid assessment or release dates are available for the active filters.</span></div></section>;
  const width=1000,height=270,pad={left:48,right:20,top:24,bottom:42},max=Math.max(1,...rows.flatMap((row)=>[row.detainedAssessments,row.released]));
  const points=(key:"detainedAssessments"|"released")=>rows.map((row,index)=>`${pad.left+(index*Math.max(1,width-pad.left-pad.right))/Math.max(1,rows.length-1)},${pad.top+(height-pad.top-pad.bottom)*(1-row[key]/max)}`).join(" ");
  return <section className="glass detention-trend"><header><div><span className="eyebrow">MONTHLY TREND</span><h3>Detained assessments and releases</h3></div><div className="trend-legend"><span><i className="assessment"/>Assessment date</span><span><i className="release"/>Release/deportation date</span></div></header><div className="detention-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly detained assessments and releases comparison"><line x1={pad.left} y1={height-pad.bottom} x2={width-pad.right} y2={height-pad.bottom} className="chart-axis"/>{[0,.25,.5,.75,1].map((step)=><g key={step}><line x1={pad.left} y1={pad.top+(height-pad.top-pad.bottom)*(1-step)} x2={width-pad.right} y2={pad.top+(height-pad.top-pad.bottom)*(1-step)} className="chart-grid"/><text x={pad.left-9} y={pad.top+(height-pad.top-pad.bottom)*(1-step)+4} textAnchor="end">{Math.round(max*step)}</text></g>)}<polyline points={points("detainedAssessments")} className="trend-line assessment"/><polyline points={points("released")} className="trend-line release"/>{rows.map((row,index)=>{const x=pad.left+(index*Math.max(1,width-pad.left-pad.right))/Math.max(1,rows.length-1);return <g key={row.month}><circle cx={x} cy={pad.top+(height-pad.top-pad.bottom)*(1-row.detainedAssessments/max)} r="3.5" className="trend-dot assessment"><title>{`${row.month}: ${row.detainedAssessments} detained assessments`}</title></circle><circle cx={x} cy={pad.top+(height-pad.top-pad.bottom)*(1-row.released/max)} r="3.5" className="trend-dot release"><title>{`${row.month}: ${row.released} releases`}</title></circle>{(index===0||index===rows.length-1||index%Math.max(1,Math.ceil(rows.length/8))===0)&&<text x={x} y={height-15} textAnchor="middle">{row.month}</text>}</g>})}</svg></div></section>;
}

const ASSESSMENT_OMIT = [
  "Beneficiary ID",
  "Gender النوع الاجتماعي",
  "DoB / تأريخ الولاده",
  "Age",
  "Age group",
  "Age Gender Group",
  "UNHCR Age Group",
  "Nationality الجنسية",
  "Nationality Stateless",
  "Community Type",
  "Nation of Birth / بلد الولاده",
  "Assessments (Indicator 1)",
  "Legal Service (Type of Service Provided / نوع الخدمة)",
  "Service Status حالة الخدمة",
  "Type of Document نوع الوثيقة",
  "Type of service with Civil",
  "Date Service Completed تاريخ انجاز الخدمة",
  "Protection Category / الفئة الرئيسيه للحمايه",
  "Type of vulnerabilities",
  "Legal Service Type of Service Provided - with Status",
];
const SERVICE_OMIT = [
  "Is successfully secured civil documentation through ad hoc committee mobile missions",
  "Is successfully secured civil documentation through mobile CAD missions supported",
  "Assessment Status حالة التقييم",
  "Date of Assessment Closure تاريخ إغلاق التقييم",
  "Date of Assessment تاريخ التقييم",
  "Is the beneficiary detained هل المستفيد موقوف",
  "Community Type",
  "Case Complexity from Assessment",
  "Nationality Stateless",
  "Nationality الجنسية",
  "Age Gender Group",
  "UNHCR Age Group",
  "Age group",
  "Age",
  "DoB / تأريخ الولاده",
  "Gender النوع الاجتماعي",
];
const getField = (row: any, hint: string) => {
  const key = Object.keys(row || {}).find((x) =>
    x.toLowerCase().includes(hint.toLowerCase()),
  );
  return key ? row[key] : "";
};

type CasesExportTask={preparing:boolean;error:string};
let casesExportTask:CasesExportTask={preparing:false,error:""};
let casesExportController:AbortController|null=null;
const casesExportListeners=new Set<(task:CasesExportTask)=>void>();
const getCasesExportTask=()=>casesExportTask;
const notifyCasesExportTask=()=>casesExportListeners.forEach((listener)=>listener(casesExportTask));
const subscribeCasesExportTask=(listener:(task:CasesExportTask)=>void)=>{casesExportListeners.add(listener);return()=>{casesExportListeners.delete(listener)}};
const startCasesExportTask=(query:string,filters:Record<string,string[]>)=>{
  if(casesExportTask.preparing)return;
  const controller=new AbortController();casesExportController=controller;casesExportTask={preparing:true,error:""};notifyCasesExportTask();
  void exportLegalCases(query,filters,"filtered-beneficiary-cases.xlsx",[],controller.signal).catch((reason:any)=>{
    if(reason?.name!=="AbortError")casesExportTask={preparing:false,error:reason?.message||"Excel export failed."};
  }).finally(()=>{
    if(casesExportController!==controller)return;
    casesExportController=null;
    if(casesExportTask.preparing)casesExportTask={preparing:false,error:""};
    notifyCasesExportTask();
  });
};
const cancelCasesExportTask=()=>{casesExportController?.abort();casesExportController=null;casesExportTask={preparing:false,error:""};notifyCasesExportTask()};

function Cases({
  metadata,
  initialQuery,
  onQueryUsed,
  onOpenCase,
}: {
  metadata: LegalMetadata;
  initialQuery: string;
  onQueryUsed: () => void;
  onOpenCase: (id: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery),
    [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [drawer, setDrawer] = useState(false),
    [viewMode, setViewMode] = useState<"cards" | "table">("cards"),
    [filterOptions, setFilterOptions] = useState<
      { dataset:string;label:string;columns:{key:string;name:string;values:string[]}[] }[]
    >([]),
    [filters, setFilters] = useState<Record<string, string[]>>({}),
    [filterSearch, setFilterSearch] = useState(""),
    [tablePage, setTablePage] = useState(1),
    [sortColumn, setSortColumn] = useState(""),
    [sortDirection, setSortDirection] = useState<"asc"|"desc">("asc"),
    [selectedColumns, setSelectedColumns] = useState<string[]>([]),
    [columnDrawer, setColumnDrawer] = useState(false),
    [columnSearch, setColumnSearch] = useState(""),
    [error, setError] = useState("");
  const [exportTask,setExportTask]=useState(getCasesExportTask);
  useEffect(()=>subscribeCasesExportTask(setExportTask),[]);
  useEffect(()=>{if(exportTask.error)setError(exportTask.error)},[exportTask.error]);
  const liveSearchReady = useRef(false);
  const run = (term=query,nextFilters=filters,nextView=viewMode,nextPage=tablePage,nextSort=sortColumn,nextDirection=sortDirection) => {
    setBusy(true);
    setError("");
    getLegalCase(term,nextFilters,{viewMode:nextView,page:nextPage,pageSize:100,sortColumn:nextSort,sortDirection:nextDirection,columns:selectedColumns})
      .then((next) => {setData(next);if(nextView==="table"&&!selectedColumns.length)setSelectedColumns(next.columns.map((column) => column.key))})
      .catch((reason) => setError(reason.message || "Unable to load beneficiary cases."))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    run(initialQuery, {});
    getLegalCaseFilters().then((x) => setFilterOptions(x.groups));
    onQueryUsed();
  }, []);
  useEffect(() => {
    if (!liveSearchReady.current) {
      liveSearchReady.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      setTablePage(1);
      run(query, filters, viewMode, 1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);
  const activeCount = Object.values(filters).reduce(
      (sum, items) => sum + items.length,
      0,
    ),
    toggle = (column: string, item: string) =>
      setFilters((current) => ({
        ...current,
        [column]: current[column]?.includes(item)
          ? current[column].filter((x) => x !== item)
          : [...(current[column] || []), item],
      }));
  const clear = () => {
    setFilters({});
    setDrawer(false);
    setTablePage(1);
    run(query,{},viewMode,1);
  };
  return (
    <>
      {error && <div className="error glass">{error}</div>}
      <LegalScrollControls search={query} onSearch={setQuery} onSearchSubmit={()=>{setTablePage(1);run(query,filters,viewMode,1)}} searchPlaceholder="Search cases" onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={clear}>
      <div className="case-search glass sticky-case-search">
        <div className="case-search-title">
          <Search />
          <div>
            <strong>Find a beneficiary case</strong>
            <span>Search by Case ID, Assessment ID, Service ID, name, contact number, national ID, UNHCR or ASSIST number.</span>
          </div>
          <span className="case-header-total"><strong>{data?.totalCases || data?.totalRows || 0}</strong> cases{busy ? " · Updating…" : ""}</span>
          <span className="view-switch case-view-switch" aria-label="View mode">
            <button
              className={viewMode === "cards" ? "active" : ""}
              onClick={() => {setViewMode("cards");setTablePage(1);run(query,filters,"cards",1)}}
              aria-label="Card view"
              title="Card view"
            >
              <LayoutDashboard />
            </button>
            <button
              className={viewMode === "table" ? "active" : ""}
              onClick={() => {setViewMode("table");setTablePage(1);run(query,filters,"table",1)}}
              aria-label="Table view"
              title="Table view"
            >
              <TableProperties />
            </button>
          </span>
        </div>
        <div className="legal-toolbar">
          <label>
            <input
              className="table-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {if(e.key === "Enter"){setTablePage(1);run(query,filters,viewMode,1)}}}
              placeholder="Search cases"
            />
          </label>
          <button className={`primary case-export-button${exportTask.preparing?" is-preparing":""}`} aria-busy={exportTask.preparing} aria-label={exportTask.preparing?"Cancel Excel download":"Download Excel"} title={exportTask.preparing?"Cancel Excel download":"Download Excel"} onClick={()=>{if(exportTask.preparing)cancelCasesExportTask();else{setError("");startCasesExportTask(query,filters)}}}>
            <span className="case-export-content"><Download/><span className="case-export-label">Excel</span></span>
            {exportTask.preparing&&<><span className="button-spinner case-export-spinner" aria-hidden="true"/><span className="case-export-cancel"><X/><span className="case-export-label">Cancel</span></span></>}
          </button>
          <button
            className="soft case-filter-button"
            onClick={() => setDrawer(true)}
          >
            <SlidersHorizontal />
            All filters{activeCount > 0 && <b>{activeCount}</b>}
          </button>
          <button className="soft case-clear" disabled={!activeCount} onClick={clear}><RotateCcw/>Clear</button>
        </div>
      </div>
      </LegalScrollControls>
      <div className="case-results-summary" hidden>
          <span><strong>{data?.totalCases || data?.totalRows || 0}</strong> beneficiary cases{busy ? " · Updating…" : ""}</span>
      </div>
      {busy && !data && <LegalSkeleton variant="cases" embedded />}
      {false && (
        <div className="section-heading">
          <div>
            <h2>Recent beneficiary cases</h2>
            <p>Open a case below or search and filter the complete caseload.</p>
          </div>
        </div>
      )}
      {data && viewMode === "cards" && data.cases?.length === 0 && (
        <div className="glass legal-empty">
          <Search />
          <h2>No matching cases</h2>
          <p>Check the search term or remove one or more filters.</p>
        </div>
      )}
      {viewMode === "cards" ? (
        data?.cases?.map((item: any, i: number) => (
          <CaseTree key={i} item={item} metadata={metadata} onOpenCase={onOpenCase} />
        ))
      ) : (
        <div className={`case-table-refresh ${busy ? "refreshing" : ""}`}><HierarchicalCaseTable
          cases={data?.cases || []} onOpenCase={onOpenCase}
          page={data?.page || tablePage} total={data?.totalRows || 0}
          onPageChange={(next)=>{setTablePage(next);run(query,filters,"table",next)}}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={(column) => {const direction=sortColumn===column&&sortDirection==="asc"?"desc":"asc";setSortColumn(column);setSortDirection(direction);setTablePage(1);run(query,filters,"table",1,column,direction)}}
        />{busy && data && <div className="compact-table-skeleton" aria-label="Refreshing table"><i/><i/><i/></div>}</div>
      )}{" "}
      {drawer && (
        <>
          <button
            className="filter-backdrop"
            aria-label="Close filters"
            onClick={() => setDrawer(false)}
          />
          <aside className="case-filter-drawer">
            <header>
              <div>
                <span className="eyebrow">CASE FILTERS</span>
                <h2>Filter beneficiary cases</h2>
              </div>
              <button onClick={() => setDrawer(false)}>
                <X />
              </button>
            </header>
            <label className="filter-search">
              <Search />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search filters"
              />
            </label>
            <div className="case-filter-scroll">
              {filterOptions.flatMap((group) => group.columns.map((option) => ({...option,label: `${group.label} · ${option.name}`}))).filter((option) => option.label.toLowerCase().includes(filterSearch.toLowerCase())).map((option) => (
                  <details
                    key={option.key}
                    open={Boolean(filters[option.key]?.length)}
                  >
                    <summary>
                      <span>{option.label}</span>
                      {filters[option.key]?.length > 0 && (
                        <b>{filters[option.key].length}</b>
                      )}
                      <ChevronDown />
                    </summary>
                    <div>
                      {option.values.map((item) => (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={
                              filters[option.key]?.includes(item) || false
                            }
                            onChange={() => toggle(option.key, item)}
                          />
                          <span>{formatFilterMonth(item)}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
            </div>
            <footer>
              <button className="soft" onClick={clear} disabled={!activeCount}>
                Clear all
              </button>
              <button
                className="primary"
                onClick={() => {
                  setDrawer(false);
                  setTablePage(1);run(query,filters,viewMode,1);
                }}
              >
                Apply filters {activeCount > 0 && `(${activeCount})`}
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
function HierarchicalCaseTable({cases,page,total,onPageChange,sortColumn,sortDirection,onSort,onOpenCase}:{cases:any[];page:number;total:number;onPageChange:(page:number)=>void;sortColumn:string;sortDirection:"asc"|"desc";onSort:(column:string)=>void;onOpenCase:(id:string)=>void}) {
  const [selected,setSelected]=useState<Map<string,Record<string,unknown>>>(new Map());
  const summaryColumns=[["Lawyer","Lawyer"],["beneficiaries::Case ID","Case ID"],["beneficiaries::Name (Filter Color Red)","Name"],["beneficiaries::Project","Project"],["beneficiaries::Project Location","Location"],["beneficiaries::DoB","Date of birth"]] as [string,string][];
  const rowFor=(item:any)=>({"Case ID":String(getField(item.beneficiary,"Case ID")||""),Name:String(getField(item.beneficiary,"Name (Filter Color Red)")||""),Project:String(getField(item.beneficiary,"Project")||""),Location:String(getField(item.beneficiary,"Project Location")||""),Lawyer:String((item.lawyers||[]).join(", ")||"Unassigned")});
  const displayedCases=[...cases].sort((left,right)=>Number(selected.has(String(getField(right.beneficiary,"Case ID")||"")))-Number(selected.has(String(getField(left.beneficiary,"Case ID")||""))));
  return <div className="glass case-table hierarchical-case-table"><div className="legal-card-heading"><div className="indicator-total-block detention-table-total"><strong>{total.toLocaleString()}</strong><span>Total</span></div><TableSelectionActions selected={selected} filename="selected-beneficiary-cases.xlsx" onClear={()=>setSelected(new Map())} onDownloadSelected={()=>exportLegalCases("",{},"selected-beneficiary-cases.xlsx",Array.from(selected.keys()))} iconOnly/><Pager compact page={page} total={total} onChange={onPageChange}/></div><table><thead><tr><th><input aria-label="Select visible cases" type="checkbox" checked={Boolean(cases.length)&&cases.every((item)=>selected.has(String(getField(item.beneficiary,"Case ID")||"")))} onChange={(event)=>setSelected((current)=>{const next=new Map(current);cases.forEach((item)=>{const row=rowFor(item),key=row["Case ID"];if(event.target.checked)next.set(key,row);else next.delete(key)});return next})}/></th>{summaryColumns.map(([key,label])=><th key={key}><button className={sortColumn===key?"active":""} onClick={()=>onSort(key)}><span>{label}</span><b>{sortColumn===key?(sortDirection==="asc"?"▲":"▼"):"↕"}</b></button></th>)}<th>Connected records</th></tr></thead><tbody>{displayedCases.map((item,index)=>{const row=rowFor(item),key=row["Case ID"],counts=item.counts||{};return <tr className={selected.has(key)?"case-row-selected":""} key={key||index}><td><input aria-label="Select case" type="checkbox" checked={selected.has(key)} onChange={()=>setSelected((current)=>{const next=new Map(current);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td><td>{value(row.Lawyer)}</td><td><button className="table-action" onClick={()=>onOpenCase(key)} aria-label={`Open case ${key}`}>{value(key)}<ArrowRight/></button></td><td>{value(row.Name)}</td><td>{value(row.Project)}</td><td>{value(row.Location)}</td><td>{value(getField(item.beneficiary,"DoB"))}</td><td><div className="case-connected-summary"><span><b>{counts.assessments||0}</b><small>Assessments</small></span><span><b>{counts.services||0}</b><small>Services</small></span>{counts.followups>0&&<span><b>{counts.followups}</b><small>Follow-ups</small></span>}{counts.fees>0&&<span><b>{counts.fees}</b><small>Legal fees</small></span>}</div></td></tr>})}</tbody></table></div>;
  /* legacy flat renderer retained below only as unreachable migration reference */
  const rows:Record<string,unknown>[]=[];const columns:{key:string;label:string;dataset:string}[]=[];
  const groups:{label:string;count:number}[]=[];
  columns.forEach((column) => {const last=groups[groups.length-1];if(last?.label===column.dataset)last.count+=1;else groups.push({label:column.dataset,count:1})});
  return <div className="glass case-table connected-case-table"><table><thead>
    <tr className="case-dataset-head">{groups.map((group) => <th key={group.label} colSpan={group.count}>{group.label}</th>)}</tr>
    <tr>{columns.map((column) => <th key={column.key}><button className={sortColumn===column.key?"active":""} onClick={() => onSort(column.key)}><span>{column.label}</span><b>{sortColumn===column.key?(sortDirection==="asc"?"▲":"▼"):"↕"}</b></button></th>)}</tr>
  </thead><tbody>{rows.map((row,index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{value(row[column.key])}</td>)}</tr>)}</tbody></table></div>;
}

function ExpandableCaseRow({item}:{item:any}) {
  const [open,setOpen]=useState(false),beneficiary=item.beneficiary||{},caseId=getField(beneficiary,"Case ID");
  return <><tr className={open?"case-summary-row open":"case-summary-row"}><td><button className="case-expand" aria-expanded={open} aria-label={`${open?"Collapse":"Expand"} case ${caseId}`} onClick={()=>setOpen((shown)=>!shown)}><ChevronDown/></button></td><td>{value((item.lawyers||[]).join(", ")||"Unassigned")}</td><td>{value(caseId)}</td><td>{value(getField(beneficiary,"Name (Filter Color Red)"))}</td><td>{value(getField(beneficiary,"Project"))}</td><td>{value(getField(beneficiary,"Project Location"))}</td><td>{value(getField(beneficiary,"DoB"))}</td><td><div className="case-count-pills"><span>{item.counts?.assessments||0} assessments</span><span>{item.counts?.services||0} services</span><span>{item.counts?.followups||0} follow-ups</span><span>{item.counts?.fees||0} fees</span></div></td></tr>{open&&<tr className="case-hierarchy-row"><td colSpan={8}><div className="case-hierarchy"><header><div><span className="eyebrow">CONNECTED CASE</span><strong>{value(getField(beneficiary,"Name (Filter Color Red)"))}</strong></div><RecordFields label="View all beneficiary fields" record={beneficiary}/></header>{item.assessments?.length?item.assessments.map((node:any,index:number)=><AssessmentBranch node={node} key={String(getField(node.assessment,"Assessment ID")||index)}/>):<div className="hierarchy-empty">No connected assessments</div>}</div></td></tr>}</>;
}
function AssessmentBranch({node}:{node:any}) {const assessment=node.assessment||{};return <section className="assessment-branch"><header><div><span>Assessment</span><strong>{value(getField(assessment,"Assessment ID"))}</strong><small>{value(getField(assessment,"Date of Assessment"))} · {value(getField(assessment,"Assessment Status"))}</small></div><RecordFields label="View all assessment fields" record={assessment}/></header><div className="service-branch-list">{node.services?.length?node.services.map((serviceNode:any,index:number)=><ServiceBranch node={serviceNode} key={String(getField(serviceNode.service,"Service ID")||index)}/>):<div className="hierarchy-empty">No connected services</div>}</div></section>}
function ServiceBranch({node}:{node:any}) {const service=node.service||{};return <article className="service-branch"><header><div><span>Legal service</span><strong>{value(getField(service,"Service ID"))}</strong><small>{value(getField(service,"Type of Service"))} · {value(getField(service,"Service Status"))}</small></div><RecordFields label="View all service fields" record={service}/></header><div className="service-leaves"><RelatedRecords title="Follow-ups" rows={node.followups||[]}/><RelatedRecords title="Legal fees" rows={node.fees||[]}/></div></article>}
function RelatedRecords({title,rows}:{title:string;rows:any[]}) {return <section className="related-records"><header><strong>{title}</strong><span>{rows.length}</span></header>{rows.length?<div className="related-record-list">{rows.map((row,index)=><RecordFields key={index} label={`${title.slice(0,-1)} ${index+1}`} record={row}/>)}</div>:<small>None connected</small>}</section>}
function RecordFields({label,record}:{label:string;record:Record<string,unknown>}) {return <details className="record-fields"><summary>{label}</summary><div>{Object.entries(record||{}).map(([key,item])=><span key={key}><small>{key}</small><strong>{value(item)}</strong></span>)}</div></details>}

function CaseTable({
  cases,
  metadata,
}: {
  cases: any[];
  metadata: LegalMetadata;
}) {
  return (
    <div className="glass case-table">
      <table>
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Name</th>
            <th>Project</th>
            <th>Location</th>
            <th>Community</th>
            <th>Assessments</th>
            <th>Services</th>
            <th>Follow-ups</th>
            <th>Fees</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((item, i) => (
            <tr key={i}>
              <td colSpan={9}>
                <details>
                  <summary>
                    <span>{value(item.beneficiary["Case ID"])}</span>
                    <strong>
                      {item.beneficiary["Name (Filter Color Red)"] ||
                        "Not provided in source"}
                    </strong>
                    <span>{getField(item.beneficiary, "Project") || "—"}</span>
                    <span>
                      {getField(item.beneficiary, "Project Location") || "—"}
                    </span>
                    <span>
                      {getField(item.beneficiary, "Community Type") || "—"}
                    </span>
                    <b>{item.counts.assessments}</b>
                    <b>{item.counts.services}</b>
                    <b>
                      {metadata.availability.followupslogbooks
                        ? item.counts.followups
                        : "—"}
                    </b>
                    <b>
                      {metadata.availability.legalfees ? item.counts.fees : "—"}
                    </b>
                  </summary>
                  <div className="table-beneficiary-card">
                    <h3>Beneficiary information</h3>
                    <RecordGrid row={item.beneficiary} />
                    <button
                      className="primary"
                      onClick={() =>
                        exportLegalCases(
                          String(item.beneficiary["Case ID"] || ""),
                          {},
                          `case-${item.beneficiary["Case ID"]}.xlsx`,
                        )
                      }
                    >
                      <Download />
                      Excel
                    </button>
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CaseTree({ item, metadata, showBeneficiary = false, onOpenCase }: { item: any; metadata: LegalMetadata; showBeneficiary?: boolean; onOpenCase?: (caseId: string) => void }) {
  const [beneficiaryOpen,setBeneficiaryOpen]=useState(showBeneficiary);
  const counts = item.counts || {},
    caseId = String(item.beneficiary["Case ID"] || ""),
    beneficiaryName = String(item.beneficiary["Name (Filter Color Red)"] || "Name not provided in source");
  return (
    <article className="glass case-card">
      <header>
        <div>
          <span className="eyebrow">BENEFICIARY CASE</span>
          <h3 data-copy-value={beneficiaryName} title="Click to copy beneficiary name">{beneficiaryName}</h3>
          <p>
            Case ID: <strong data-copy-value={caseId} title="Click to copy Case ID">{value(caseId)}</strong>
          </p>
        </div>
        <div className="case-header-actions">
          <div className="case-counts">
            <span>
              <b>{counts.assessments || 0}</b> Assessments
            </span>
            <span>
              <b>{counts.services || 0}</b> Services
            </span>
            {metadata.availability.followupslogbooks && (
              <span>
                <b>{counts.followups || 0}</b> Follow-ups
              </span>
            )}
            {metadata.availability.legalfees && (
              <span>
                <b>{counts.fees || 0}</b> Fees
              </span>
            )}
          </div>
          <div className="case-card-actions">
            {onOpenCase && <button
              className="soft case-view-button"
              onClick={() => onOpenCase(caseId)}
              aria-label={`Open case ${caseId}`}
            >
              View <ArrowRight />
            </button>}
            <button
              className="primary"
              onClick={() => exportLegalCases(caseId, {}, `case-${caseId}.xlsx`)}
            >
              <Download />
              Excel
            </button>
          </div>
        </div>
      </header>
      <details className="beneficiary-profile" open={beneficiaryOpen} onToggle={(event)=>setBeneficiaryOpen(event.currentTarget.open)}>
        <summary>
          Beneficiary information <ChevronDown />
        </summary>
        <RecordGrid row={item.beneficiary} />
      </details>
      <div className="case-timeline">
        <div className="case-level-heading">
          <span>Assessments</span>
          <b>{item.assessments.length}</b>
        </div>
        {item.assessments.length ? (
          item.assessments.map((node: any, i: number) => (
            <AssessmentNode
              key={i}
              node={node}
              metadata={metadata}
              index={i + 1}
            />
          ))
        ) : (
          <div className="nested-empty">No linked assessments</div>
        )}
      </div>
    </article>
  );
}
function AssessmentNode({
  node,
  metadata,
  index,
}: {
  node: any;
  metadata: LegalMetadata;
  index: number;
}) {
  const id = node.assessment["Assessment ID"],
    need = englishOnly(
      getField(node.assessment, "Type of Legal Service Needed"),
    );
  return (
    <details className="assessment-node">
      <summary>
        <div className="node-title">
          <span>Assessment {index}</span>
          <strong>{need}</strong>
          <small>{value(id)}</small>
        </div>
        <div>
          <b>{node.services.length}</b> services
          <ChevronDown />
        </div>
      </summary>
      <RecordGrid row={node.assessment} omit={ASSESSMENT_OMIT} />
      <div className="service-list">
        <div className="case-level-heading">
          <span>Legal services</span>
          <b>{node.services.length}</b>
        </div>
        {node.services.length ? (
          node.services.map((service: any, i: number) => (
            <ServiceNode
              key={i}
              node={service}
              metadata={metadata}
              index={i + 1}
            />
          ))
        ) : (
          <div className="nested-empty">
            No legal services linked to this assessment
          </div>
        )}
      </div>
    </details>
  );
}
function ServiceNode({
  node,
  metadata,
  index,
}: {
  node: any;
  metadata: LegalMetadata;
  index: number;
}) {
  const serviceType = englishOnly(
    getField(node.service, "Type of Service Provided"),
  );
  return (
    <details className="service-node">
      <summary>
        <div className="node-title">
          <span>Service {index}</span>
          <strong>{serviceType}</strong>
          <small>{value(node.service["Service ID"])}</small>
        </div>
        <div className="nested-counts">
          {metadata.availability.followupslogbooks && (
            <b>{node.followups.length} follow-ups</b>
          )}
          {metadata.availability.legalfees && <b>{node.fees.length} fees</b>}
          <ChevronDown />
        </div>
      </summary>
      <RecordGrid row={node.service} omit={SERVICE_OMIT} />
      <div className="service-children">
        {metadata.availability.followupslogbooks ? (
          <NestedTable title="Follow-ups" rows={node.followups} />
        ) : (
          <Unavailable label="Follow-ups" />
        )}
        {metadata.availability.legalfees ? (
          <NestedTable title="Legal fees" rows={node.fees} />
        ) : (
          <Unavailable label="Legal fees" />
        )}
      </div>
    </details>
  );
}
function NestedTable({ title, rows }: { title: string; rows: any[] }) {
  const columns = Array.from(
    new Set(
      rows.flatMap((row) =>
        Object.keys(row).filter((key) => row[key] !== "" && row[key] !== null),
      ),
    ),
  );
  return (
    <section className="nested-records nested-table">
      <h4>
        {title} <b>{rows.length}</b>
      </h4>
      {rows.length ? (
        <div>
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{renderCell(row[c], c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="nested-empty">No linked {title.toLowerCase()}</div>
      )}
    </section>
  );
}
function RecordGrid({ row, omit = [] }: { row: any; omit?: string[] }) {
  return (
    <div className="case-record">
      {Object.entries(row)
        .filter(
          ([k, v]) =>
            v !== "" &&
            v !== null &&
            !omit.some(
              (item) => k.trim().toLowerCase() === item.trim().toLowerCase(),
            ),
        )
        .map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <strong>{renderCell(v, k)}</strong>
          </div>
        ))}
    </div>
  );
}
function Unavailable({ label }: { label: string }) {
  return (
    <div className="legal-unavailable">
      <strong>{label}</strong>
      <span>Data not loaded</span>
    </div>
  );
}

type IntelligencePageId = "lawyer-intelligence";
const intelligenceColors=["#2477b3","#6e59b5","#24a186","#e39138","#dc5d69"];
const intelligenceNames:Record<IntelligencePageId,{eyebrow:string;heading:string}>={
  "lawyer-intelligence":{eyebrow:"LAWYER OVERVIEW",heading:"Lawyer workload and services"},
};
function IntelligencePage({page,filters,setFilters}:{page:IntelligencePageId;filters:Record<string,string[]>;setFilters:(next:Record<string,string[]>)=>void}){
  const [data,setData]=useState<LegalIntelligence|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[filterDrawer,setFilterDrawer]=useState(false);
  useEffect(()=>{let current=true;setBusy(true);setError("");getLegalIntelligence(page,filters).then((result)=>current&&setData(result)).catch((reason)=>current&&setError(reason.message||"Unable to load intelligence dashboard.")).finally(()=>{if(current)setBusy(false)});return()=>{current=false}},[page,filters]);
  const format=(item:{value:number;format:string})=>item.format==="currency"?`${item.value.toLocaleString(undefined,{maximumFractionDigits:0})} IQD`:item.value.toLocaleString();
  const monthKeys=["Assessments","Services","Follow-ups","Deportations","Awareness"];
  const maxMonth=Math.max(1,...(data?.monthly||[]).flatMap((row)=>monthKeys.map((key)=>Number(row[key]||0))));
  const maxFunnel=Math.max(1,...(data?.funnel||[]).map((item)=>item.value));
  const lawyerMax=Math.max(1,...(data?.lawyers||[]).map((row)=>row.assessments));
  const activeFilters=Object.values(filters).reduce((total,items)=>total+items.length,0);
  const filterOptionValues=(key:keyof LegalIntelligence["filterOptions"])=>{
    const values=data?.filterOptions[key]||[];
    return key==="assessmentMonth"?Array.from(new Set(values.map((value)=>value.match(/^\d{4}-\d{2}/)?.[0]||value))).filter((value)=>/^\d{4}-\d{2}$/.test(value)).sort((a,b)=>b.localeCompare(a)):values;
  };
  const filterControls=data?(["project","location","lawyer","createdBy","assessmentMonth"] as const).map((key)=><CheckboxMultiSelect key={key} label={key==="createdBy"?"Original created by":key==="location"?"Project location":key==="assessmentMonth"?"Assessment date":key} values={filterOptionValues(key)} selected={filters[key]||[]} onChange={(items)=>setFilters({...filters,[key]:items})}/>):null;
  if(!data&&!error)return <LegalSkeleton variant="lawyers"/>;
  return <div className={`intelligence-page ${busy?"intelligence-busy":""}`}>
    {error&&<div className="error glass">{error}</div>}
    {data&&<>
      <LegalScrollControls onFilters={()=>setFilterDrawer(true)} activeCount={activeFilters} onClear={()=>setFilters({})} compactFilters={null}><div className="indicator-filter-bar lawyer-overview-filter-bar">{filterControls}<button className="soft lawyer-filter-clear" disabled={!activeFilters} onClick={()=>setFilters({})}><RotateCcw/>Clear</button></div></LegalScrollControls>
      {filterDrawer&&<><button className="indicator-filter-drawer-backdrop" aria-label="Close filters" onClick={()=>setFilterDrawer(false)}/><aside className="indicator-filter-drawer glass"><header><div><span>LAWYER OVERVIEW FILTERS</span><h2>Filter Lawyer Overview</h2></div><button className="icon" onClick={()=>setFilterDrawer(false)} aria-label="Close filters"><X/></button></header><div className="indicator-filter-drawer-controls">{filterControls}</div><footer><button className="soft" disabled={!activeFilters} onClick={()=>setFilters({})}>Clear all</button></footer></aside></>}
      <section className="intelligence-kpis">{data.kpis.map((item)=><article className="glass" key={item.label}><span>{item.label}</span><strong>{format(item)}</strong><small>{item.label==="Awareness participants"?"Reported separately from case beneficiaries":"Distinct source records"}</small></article>)}</section>
      <section className="glass intelligence-panel intelligence-operational-mix lawyer-section"><header><div><span className="eyebrow">SERVICE DELIVERY PROFILE</span><h3>Service delivery profile</h3></div><small>Leading distribution categories in the current selection</small></header><div className="operational-mix-grid">{data.breakdowns.map((group)=>{const total=Math.max(group.total,1);return <article key={group.title}><strong>{group.title}</strong>{group.items.slice(0,5).map((item)=><div key={item.label}><span title={item.label}>{item.label}</span><b><em>{item.value.toLocaleString()}</em><small>{((item.value/total)*100).toFixed(1)}%</small></b></div>)}</article>})}</div></section>
      <Lawyers data={data.lawyerSummary} workload={data.lawyers} showAwareness={data.kpis.some((item)=>item.label==="Awareness participants")} filters={filters}/>
    </>}
  </div>;
}

type LawyerData = {
  rows: { lawyer: string; metric: string; count: number }[];
  monthlyAssessments: { lawyer: string; month: string; count: number; average: number }[];
  breakdowns: {
    lawyer: string;
    dimension: string;
    value: string;
    count: number;
  }[];
  charts: {
    title: string;
    dimension: string;
    kind: string;
    items: { label: string; count: number }[];
  }[];
  kpis: { label: string; value: number; detail: string }[];
  filterOptions: Record<"lawyer" | "createdBy" | "project" | "location" | "assessmentMonth", string[]>;
  activeFilters: Record<string, string[]>;
  availability: Record<string, boolean>;
};
const chartColors = [
  "#2477b3",
  "#6e59b5",
  "#24a186",
  "#e39138",
  "#dc5d69",
  "#5796d2",
  "#9b76ce",
  "#56b7a6",
  "#d9a34a",
  "#8b9bad",
  "#d8789a",
  "#6383bf",
];
function LawyerChart({ chart }: { chart: LawyerData["charts"][number] }) {
  const total = chart.items.reduce((sum, item) => sum + item.count, 0),
    max = Math.max(1, ...chart.items.map((item) => item.count));
  const chartLabel = (label: string) =>
    label.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, "").replace(/\s*[-–—,:/]\s*$/, "").replace(/\s{2,}/g, " ").trim() || "Blank";
  if (chart.kind === "donut") {
    let offset = 0;
    return (
      <article className="glass lawyer-chart">
        <header>
          <div>
            <span>{chart.dimension}</span>
            <h3>{chart.title}</h3>
          </div>
          <strong>{total.toLocaleString()}</strong>
        </header>
        <div className="donut-chart">
          <svg viewBox="0 0 42 42" aria-label={chart.title}>
            <circle
              cx="21"
              cy="21"
              r="15.9"
              fill="none"
              stroke="var(--line)"
              strokeWidth="6"
            />
            {chart.items.map((item, index) => {
              const size = (item.count / Math.max(total, 1)) * 100,
                start = offset;
              offset += size;
              return (
                <circle
                  key={item.label}
                  cx="21"
                  cy="21"
                  r="15.9"
                  fill="none"
                  stroke={chartColors[index % chartColors.length]}
                  strokeWidth="6"
                  strokeDasharray={`${size} ${100 - size}`}
                  strokeDashoffset={-start}
                  pathLength="100"
                />
              );
            })}
            <text x="21" y="20" textAnchor="middle">
              {total.toLocaleString()}
            </text>
            <text x="21" y="25" textAnchor="middle">
              records
            </text>
          </svg>
          <div className="chart-legend">
            {chart.items.map((item, index) => (
              <div key={item.label}>
                <i
                  style={{
                    background: chartColors[index % chartColors.length],
                  }}
                />
                <span title={chartLabel(item.label)}>{chartLabel(item.label)}</span>
                <strong>
                  {item.count.toLocaleString()}{" "}
                  <small>
                    {((item.count / Math.max(total, 1)) * 100).toFixed(1)}%
                  </small>
                </strong>
              </div>
            ))}
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className="glass lawyer-chart">
      <header>
        <div>
          <span>{chart.dimension}</span>
          <h3>{chart.title}</h3>
        </div>
        <strong>{total.toLocaleString()}</strong>
      </header>
      <div className="lawyer-bars">
        {chart.items.map((item, index) => (
          <div key={item.label}>
            <div>
              <span title={chartLabel(item.label)}>{chartLabel(item.label)}</span>
              <strong>{item.count.toLocaleString()}</strong>
            </div>
            <i>
              <b
                style={{
                  width: `${(item.count / max) * 100}%`,
                  background: chartColors[index % chartColors.length],
                }}
              />
            </i>
          </div>
        ))}
      </div>
    </article>
  );
}

function RepresentationCaseLoadTable({filters}:{filters:Record<string,string[]>}){
  const [status,setStatus]=useState<"open"|"closed">("open"),[showDocuments,setShowDocuments]=useState(true),[data,setData]=useState<RepresentationCaseLoad|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[drill,setDrill]=useState<{title:string;services:RepresentationCaseLoadService[]}|null>(null);
  useEffect(()=>{let active=true;setBusy(true);setError("");getRepresentationCaseLoad(status,filters).then((result)=>{if(active)setData(result)}).catch((reason)=>active&&setError(reason.message||"Unable to load legal service case load.")).finally(()=>active&&setBusy(false));return()=>{active=false}},[status,filters]);
  const buildTable=(source:RepresentationCaseLoad|null)=>{
    const months=source?.months||[],grouped=new Map<string,{lawyer:string;document:string;values:Record<string,number>;total:number;services:RepresentationCaseLoadService[]}>();
    for(const item of source?.rows||[]){const key=showDocuments?`${item.lawyer}\u0000${item.document}`:item.lawyer;const current=grouped.get(key)||{lawyer:item.lawyer,document:item.document,values:{},total:0,services:[]};current.values[item.month]=(current.values[item.month]||0)+item.count;current.total+=item.count;current.services.push(...item.services);grouped.set(key,current)}
    return {months,rows:Array.from(grouped.values()).sort((a,b)=>a.lawyer.localeCompare(b.lawyer)||a.document.localeCompare(b.document))};
  };
  const table=useMemo(()=>buildTable(data),[data,showDocuments]);
  const totalLabel=status==="open"?"Open Representation Services":"Closed Representation Services";
  const workbookSheet=(sheetStatus:"open"|"closed",source:RepresentationCaseLoad)=>{const sheet=buildTable(source),label=sheetStatus==="open"?"Open Representation Services":"Closed Representation Services",max=Math.max(1,...sheet.rows.map((row)=>row.total)),columns=["Lawyer Name",...(showDocuments?["Type of Documents"]:[]),...sheet.months,label,"Average / month","Workload signal"],rows=sheet.rows.map((row)=>({"Lawyer Name":row.lawyer,...(showDocuments?{"Type of Documents":row.document}:{}),...Object.fromEntries(sheet.months.map((month)=>[month,row.values[month]||""])),[label]:row.total,"Average / month":(row.total/Math.max(sheet.months.length,1)).toFixed(1),"Workload signal":`${Math.round(row.total/max*100)}%`}));return {title:sheetStatus==="open"?"Open Cases":"Closed Cases",columns,rows}};
  const exportWorkbook=async()=>{const [open,closed]=await Promise.all([getRepresentationCaseLoad("open",filters),getRepresentationCaseLoad("closed",filters)]);await exportTableWorkbookSheets("representation-caseload.xlsx",[workbookSheet("open",open),workbookSheet("closed",closed)])};
  const workloadMax=Math.max(1,...table.rows.map((row)=>row.total));
  const openDrill=(title:string,services:RepresentationCaseLoadService[])=>setDrill({title,services});
  return <><section className={`glass intelligence-panel lawyer-section representation-case-load ${showDocuments?"":"documents-hidden"}`}><header><div><span className="eyebrow">LEGAL SERVICES CASELOAD</span><h3>Representation caseload by lawyer</h3></div><div className="pivot-actions"><button className={status==="open"?"primary":"soft"} onClick={()=>setStatus("open")}>Open cases</button><button className={status==="closed"?"primary":"soft"} onClick={()=>setStatus("closed")}>Closed cases</button><button className="soft" onClick={()=>setShowDocuments((value)=>!value)}>{showDocuments?"Hide Documents":"Show Documents"}</button><ExcelDownloadButton className="primary" onClick={exportWorkbook} disabled={busy}/></div></header><small>{status==="open"?"Open representation services, grouped by the month the service was provided. Select a number to view its services.":"Completed or closed representation services, grouped by the month the service was closed. Select a number to view its services."}</small>{error&&<div className="error">{error}</div>}<div className="legal-table-wrap"><table><thead><tr><th>Lawyer Name</th>{showDocuments&&<th>Type of Documents</th>}{table.months.map((month)=><th key={month}>{month}</th>)}<th>{totalLabel}</th><th>Average / month</th><th>Workload signal</th></tr></thead><tbody>{table.rows.map((row)=><tr key={`${row.lawyer}-${row.document}`}><td><strong>{row.lawyer}</strong></td>{showDocuments&&<td>{row.document}</td>}{table.months.map((month)=><td key={month}>{row.values[month]?<button className="caseload-count" onClick={()=>openDrill(`${row.lawyer} - ${month}`,row.services.filter((service)=>service.month===month))}>{row.values[month]}</button>:""}</td>)}<td><button className="caseload-count" onClick={()=>openDrill(row.lawyer,row.services)}><strong>{row.total}</strong></button></td><td>{(row.total/Math.max(table.months.length,1)).toFixed(1)}</td><td><i className="score-bar"><b style={{width:`${row.total/workloadMax*100}%`}}/></i></td></tr>)}{!busy&&!table.rows.length&&<tr><td colSpan={4+table.months.length+(showDocuments?1:0)}>No matching representation services.</td></tr>}</tbody></table></div></section>{drill&&createPortal(<div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Representation service details"><button className="case-modal-backdrop" aria-label="Close service details" onClick={()=>setDrill(null)}/><section className="indicator-modal-panel"><header><div><span>LEGAL SERVICES DRILL-DOWN</span><h2>Matching representation services</h2><p>{drill.title} - {drill.services.length.toLocaleString()} service{drill.services.length===1?"":"s"}</p></div><button className="icon" onClick={()=>setDrill(null)} aria-label="Close service details"><X/></button></header><div className="indicator-modal-scroll"><table><thead><tr><th>Service ID</th><th>Beneficiary ID</th><th>Assessment ID</th><th>Lawyer</th><th>Document</th><th>Status</th><th>Service provided</th><th>Service closed</th></tr></thead><tbody>{drill.services.map((service)=><tr key={service.serviceId}><td>{service.serviceId}</td><td>{service.beneficiaryId}</td><td>{service.assessmentId}</td><td>{service.lawyer}</td><td>{service.document}</td><td>{service.status}</td><td>{service.provisionDate}</td><td>{service.closeDate}</td></tr>)}</tbody></table></div></section></div>,document.body)}</>;
}

function Lawyers({ data, workload, showAwareness, filters }: { data: Pick<LawyerData,"rows"|"monthlyAssessments"|"charts">; workload:LegalIntelligence["lawyers"]; showAwareness:boolean; filters:Record<string,string[]> }) {
  const assessmentMonths = useMemo(
      () => Array.from(new Set(data.monthlyAssessments.map((r) => r.month))).sort(),
      [data.monthlyAssessments],
    ),
    assessmentLawyers = useMemo(
      () => Array.from(new Set(data.monthlyAssessments.map((r) => r.lawyer))).sort(),
      [data.monthlyAssessments],
    );
  const workloadMax=Math.max(1,...workload.map((row)=>row.assessments));
  const exportWorkload=()=>{const columns=["Project","Lawyer","Assessments","Average / month","Services","Completed","Completion","Follow-ups","Fee records",...(showAwareness?["Awareness"]:[])],rows=workload.filter((row)=>row.assessments>0).map((row)=>({Project:formatProjectLabel(row.project),Lawyer:row.lawyer,Assessments:row.assessments,"Average / month":row.monthlyAverage.toFixed(1),Services:row.services,Completed:row.completedServices,Completion:`${(row.completionRate*100).toFixed(0)}%`,"Follow-ups":row.followups,"Fee records":row.fees,...(showAwareness?{Awareness:row.awareness}:{})}));return exportTableWorkbook("lawyer-workload.xlsx",columns,rows)};
  const exportMonthlyAssessments=()=>{const columns=["Lawyer",...assessmentMonths,"Average / month"],rows=assessmentLawyers.map((lawyer)=>{const lawyerRows=data.monthlyAssessments.filter((row)=>row.lawyer===lawyer);return {Lawyer:lawyer,...Object.fromEntries(assessmentMonths.map((month)=>[month,lawyerRows.find((row)=>row.month===month)?.count||""])),"Average / month":(lawyerRows[0]?.average||0).toFixed(1)}});return exportTableWorkbook("monthly-assessments-by-lawyer.xlsx",columns,rows)};
  return <div className="lawyer-dashboard-sections">
      <div className="lawyer-chart-grid">
        {data.charts.map((chart) => (
          <LawyerChart key={chart.title} chart={chart} />
        ))}
      </div>
      <section className="glass intelligence-panel lawyer-section"><header><div><span className="eyebrow">TEAM BENCHMARK</span><h3>Lawyer workload</h3></div><div className="pivot-actions"><small>Grouped by project</small><ExcelDownloadButton className="primary" onClick={exportWorkload} disabled={!workload.some((row)=>row.assessments>0)}/></div></header><div className="legal-table-wrap"><table><thead><tr><th>Project</th><th>Lawyer</th><th>Assessments</th><th>Average / month</th><th>Services</th><th>Completed</th><th>Completion</th><th>Follow-ups</th><th>Fee records</th>{showAwareness&&<th>Awareness</th>}<th>Workload signal</th></tr></thead><tbody>{workload.filter((row)=>row.assessments>0).map((row)=><tr key={`${row.project}-${row.lawyer}`}><td><strong>{formatProjectLabel(row.project)}</strong></td><td>{row.lawyer}</td><td>{row.assessments}</td><td>{row.monthlyAverage.toFixed(1)}</td><td>{row.services}</td><td>{row.completedServices}</td><td>{(row.completionRate*100).toFixed(0)}%</td><td>{row.followups}</td><td>{row.fees}</td>{showAwareness&&<td>{row.awareness}</td>}<td><i className="score-bar"><b style={{width:`${row.assessments/workloadMax*100}%`}}/></i></td></tr>)}</tbody></table></div></section>
      <RepresentationCaseLoadTable filters={filters}/>
      <div className="glass legal-table-card lawyer-workload lawyer-section">
        <div className="legal-card-heading">
          <div><strong>Monthly assessments by lawyer</strong></div>
          <div className="pivot-actions"><small>Distinct assessments dated January 2026 or later · average uses all displayed months</small><ExcelDownloadButton className="primary" onClick={exportMonthlyAssessments} disabled={!assessmentLawyers.length}/></div>
        </div>
        <div className="legal-table-wrap">
          <table>
            <thead><tr><th>Lawyer</th>{assessmentMonths.map((month)=><th key={month}>{month}</th>)}<th>Average / month</th></tr></thead>
            <tbody>{assessmentLawyers.map((lawyer)=>{
              const lawyerRows=data.monthlyAssessments.filter((row)=>row.lawyer===lawyer);
              return <tr key={lawyer}><td><strong>{lawyer}</strong></td>{assessmentMonths.map((month)=><td key={month}>{lawyerRows.find((row)=>row.month===month)?.count||""}</td>)}<td><strong>{(lawyerRows[0]?.average||0).toFixed(1)}</strong></td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>
  </div>;
}

function LawyerOverview({ metadata: _metadata }: { metadata: LegalMetadata }) {
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  return <div className="lawyer-overview-page"><IntelligencePage page="lawyer-intelligence" filters={filters} setFilters={setFilters}/></div>;
}

function LegacyLawyers({ metadata }: { metadata: LegalMetadata }) {
  const [data, setData] = useState<{
    rows: { lawyer: string; metric: string; count: number }[];
    breakdowns: {
      lawyer: string;
      dimension: string;
      value: string;
      count: number;
    }[];
  }>({ rows: [], breakdowns: [] });
  useEffect(() => {
    getLegalLawyers().then(setData as any);
  }, []);
  const rows = data.rows,
    lawyers = useMemo(
      () => Array.from(new Set(rows.map((r) => r.lawyer))).sort(),
      [rows],
    ),
    metrics = useMemo(
      () => Array.from(new Set(rows.map((r) => r.metric))),
      [rows],
    );
  return (
    <>
      <div className="legal-kpis">
        {metrics.map((metric) => (
          <div className="glass legal-kpi" key={metric}>
            <span>{metric}</span>
            <strong>
              {rows
                .filter((r) => r.metric === metric)
                .reduce((n, r) => n + r.count, 0)
                .toLocaleString()}
            </strong>
          </div>
        ))}
        {!metadata.availability.followupslogbooks && (
          <Unavailable label="Follow-ups" />
        )}
        {!metadata.availability.awareness && <Unavailable label="Awareness" />}
      </div>
      <div className="glass legal-table-card">
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lawyer</th>
                {metrics.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lawyers.map((l) => (
                <tr key={l}>
                  <td>{l}</td>
                  {metrics.map((m) => (
                    <td key={m}>
                      {rows.find((r) => r.lawyer === l && r.metric === m)
                        ?.count || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const indicatorLines=(item:IndicatorReportItem,includeChildren=true)=>{
  const items=includeChildren?[item,...item.children]:[item];
  return items.flatMap((entry)=>{
    const rowCount=Math.max(0,...entry.sections.map((section)=>section.rows.length));
    return Array.from({length:rowCount},(_,index)=>entry.sections.flatMap((section)=>section.rows[index]?.values.slice(0,12)||Array(12).fill(0)).join("\t"));
  });
};

function IndicatorMatrix({section,ageGroups}:{section:IndicatorSection;ageGroups:string[]}){
  return <section className="indicator-population-block"><header><div><strong>{section.label}</strong><span>{section.total.toLocaleString()} counted</span></div>{(section.warnings.unclassified>0||section.warnings.unknownLocation>0)&&<small><AlertTriangle/>{section.warnings.unclassified>0&&`${section.warnings.unclassified} missing demographics`}{section.warnings.unclassified>0&&section.warnings.unknownLocation>0?" · ":""}{section.warnings.unknownLocation>0&&`${section.warnings.unknownLocation} outside reporting grid`}</small>}</header><div className="indicator-table-wrap"><table className="indicator-matrix"><thead><tr><th rowSpan={2} className="no-sort">Project</th><th rowSpan={2} className="no-sort">Project location</th><th colSpan={6} className="no-sort indicator-male">Male</th><th colSpan={6} className="no-sort indicator-female">Female</th><th rowSpan={2} className="no-sort indicator-total">Total</th></tr><tr>{ageGroups.map((age)=><th className="no-sort indicator-male" key={`m-${age}`}>{age}</th>)}{ageGroups.map((age)=><th className="no-sort indicator-female" key={`f-${age}`}>{age}</th>)}</tr></thead><tbody>{section.rows.map((row)=><tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{row.values.map((number,index)=><td className={index<6?"indicator-male":index<12?"indicator-female":"indicator-total"} key={index}>{number}</td>)}</tr>)}<tr className="indicator-grand-total"><td>Total</td><td>All selected locations</td>{section.totals.map((number,index)=><td className={index<6?"indicator-male":index<12?"indicator-female":"indicator-total"} key={index}>{number}</td>)}</tr></tbody></table></div></section>;
}

function IndicatorCard({item,ageGroups,onCopy}:{item:IndicatorReportItem;ageGroups:string[];onCopy:(item:IndicatorReportItem)=>void}){
  return <details className="indicator-card glass"><summary><div className="indicator-card-title"><span>{item.source}</span><h3>{item.title}</h3><small>{item.dateField}</small></div><div className="indicator-card-summary"><strong>{item.total.toLocaleString()}</strong><span>Total</span><ChevronDown/></div></summary><div className="indicator-card-body"><div className="indicator-rule"><p>{item.rule}</p>{typeof item.contributions.assessmentPeriod==="number"&&<div><span>Assessment period <b>{Number(item.contributions.assessmentPeriod).toLocaleString()}</b></span><span>Carry-over <b>{Number(item.contributions.carryOver||0).toLocaleString()}</b></span></div>}<button className="soft" onClick={()=>onCopy(item)}><Copy/>Copy numbers</button></div>{item.sections.map((section)=><IndicatorMatrix key={section.id} section={section} ageGroups={ageGroups}/>)}{item.children.length>0&&<div className="indicator-subindicators"><h4>Subindicators</h4>{item.children.map((child)=><details key={child.id} className="indicator-child"><summary><div><strong>{child.title}</strong><small>{child.rule}</small></div><b>{child.total.toLocaleString()}</b><ChevronDown/></summary><div>{child.sections.map((section)=><IndicatorMatrix key={section.id} section={section} ageGroups={ageGroups}/>)}</div></details>)}</div>}</div></details>;
}

function CombinedIndicatorMatrix({sections,ageGroups}:{sections:IndicatorSection[];ageGroups:string[]}){
  return <section className="indicator-population-block"><div className="indicator-table-wrap"><table className="indicator-matrix"><thead><tr><th rowSpan={2} className="no-sort">Project</th><th rowSpan={2} className="no-sort">Project location</th><th colSpan={6} className="no-sort indicator-male">Male</th><th colSpan={6} className="no-sort indicator-female">Female</th><th rowSpan={2} className="no-sort indicator-total">Total</th></tr><tr>{ageGroups.map((age)=><th className="no-sort indicator-male" key={`m-${age}`}>{age}</th>)}{ageGroups.map((age)=><th className="no-sort indicator-female" key={`f-${age}`}>{age}</th>)}</tr></thead><tbody>{sections.flatMap((section)=>[<tr className="indicator-population-heading" key={`${section.id}-heading`}><td colSpan={15}><strong>{section.label}</strong><span>{section.total.toLocaleString()} counted</span>{(section.warnings.unclassified>0||section.warnings.unknownLocation>0)&&<small><AlertTriangle/>{section.warnings.unclassified>0&&`${section.warnings.unclassified} missing demographics`}{section.warnings.unclassified>0&&section.warnings.unknownLocation>0?" · ":""}{section.warnings.unknownLocation>0&&`${section.warnings.unknownLocation} outside reporting grid`}</small>}</td></tr>,...section.rows.map((row)=><tr key={`${section.id}-${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{row.values.map((number,index)=><td className={index<6?"indicator-male":index<12?"indicator-female":"indicator-total"} key={index}>{number}</td>)}</tr>),<tr className="indicator-grand-total" key={`${section.id}-total`}><td>{section.label} total</td><td>All selected locations</td>{section.totals.map((number,index)=><td className={index<6?"indicator-male":index<12?"indicator-female":"indicator-total"} key={index}>{number}</td>)}</tr>])}</tbody></table></div></section>;
}

function IndicatorValue({value,ids,onOpen}:{value:number;ids:string[];onOpen:(ids:string[],value:number)=>void}){
  if(!value)return <span className="indicator-value-empty" aria-label="Zero"> </span>;
  return <button type="button" className="indicator-value-button" onClick={()=>onOpen(ids,value)} title="View matching Beneficiary IDs">{value.toLocaleString()}</button>;
}

function PopulationIndicatorMatrix({sections,ageGroups,onOpenIds,idpTotalColumn=false}:{sections:IndicatorSection[];ageGroups:string[];onOpenIds:(ids:string[],value:number)=>void;idpTotalColumn?:boolean}){
  const rows=sections[0]?.rows||[];
  if(idpTotalColumn)return <section className="indicator-population-block horizontal-population-matrix"><div className="indicator-table-wrap"><table className="indicator-matrix"><thead><tr><th rowSpan={3} className="no-sort fixed-dimension">Project</th><th rowSpan={3} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={12} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}<th rowSpan={3} className="no-sort indicator-total overall-total">Total</th></tr><tr>{sections.flatMap((section)=>[<th colSpan={6} className="no-sort indicator-male" key={`${section.id}-male`}>Male</th>,<th colSpan={6} className="no-sort indicator-female" key={`${section.id}-female`}>Female</th>])}</tr><tr>{sections.flatMap((section)=>[...ageGroups.map((age)=><th className="no-sort indicator-male" key={`${section.id}-m-${age}`}>{age}</th>),...ageGroups.map((age)=><th className="no-sort indicator-female" key={`${section.id}-f-${age}`}>{age}</th>)])}</tr></thead><tbody>{rows.map((row,index)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[index]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[index]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>(section.rows[index]?.values||Array(13).fill(0)).slice(0,12)).map((number,valueIndex)=>{const section=sections[Math.floor(valueIndex/12)],cellIndex=valueIndex%12;return <td className={cellIndex<6?"indicator-male":"indicator-female"} key={valueIndex}><IndicatorValue value={number} ids={section.rows[index]?.beneficiaryIds?.[cellIndex]||[]} onOpen={onOpenIds}/></td>})}<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td></tr>})}</tbody></table></div><footer className="population-matrix-summary">{sections.map((section)=><span key={section.id}><strong>{section.label}</strong>{section.total.toLocaleString()}{(section.warnings.unclassified>0||section.warnings.unknownLocation>0)&&<small><AlertTriangle/>{section.warnings.unclassified+section.warnings.unknownLocation} excluded</small>}</span>)}</footer></section>;
  const hideTotalColumns=false;
  return <section className="indicator-population-block horizontal-population-matrix"><div className="indicator-table-wrap"><table className="indicator-matrix"><thead><tr><th rowSpan={3} className="no-sort fixed-dimension">Project</th><th rowSpan={3} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={hideTotalColumns?12:13} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}{!hideTotalColumns&&<th rowSpan={3} className="no-sort indicator-total overall-total">Total</th>}</tr><tr>{sections.flatMap((section)=>[<th colSpan={6} className="no-sort indicator-male" key={`${section.id}-male`}>Male</th>,<th colSpan={6} className="no-sort indicator-female" key={`${section.id}-female`}>Female</th>,...(!hideTotalColumns?[<th rowSpan={2} className="no-sort indicator-total" key={`${section.id}-activity`}>Activity</th>]:[])])}</tr><tr>{sections.flatMap((section)=>[...ageGroups.map((age)=><th className="no-sort indicator-male" key={`${section.id}-m-${age}`}>{age}</th>),...ageGroups.map((age)=><th className="no-sort indicator-female" key={`${section.id}-f-${age}`}>{age}</th>)])}</tr></thead><tbody>{rows.map((row,index)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[index]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[index]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>(section.rows[index]?.values||Array(13).fill(0)).slice(0,hideTotalColumns?12:13)).map((number,valueIndex)=>{const section=sections[Math.floor(valueIndex/(hideTotalColumns?12:13))],cellIndex=valueIndex%(hideTotalColumns?12:13);return <td className={cellIndex<6?"indicator-male":cellIndex<12?"indicator-female":"indicator-total"} key={valueIndex}>{cellIndex===12?<span className="indicator-value-empty" aria-label="Zero"> </span>:<IndicatorValue value={number} ids={section.rows[index]?.beneficiaryIds?.[cellIndex]||[]} onOpen={onOpenIds}/>}</td>})}{!hideTotalColumns&&<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td>}</tr>})}<tr className="indicator-grand-total"><td>Total</td><td>All selected locations</td>{sections.flatMap((section)=>section.totals.slice(0,hideTotalColumns?12:13)).map((number,index)=>{const cellIndex=index%(hideTotalColumns?12:13);return <td className={cellIndex<6?"indicator-male":cellIndex<12?"indicator-female":"indicator-total"} key={index}>{cellIndex===12?<span className="indicator-value-empty" aria-label="Zero"> </span>:<IndicatorValue value={number} ids={sections[Math.floor(index/(hideTotalColumns?12:13))].totalBeneficiaryIds?.[cellIndex]||[]} onOpen={onOpenIds}/>}</td>})}{!hideTotalColumns&&<td className="indicator-total overall-total"><IndicatorValue value={sections.reduce((sum,section)=>sum+section.total,0)} ids={sections.flatMap((section)=>section.totalBeneficiaryIds?.[12]||[])} onOpen={onOpenIds}/></td>}</tr></tbody></table></div><footer className="population-matrix-summary">{sections.map((section)=><span key={section.id}><strong>{section.label}</strong>{section.total.toLocaleString()}{(section.warnings.unclassified>0||section.warnings.unknownLocation>0)&&<small><AlertTriangle/>{section.warnings.unclassified+section.warnings.unknownLocation} excluded</small>}</span>)}</footer></section>;
}

function GenderGroupIndicatorMatrix({sections,onOpenIds,idpTotalColumn=false}:{sections:IndicatorSection[];onOpenIds:(ids:string[],value:number)=>void;idpTotalColumn?:boolean}){
  const rows=sections[0]?.rows||[];
  const groups=[
    {label:"Girls", indexes:[6,7,8], className:"indicator-female"},
    {label:"Women", indexes:[9,10,11], className:"indicator-female"},
    {label:"Boys", indexes:[0,1,2], className:"indicator-male"},
    {label:"Men", indexes:[3,4,5], className:"indicator-male"},
  ];
  const valueFor=(values:number[],indexes:number[])=>indexes.reduce((sum,index)=>sum+(values[index]||0),0);
  const idsFor=(ids:string[][]|undefined,indexes:number[])=>indexes.flatMap((index)=>ids?.[index]||[]);
  if(idpTotalColumn)return <section className="indicator-population-block indicator-gender-group"><header><div><strong>Gender group disaggregation</strong><span>Girls, Women, Boys, and Men</span></div></header><div className="indicator-table-wrap"><table className="indicator-matrix"><colgroup><col className="gender-project-column"/><col className="gender-location-column"/>{Array.from({length:sections.length*groups.length+1},(_,index)=><col className="gender-data-column" key={index}/>)}</colgroup><thead><tr><th rowSpan={2} className="no-sort fixed-dimension">Project</th><th rowSpan={2} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={4} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}<th rowSpan={2} className="no-sort indicator-total overall-total">Total</th></tr><tr>{sections.flatMap((section)=>groups.map((group)=><th className={`no-sort ${group.className}`} key={`${section.id}-${group.label}`}>{group.label}</th>))}</tr></thead><tbody>{rows.map((row,rowIndex)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[rowIndex]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[rowIndex]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>groups.map((group)=>{const values=section.rows[rowIndex]?.values||[];const ids=section.rows[rowIndex]?.beneficiaryIds;return <td className={group.className} key={`${section.id}-${group.label}`}><IndicatorValue value={valueFor(values,group.indexes)} ids={idsFor(ids,group.indexes)} onOpen={onOpenIds}/></td>}))}<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td></tr>})}</tbody></table></div></section>;
  const hideTotalColumns=false;
  const dataColumnCount=sections.length*groups.length+(idpTotalColumn?1:groups.length+1);
  return <section className="indicator-population-block indicator-gender-group"><header><div><strong>Gender group disaggregation</strong><span>Girls, Women, Boys, and Men</span></div></header><div className="indicator-table-wrap"><table className="indicator-matrix"><colgroup><col className="gender-project-column"/><col className="gender-location-column"/>{Array.from({length:dataColumnCount},(_,index)=><col className="gender-data-column" key={index}/>)}</colgroup><thead><tr><th rowSpan={2} className="no-sort fixed-dimension">Project</th><th rowSpan={2} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={4} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}{!hideTotalColumns&&<><th colSpan={4} className="no-sort indicator-total">Total</th><th rowSpan={2} className="no-sort indicator-total overall-total">Grand total</th></>}</tr><tr>{sections.flatMap((section)=>groups.map((group)=><th className={`no-sort ${group.className}`} key={`${section.id}-${group.label}`}>{group.label}</th>))}{!hideTotalColumns&&groups.map((group)=><th className={`no-sort ${group.className}`} key={`total-${group.label}`}>{group.label}</th>)}</tr></thead><tbody>{rows.map((row,rowIndex)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[rowIndex]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[rowIndex]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>groups.map((group)=>{const values=section.rows[rowIndex]?.values||[];const ids=section.rows[rowIndex]?.beneficiaryIds;const value=valueFor(values,group.indexes);return <td className={group.className} key={`${section.id}-${group.label}`}><IndicatorValue value={value} ids={idsFor(ids,group.indexes)} onOpen={onOpenIds}/></td>}))}{!hideTotalColumns&&<>{groups.map((group)=>{const value=sections.reduce((sum,section)=>sum+valueFor(section.rows[rowIndex]?.values||[],group.indexes),0);const ids=sections.flatMap((section)=>idsFor(section.rows[rowIndex]?.beneficiaryIds,group.indexes));return <td className={group.className} key={`total-${group.label}`}><IndicatorValue value={value} ids={ids} onOpen={onOpenIds}/></td>})}<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td></>}</tr>})}<tr className="indicator-grand-total"><td>Total</td><td>All selected locations</td>{sections.flatMap((section)=>groups.map((group)=>{const value=valueFor(section.totals,group.indexes);return <td className={group.className} key={`${section.id}-${group.label}`}><IndicatorValue value={value} ids={idsFor(section.totalBeneficiaryIds,group.indexes)} onOpen={onOpenIds}/></td>}))}{!hideTotalColumns&&<>{groups.map((group)=>{const value=sections.reduce((sum,section)=>sum+valueFor(section.totals,group.indexes),0);const ids=sections.flatMap((section)=>idsFor(section.totalBeneficiaryIds,group.indexes));return <td className={group.className} key={`total-${group.label}`}><IndicatorValue value={value} ids={ids} onOpen={onOpenIds}/></td>})}<td className="indicator-total overall-total"><IndicatorValue value={sections.reduce((sum,section)=>sum+section.total,0)} ids={sections.flatMap((section)=>section.totalBeneficiaryIds?.[12]||[])} onOpen={onOpenIds}/></td></>}</tr></tbody></table></div></section>;
}

function NarrativeRemark({item,achievementLabel}:{item:IndicatorReportItem;achievementLabel:string}){
  const [expanded,setExpanded]=useState(false),[copied,setCopied]=useState(false),[remarkCopied,setRemarkCopied]=useState(false),[cellCopied,setCellCopied]=useState(""),narrative=item.narrative;
  if(!narrative)return null;
  const copyRemark=async()=>{
    await navigator.clipboard.writeText(narrative.remark);
    setRemarkCopied(true);window.setTimeout(()=>setRemarkCopied(false),1600);
  };
  const copyData=async()=>{
    const rows=narrative.rows.map((row)=>[row.indicator,row.population,row.totalAchievement,row.remarks]);
    await navigator.clipboard.writeText([["Indicators","Population",achievementLabel,"Remarks"],...rows].map((row)=>row.join("\t")).join("\n"));
    setCopied(true);window.setTimeout(()=>setCopied(false),1600);
  };
  const copyCell=async(value:string,key:string)=>{
    await navigator.clipboard.writeText(value);
    setCellCopied(key);window.setTimeout(()=>setCellCopied((current)=>current===key?"":current),1200);
  };
  const copyCellKey=(event:React.KeyboardEvent<HTMLTableCellElement>,value:string,key:string)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();void copyCell(value,key)}};
  return <><section className={`indicator-narrative${remarkCopied?" copied":""}`}><header><div><strong>Narrative report</strong></div><button className="soft" onClick={()=>setExpanded(true)}><Maximize2/>Expand</button></header>{narrative.remark?<button type="button" className="narrative-copy-text" onClick={copyRemark} title="Copy narrative as plain text"><span>{narrative.remark}</span>{remarkCopied&&<small className="narrative-cell-confirm"><CheckCircle2/>Copied</small>}</button>:<div className="narrative-blank"/>}</section>{expanded&&createPortal(<div className="indicator-modal narrative-modal" role="dialog" aria-modal="true"><button className="case-modal-backdrop" aria-label="Close narrative" onClick={()=>setExpanded(false)}/><section className="indicator-modal-panel"><header><div><span>NARRATIVE REPORT</span><h2>{item.title}</h2><p>Click any table cell to copy its plain value</p></div><div className="indicator-modal-actions"><button className="soft" onClick={copyData}>{copied?<CheckCircle2/>:<Copy/>}{copied?"Copied":"Copy data"}</button><button className="icon" onClick={()=>setExpanded(false)} aria-label="Close narrative"><X/></button></div></header><div className="indicator-modal-scroll"><table className="narrative-table"><thead><tr><th>Indicators</th><th>Population</th><th>{achievementLabel}</th><th>Remarks</th></tr></thead><tbody>{narrative.rows.map((row,rowIndex)=>{const values=[row.indicator,row.population,String(row.totalAchievement),row.remarks];return <tr key={`${row.indicator}-${row.population}`}>{values.map((value,columnIndex)=>{const key=`${rowIndex}-${columnIndex}`;return <td key={key} tabIndex={0} role="button" title="Click to copy this value" className={cellCopied===key?"narrative-cell-copied":""} onClick={()=>void copyCell(value,key)} onKeyDown={(event)=>copyCellKey(event,value,key)}>{columnIndex===3?<><p>{row.remarks}</p>{row.locations.length>0&&<div className="narrative-location-list">{row.locations.map((location)=><span key={`${location.project}-${location.location}`}><b>{location.location}</b>{location.total.toLocaleString()}</span>)}</div>}</>:columnIndex===2?row.totalAchievement.toLocaleString():value}{cellCopied===key&&<small className="narrative-cell-confirm"><CheckCircle2/>Copied</small>}</td>})}</tr>})}</tbody></table></div></section></div>,document.body)}</>;
}

function ExpandedIndicatorCard({item,ageGroups,achievementLabel,onCopy,onCopyTitle,onView,onOpenIds}:{item:IndicatorReportItem;ageGroups:string[];achievementLabel:string;onCopy:(item:IndicatorReportItem)=>void;onCopyTitle:(title:string)=>void;onView:(item:IndicatorReportItem)=>void;onOpenIds:(ids:string[],count:number,title:string)=>void}){
  const main=item.id==="individuals-reached";
  const idpTotalColumn=item.sections.length>0&&item.sections.every((section)=>section.id==="idp");
  return <article className={`indicator-card indicator-card-${item.id} glass${main?" indicator-card-main":""}`}><header className="indicator-card-header"><div className="indicator-card-title"><div className="indicator-card-badges"><span>{item.source}</span>{main&&<em>Main indicator</em>}</div><button type="button" className="indicator-title-copy" onClick={()=>onCopyTitle(item.title)} title="Copy indicator name"><h3>{item.title}</h3></button><small>{item.dateField}</small></div><div className="indicator-card-summary"><div className="indicator-total-block"><strong>{item.total?item.total.toLocaleString():""}</strong><span>Total</span></div>{typeof item.contributions.assessmentPeriod==="number"&&<div className="indicator-summary-contributions"><span>Assessment period <b>{Number(item.contributions.assessmentPeriod).toLocaleString()}</b></span><span>Carry-over <b>{Number(item.contributions.carryOver||0).toLocaleString()}</b></span></div>}<div className="indicator-summary-actions"><button className="soft indicator-copy-button" onClick={()=>onCopy(item)} title="Copy numbers" aria-label="Copy numbers"><Copy/></button><button className="soft indicator-view-button" onClick={()=>onView(item)} title="View full disaggregation" aria-label="View full disaggregation"><Maximize2/></button></div></div></header><div className="indicator-card-body"><div className="indicator-rule"><p><b>How it is counted</b>{item.rule}</p></div><PopulationIndicatorMatrix sections={item.sections} ageGroups={ageGroups} idpTotalColumn={idpTotalColumn} onOpenIds={(ids,value)=>onOpenIds(ids,value,item.title)}/><NarrativeRemark item={item} achievementLabel={achievementLabel}/>{item.children.length>0&&<div className="indicator-subindicators"><h4>Subindicators</h4>{item.children.map((child)=><article key={child.id} className={`indicator-child indicator-child-${child.id.endsWith("detainee")?"detainee":"other"}`}><header><div><button type="button" className="indicator-title-copy" onClick={()=>onCopyTitle(child.title)} title="Copy indicator name"><strong>{child.title}</strong></button><small>{child.rule}</small></div><b>{child.total?child.total.toLocaleString():""}</b><div className="indicator-child-actions">{typeof child.contributions.assessmentPeriod==="number"&&<><span>Assessment period <strong>{Number(child.contributions.assessmentPeriod).toLocaleString()}</strong></span><span>Carry-over <strong>{Number(child.contributions.carryOver||0).toLocaleString()}</strong></span></>}<button className="soft" onClick={()=>onView(child)} title="View full disaggregation"><Maximize2/></button><button className="soft" onClick={()=>onCopy(child)} title="Copy numbers"><Copy/></button></div></header><div><PopulationIndicatorMatrix sections={child.sections} ageGroups={ageGroups} idpTotalColumn={child.sections.length>0&&child.sections.every((section)=>section.id==="idp")} onOpenIds={(ids,value)=>onOpenIds(ids,value,child.title)}/><NarrativeRemark item={child} achievementLabel={achievementLabel}/></div></article>)}</div>}</div></article>;
}

function ExpandedIndicatorGroup({group,ageGroups,achievementLabel,onCopy,onCopyTitle,onView,onOpenIds}:{group:IndicatorReportGroup;ageGroups:string[];achievementLabel:string;onCopy:(item:IndicatorReportItem)=>void;onCopyTitle:(title:string)=>void;onView:(item:IndicatorReportItem)=>void;onOpenIds:(ids:string[],count:number,title:string)=>void}){
  const icon=group.id==="refugee"?<Backpack/>:group.id==="idp"?<Tent/>:<Users/>;
  const uidTotal=group.indicators.find((item)=>item.id==="uid-secured")?.total??0,securedTotal=group.indicators.find((item)=>item.id==="secured-civil-documentation")?.total??0,uidWarning=uidTotal>securedTotal;
  return <section className={`indicator-group indicator-group-${group.id}`}><header className="indicator-group-header"><i className="indicator-group-icon">{icon}</i><div><span>{group.label}</span><strong>{group.indicators.length} indicator{group.indicators.length===1?"":"s"}</strong></div><small>Indicators may overlap; totals are shown per indicator.</small></header><div>{uidWarning&&<div className="indicator-consistency-warning" role="alert"><AlertTriangle/><div><strong>Data consistency check</strong><span>UIDs received ({uidTotal.toLocaleString()}) are higher than secured civil documentation ({securedTotal.toLocaleString()}). Please review the selected records.</span></div></div>}{group.indicators.map((item)=><ExpandedIndicatorCard key={item.id} item={item} ageGroups={ageGroups} achievementLabel={achievementLabel} onCopy={onCopy} onCopyTitle={onCopyTitle} onView={onView} onOpenIds={onOpenIds}/>)}</div></section>;
}

function IdpDurableSolutions({report}:{report:IndicatorReport}){
  const idpGroup=report.groups.find((group)=>group.id==="idp");
  const genderGroups=[{label:"Girls",indexes:[6,7,8],className:"indicator-female"},{label:"Women",indexes:[9,10,11],className:"indicator-female"},{label:"Boys",indexes:[0,1,2],className:"indicator-male"},{label:"Men",indexes:[3,4,5],className:"indicator-male"}];
  const genderValues=(indicatorId:string)=>{
    const section=idpGroup?.indicators.find((item)=>item.id===indicatorId)?.sections.find((item)=>item.id==="idp");
    return genderGroups.map((group)=>group.indexes.reduce((total,index)=>total+(section?.totals[index]||0),0));
  };
  if(!idpGroup)return null;
  const counselling=genderValues("civil-counselling"),representation=genderValues("civil-representation"),secured=genderValues("secured-civil-documentation"),awareness=genderValues("legal-awareness-participants");
  const rows=[
    {label:"Number of people who received legal assistance (counselling and/or representation)",values:counselling.map((value,index)=>value+representation[index])},
    {label:"Number of people who received legal assistance AND successfully secured core civil documentation (National ID, Unified ID, PDS, Nationality Certificate and Birth Certificate)",values:secured},
    {label:"Number of people who participated in information and awareness raising sessions on access to civil documentation and family law",values:awareness},
  ];
  if(!rows.some((row)=>row.values.some((value)=>value>0)))return null;
  return <section className="indicator-group indicator-group-idp-durable-solutions"><header className="indicator-group-header"><i className="indicator-group-icon"><Tent/></i><div><span>IDP Durable Solutions</span></div></header><div><section className="indicator-population-block idp-durable-solutions-table"><div className="indicator-table-wrap"><table className="indicator-matrix"><thead><tr><th className="no-sort">Indicator</th>{genderGroups.map((group)=><th className={`no-sort ${group.className}`} key={group.label}>{group.label}</th>)}</tr></thead><tbody>{rows.map((row)=><tr key={row.label}><td>{row.label}</td>{row.values.map((value,index)=><td className={genderGroups[index].className} key={genderGroups[index].label}>{value?value.toLocaleString():""}</td>)}</tr>)}</tbody></table></div></section></div></section>;
}

function IndicatorFullView({item,ageGroups,onClose,onOpenIds,onCopy}:{item:IndicatorReportItem;ageGroups:string[];onClose:()=>void;onOpenIds:(ids:string[],count:number,title:string)=>void;onCopy?:()=>void}){
  const idpTotalColumn=item.sections.length>0&&item.sections.every((section)=>section.id==="idp");
  return <div className="indicator-modal" role="dialog" aria-modal="true" aria-label={`Full view: ${item.title}`}><button className="case-modal-backdrop" aria-label="Close full view" onClick={onClose}/><section className="indicator-modal-panel"><header><div><span>INDICATOR DISAGGREGATION</span><h2>{item.title}</h2><p>{item.total.toLocaleString()} total · Select any figure to view Beneficiary IDs.</p></div><div className="indicator-modal-actions"><button className="soft" onClick={onCopy}><Copy/>Copy numbers</button><button className="icon" onClick={onClose} aria-label="Close full view"><X/></button></div></header><div className="indicator-modal-scroll"><PopulationIndicatorMatrix sections={item.sections} ageGroups={ageGroups} idpTotalColumn={idpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,item.title)}/><GenderGroupIndicatorMatrix sections={item.sections} idpTotalColumn={idpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,item.title)}/>{item.children.map((child)=>{const childIdpTotalColumn=child.sections.length>0&&child.sections.every((section)=>section.id==="idp");return <section className="indicator-modal-child" key={child.id}><h3>{child.title}</h3><PopulationIndicatorMatrix sections={child.sections} ageGroups={ageGroups} idpTotalColumn={childIdpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,child.title)}/><GenderGroupIndicatorMatrix sections={child.sections} idpTotalColumn={childIdpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,child.title)}/></section>})}</div></section></div>;
}

function BeneficiaryIdModal({ids,count,title,onClose,onCopy}:{ids:string[];count:number;title:string;onClose:()=>void;onCopy:(text:string,label:string)=>void}){
  const [sort,setSort]=useState<{key:"beneficiaryId"|"assessmentId"|"name"|"source";ascending:boolean}>({key:"beneficiaryId",ascending:true});
  const isDeportation=title.toLowerCase().includes("persons deported from detention");
  const rows=Array.from(new Set(ids)).map((value)=>{const [beneficiaryId="",assessmentPart="",namePart="",sourcePart=""]=value.split("  |  ");return {beneficiaryId,assessmentId:assessmentPart.replace("Assessment ID: ",""),name:namePart.replace("Name: ",""),source:sourcePart.replace("Source: ","")||"source record"}});
  const sortedRows=[...rows].sort((left,right)=>left[sort.key].localeCompare(right[sort.key],undefined,{numeric:true})*(sort.ascending?1:-1));
  const sourceCounts=rows.reduce<Record<string,number>>((result,row)=>({...result,[row.source]:(result[row.source]||0)+1}),{});
  if(isDeportation){
    const sortDeportation=(key:"beneficiaryId"|"name"|"source")=>setSort((current)=>({key,ascending:current.key===key?!current.ascending:true}));
    const deportationMark=(key:"beneficiaryId"|"name"|"source")=>sort.key===key?(sort.ascending?" ↑":" ↓"):"";
    const copiedRows=sortedRows.map((row)=>`${row.beneficiaryId}\t${row.name}\t${row.source}`).join("\n");
    return <div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Deportation records"><button className="case-modal-backdrop" aria-label="Close IDs" onClick={onClose}/><section className="beneficiary-id-modal"><header><div><span>DEPORTATION DRILL-DOWN</span><h2>Matching deportation records</h2><p>{title}</p></div><button className="icon" onClick={onClose} aria-label="Close IDs"><X/></button></header><div className="beneficiary-id-summary"><strong>{count.toLocaleString()}</strong><span>reported count</span><b>{rows.length.toLocaleString()}</b><span>unique records</span><button className="soft" disabled={!rows.length} onClick={()=>onCopy(copiedRows,"PN IDs copied")}><Copy/>Copy PN IDs</button></div><div className="drill-source-summary">{Object.entries(sourceCounts).map(([source,total])=><span key={source}><b>{total.toLocaleString()}</b> from {source}</span>)}</div><div className="beneficiary-id-list">{rows.length?<table className="drilldown-table drilldown-table-deportation"><thead><tr><th><button onClick={()=>sortDeportation("beneficiaryId")}>PN ID{deportationMark("beneficiaryId")}</button></th><th><button onClick={()=>sortDeportation("name")}>Name{deportationMark("name")}</button></th><th><button onClick={()=>sortDeportation("source")}>Source{deportationMark("source")}</button></th></tr></thead><tbody>{sortedRows.map((row,index)=><tr key={`${row.beneficiaryId}-${row.source}-${index}`}><td><code>{row.beneficiaryId}</code></td><td><code>{row.name||"—"}</code></td><td><span className={`drill-source drill-source-${row.source.toLowerCase().replace(/\s+/g,"-")}`}>{row.source}</span></td></tr>)}</tbody></table>:<p>No PN ID is available for these matching records.</p>}</div></section></div>;
  }
  const sortBy=(key:"beneficiaryId"|"assessmentId"|"name"|"source")=>setSort((current)=>({key,ascending:current.key===key?!current.ascending:true}));
  const sortMark=(key:"beneficiaryId"|"assessmentId"|"name"|"source")=>sort.key===key?(sort.ascending?" ↑":" ↓"):"";
  const exportRows=()=>exportTableWorkbook("beneficiary-assessment-id-drill-down.xlsx",["Beneficiary ID","Assessment ID","Name","Source"],sortedRows.map((row)=>({"Beneficiary ID":row.beneficiaryId,"Assessment ID":row.assessmentId,Name:row.name,Source:row.source})));
  return <div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Beneficiary and Assessment IDs"><button className="case-modal-backdrop" aria-label="Close IDs" onClick={onClose}/><section className="beneficiary-id-modal"><header><div><span>BENEFICIARY &amp; ASSESSMENT ID DRILL-DOWN</span><h2>Matching case records</h2><p>{title}</p></div><button className="icon" onClick={onClose} aria-label="Close IDs"><X/></button></header><div className="beneficiary-id-summary"><strong>{count.toLocaleString()}</strong><span>reported count</span><b>{rows.length.toLocaleString()}</b><span>unique records</span><button className="soft" disabled={!rows.length} onClick={()=>onCopy(sortedRows.map((row)=>`${row.beneficiaryId}\t${row.assessmentId}\t${row.name}\t${row.source}`).join("\n"),"Beneficiary and Assessment IDs copied")}><Copy/>Copy IDs</button><ExcelDownloadButton className="primary" disabled={!rows.length} onClick={exportRows}/></div><div className="drill-source-summary">{Object.entries(sourceCounts).map(([source,total])=><span key={source}><b>{total.toLocaleString()}</b> from {source}</span>)}</div><div className="beneficiary-id-list">{rows.length?<table className="drilldown-table"><thead><tr><th><button onClick={()=>sortBy("beneficiaryId")}>Beneficiary ID{sortMark("beneficiaryId")}</button></th><th><button onClick={()=>sortBy("assessmentId")}>Assessment ID{sortMark("assessmentId")}</button></th><th><button onClick={()=>sortBy("name")}>Name{sortMark("name")}</button></th><th><button onClick={()=>sortBy("source")}>Source{sortMark("source")}</button></th></tr></thead><tbody>{sortedRows.map((row,index)=><tr key={`${row.beneficiaryId}-${row.assessmentId}-${row.source}-${index}`}><td><code>{row.beneficiaryId}</code></td><td><code>{row.assessmentId||"—"}</code></td><td><code>{row.name||"—"}</code></td><td><span className={`drill-source drill-source-${row.source.toLowerCase().replace(/\s+/g,"-")}`}>{row.source}</span></td></tr>)}</tbody></table>:<p>No Beneficiary ID is available for these matching records.</p>}</div></section></div>;
}

function IndicatorTrendChart({title,months,series}:{title:string;months:string[];series:{label:string;values:number[];color:string}[]}){
  const width=800,height=360,padding={left:62,right:28,top:64,bottom:64},maximum=Math.max(1,...series.flatMap((item)=>item.values)),plotHeight=height-padding.top-padding.bottom;
  const x=(index:number)=>padding.left+(months.length<=1?0:index*(width-padding.left-padding.right)/(months.length-1));
  const y=(number:number)=>height-padding.bottom-(number/maximum)*plotHeight;
  const chartRef=useRef<SVGSVGElement>(null);
  const downloadPng=()=>{const svg=chartRef.current;if(svg)void exportSvgChart(svg,`${title}-monthly-trend`,"png")};
  return <div className="indicator-analysis-chart"><button className="soft indicator-chart-download" onClick={downloadPng} title="Download high-quality PNG"><Download/>PNG</button><svg ref={chartRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly indicator trend" style={{fontFamily:"Arial, sans-serif"}}><rect width={width} height={height} rx="18" fill="var(--panel-strong)"/>{[0,.25,.5,.75,1].map((ratio)=>{const lineY=height-padding.bottom-ratio*plotHeight,value=Math.round(maximum*ratio);return <g key={ratio}><line x1={padding.left} x2={width-padding.right} y1={lineY} y2={lineY} stroke="var(--line)" strokeDasharray={ratio===0?"":"4 6"}/><text x={padding.left-12} y={lineY+4} textAnchor="end" fill="var(--muted)" fontSize="12">{value.toLocaleString()}</text></g>})}{months.map((month,index)=><text key={month} x={x(index)} y={height-25} textAnchor="middle" fill="var(--muted)" fontSize="12" fontWeight="600">{month}</text>)}{series.map((item,seriesIndex)=>{return <g key={item.label}><polyline points={item.values.map((number,index)=>`${x(index)},${y(number)}`).join(" ")} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{item.values.map((number,index)=>{const label=number.toLocaleString(),labelWidth=Math.max(30,label.length*8+12),labelY=Math.max(26,Math.min(height-padding.bottom-16,y(number)-22-seriesIndex*10));return <g key={index}><circle cx={x(index)} cy={y(number)} r="6" fill="var(--panel-strong)" stroke={item.color} strokeWidth="4"/><rect x={x(index)-labelWidth/2} y={labelY-15} width={labelWidth} height="20" rx="10" fill="var(--panel-strong)" stroke={item.color} strokeOpacity=".7"/><text x={x(index)} y={labelY-1} textAnchor="middle" fill={item.color} fontSize="12" fontWeight="700">{label}</text></g>})}</g>})}</svg><footer>{series.map((item)=><span key={item.label}><i style={{background:item.color}}/>{item.label}</span>)}</footer></div>;
}

function addIndicatorAnalysisPdfPage(pdf:jsPDF,title:string,months:string[],series:{label:string;values:number[];color:string}[]){
  const pageWidth=pdf.internal.pageSize.getWidth(),pageHeight=pdf.internal.pageSize.getHeight();
  const margin=12,tableX=margin,tableWidth=112,chartX=tableX+tableWidth+12,chartWidth=pageWidth-chartX-margin,chartY=42,chartHeight=112;
  pdf.setFillColor(22,131,216);pdf.rect(0,0,pageWidth,20,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(15);pdf.text("INTERSOS Legal Indicators",margin,12);
  pdf.setTextColor(23,43,58);pdf.setFontSize(15);pdf.text(title,margin,29);pdf.setFont("helvetica","normal");
  const headers=["Month",...series.map(item=>item.label)],columnWidth=tableWidth/headers.length,rowHeight=7,tableY=42;
  pdf.setFillColor(232,244,252);pdf.rect(tableX,tableY,tableWidth,rowHeight,"F");pdf.setTextColor(40,78,105);pdf.setFont("helvetica","bold");pdf.setFontSize(7);
  headers.forEach((header,index)=>pdf.text(header,tableX+index*columnWidth+(index?columnWidth-2:2),tableY+4.5,{align:index?"right":"left"}));
  pdf.setFont("helvetica","normal");months.forEach((month,rowIndex)=>{const y=tableY+rowHeight*(rowIndex+1);if(rowIndex%2===0){pdf.setFillColor(248,251,253);pdf.rect(tableX,y,tableWidth,rowHeight,"F")}pdf.setTextColor(49,70,84);pdf.text(month,tableX+2,y+4.5);series.forEach((item,index)=>pdf.text((item.values[rowIndex]||0).toLocaleString(),tableX+(index+2)*columnWidth-2,y+4.5,{align:"right"}));});
  const totalY=tableY+rowHeight*(months.length+1);pdf.setFillColor(234,244,252);pdf.rect(tableX,totalY,tableWidth,rowHeight,"F");pdf.setFont("helvetica","bold");pdf.setTextColor(18,111,186);pdf.text("Total",tableX+2,totalY+4.5);series.forEach((item,index)=>pdf.text(item.values.reduce((sum,value)=>sum+value,0).toLocaleString(),tableX+(index+2)*columnWidth-2,totalY+4.5,{align:"right"}));
  const maximum=Math.max(1,...series.flatMap(item=>item.values)),left=chartX+13,right=chartX+chartWidth-5,top=chartY+9,bottom=chartY+chartHeight-16;
  pdf.setDrawColor(218,229,236);pdf.setLineWidth(.25);[0,.25,.5,.75,1].forEach(ratio=>{const y=bottom-(bottom-top)*ratio;pdf.line(left,y,right,y);pdf.setTextColor(108,128,144);pdf.setFont("helvetica","normal");pdf.setFontSize(6);pdf.text(Math.round(maximum*ratio).toLocaleString(),left-2,y+2,{align:"right"})});
  const pointX=(index:number)=>left+(months.length<=1?0:index*(right-left)/(months.length-1)),pointY=(value:number)=>bottom-value/maximum*(bottom-top);
  series.forEach(item=>{const rgb=item.color.match(/[A-Fa-f0-9]{2}/g)?.map(value=>parseInt(value,16))||[22,131,216];pdf.setDrawColor(rgb[0],rgb[1],rgb[2]);pdf.setLineWidth(1);item.values.forEach((value,index)=>{if(index)pdf.line(pointX(index-1),pointY(item.values[index-1]),pointX(index),pointY(value))});pdf.setFillColor(255,255,255);pdf.setDrawColor(rgb[0],rgb[1],rgb[2]);pdf.setLineWidth(.9);item.values.forEach((value,index)=>pdf.circle(pointX(index),pointY(value),1.6,"FD"))});
  series.forEach((item,seriesIndex)=>{const rgb=item.color.match(/[A-Fa-f0-9]{2}/g)?.map(value=>parseInt(value,16))||[22,131,216];item.values.forEach((value,index)=>{const label=value.toLocaleString();pdf.setFont("helvetica","bold");pdf.setFontSize(7);const labelWidth=Math.max(9,pdf.getTextWidth(label)+4),labelY=Math.max(top+8,pointY(value)-10-seriesIndex*5),labelX=pointX(index);pdf.setFillColor(255,255,255);pdf.setDrawColor(rgb[0],rgb[1],rgb[2]);pdf.setLineWidth(.25);pdf.roundedRect(labelX-labelWidth/2,labelY-3.6,labelWidth,6.2,2,2,"FD");pdf.setTextColor(rgb[0],rgb[1],rgb[2]);pdf.text(label,labelX,labelY,{align:"center"})})});
  pdf.setFontSize(6);months.forEach((month,index)=>pdf.text(month,pointX(index),bottom+6,{align:"center"}));
  pdf.setDrawColor(218,229,236);pdf.line(margin,pageHeight-13,pageWidth-margin,pageHeight-13);pdf.setTextColor(108,128,144);pdf.setFontSize(7);pdf.text("INTERSOS",pageWidth-margin,pageHeight-8,{align:"right"});
}

function downloadIndicatorAnalysisPdf(title:string,months:string[],series:{label:string;values:number[];color:string}[]){
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  addIndicatorAnalysisPdfPage(pdf,title,months,series);
  pdf.save(`${title.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"indicator-analysis"}-analysis.pdf`);
}

function downloadAllIndicatorAnalysisPdf(cards:{item:IndicatorReportItem;series:{label:string;values:number[];color:string}[]}[],months:string[]){
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  cards.forEach((card,index)=>{if(index)pdf.addPage();addIndicatorAnalysisPdfPage(pdf,card.item.title,months,card.series)});
  pdf.save("indicator-analysis-selected-filters.pdf");
}

function IndicatorAnalysis({report,monthlyReports,loading}:{report:IndicatorReport;monthlyReports:{month:string;report:IndicatorReport}[];loading:boolean}){
  const monthLabel=(month:string)=>new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"});
  const allEntries=(source:IndicatorReport)=>Object.fromEntries(source.groups.flatMap((group)=>group.indicators.flatMap((item)=>[item,...item.children])).map((item)=>[item.id,item]));
  const orderedReports=[...monthlyReports].sort((left,right)=>left.month.localeCompare(right.month)),current=allEntries(report),months=orderedReports.map(({month})=>monthLabel(month));
  const cardFor=(item:IndicatorReportItem)=>{
    const sectionIds=new Set(item.sections.map((section)=>section.id));
    const populations=[...(sectionIds.has("syrian-refugee")||sectionIds.has("non-syrian-refugee")?[{label:"Refugees",ids:new Set(["syrian-refugee","non-syrian-refugee"]),color:"#1687d9"}]:[]),...(sectionIds.has("idp")?[{label:"IDP",ids:new Set(["idp"]),color:"#16a394"}]:[])];
    const series=populations.map((population)=>({label:population.label,color:population.color,values:orderedReports.map(({report:monthly})=>{const entry=allEntries(monthly)[item.id];return entry?entry.sections.filter((section)=>population.ids.has(section.id)).reduce((total,section)=>total+section.total,0):0})}));
    // The heading total is intentionally calculated from the same monthly
    // series used by the visible pivot table and chart. This keeps every view
    // aligned even when the selected reporting period changes.
    return {item,series,total:series.reduce((sum,population)=>sum+population.values.reduce((subtotal,value)=>subtotal+value,0),0)};
  };
  const groups=report.groups.map((group)=>({group,cards:group.indicators.flatMap((item)=>[item,...item.children]).map(cardFor)}));
  return <section className="indicator-analysis-page">
    <header><div><h2>Monthly indicator trends</h2></div><div className="indicator-analysis-page-actions"><button className="soft indicator-analysis-pdf" disabled={!monthlyReports.length} onClick={()=>downloadAllIndicatorAnalysisPdf(groups.flatMap(({cards})=>cards),months)} title="Download every selected pivot table and chart"><FileText/>Download all PDF</button>{loading&&<small className="analysis-loading-state"><RefreshCw/><span>Loading selected months</span><i>Updating charts</i></small>}</div></header>
    {!monthlyReports.length?<div className="legal-empty"><ChartColumnIncreasing/><h3>{loading?"Preparing the first month of analysis…":"No months are available for this selection."}</h3></div>:<div className="indicator-groups indicator-analysis-groups">{groups.map(({group,cards})=><details className={`indicator-group indicator-group-${group.id}`} open key={group.id}>
      <summary><div><span>{group.label}</span><strong>Monthly indicator analysis</strong></div><b>{cards.length} indicator{cards.length===1?"":"s"}</b><ChevronDown/></summary>
      <div className="indicator-analysis-list">{cards.map(({item,series,total})=><article className="glass indicator-analysis-card" key={item.id}>
        <header><div><span>{item.source}</span><h3>{item.title}</h3></div><div className="indicator-analysis-actions"><strong>{total.toLocaleString()}<small>selected total</small></strong><button className="soft indicator-analysis-pdf" onClick={()=>downloadIndicatorAnalysisPdf(item.title,months,series)} title="Download pivot table and chart as PDF"><FileText/>PDF</button></div></header>
        <div className="indicator-analysis-content"><div className="indicator-analysis-table-wrap"><table><thead><tr><th>Month</th>{series.map((item)=><th key={item.label}>{item.label}</th>)}</tr></thead><tbody>{months.map((month,index)=><tr key={month}><td>{month}</td>{series.map((item)=><td key={item.label}>{item.values[index]?item.values[index].toLocaleString():""}</td>)}</tr>)}<tr className="indicator-analysis-total"><td>Total</td>{series.map((item)=><td key={item.label}>{item.values.reduce((sum,value)=>sum+value,0).toLocaleString()}</td>)}</tr></tbody></table></div><IndicatorTrendChart title={item.title} months={months} series={series}/></div>
      </article>)}</div>
    </details>)}</div>}
  </section>;
}

function IndicatorReporting(){
  const [report,setReport]=useState<IndicatorReport|null>(null),[projects,setProjects]=useState<string[]>([]),[locations,setLocations]=useState<string[]>([]),[quarters,setQuarters]=useState<string[]>([]),[months,setMonths]=useState<string[]>([]),[communityTypes,setCommunityTypes]=useState<string[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[toast,setToast]=useState(""),[filterDrawer,setFilterDrawer]=useState(false),[fullView,setFullView]=useState<IndicatorReportItem|null>(null),[idDrill,setIdDrill]=useState<{ids:string[];count:number;title:string}|null>(null),[view,setView]=useState<"report"|"analysis">("report"),[monthlyReports,setMonthlyReports]=useState<{month:string;report:IndicatorReport}[]>([]),[analysisLoading,setAnalysisLoading]=useState(false),[exporting,setExporting]=useState(false),[narrativeExporting,setNarrativeExporting]=useState(false);
  const toastTimer=useRef<number|undefined>(undefined);
  useEffect(()=>{let active=true;setLoading(true);setError("");getLegalIndicators(projects,locations,[],quarters,months,communityTypes).then((next)=>{if(active)setReport(next)}).catch((reason)=>{if(active)setError(reason.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[projects,locations,quarters,months,communityTypes]);
  const locationOptions=useMemo(()=>!report?[]:projects.length?Array.from(new Set(projects.flatMap((project)=>report.filterOptions.locationsByProject[project]||[]))):report.filterOptions.locations,[report,projects]);
  const communityTypeOptions=useMemo(()=>!report?[]:report.filterOptions.communityTypes.filter((type)=>type!=="IDP"||!projects.length||projects.includes("UNHCR 2026 - AMAL CAMP")),[report,projects]);
  useEffect(()=>setLocations((current)=>{
    const next=current.filter((location)=>locationOptions.includes(location));
    return next.length===current.length&&next.every((location,index)=>location===current[index])?current:next;
  }),[locationOptions]);
  const quarterOptions=useMemo(()=>report?.filterOptions.quarters||[],[report]);
  const monthOptions=useMemo(()=>report?.filterOptions.months.filter((month)=>{if(quarters.length){const quarter=`${month.slice(0,4)}-Q${Math.ceil(Number(month.slice(5,7))/3)}`;if(!quarters.includes(quarter))return false}return true})||[],[report,quarters]);
  const analysisMonths=useMemo(()=>[...(months.length?months:monthOptions)].filter((month)=>month.startsWith("2026-")).sort((left,right)=>right.localeCompare(left)),[months,monthOptions]);
  useEffect(()=>{if(loading||!report||!analysisMonths.length){setMonthlyReports([]);setAnalysisLoading(false);return;}let active=true;setMonthlyReports([]);setAnalysisLoading(true);Promise.all(analysisMonths.map(async(month)=>({month,report:await getLegalIndicators(projects,locations,[],[],[month],communityTypes)}))).then((reports)=>{if(active)setMonthlyReports(reports)}).catch((reason)=>{if(active)setError(reason instanceof Error?reason.message:"Unable to load monthly analysis")}).finally(()=>{if(active)setAnalysisLoading(false)});return()=>{active=false};},[loading,report,analysisMonths,projects,locations,communityTypes]);
  useEffect(()=>setQuarters((current)=>{const next=current.filter((value)=>quarterOptions.includes(value));return next.length===current.length?current:next}),[quarterOptions]);
  useEffect(()=>setMonths((current)=>{const next=current.filter((value)=>monthOptions.includes(value));return next.length===current.length?current:next}),[monthOptions]);
  useEffect(()=>setCommunityTypes((current)=>{const next=current.filter((value)=>communityTypeOptions.includes(value));return next.length===current.length?current:next}),[communityTypeOptions]);
  const showToast=(message:string)=>{if(toastTimer.current!==undefined)window.clearTimeout(toastTimer.current);setToast(message);toastTimer.current=window.setTimeout(()=>{setToast("");toastTimer.current=undefined},1800)};
  useEffect(()=>()=>{if(toastTimer.current!==undefined)window.clearTimeout(toastTimer.current)},[]);
  const copyText=async(text:string,label:string)=>{try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();document.execCommand("copy");area.remove()}showToast(label)};
  const copyItem=(item:IndicatorReportItem)=>copyText(indicatorLines(item).join("\n"),"Indicator numbers copied");
  const copyTitle=(title:string)=>copyText(title,"Indicator name copied");
  const exportAll=async()=>{setExporting(true);try{await exportLegalIndicators(projects,locations,[],quarters,months,communityTypes);showToast("Professional Excel downloaded")}catch(reason){setError(reason instanceof Error?reason.message:"Unable to export indicator report")}finally{setExporting(false)}};
  const exportNarrative=async()=>{setNarrativeExporting(true);try{await exportLegalNarrative(projects,locations,[],quarters,months,communityTypes);showToast("Narrative report downloaded")}catch(reason){setError(reason instanceof Error?reason.message:"Unable to export narrative report")}finally{setNarrativeExporting(false)}};
  const achievementLabel=useMemo(()=>{
    if(months.length!==1)return `Total Achievement - ${months.length?"Selected Period":"Reporting Period"}`;
    const [year,month]=months[0].split("-").map(Number),date=new Date(Date.UTC(year,month-1,1));
    return `Total Achievement - ${Number.isNaN(date.getTime())?months[0]:date.toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"})}`;
  },[months]);
  const activeFilters=projects.length+locations.length+quarters.length+months.length+communityTypes.length;
  const clearFilters=()=>{setProjects([]);setLocations([]);setQuarters([]);setMonths([]);setCommunityTypes([])};
  const filterControls=<><CheckboxMultiSelect label="Projects" values={report?.filterOptions.projects||[]} selected={projects} onChange={setProjects}/><CheckboxMultiSelect label="Project locations" values={locationOptions} selected={locations} onChange={setLocations}/><CheckboxMultiSelect label="Community type" values={communityTypeOptions} selected={communityTypes} onChange={setCommunityTypes}/><CheckboxMultiSelect label="Quarters" values={quarterOptions} selected={quarters} onChange={setQuarters}/><CheckboxMultiSelect label="Months" values={monthOptions} selected={months} onChange={setMonths}/></>;
  const filterBar=<>{filterControls}<button className="soft indicator-filter-clear" disabled={!activeFilters} onClick={clearFilters}><RotateCcw/>Clear</button><ExcelDownloadButton className="soft narrative-export-button" disabled={!report||loading} busy={narrativeExporting} onClick={exportNarrative}>Narrative</ExcelDownloadButton><ExcelDownloadButton disabled={!report||loading} busy={exporting} onClick={exportAll}/></>;
  const openIds=(ids:string[],count:number,title:string)=>setIdDrill({ids,count,title});
  return <div className="indicator-reporting"><nav className="indicator-subnav" aria-label="Indicator reporting views"><button className={view==="report"?"active":""} onClick={()=>setView("report")}><TableProperties/>Indicators</button><button className={view==="analysis"?"active":""} onClick={()=>setView("analysis")}><ChartColumnIncreasing/>Analysis</button></nav><LegalScrollControls onFilters={()=>setFilterDrawer(true)} activeCount={activeFilters} onClear={clearFilters} compactFilters={<><div className="indicator-header-project"><CheckboxMultiSelect label="Projects" values={report?.filterOptions.projects||[]} selected={projects} onChange={setProjects}/></div><div className="indicator-header-month"><CheckboxMultiSelect label="Months" values={monthOptions} selected={months} onChange={setMonths}/></div></>}><div className="indicator-filter-bar">{filterBar}</div></LegalScrollControls>{filterDrawer&&<><button className="indicator-filter-drawer-backdrop" aria-label="Close indicator filters" onClick={()=>setFilterDrawer(false)}/><aside className="indicator-filter-drawer glass"><header><div><span>INDICATOR FILTERS</span><h2>Filter indicator reporting</h2></div><button className="icon" onClick={()=>setFilterDrawer(false)} aria-label="Close filters"><X/></button></header><div className="indicator-filter-drawer-controls">{filterControls}</div><footer><button className="soft" disabled={!activeFilters} onClick={clearFilters}>Clear all</button></footer></aside></>}{error&&<div className="error glass">{error}</div>}{loading&&!report?<LegalSkeleton variant="indicator"/>:report&&(view==="report"?<div className={loading?"indicator-groups refreshing":"indicator-groups"}>{report.groups.map((group)=><ExpandedIndicatorGroup key={group.id} group={group} ageGroups={report.ageGroups} achievementLabel={achievementLabel} onCopy={copyItem} onCopyTitle={copyTitle} onView={setFullView} onOpenIds={openIds}/>)}</div>:<IndicatorAnalysis report={report} monthlyReports={monthlyReports} loading={analysisLoading}/>)}{report&&view==="report"&&<IdpDurableSolutions report={report}/>} {fullView&&<IndicatorFullView item={fullView} ageGroups={report?.ageGroups||[]} onClose={()=>setFullView(null)} onOpenIds={openIds}/>} {idDrill&&<BeneficiaryIdModal {...idDrill} onClose={()=>setIdDrill(null)} onCopy={copyText}/>} {toast&&<div className="legal-copy-toast"><CheckCircle2/><span>Copied</span><strong>{toast}</strong></div>}</div>;
}

function CaseReviewModal({ caseId, metadata, onClose }: { caseId: string; metadata: LegalMetadata; onClose: () => void }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);setError("");
    getLegalCase(caseId, {}).then(setData).catch((reason) => {
      if (reason.name !== "AbortError") setError(reason.message || "Unable to open this case.");
    });
    return () => controller.abort();
  }, [caseId]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const item=data?.cases?.[0];
  return <div className="case-review-modal" role="dialog" aria-modal="true" aria-label={`Case ${caseId}`}>
    <button className="case-modal-backdrop" aria-label="Close case" onClick={onClose} />
    <section className="case-modal-panel">
      <header><div><span className="eyebrow">CASE REVIEW</span><h2 data-copy-value={caseId} title="Click to copy Case ID">Case {caseId}</h2></div><button className="soft" onClick={onClose} aria-label="Close case review" title="Close"><X /></button></header>
      <div className="case-modal-scroll">
        {error && <div className="error">{error}</div>}
        {!data ? <LegalSkeleton variant="cases" /> : item ? <CaseTree item={item} metadata={metadata} showBeneficiary /> : <div className="legal-empty"><FileQuestion /><h3>Case not found</h3></div>}
      </div>
    </section>
  </div>;
}

export default function LegalPlatform() {
  const [metadata, setMetadata] = useState<LegalMetadata | null>(null),
    [metadataLoading, setMetadataLoading] = useState(true),
    [page, setPageState] = useState<LegalPage>(legalPageFromUrl),
    [caseQuery, setCaseQuery] = useState(() => legalRouteFromUrl().caseId),
    [reviewCaseId, setReviewCaseId] = useState(""),
    [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("legal-sidebar-collapsed") === "true"),
    [theme, setTheme] = useState(() => localStorage.getItem("legal-platform-theme") || localStorage.getItem("app-theme") || "glass-light"),
    [fullscreen, setFullscreen] = useState(false),
    [dataMenuOpen, setDataMenuOpen] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [dataRevision, setDataRevision] = useState(0),
    [uploadProgress, setUploadProgress] = useState(0),
    [uploadPhase, setUploadPhase] = useState<"uploading" | "processing">(
      "uploading",
    );
  const [updateInfo, setUpdateInfo] = useState<UpdateCheck | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const legalShell = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<number | null>(null);
  // The warm-up worker reads this ref between requests so a page selected by
  // the user is always the next page it prepares.
  const activePageRef = useRef<LegalPage>(page);
  const [copiedValue, setCopiedValue] = useState("");
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
  useEffect(() => { activePageRef.current = page; }, [page]);
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
    activePageRef.current = next;
    setPageState(next);
    window.location.hash = `/legal/${next}`;
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  useEffect(() => {
    const started=performance.now();
    getLegalMetadata()
      .then(setMetadata)
      .catch((e) => setError(e.message))
      .finally(() => window.setTimeout(() => setMetadataLoading(false),Math.max(0,650-(performance.now()-started))));
  }, []);
  useEffect(()=>{
    if(metadataLoading||metadata?.ready||!metadata?.loading)return;
    let cancelled=false;
    const poll=()=>getLegalMetadata().then((next)=>{if(!cancelled)setMetadata(next)}).catch(()=>{});
    const timer=window.setInterval(poll,1000);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[metadataLoading,metadata?.ready,metadata?.loading]);
  useEffect(() => {
    if (!metadata?.ready) return;
    let cancelled = false;
    const firstDataset = metadata.sheets[0]?.id;
    const analyticsQuery = (dataset: string) => () => getLegalAnalyticsDashboard({
      dataset,
      filters: {},
      search: "",
      page: 1,
      pageSize: 100,
      sortColumn: "",
      sortDirection: "asc",
    });
    const warmPages = async () => {
      const tasks: [LegalPage, () => Promise<unknown>][] = [
        ["indicators", () => getLegalIndicators([], [], [], [], [])],
        ["beneficiaries", () => getLegalReview("beneficiaries", "", "", 1)],
        ["assessments", () => getLegalReview("assessments", "", "", 1)],
        ["legalservices", () => getLegalReview("legalservices", "", "", 1)],
        ...(metadata.availability.awareness ? [["awareness", () => getLegalReview("awareness", "", "", 1)] as [LegalPage, () => Promise<unknown>]] : []),
        ...(metadata.features?.deportation ? [["deportation", async () => {
          await getLegalDeportationDashboard({});
          await getLegalExplorer("deportationrecords", "", 1);
        }] as [LegalPage, () => Promise<unknown>]] : []),
        ["studio", analyticsQuery("assessments")],
        ...(metadata.features?.detention ? [["detention", () => getLegalDetention("", 1)] as [LegalPage, () => Promise<unknown>]] : []),
        ["explorer", async () => {
          if (!firstDataset) return;
          await getLegalExplorer(firstDataset, "", 1);
          await getLegalExplorerFilters(firstDataset);
        }],
        ["cases", async () => {
          await getLegalCase("", {}, { viewMode: "cards", page: 1, pageSize: 100 });
          await getLegalCaseFilters();
        }],
        ["lawyer-intelligence", async () => {
          await getLegalLawyers();
          await getLegalIntelligence("lawyer-intelligence");
        }],
      ];
      while (tasks.length) {
        if (cancelled) return;
        const selectedIndex = tasks.findIndex(([candidate]) => candidate === activePageRef.current);
        const [, task] = tasks.splice(selectedIndex >= 0 ? selectedIndex : 0, 1)[0];
        // Only one page is warmed at a time. If navigation happens while a
        // request is in flight, the selected page is moved to the front before
        // the next background request begins.
        await task().catch(() => undefined);
      }
    };
    const start = window.setTimeout(() => { void warmPages(); }, 750);
    return () => { cancelled = true; window.clearTimeout(start); };
  }, [metadata]);
  useEffect(() => {
    const sync = () => {
      const route = legalRouteFromUrl();
      activePageRef.current = route.page;
      setPageState(route.page);
      if (route.caseId) setCaseQuery(route.caseId);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const upload = async (files: File[]) => {
    const selectedFiles = latestLegalFiles(files);
    if (!selectedFiles.length) {
      setError("No supported CSV files were found in the selected folder.");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadPhase("uploading");
    setError("");
    try {
      const next = await uploadLegalFolder(selectedFiles, (status) => {
        setUploadPhase(status.phase);
        // The browser can measure bytes sent, but the server processes the
        // CSVs as one request and cannot truthfully report record progress.
        // Keep the processing stage indeterminate instead of showing 100%.
        if (status.percent !== null) setUploadProgress(status.percent);
      });
      setMetadata(next); setDataRevision((value) => value + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      window.setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 350);
    }
  };
  const selectFolder = async () => {
    const desktopApi = (window as any).pywebview?.api;
    let progressTimer:number|undefined;
    if (!desktopApi?.choose_legal_folder || !desktopApi?.process_legal_folder) {
      folderInput.current?.click();
      return;
    }
    setError("");
    try {
      const selectedPath = await desktopApi.choose_legal_folder();
      if (!selectedPath) return;
      setUploading(true);
      setUploadProgress(0);
      setUploadPhase("processing");
      progressTimer=window.setInterval(()=>{void desktopApi.get_legal_import_progress?.().then((progress:number)=>setUploadProgress(progress)).catch(()=>{})},180);
      const next = await desktopApi.process_legal_folder(selectedPath);
      if (next?.ready) {
        setMetadata(next); setDataRevision((value) => value + 1);
      }
    } catch (reason: any) {
      setError(reason?.message || String(reason) || "Unable to open the selected folder.");
    } finally {
      if(progressTimer!==undefined)window.clearInterval(progressTimer);
      setUploading(false);
      setUploadProgress(0);
    }
  };
  const refreshSelectedFolder = async () => {
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.refresh_legal_folder) return;
    setError("");setUploading(true);setUploadProgress(0);setUploadPhase("processing");
    try { const next = await desktopApi.refresh_legal_folder(); setMetadata(next); setDataRevision((value) => value + 1); }
    catch (reason: any) { setError(reason?.message || "Unable to refresh the selected folder."); }
    finally { setUploading(false);setUploadProgress(0); }
  };
  const selectFiles = async () => {
    const desktopApi = (window as any).pywebview?.api;
    let progressTimer:number|undefined;
    if (!desktopApi?.choose_legal_files || !desktopApi?.process_legal_files) { filesInput.current?.click(); return; }
    setError("");
    try {
      const paths = await desktopApi.choose_legal_files();
      if (!paths?.length) return;
      setUploading(true);setUploadProgress(0);setUploadPhase("processing");
      progressTimer=window.setInterval(()=>{void desktopApi.get_legal_import_progress?.().then((progress:number)=>setUploadProgress(progress)).catch(()=>{})},180);
      const next = await desktopApi.process_legal_files(paths);
      setMetadata(next); setDataRevision((value) => value + 1);
    } catch (reason: any) { setError(reason?.message || "Unable to open the selected CSV files."); }
    finally { if(progressTimer!==undefined)window.clearInterval(progressTimer);setUploading(false);setUploadProgress(0); }
  };
  const refreshSelectedFiles = async () => {
    const desktopApi = (window as any).pywebview?.api;
    if (!desktopApi?.refresh_legal_files) return;
    setError("");setUploading(true);setUploadProgress(0);setUploadPhase("processing");
    try { const next = await desktopApi.refresh_legal_files();setMetadata(next); setDataRevision((value) => value + 1); }
    catch (reason: any) { setError(reason?.message || "Unable to refresh the selected CSV files."); }
    finally { setUploading(false);setUploadProgress(0); }
  };
  const availableNav = nav.filter(([id]) =>
    (id !== "awareness" || metadata?.availability.awareness) &&
    (id !== "deportation" || metadata?.features?.deportation) &&
    (id !== "detention" || metadata?.features?.detention),
  );
  useEffect(()=>{
    if(!metadata?.ready)return;
    if(page==="deportation"&&!metadata.features?.deportation)setPage("overview");
    if(page==="detention"&&!metadata.features?.detention)setPage("overview");
  },[metadata?.ready,metadata?.features?.deportation,metadata?.features?.detention,page]);
  const openReviewCase = (id: string) => setReviewCaseId(id);
  return (
    <div ref={legalShell} className={`app-shell legal-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar glass">
        <div className="brand">
          <img src="/intersos-symbol-clear.png" alt="INTERSOS" />
          <div>
            <strong>Legal Platform</strong>
            <small>Review & analytics</small>
          </div>
        </div>
        <div className="sidebar-workspace-controls"><button className="soft sidebar-fullscreen" onClick={toggleFullscreen} title={fullscreen ? "Exit full screen" : "Enter full screen"} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>{fullscreen ? <Minimize2/> : <Maximize2/>}<span>Full screen</span></button><div className={`data-source-control app-select app-select-theme ${dataMenuOpen?"open":""}`}><Database className="app-select-icon"/><span className="app-select-label">Data source</span><button className="app-select-trigger" disabled={uploading} aria-busy={uploading} aria-haspopup="menu" aria-expanded={dataMenuOpen} onClick={() => setDataMenuOpen((current)=>!current)}><span>{uploading ? uploadPhase === "uploading" ? `Uploading ${uploadProgress}%` : "Processing records…" : "Choose source"}</span><ChevronDown/></button>{dataMenuOpen&&<><button className="data-source-backdrop" aria-label="Close data source menu" onClick={()=>setDataMenuOpen(false)}/><div className="app-select-menu data-source-menu" role="menu"><div className="data-source-option"><button role="menuitem" onClick={()=>{setDataMenuOpen(false);selectFolder()}}><FolderOpen/><span><strong>Select folder</strong><small>Load all supported CSV files</small></span></button>{(window as any).pywebview?.api?.refresh_legal_folder&&<button className="data-source-refresh" aria-label="Refresh selected folder" title="Refresh selected folder" onClick={()=>{setDataMenuOpen(false);refreshSelectedFolder()}}><RefreshCw/></button>}</div><div className="data-source-option"><button role="menuitem" onClick={()=>{setDataMenuOpen(false);selectFiles()}}><Database/><span><strong>Select multiple CSV files</strong><small>Choose individual source files</small></span></button>{(window as any).pywebview?.api?.refresh_legal_files&&<button className="data-source-refresh" aria-label="Refresh selected CSV files" title="Refresh selected CSV files" onClick={()=>{setDataMenuOpen(false);refreshSelectedFiles()}}><RefreshCw/></button>}</div><footer><span>Current source</span><strong>{metadata?.source||"No folder loaded"}</strong></footer></div></>}</div></div>
        <div className="legal-sidebar-utilities"><button aria-label="Home" title="Home" onClick={() => {window.location.hash="/"}}><Home/><span>Home</span></button><button aria-label={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Minimize"} onClick={() => setSidebarCollapsed((current) => {const next=!current;localStorage.setItem("legal-sidebar-collapsed",String(next));return next})}><ArrowLeft/><span>{sidebarCollapsed ? "Expand" : "Minimize"}</span></button></div>
        <nav>
          {availableNav.map(([id, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <Icon />
              <span>{labels[id]}</span>
              {metadata?.reviewCounts[id] !== undefined && (
                <b className="nav-count">{metadata.reviewCounts[id]}</b>
              )}
            </button>
          ))}
        </nav>
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
        <section className="content legal-content">
          {error && (
            <div className="error glass">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {metadataLoading ? (
            <AppStartupLoadingScreen />
          ) : !metadata?.ready && metadata?.loading ? (
            <LegalSkeleton variant="overview" />
          ) : !metadata?.ready ? (
            <section className="glass legal-import-source" aria-labelledby="import-data-source-title">
              <header>
                <span className="legal-import-source-icon"><Database/></span>
                <div>
                  <span className="eyebrow">DATA SOURCE</span>
                  <h2 id="import-data-source-title">Import Legal Platform data</h2>
                  <p>Choose a folder or individual CSV files to begin your data review and analysis.</p>
                </div>
              </header>
              <div className="legal-import-source-options">
                <button type="button" className="legal-import-source-option" onClick={()=>void selectFolder()} disabled={uploading}>
                  <FolderOpen/>
                  <span><strong>Select data folder</strong><small>Load all supported CSV files from one folder.</small></span>
                  <ArrowRight/>
                </button>
                <button type="button" className="legal-import-source-option" onClick={()=>void selectFiles()} disabled={uploading}>
                  <FileText/>
                  <span><strong>Select CSV files</strong><small>Choose individual source files from different locations.</small></span>
                  <ArrowRight/>
                </button>
              </div>
              <footer><CheckCircle2/><span><strong>Required files:</strong> beneficiaries, assessments, and legal services. Add optional files whenever available.</span></footer>
            </section>
          ) : page === "overview" ? (
            <Overview metadata={metadata} theme={theme as Theme} />
          ) : [
              "beneficiaries",
              "assessments",
              "legalservices",
              "awareness",
            ].includes(page) ? (
            <ReviewPage key={`${page}-${dataRevision}`} dataset={page} onOpenCase={openReviewCase} />
          ) : page === "explorer" ? (
            <Explorer metadata={metadata} onOpenCase={openReviewCase} />
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
          ) : <IndicatorReporting/>}
        </section>
      </main>
      {uploading && (
        <div className="legal-upload-overlay" role="status" aria-live="polite">
          <section className="glass legal-upload-progress">
            <div className="legal-upload-icon">
              <FolderOpen />
            </div>
            <span className="eyebrow">REPLACING LEGAL DATA</span>
            <h2>
              {uploadPhase === "uploading"
                ? "Uploading folder"
                : "Processing records"}
            </h2>
            {uploadPhase === "uploading"?<><strong>{uploadProgress}%</strong><div role="progressbar" aria-label="Legal Platform folder upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><i style={{ width: `${uploadProgress}%` }} /></div></>:<><strong className="legal-upload-indeterminate-label">Working…</strong><div className="legal-upload-indeterminate" role="progressbar" aria-label="Processing Legal Platform records"><i/></div></>}
            <p>
              {uploadPhase === "uploading"
                ? "Sending selected CSV files to the local service…"
                : "Validating relationships and preparing review findings. This can take about a minute for large folders."}
            </p>
          </section>
        </div>
      )}
      {reviewCaseId && metadata?.ready && <CaseReviewModal caseId={reviewCaseId} metadata={metadata} onClose={() => setReviewCaseId("")} />}
      {copiedValue&&<div className="legal-copy-toast" role="status" aria-live="polite"><CheckCircle2/><span>Copied</span><strong>{copiedValue}</strong></div>}
      {updateOpen&&<div className="modal-backdrop"><section className="update-modal glass" role="dialog" aria-modal="true" aria-label="Application update"><div className="update-icon"><RefreshCw/></div><span className="eyebrow">APPLICATION UPDATE</span><h2>{updateInfo?.available?`Version ${updateInfo.latestVersion} is available`:updateInfo?.enabled===false?"Updates need configuration":updateInfo?.message?.startsWith("Unable")?"Unable to check for updates":"You’re up to date"}</h2><p>{updateInfo?.available?(updateInfo.notes||"A new signed version of Iraq Data Analysis is ready to install."):(updateInfo?.message||`You are using version ${updateInfo?.currentVersion||"1.0.18"}.`)}</p>{updateInfo?.available&&typeof updateInfo.sizeBytes==="number"&&<small className="update-size">Update size: {formatUpdateSize(updateInfo.sizeBytes)}</small>}{updateStatus&&updateStatus.phase!=="idle"&&<div className="update-progress"><div><span>{updateStatus.phase}</span><strong>{updateStatus.progress}%</strong></div><i><b style={{width:`${updateStatus.progress}%`}}/></i>{updateStatus.phase==="downloading"&&<small>Downloaded {formatUpdateSize(updateStatus.downloadedBytes)} of {formatUpdateSize(updateStatus.totalBytes||updateInfo?.sizeBytes)}</small>}{updateStatus.error&&<em>{updateStatus.error}</em>}</div>}<div className="update-actions">{updateInfo?.available&&(!updateStatus||["idle","error"].includes(updateStatus.phase))&&<button className="primary" onClick={beginUpdate}>Update now</button>}<button className="soft" onClick={()=>setUpdateOpen(false)} disabled={Boolean(updateStatus&&["installing","restarting"].includes(updateStatus.phase))}>{updateInfo?.available?"Later":"Close"}</button></div></section></div>}
    </div>
  );
}
function Overview({
  metadata,
  theme,
}: {
  metadata: LegalMetadata;
  theme: Theme;
}) {
  const o = metadata.overview;
  const primary = [
    ["Beneficiaries", o?.beneficiaries, "People registered"],
    ["Assessments", o?.assessments, "Protection records"],
    ["Legal services", o?.services, "Services delivered"],
    ["Representation completion", o?.representationCompletionRate===undefined?"—":`${(o.representationCompletionRate*100).toFixed(1)}%`, "Completed representation services"],
  ];
  const supporting = [
    ...(metadata.features?.deportation ? [["Deportations", o?.deportations] as [string, number | null | undefined]] : []),
    ["Follow-ups", o?.followups],
    ["Legal fees", o?.fees],
    ...(metadata.features?.awareness === false ? [] : [["Awareness", o?.awareness]]),
  ] as [string, number | null | undefined][];
  const showDetentionDetails = metadata.features?.detention !== false;
  const overviewChart=(id:string,title:string,rows:any[])=>({id,title,kind:"bar",multiChoice:false,rows:rows.map((row)=>({label:row.label,count:row.count,percent:0}))});
  return (
    <div className="professional-overview">
      <section className="overview-primary-kpis">
        {primary.map(([label, count, detail], index) => (
          <div
            className={`glass executive-kpi ${index === 3 ? "attention" : ""}`}
            key={String(label)}
          >
            <span>{label}</span>
            <strong>
              {typeof count === "string" ? count : count === null ? "—" : Number(count || 0).toLocaleString()}
            </strong>
            <small>{detail}</small>
          </div>
        ))}
      </section>
      <section className="overview-supporting">
        {supporting.map(([label, count]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>
              {count === null ? "—" : Number(count || 0).toLocaleString()}
            </strong>
            <small>{count === null ? "Not loaded" : "records"}</small>
          </div>
        ))}
      </section>
      <TrendCard rows={(o?.activityTrend||[]).map((row)=>({label:row.month,count:row.assessments,percent:0}))} primaryLabel="Assessments" display="count" theme={theme} title="Monthly assessments" subtitle="2026 only · Assessment workload by month"/>
      <TrendCard rows={(o?.representationTrend||[]).map((row)=>({label:row.month,count:row.representation,percent:0}))} primaryLabel="Representation services" display="count" theme={theme} title="Monthly representation services" subtitle="2026 only · Legal Representation and Legal Assistance services by provision month"/>
      <section className="overview-analysis-grid" aria-label="Operational analysis">
        <ChartCard chart={overviewChart("assessment-status","Assessment status",o?.charts?.assessmentStatus||[])} display="count" theme={theme} onSelect={()=>{}}/>
        <ChartCard chart={overviewChart("representation-status","Representation service status",o?.charts?.representationServiceStatus||[])} display="count" theme={theme} onSelect={()=>{}}/>
        <ChartCard chart={overviewChart("assessment-location","Assessments by project location",o?.charts?.assessmentsByLocation||[])} display="count" theme={theme} onSelect={()=>{}}/>
        <ChartCard chart={overviewChart("assessment-lawyer","Assessments by lawyer",o?.charts?.assessmentsByLawyer||[])} display="count" theme={theme} onSelect={()=>{}}/>
      </section>
      {showDetentionDetails && <section className="overview-detention-grid" aria-label="2026 detention analysis">
        <TrendCard rows={(o?.detention2026?.trend||[]).map((row)=>({label:row.month,count:row.detainedAssessments,percent:0}))} comparisonRows={(o?.detention2026?.trend||[]).map((row)=>({label:row.month,count:row.released,percent:0}))} primaryLabel="Detained assessments" comparisonLabel="Released" display="count" theme={theme} title="Detained assessments and releases" subtitle="2026 only · Assessment date and release/deportation date"/>
        {metadata.features?.deportation && <ChartCard chart={overviewChart("deportation-governorate","Deportations by governorate",o?.deportationsByGovernorate||[])} display="count" theme={theme} onSelect={()=>{}}/>}
        <IraqDetentionMapMetrics items={o?.detention2026?.map||[]} selected={[]} onSelect={()=>{}} showFooter={false}/>
      </section>}
      <section className="glass overview-location-performance"><header><div><span className="eyebrow">LOCATION PERFORMANCE</span><h3>Operational activity by project location</h3></div></header><div className="legal-table-wrap"><table><thead><tr><th>Project location</th><th>Assessments</th><th>Representation services</th>{showDetentionDetails && <><th>Detained (2026)</th><th>Released (2026)</th></>}<th>Representation completion</th></tr></thead><tbody>{(o?.locationPerformance||[]).map((row)=><tr key={row.location}><td><strong>{row.location}</strong></td><td>{row.assessments.toLocaleString()}</td><td>{row.representationServices.toLocaleString()}</td>{showDetentionDetails && <><td>{row.detained.toLocaleString()}</td><td>{row.released.toLocaleString()}</td></>}<td>{row.representationServices?`${(row.completionRate*100).toFixed(1)}%`:"—"}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
