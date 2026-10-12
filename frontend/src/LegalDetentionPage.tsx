import {
ArrowRight,
BarChart3,
CheckCircle2,
FolderOpen,
RotateCcw,
Search,
ShieldCheck,
SlidersHorizontal,
TableProperties,
X
} from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { createPortal } from "react-dom";
import {
exportLegalDetention,
exportLegalDetentionReconciliation,
getDetentionWorkbookSheets,
getLegalDetention,
reconcileLegalDetention
} from "./api";
import { ChartCard,TrendCard } from './ChartComponents';
import { formatFilterMonth } from "./dateFormat";
import { FilterDrawerShell,FilterSection } from './FilterDrawerShell';
import { legalLoadScheduler } from "./legalLoadScheduler";
import { IraqDetentionMapMetrics } from './LegalMapMetrics';
import { value } from './LegalRecordCells';
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import { AppSelect,CheckboxMultiSelect,ExcelDownloadButton,FilterValueList } from './SelectionControls';
import { Pager,RowSelectionCheckbox } from './TableControls';
import { TableSelectionActions } from './TableSelectionActions';
import { useDebouncedValue } from "./useDebouncedValue";
import { useQueryPage } from "./useQueryPage";
import { ValueTable } from "./ValueTable";

export function DetentionCases({
  onOpenCase,
  theme,
}: {
  onOpenCase: (caseId: string) => void;
  theme: any;
}) {
  const [recordSearch,setRecordSearch]=useState(""),
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
  const debouncedRecordSearch=useDebouncedValue(recordSearch);
  const [page,setPage]=useQueryPage(JSON.stringify([filters,tab,tab==="records"?debouncedRecordSearch:""]));
  useEffect(() => {
    let current=true;
    setBusy(true);
    setError("");
    getLegalDetention(tab==="records"?debouncedRecordSearch:"", page, filters,tab==="records"?recordSortColumn:"",recordSortDirection)
      .then((result)=>{if(current)setData(result)})
      .catch((reason) => {if(current)setError(reason.message || "Unable to load detention records.")})
      .finally(() => {if(current)setBusy(false)});
    return()=>{current=false};
  }, [page, filters, tab, debouncedRecordSearch, recordSortColumn, recordSortDirection]);
  const updateFilter = (label: string, selections: string[]) => {
    setFilters((current) => ({
      ...current,
      [label]: selections,
    }));
    setPage(1);
  };
  const activeCount=Object.values(filters).reduce((sum,items)=>sum+items.length,0);
  const quickFilterLabels=["Project","Project location","Detention governorate","Date of Assessment","Date of Detention","Date of the released","Current status","Type of Released","Nationality"];
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
      await exportLegalDetention(recordSearch,filters,recordSortColumn,recordSortDirection);
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
        <button className={tab==="analysis"?"active":""} onClick={()=>{legalLoadScheduler.promotePage("detention","analysis");setTab("analysis")}}><BarChart3/>Analysis</button>
        <button className={tab==="records"?"active":""} onClick={()=>{legalLoadScheduler.promotePage("detention","records");setTab("records")}}><TableProperties/>Detention detail table</button>
        <button className={tab==="reconcile"?"active":""} onClick={()=>setTab("reconcile")}><ShieldCheck/>Platform and Excel Comparison</button>
      </nav>
      {tab!=="reconcile"&&<LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={()=>{setFilters({});setPage(1)}}>
      <div className="glass detention-toolbar">
        {quickFilters()}
        <div className="detention-toolbar-actions"><button className="soft detention-filter-clear" disabled={!activeCount} onClick={()=>{setFilters({});setPage(1)}}><RotateCcw/>Reset</button><button className="primary" onClick={()=>setDrawer(true)}><SlidersHorizontal/>Filters {activeCount>0&&<b>{activeCount}</b>}</button></div>
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
          <label className="detention-table-search"><Search/><input className="table-search-input" value={recordSearch} onChange={(event)=>{setRecordSearch(event.target.value)}} placeholder="Search detention cases"/></label>
          <div className="indicator-total-block detention-table-total"><strong>{data?.total.toLocaleString() || 0}</strong><span>Total</span></div>
          <TableSelectionActions selected={selectedRecords} filename="selected-detention-records.xlsx" onClear={()=>setSelectedRecords(new Map())} onDownloadAll={exportDetentionTable} iconOnly/>{data&&<Pager compact page={page} total={data.total} onChange={setPage}/>}
        </div>
        <div className="legal-table-wrap">
          <ValueTable>
            <thead>
              <tr><th><RowSelectionCheckbox label="Select visible detention records" total={(data?.rows||[]).length} selectedCount={(data?.rows||[]).filter((row:any)=>selectedRecords.has(String(row.__rowKey))).length} onChange={checked=>setSelectedRecords((current)=>{const next=new Map(current);data?.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(checked)next.set(key,row);else next.delete(key)});return next})}/></th>
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
          </ValueTable>
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
            <div className="reconciliation-export"><ExcelDownloadButton className="primary" onClick={exportComparison} busy={comparisonExporting} disabled={!comparisonResult.rows.length}/></div>
          </div>
          {comparisonResult.warnings.length>0&&<details className="reconciliation-warnings"><summary>{comparisonResult.warnings.length} workbook column warning{comparisonResult.warnings.length===1?"":"s"}</summary>{comparisonResult.warnings.map((warning)=><p key={warning}>{warning}</p>)}</details>}
          <div className="legal-table-wrap reconciliation-table"><ValueTable><thead><tr><th className="no-sort">Note group</th><th className="no-sort">Beneficiary ID</th><th className="no-sort">Name</th><th className="no-sort">Different field</th><th className="no-sort">Platform Value</th><th className="no-sort">Excel value</th><th className="no-sort">Action</th></tr></thead><tbody>{comparisonResult.rows.length?Array.from(new Set(comparisonResult.rows.map((row)=>row.note))).flatMap((note,groupIndex)=>{
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
          }):<tr><td colSpan={7}><div className="reconciliation-empty"><CheckCircle2/><strong>All records match for {comparisonResult.month}</strong></div></td></tr>}</tbody></ValueTable></div>
        </>}
      </section>}
      {drawer&&<><FilterDrawerShell className="case-filter-drawer" header={<header><div><span className="eyebrow">DETENTION FILTERS</span><h2>Filter detention cases</h2></div><button onClick={()=>setDrawer(false)}><X/></button></header>} footer={<footer><button className="soft" disabled={!activeCount} onClick={()=>{setFilters({});setPage(1)}}>Reset all</button><button className="primary" onClick={()=>setDrawer(false)}>Apply filters {activeCount>0&&`(${activeCount})`}</button></footer>} backdrop={<button className="filter-backdrop" aria-label="Close filters" onClick={()=>setDrawer(false)}/>}><div className="case-filter-scroll review-checkbox-filters">{Object.entries(data?.filterOptions||{}).map(([label,values])=><FilterSection key={label} open={Boolean(filters[label]?.length)} label={<>{label}</>} badge={<>{filters[label]?.length>0&&<b>{filters[label].length}</b>}</>}><div>{<FilterValueList field={label} values={values} formatCaption={item=>/date/i.test(label)?formatFilterMonth(item):item} selected={filters[label]||[]} onChange={items=>updateFilter(label,items)}/>}</div></FilterSection>)}</div></FilterDrawerShell></>}
      {drillMenu&&createPortal(<div ref={drillMenuRef} className="detention-drill-menu" role="menu" aria-label="Chart table options" style={{left:drillMenu.x,top:drillMenu.y}}><span>Filtered records</span><button role="menuitem" autoFocus onClick={()=>{setDrillMenu(null);setPage(1);setTab("records")}}><TableProperties/><div><strong>Open detail table</strong><small>Keep all active filters</small></div><ArrowRight/></button><button role="menuitem" className="cancel" onClick={()=>setDrillMenu(null)}><X/>Cancel</button></div>,document.body)}
    </div>
  );
}
import './detention.css';
