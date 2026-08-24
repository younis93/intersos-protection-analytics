import type {
  Dashboard,
  ExplorerFilter,
  ExplorerResult,
  Filters,
  LegalExplorerResult,
  LegalMetadata,
  LegalAnalyticsDashboard,
  IndicatorReport,
  LegalReview,
  DuplicateExclusion,
  Metadata,
  QualityRow,
  StudioResult,
  UpdateCheck,
  UpdateStatus,
} from "./types";
const API = import.meta.env.DEV ? "http://127.0.0.1:8000/api" : "/api";
async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const x = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(x.detail || "Request failed");
  }
  return r.json();
}
export const getMetadata = () =>
  fetch(`${API}/metadata`, { cache: "no-store" }).then(parse<Metadata>);
export const getQuality = () =>
  fetch(`${API}/quality`, { cache: "no-store" }).then(
    parse<{ rows: QualityRow[]; source: string; loadedAt: string }>,
  );
export const getDashboard = (page: string, filters: Filters, measure: string) =>
  fetch(`${API}/dashboard/${page}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, measure, defaultYtd: false }),
  }).then(parse<Dashboard>);
export const uploadWorkbook = async (
  file: File,
  onProgress?: (percent: number) => void,
) => {
  const body = new FormData();
  body.append("file", file);
  let progress = 4;
  onProgress?.(progress);
  const timer = window.setInterval(() => {
    progress = Math.min(
      progress + (progress < 70 ? 7 : progress < 90 ? 3 : 1),
      95,
    );
    onProgress?.(progress);
  }, 450);
  try {
    const result = await fetch(`${API}/upload`, { method: "POST", body }).then(
      parse<Metadata>,
    );
    onProgress?.(100);
    return result;
  } finally {
    window.clearInterval(timer);
  }
};
export const exportUrl = (page: string, filters: Filters) =>
  `${API}/export/${page}?filters=${encodeURIComponent(JSON.stringify(filters))}&default_ytd=false`;
export const getStudio = (
  page: string,
  rowDimension: string,
  columnDimension: string,
  filters: Filters,
  measure: string,
  signal?: AbortSignal,
) =>
  fetch(`${API}/studio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page,
      rowDimension,
      columnDimension: columnDimension || null,
      filters,
      measure,
      defaultYtd: false,
    }),
    signal,
  }).then(parse<StudioResult>);
export const getLegalStudio = (dataset:string,rowDimension:string,columnDimension:string,filters:Filters,measure:string,signal?:AbortSignal) => fetch(`${API}/legal/studio`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataset,rowDimension,columnDimension,filters,measure}),signal}).then(parse<StudioResult>);
export const getLegalAnalyticsDashboard = (query:{dataset:string;filters:Filters;search:string;page:number;pageSize:number;sortColumn:string;sortDirection:"asc"|"desc"},signal?:AbortSignal) => fetch(`${API}/legal/analytics-dashboard`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(query),signal}).then(parse<LegalAnalyticsDashboard>);
export interface ExplorerQuery {
  sheetId: string;
  search: string;
  filters: ExplorerFilter[];
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  page: number;
  pageSize: number;
  columns: string[];
}
export const getExplorer = (query: ExplorerQuery, signal?: AbortSignal) =>
  fetch(`${API}/data-explorer/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
    signal,
  }).then(parse<ExplorerResult>);
export const exportExplorer = async (
  format: "csv" | "xlsx",
  query: ExplorerQuery,
  signal?: AbortSignal,
) => {
  const response = await fetch(`${API}/data-explorer/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
    signal,
  });
  if (!response.ok) {
    const issue = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(issue.detail || "Export failed");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] || `filtered-data.${format}`;
  link.click();
  URL.revokeObjectURL(url);
};
export const downloadExcelUrl = async (url:string, fallbackFilename="export.xlsx") => {
  const response=await fetch(url);
  if(!response.ok)throw new Error(await response.text()||"Excel export failed");
  const disposition=response.headers.get("Content-Disposition")||"",match=disposition.match(/filename="?([^";]+)"?/i),blobUrl=URL.createObjectURL(await response.blob()),link=document.createElement("a");
  link.href=blobUrl;link.download=match?.[1]||fallbackFilename;link.click();window.setTimeout(()=>URL.revokeObjectURL(blobUrl),1500);
};
export const checkForUpdates = () =>
  fetch(`${API}/update/check`, { cache: "no-store" }).then(parse<UpdateCheck>);
export const getUpdateStatus = () =>
  fetch(`${API}/update/status`, { cache: "no-store" }).then(
    parse<UpdateStatus>,
  );
