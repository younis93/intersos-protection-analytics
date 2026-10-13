import {SharedFilterDrawer} from './SharedFilterDrawer';
import {
ArrowRight,
Download,
RotateCcw,
Search,
SlidersHorizontal,
X
} from "lucide-react";
import { useEffect,useState } from "react";
import {
exportLegalExplorer,
getLegalExplorer,
getLegalExplorerFilters
} from "./api";
import { formatYearMonthFilterValue } from "./dateFormat";
import { hasLegalCore } from './legalAvailability';
import { renderCell,value } from './LegalRecordCells';
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import { AppSelect } from './SelectionControls';
import { Pager,SortableHeader } from './TableControls';
import { TableSelectionActions } from './TableSelectionActions';
import type { LegalExplorerResult,LegalMetadata } from "./types";
import { useQueryPage } from "./useQueryPage";
import { ValueTable } from "./ValueTable";

export type ExplorerExportTask={preparing:boolean;error:string};

export let explorerExportTask:ExplorerExportTask={preparing:false,error:""};

export let explorerExportController:AbortController|null=null;

export const explorerExportListeners=new Set<(task:ExplorerExportTask)=>void>();

export const notifyExplorerExportTask=()=>explorerExportListeners.forEach((listener)=>listener(explorerExportTask));

export const subscribeExplorerExportTask=(listener:(task:ExplorerExportTask)=>void)=>{explorerExportListeners.add(listener);return()=>{explorerExportListeners.delete(listener)}};

export const startExplorerExportTask=(dataset:string,search:string,filters:Record<string,string[]>)=>{
  if(explorerExportTask.preparing)return;
  const controller=new AbortController();explorerExportController=controller;explorerExportTask={preparing:true,error:""};notifyExplorerExportTask();
  void exportLegalExplorer("xlsx",dataset,search,filters,controller.signal).catch((reason:any)=>{if(reason?.name!=="AbortError")explorerExportTask={preparing:false,error:reason?.message||"Excel export failed."}}).finally(()=>{if(explorerExportController!==controller)return;explorerExportController=null;if(explorerExportTask.preparing)explorerExportTask={preparing:false,error:""};notifyExplorerExportTask()});
};

export const cancelExplorerExportTask=()=>{explorerExportController?.abort();explorerExportController=null;explorerExportTask={preparing:false,error:""};notifyExplorerExportTask()};

