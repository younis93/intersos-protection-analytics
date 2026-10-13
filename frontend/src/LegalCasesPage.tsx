import {AnimatedActionIcon} from './AnimatedActionIcon';
import {AnimatedSectionIcon} from './AnimatedNavigationIcon';
import {SharedFilterDrawer} from './SharedFilterDrawer';
import {
ArrowRight,
Download,
LayoutDashboard,
Search,
TableProperties,
X
} from "lucide-react";
import { useEffect,useRef,useState } from "react";
import {
exportLegalCases,
getLegalCase,
getLegalCaseFilters
} from "./api";
import { formatYearMonthFilterValue } from "./dateFormat";
import { CaseTree,getField } from './LegalCaseTree';
import { legalLoadScheduler } from "./legalLoadScheduler";
import { value } from './LegalRecordCells';
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import { Pager,RowSelectionCheckbox,SortableHeader } from './TableControls';
import { TableSelectionActions } from './TableSelectionActions';
import type { LegalMetadata } from "./types";
import { ValueTable } from "./ValueTable";

export type CasesExportTask={preparing:boolean;error:string};

export let casesExportTask:CasesExportTask={preparing:false,error:""};

export let casesExportController:AbortController|null=null;

export const casesExportListeners=new Set<(task:CasesExportTask)=>void>();

export const getCasesExportTask=()=>casesExportTask;

export const notifyCasesExportTask=()=>casesExportListeners.forEach((listener)=>listener(casesExportTask));

export const subscribeCasesExportTask=(listener:(task:CasesExportTask)=>void)=>{casesExportListeners.add(listener);return()=>{casesExportListeners.delete(listener)}};