export const installUpdate = () =>
  fetch(`${API}/update/install`, { method: "POST" }).then(parse<UpdateStatus>);
export const getLegalMetadata = () =>
  fetch(`${API}/legal/metadata`, { cache: "no-store" }).then(
    parse<LegalMetadata>,
  );
export const getLegalDeportationDashboard = (filters:Filters={}) => fetch(`${API}/legal/deportation-dashboard`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataset:"deportationrecords",filters})}).then(parse<Dashboard>);
export const getLegalIndicators = (projects:string[],projectLocations:string[],years:string[],quarters:string[],months:string[],communityTypes:string[]=[]) =>
  fetch(`${API}/legal/indicators`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projects,projectLocations,years,quarters,months,communityTypes})}).then(parse<IndicatorReport>);
export const exportLegalIndicators = async (projects:string[],projectLocations:string[],years:string[],quarters:string[],months:string[],communityTypes:string[]=[]) => {
  const response=await fetch(`${API}/legal/indicators/export`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projects,projectLocations,years,quarters,months,communityTypes})});
  if(!response.ok)throw new Error(await response.text()||"Unable to export indicator report");
  const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");
  link.href=url;link.download="professional-indicator-report.xlsx";link.style.display="none";document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000);
};
export const exportLegalNarrative = async (projects:string[],projectLocations:string[],years:string[],quarters:string[],months:string[],communityTypes:string[]=[]) => {
  const response=await fetch(`${API}/legal/indicators/narrative-export`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projects,projectLocations,years,quarters,months,communityTypes})});
  if(!response.ok)throw new Error(await response.text()||"Unable to export narrative report");
  const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download="indicator-narrative-report.xlsx";link.click();URL.revokeObjectURL(url);
};
export const uploadLegalFolder = async (
  files: File[],
  onProgress?: (status: {
    phase: "uploading" | "processing";
    percent: number | null;
  }) => void,
) => {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return new Promise<LegalMetadata>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API}/legal/upload`);
    onProgress?.({ phase: "uploading", percent: 0 });
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        phase: "uploading",
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
      });
    };
    request.upload.onload = () =>
      onProgress?.({ phase: "processing", percent: null });
    request.onerror = () =>
      reject(new Error("Unable to upload the selected folder."));
    request.onload = () => {
      let payload: any;
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload as LegalMetadata);
      } else {
        reject(
          new Error(
            payload.detail || request.statusText || "Folder upload failed",
          ),
        );
      }
    };
    request.send(body);
  });
};
export const getLegalReview = (
  dataset: string,
  search: string,
  rule: string,
  page: number,
  filters: Record<string, string> = {},
  comparisonMonth = "",
  nameCompareChars = 15,
  allowNameVariations = false,
  exactMatchesOnly = false,
  signal?: AbortSignal,
) =>
  fetch(`${API}/legal/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset,
      search,
      rule,
      page,
      // Review findings are displayed as one complete table, without paging.
      pageSize: 5000,
      nameCompareChars,
      allowNameVariations,
      exactMatchesOnly,
      ...filters,
      comparisonMonth,
    }),
    signal,
  }).then(parse<LegalReview>);
export const legalReviewExportUrl = (
  dataset: string,
  comparisonMonth = "",
  nameCompareChars = 15,
  allowNameVariations = false,
  exactMatchesOnly = false,
  rules: string[] = [],
) =>
  `${API}/legal/review-export/${dataset}?comparison_month=${encodeURIComponent(comparisonMonth)}&name_compare_chars=${nameCompareChars}&allow_name_variations=${allowNameVariations}&exact_matches_only=${exactMatchesOnly}&rules=${encodeURIComponent(rules.join(","))}`;
export const getDuplicateExclusions = () =>
  fetch(`${API}/legal/duplicate-exclusions`, { cache: "no-store" }).then(parse<{rows: DuplicateExclusion[]; count: number}>);