export function Explorer({
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
    [sortColumn,setSortColumn]=useState(""),
    [sortDirection,setSortDirection]=useState<"asc"|"desc">("asc"),
    [drawer, setDrawer] = useState(false),
    [filterSearch, setFilterSearch] = useState(""),
    [filters, setFilters] = useState<Record<string, string[]>>({}),
    [options, setOptions] = useState<{ name: string; values: string[]; valueCount?: number; truncated?: boolean }[]>([]),
    [result, setResult] = useState<LegalExplorerResult | null>(null),
    [selectedRows,setSelectedRows]=useState<Map<string,Record<string,unknown>>>(new Map()),
    [exportTask,setExportTask]=useState(explorerExportTask),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [page,setPage]=useQueryPage(JSON.stringify([dataset,debouncedSearch,filters]));
  useEffect(()=>subscribeExplorerExportTask(setExportTask),[]);
  useEffect(()=>{if(exportTask.error)setError(exportTask.error)},[exportTask.error]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    if (dataset) {
      setBusy(true);
      setError("");
      getLegalExplorer(dataset, debouncedSearch, page, filters,sortColumn,sortDirection)
        .then(data => {if(active)setResult(data)})
        .catch(reason => {if(active)setError(reason.message || "Unable to load dataset.")})
        .finally(() => {if(active)setBusy(false)});
    }
    return () => {active = false};
  }, [dataset, debouncedSearch, page, filters, sortColumn, sortDirection]);
  useEffect(() => {
    const controller=new AbortController();
    if (dataset) getLegalExplorerFilters(dataset,controller.signal,filters,debouncedSearch).then(x => {if(!controller.signal.aborted)setOptions(x.columns)}).catch(reason => {if(!controller.signal.aborted)setError(reason.message)});
    return () => controller.abort();
  }, [dataset,filters,debouncedSearch,metadata.revision]);
  const datasetOrder=["beneficiaries","assessments","legalservices","followupslogbooks","legalfees","deportationrecords","legalhotlines","awareness"],
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
          Filters{activeCount > 0 && <b>{activeCount}</b>}
        </button>
        <button className="soft explorer-sticky-clear" disabled={!activeCount} onClick={()=>{setFilters({});setPage(1)}}>
          <RotateCcw />
          Reset
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
            Reset all
          </button>
        </div>
      )}
      {busy && !result && <LegalSkeleton variant="explorer" embedded />}
      {!(busy && !result) && <div className="glass legal-table-card compact-explorer">
        <div className="legal-card-heading">
          <label className="explorer-table-search"><Search/><input className="table-search-input" placeholder="Search data" value={search} onChange={(event)=>{setSearch(event.target.value)}}/></label>
          <div className="indicator-total-block detention-table-total"><strong>{result?.total.toLocaleString() || 0}</strong><span>Total</span></div>
          <TableSelectionActions selected={selectedRows} filename={`${dataset}-selected.xlsx`} onClear={()=>setSelectedRows(new Map())} onDownloadAll={download} iconOnly/>
          {result && <Pager compact page={page} total={result.total} onChange={setPage}/>}
        </div>
        <div className="legal-table-wrap">
          <ValueTable>
            <thead>
              <tr><th><input aria-label="Select all filtered records" type="checkbox" checked={Boolean(result?.total)&&selectedRows.size===result!.total} onChange={async(event)=>{if(!event.target.checked){setSelectedRows(new Map());return;}const all=await getLegalExplorer(dataset,debouncedSearch,1,filters,sortColumn,sortDirection,result?.total||100,);setSelectedRows(new Map(all.rows.map((row:any)=>[String(row.__rowKey),row])));}}/></th>
                {result?.columns.map((c) => (
                  <SortableHeader key={c} direction={sortColumn===c?sortDirection:undefined} onSort={()=>{const direction=sortColumn===c&&sortDirection==="asc"?"desc":"asc";setSortColumn(c);setSortDirection(direction);setPage(1)}} buttonProps={{"className":sortColumn===c?"active":""}}><span>{c}</span><b>{sortColumn===c?(sortDirection==="asc"?"▲":"▼"):"↕"}</b></SortableHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, i) => (
                <tr key={i}><td><input aria-label="Select record" type="checkbox" checked={selectedRows.has(String((row as any).__rowKey))} onChange={()=>setSelectedRows((current)=>{const next=new Map(current),key=String((row as any).__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>
                  {result?.columns.map((c) => (
                    <td key={c}>
                      {hasLegalCore(metadata) && ((dataset === "beneficiaries" && c === "Case ID") || (["assessments","legalservices","followupslogbooks","legalfees"].includes(dataset) && c === "Beneficiary ID")) ? (
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
          </ValueTable>
        </div>
      </div>}
      {drawer&&<SharedFilterDrawer title={`Filter ${metadata.sheets.find(sheet=>sheet.id===dataset)?.name||dataset}`} eyebrow="DATA FILTERS" onClose={()=>setDrawer(false)} onReset={()=>{setFilters({});setPage(1)}} resetDisabled={!activeCount} search={filterSearch} onSearchChange={setFilterSearch}
        fields={options.map(option=>({key:option.name,label:option.name,values:option.values,selected:filters[option.name]||[],formatCaption:(item:string)=>formatYearMonthFilterValue(option.name,item),onChange:(items:string[])=>{setFilters(current=>({...current,[option.name]:items}));setPage(1)},note:option.truncated?<small className="filter-value-limit">Showing {option.values.length} of {option.valueCount?.toLocaleString()} values. Use Search data to find a specific record.</small>:undefined}))}/>}
    </>
  );
}