export const startCasesExportTask=(query:string,filters:Record<string,string[]>)=>{
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

export const cancelCasesExportTask=()=>{casesExportController?.abort();casesExportController=null;casesExportTask={preparing:false,error:""};notifyCasesExportTask()};

export function Cases({
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
  const previousFilters=useRef(filters);
  const queryTimer=useRef<number|undefined>(undefined);
  const latestScope=useRef({query,filters});latestScope.current={query,filters};
  const caseRequest = useRef(0);
  const run = (term=query,nextFilters=filters,nextView=viewMode,nextPage=tablePage,nextSort=sortColumn,nextDirection=sortDirection) => {
    window.clearTimeout(queryTimer.current);
    setBusy(true);
    setError("");
    const request = ++caseRequest.current;
    const current=()=>request===caseRequest.current&&term===latestScope.current.query&&nextFilters===latestScope.current.filters;
    getLegalCase(term,nextFilters,{viewMode:nextView,page:nextPage,pageSize:100,sortColumn:nextSort,sortDirection:nextDirection,columns:selectedColumns})
      .then((next) => {if(!current())return;setData(next);if(nextView==="table"&&!selectedColumns.length)setSelectedColumns(next.columns.map((column) => column.key))})
      .catch((reason) => {if(current())setError(reason.message || "Unable to load beneficiary cases.")})
      .finally(() => {if(current())setBusy(false)});
  };
  useEffect(() => {
    run(initialQuery, filters);
    onQueryUsed();
    return () => {window.clearTimeout(queryTimer.current);caseRequest.current++};
  }, []);
  useEffect(() => {
    const filterChanged=previousFilters.current!==filters;previousFilters.current=filters;
    if (!liveSearchReady.current) {
      liveSearchReady.current = true;
      return;
    }
    caseRequest.current++;
    setBusy(true);
    queryTimer.current = window.setTimeout(() => {
      setTablePage(1);
      run(query, filters, viewMode, 1);
    }, filterChanged?120:300);
    return () => window.clearTimeout(queryTimer.current);
  }, [query,filters]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(()=>getLegalCaseFilters(controller.signal,filters,query).then(next=>{if(!controller.signal.aborted)setFilterOptions(next.groups)}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)}),200);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[filters,query,metadata.revision]);
  const activeCount = Object.values(filters).reduce((sum,items)=>sum+items.length,0);
  const clear = () => {
    setFilters({});
    setTablePage(1);
  };
  return (
    <>
      {error && <div className="error glass">{error}</div>}
      <LegalScrollControls search={query} onSearch={setQuery} onSearchSubmit={()=>{setTablePage(1);run(query,filters,viewMode,1)}} searchPlaceholder="Search cases" onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={clear}>
      <div className="case-search glass sticky-case-search">
        <div className="case-search-title">
          <AnimatedSectionIcon Icon={Search} iconStyle="search" size={25}/>
          <div>
            <strong>Find a beneficiary case</strong>
            <span>Search by Case ID, Assessment ID, Service ID, name, contact number, national ID, UNHCR or ASSIST number.</span>
          </div>
          <span className="case-header-total"><strong>{data?.totalCases || data?.totalRows || 0}</strong> cases{busy ? " · Updating…" : ""}</span>
          <span className="view-switch case-view-switch" aria-label="View mode">
            <button
              className={viewMode === "cards" ? "active" : ""}
              onClick={() => {legalLoadScheduler.promotePage("cases","cards");setViewMode("cards");setTablePage(1);run(query,filters,"cards",1)}}
              aria-label="Card view"
              title="Card view"
            >
              <AnimatedSectionIcon Icon={LayoutDashboard} iconStyle="layout-dashboard" active={viewMode==="cards"} size={15}/>
            </button>
            <button
              className={viewMode === "table" ? "active" : ""}
              onClick={() => {legalLoadScheduler.promotePage("cases","table");setViewMode("table");setTablePage(1);run(query,filters,"table",1)}}
              aria-label="Table view"
              title="Table view"
            >
              <AnimatedSectionIcon Icon={TableProperties} iconStyle="table-properties" active={viewMode==="table"} size={15}/>
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
            <AnimatedActionIcon type="filters"/>
            Filters{activeCount > 0 && <b>{activeCount}</b>}
          </button>
          <button className="soft case-clear" disabled={!activeCount} onClick={clear}><AnimatedActionIcon type="reset"/>Reset</button>
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
      {drawer&&<SharedFilterDrawer title="Filter beneficiary cases" eyebrow="CASE FILTERS" onClose={()=>setDrawer(false)} onReset={clear} resetDisabled={!activeCount} search={filterSearch} onSearchChange={setFilterSearch}
        fields={filterOptions.flatMap(group=>group.columns.map(option=>({key:option.key,label:`${group.label} · ${option.name}`,values:option.values,selected:filters[option.key]||[],formatCaption:(item:string)=>formatYearMonthFilterValue(option.name,item),onChange:(items:string[])=>setFilters(current=>({...current,[option.key]:items}))})))}/>}
    </>
  );
}