export const createDuplicateExclusion = (record: Pick<DuplicateExclusion, "caseId" | "rule" | "name" | "project" | "source"> & Partial<Pick<DuplicateExclusion,"dataset"|"identifierType"|"identifierValue">>) =>
  fetch(`${API}/legal/duplicate-exclusions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) }).then(parse<{rows: DuplicateExclusion[]; count: number}>);
export const restoreDuplicateExclusion = (caseId: string, rule: string, dataset="", identifierType="") =>
  fetch(`${API}/legal/duplicate-exclusions/${encodeURIComponent(caseId)}?rule=${encodeURIComponent(rule)}&dataset=${encodeURIComponent(dataset)}&identifier_type=${encodeURIComponent(identifierType)}`, { method: "DELETE" }).then(parse<{rows: DuplicateExclusion[]; count: number}>);
export const importDuplicateExclusions = (file: File, dataset: string, identifierType: string, rules: string[]) => { const body=new FormData(); body.append("file",file); body.append("dataset",dataset); body.append("identifier_type",identifierType); body.append("rules",rules.join(",")); return fetch(`${API}/legal/duplicate-exclusions/import`,{method:"POST",body}).then(parse<{imported:number;duplicates:number;invalid:number;column:string;rows:DuplicateExclusion[];count:number}>); };
export const duplicateExclusionsExportUrl = () => `${API}/legal/duplicate-exclusions-export`;
export const getLegalExplorer = (
  dataset: string,
  search: string,
  page: number,
  filters: Record<string, string[]> = {},
  sortColumn = "",
  sortDirection: "asc" | "desc" = "asc",
  pageSize = 100,
) =>
  fetch(`${API}/legal/explorer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset, search, page, pageSize, filters, sortColumn, sortDirection }),
  }).then(parse<LegalExplorerResult>);
export const getLegalExplorerFilters = (dataset: string) =>
  fetch(`${API}/legal/explorer-filters/${dataset}`, { cache: "no-store" }).then(
    parse<{ columns: { name: string; values: string[] }[] }>,
  );
export const exportLegalExplorer = async (
  format: "csv" | "xlsx",
  dataset: string,
  search: string,
  filters: Record<string, string[]> = {},
  signal?: AbortSignal,
) => {
  const response = await fetch(`${API}/legal/explorer-export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset, search, filters }),
    signal,
  });
  if (!response.ok) {
    const issue = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(issue.detail || "Export failed");
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `${dataset}-filtered.${format}`;
  link.click();
  URL.revokeObjectURL(url);
};
export const exportTableWorkbook = async (filename:string,columns:string[],rows:Record<string,unknown>[]) => {
  const response=await fetch(`${API}/table-workbook`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename,columns,rows})});
  if(!response.ok){const issue=await response.json().catch(()=>({detail:response.statusText}));throw new Error(issue.detail||"Excel export failed");}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=filename.endsWith(".xlsx")?filename:`${filename}.xlsx`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
};
export const exportTableWorkbookSheets = async (filename:string,sheets:{title:string;columns:string[];rows:Record<string,unknown>[]}[]) => {
  const response=await fetch(`${API}/table-workbook`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename,sheets})});
  if(!response.ok){const issue=await response.json().catch(()=>({detail:response.statusText}));throw new Error(issue.detail||"Excel export failed");}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=filename.endsWith(".xlsx")?filename:`${filename}.xlsx`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
};
export const getLegalCase = (
  query: string,
  filters: Record<string, string[]> = {},
  options: {viewMode?: "cards" | "table";page?: number;pageSize?: number;sortColumn?: string;sortDirection?: "asc" | "desc";columns?:string[]} = {},
) =>
  fetch(`${API}/legal/case`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, filters, ...options }),
  }).then(parse<{ query: string; cases: any[];rows:any[];columns:{key:string;label:string;dataset:string}[];availableColumns:{key:string;label:string;dataset:string}[];totalRows:number;totalCases:number;page:number;pageSize:number }>);
export const getLegalCaseFilters = () =>
  fetch(`${API}/legal/case-filters`, { cache: "no-store" }).then(
    parse<{ groups: {dataset:string;label:string;columns:{key:string;name:string;values:string[]}[]}[] }>,
  );
export const exportLegalCases = async (
  query: string,
  filters: Record<string, string[]> = {},
  filename = "beneficiary-cases.xlsx",
  caseIds: string[] = [],
  signal?: AbortSignal,
) => {
  const response = await fetch(`${API}/legal/case-export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, filters, caseIds }),
    signal,
  });
  if (!response.ok) {
    const issue = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(issue.detail || "Export failed");
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
export const getLegalLawyers = (filters: Record<string, string[]> = {}) =>
  fetch(`${API}/legal/lawyers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  }).then(
    parse<{
      rows: { lawyer: string; metric: string; count: number }[];
      monthlyAssessments: {
        lawyer: string;
        month: string;
        count: number;
        average: number;
      }[];
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
    }>,
  );
export type RepresentationCaseLoadService = {serviceId:string;beneficiaryId:string;assessmentId:string;lawyer:string;document:string;status:string;provisionDate:string;closeDate:string;month:string};
export type RepresentationCaseLoad = {status:"open"|"closed";months:string[];rows:{lawyer:string;document:string;month:string;count:number;services:RepresentationCaseLoadService[]}[]};
export const getRepresentationCaseLoad = (status:"open"|"closed", filters: Record<string, string[]> = {}) =>
  fetch(`${API}/legal/representation-case-load/${status}`, {
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filters}),
  }).then(parse<RepresentationCaseLoad>);
export type LegalIntelligence = {
  page: string;
  period: string;
  kpis: { label: string; value: number; format: "number" | "currency" }[];
  funnel: { label: string; value: number }[];
  monthly: ({ month: string } & Record<string, string | number>)[];
  geography: ({ label: string } & Record<string, string | number>)[];
  breakdowns: { title: string; total: number; items: { label: string; value: number }[] }[];
  lawyers: { project: string; lawyer: string; assessments: number; monthlyAverage: number; services: number; completedServices: number; completionRate: number; followups: number; fees: number; averageCost: number; deportations: number; awareness: number }[];
  lawyerSummary: { rows: { lawyer: string; metric: string; count: number }[]; monthlyAssessments: { lawyer: string; month: string; count: number; average: number }[]; charts: { title: string; dimension: string; kind: string; items: { label: string; count: number }[] }[] };
  risks: { label: string; value: number; severity: string }[];
  insights: { title: string; detail: string; tone: string }[];
  finance: { total: number; averagePerCompletedService: number; records: number };
  filterOptions: Record<"lawyer" | "createdBy" | "project" | "location" | "assessmentMonth", string[]>;
  activeFilters: Record<string, string[]>;
  availability: Record<string, boolean>;
};
export const getLegalIntelligence = (page: string, filters: Record<string, string[]> = {}) =>
  fetch(`${API}/legal/intelligence/${page}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  }).then(parse<LegalIntelligence>);