export function HierarchicalCaseTable({cases,page,total,onPageChange,sortColumn,sortDirection,onSort,onOpenCase}:{cases:any[];page:number;total:number;onPageChange:(page:number)=>void;sortColumn:string;sortDirection:"asc"|"desc";onSort:(column:string)=>void;onOpenCase:(id:string)=>void}) {
  const [selected,setSelected]=useState<Map<string,Record<string,unknown>>>(new Map());
  const summaryColumns=[["Lawyer","Lawyer"],["beneficiaries::Case ID","Case ID"],["beneficiaries::Name (Filter Color Red)","Name"],["beneficiaries::Project","Project"],["beneficiaries::Project Location","Location"],["beneficiaries::DoB","Date of birth"]] as [string,string][];
  const rowFor=(item:any)=>({"Case ID":String(getField(item.beneficiary,"Case ID")||""),Name:String(getField(item.beneficiary,"Name (Filter Color Red)")||""),Project:String(getField(item.beneficiary,"Project")||""),Location:String(getField(item.beneficiary,"Project Location")||""),Lawyer:String((item.lawyers||[]).join(", ")||"Unassigned")});
  const displayedCases=[...cases].sort((left,right)=>Number(selected.has(String(getField(right.beneficiary,"Case ID")||"")))-Number(selected.has(String(getField(left.beneficiary,"Case ID")||""))));
  return <div className="glass case-table hierarchical-case-table"><div className="legal-card-heading"><div className="indicator-total-block detention-table-total"><strong>{total.toLocaleString()}</strong><span>Total</span></div><TableSelectionActions selected={selected} filename="selected-beneficiary-cases.xlsx" onClear={()=>setSelected(new Map())} onDownloadSelected={()=>exportLegalCases("",{},"selected-beneficiary-cases.xlsx",Array.from(selected.keys()))} iconOnly/><Pager compact page={page} total={total} onChange={onPageChange}/></div><ValueTable><thead><tr><th><RowSelectionCheckbox label="Select visible cases" total={(cases||[]).length} selectedCount={(cases||[]).filter((item)=>selected.has(String(getField(item.beneficiary,"Case ID")||""))).length} onChange={checked=>setSelected((current)=>{const next=new Map(current);cases.forEach((item)=>{const row=rowFor(item),key=row["Case ID"];if(checked)next.set(key,row);else next.delete(key)});return next})}/></th>{summaryColumns.map(([key,label])=><SortableHeader key={key} direction={sortColumn===key?sortDirection:undefined} onSort={()=>onSort(key)} buttonProps={{"className":sortColumn===key?"active":""}}><span>{label}</span><b>{sortColumn===key?(sortDirection==="asc"?"▲":"▼"):"↕"}</b></SortableHeader>)}<th>Connected records</th></tr></thead><tbody>{displayedCases.map((item,index)=>{const row=rowFor(item),key=row["Case ID"],counts=item.counts||{};return <tr className={selected.has(key)?"case-row-selected":""} key={key||index}><td><input aria-label="Select case" type="checkbox" checked={selected.has(key)} onChange={()=>setSelected((current)=>{const next=new Map(current);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td><td>{value(row.Lawyer)}</td><td><button className="table-action" onClick={()=>onOpenCase(key)} aria-label={`Open case ${key}`}>{value(key)}<ArrowRight/></button></td><td>{value(row.Name)}</td><td>{value(row.Project)}</td><td>{value(row.Location)}</td><td>{value(getField(item.beneficiary,"DoB"))}</td><td><div className="case-connected-summary"><span><b>{counts.assessments||0}</b><small>Assessments</small></span><span><b>{counts.services||0}</b><small>Services</small></span>{counts.followups>0&&<span><b>{counts.followups}</b><small>Follow-ups</small></span>}{counts.fees>0&&<span><b>{counts.fees}</b><small>Legal fees</small></span>}</div></td></tr>})}</tbody></ValueTable></div>;
  /* legacy flat renderer retained below only as unreachable migration reference */
  const rows:Record<string,unknown>[]=[];const columns:{key:string;label:string;dataset:string}[]=[];
  const groups:{label:string;count:number}[]=[];
  columns.forEach((column) => {const last=groups[groups.length-1];if(last?.label===column.dataset)last.count+=1;else groups.push({label:column.dataset,count:1})});
  return <div className="glass case-table connected-case-table"><ValueTable><thead>
    <tr className="case-dataset-head">{groups.map((group) => <th key={group.label} colSpan={group.count}>{group.label}</th>)}</tr>
    <tr>{columns.map((column) => <SortableHeader key={column.key} direction={sortColumn===column.key?sortDirection:undefined} onSort={() => onSort(column.key)} buttonProps={{"className":sortColumn===column.key?"active":""}}><span>{column.label}</span><b>{sortColumn===column.key?(sortDirection==="asc"?"▲":"▼"):"↕"}</b></SortableHeader>)}</tr>
  </thead><tbody>{rows.map((row,index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{value(row[column.key])}</td>)}</tr>)}</tbody></ValueTable></div>;
}