export const getLegalDetention = (
  search: string,
  page: number,
  filters: Record<string, string[]> = {},
  sortColumn = "",
  sortDirection: "asc" | "desc" = "asc",
) =>
  fetch(`${API}/legal/detention`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search, page, pageSize: 100, filters, sortColumn, sortDirection }),
  }).then(
    parse<{
      total: number;
      page: number;
      pageSize: number;
      columns: string[];
      rows: Record<string, unknown>[];
      filterOptions: Record<string, string[]>;
      kpis: { label: string; value: number }[];
      trend: {month:string;detainedAssessments:number;released:number}[];
      charts: {id:string;title:string;items:{label:string;count:number}[]}[];
      map: {items:{label:string;count:number;detained:number;released:number;values:string[]}[]};
    }>,
  );
export interface DetentionReconciliation {
  month: string;
  months: string[];
  project: string;
  projects: string[];
  filename: string;
  sheet: string;
  sheets: string[];
  platformRecords: number;
  comparisonRecords: number;
  missingCaseIds: {assessments:number; excel:number};
  matched: number;
  unmatched: number;
  comparedFields: string[];
  rows: { beneficiaryId: string; caseAvailable: boolean; name: unknown; lawyer: string; note: string; differences: {field:string; assessment:unknown; excel:unknown}[] }[];
  warnings: string[];
}
export const getDetentionWorkbookSheets = (file: File) => {
  const body = new FormData();
  body.append("file", file);
  return fetch(`${API}/legal/detention/reconcile-sheets`, {method:"POST",body}).then(parse<{sheets:string[];selected:string}>);
};
export const reconcileLegalDetention = (file: File, months: string[], projects: string[], sheet: string) => {
  const body = new FormData();
  body.append("file", file);
  const query = new URLSearchParams({month:months.join(","),sheet});
  projects.forEach((project)=>query.append("project",project));
  return fetch(`${API}/legal/detention/reconcile?${query.toString()}`, {
    method: "POST",
    body,
  }).then(parse<DetentionReconciliation>);
};
export const exportLegalDetentionReconciliation = async (file: File, months: string[], projects: string[], sheet: string) => {
  const body=new FormData();body.append("file",file);
  const query=new URLSearchParams({month:months.join(","),sheet});projects.forEach((project)=>query.append("project",project));
  const response=await fetch(`${API}/legal/detention/reconcile-export?${query.toString()}`,{method:"POST",body});
  if(!response.ok){const issue=await response.json().catch(()=>({detail:response.statusText}));throw new Error(issue.detail||"Export failed")}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download="detention-comparison-issues.xlsx";link.click();URL.revokeObjectURL(url);
};
export const legalExportUrl = (dataset: string) =>
  `${API}/legal/export/${dataset}`;
export const legalAttachmentDownloadUrl = (url: string) =>
  `${API}/legal/attachment-download?${new URLSearchParams({url}).toString()}`;
