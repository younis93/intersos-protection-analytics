import {useLegalRecordFilters} from './useLegalRecordFilters';
import {DeportationIdButton} from './DeportationCaseModal';
import {isDeportationIdColumn} from './deportationCase';
import {AnimatedActionIcon} from './AnimatedActionIcon';
import {
RefreshCw,
Search,
ShieldAlert
} from "lucide-react";
import { useEffect,useState } from "react";
import {
exportLegalExplorer,
getLegalDeportationDashboard,
getLegalExplorer
} from "./api";
import { ChartCard,TrendCard } from './ChartComponents';
import { FilterDrawer } from './FilterControls';
import { KpiCard } from './KpiCard';
import { value } from './LegalRecordCells';
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import { AppSelect,CheckboxMultiSelect } from './SelectionControls';
import { Pager,RowSelectionCheckbox,SortableHeader } from './TableControls';
import { TableSelectionActions } from './TableSelectionActions';
import type { Dashboard,LegalExplorerResult,LegalMetadata,Theme } from "./types";
import { useDebouncedValue } from "./useDebouncedValue";
import { useQueryPage } from "./useQueryPage";
import { ValueTable } from "./ValueTable";

export function LegalDeportationDashboard({metadata,theme}:{metadata:LegalMetadata;theme:Theme}){
  const [recordSearch,setRecordSearch]=useState(""),[columnFilterCount,setColumnFilterCount]=useState(0);
  const [dash,setDash]=useState<Dashboard|null>(null),[error,setError]=useState(""),[filters,setFilters]=useState<Record<string,string[]>>({}),[drawer,setDrawer]=useState(false),[display,setDisplay]=useState<"both"|"count"|"percent">("both"),[refreshing,setRefreshing]=useState(false);
  useEffect(()=>{const controller=new AbortController();setError("");setRefreshing(true);getLegalDeportationDashboard(filters,controller.signal,recordSearch).then(data=>{if(!controller.signal.aborted)setDash(data)}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message||"Unable to load deportation data.")}).finally(()=>{if(!controller.signal.aborted)setRefreshing(false)});return()=>controller.abort()},[metadata.source,filters,recordSearch]);
  const activeCount=columnFilterCount+Object.values(filters).reduce((count,values)=>count+values.length,0),clear=()=>setFilters({});
  if(error)return <section className="glass legal-empty"><ShieldAlert/><h2>Unable to load Deportation</h2><p>{error}</p><button className="primary" onClick={()=>window.location.reload()}><RefreshCw/>Retry</button></section>;
  if(!dash)return <LegalSkeleton variant="deportation"/>;
  const selectChart=(field:string,value:string)=>setFilters((current)=>({...current,[field]:current[field]?.includes(value)?current[field].filter((item)=>item!==value):[...(current[field]||[]),value]}));
  const dashboardFilterOptions=dash.filterOptions||{};
  const quickFields=Object.keys(dashboardFilterOptions).filter((field)=>field!=="__reviewStyle"&&(/project/i.test(field)||/date.*deportation.*knowledge/i.test(field))).sort((left,right)=>(/project.*location/i.test(left)?1:/date/i.test(left)?2:0)-(/project.*location/i.test(right)?1:/date/i.test(right)?2:0));
  const quickLabel=(field:string)=>/project.*location/i.test(field)?"Project location":/date/i.test(field)?"Date Of Deportation Knowledge":"Project";
  return <section className={`legal-deportation-dashboard dashboard-content ${refreshing?"refreshing":""}`}><LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={clear}><div className="toolbar deportation-top-toolbar"><div className="deportation-quick-filters">{quickFields.map((field)=><CheckboxMultiSelect key={field} hideLabel label={quickLabel(field)} values={dashboardFilterOptions[field]||[]} selected={filters[field]||[]} onChange={(items)=>setFilters((current)=>({...current,[field]:items}))}/>)}</div><div className="deportation-toolbar-actions"><button className="soft case-filter-button" onClick={()=>setDrawer(true)}><AnimatedActionIcon type="filters"/>Filters {activeCount>0&&<b>{activeCount}</b>}</button><button className="soft detention-filter-clear" onClick={clear} disabled={!activeCount}><AnimatedActionIcon type="reset"/>Reset</button></div><div className="toolbar-metrics"><AppSelect label="Display" value={display} onChange={(value)=>setDisplay(value as "both"|"count"|"percent")} options={[["both","# + %"],["count","Count #"],["percent","Percentage %"]]}/></div></div></LegalScrollControls><div className="refresh-indicator">Updating filters…</div><div className="kpi-grid">{dash.kpis.map((item)=><KpiCard key={item.label} {...item}/>)}</div><div className="dashboard-grid"><TrendCard rows={dash.trend} display={display} theme={theme} selected={filters.Month||[]} onSelect={(months,replace)=>setFilters((current)=>({...current,Month:replace?months:Array.from(new Set([...(current.Month||[]),...months]))}))} onRemove={(month)=>setFilters((current)=>({...current,Month:(current.Month||[]).filter((item)=>item!==month)}))} title="Activity over time" subtitle="Date of deportation"/>{dash.charts.map((chart)=><ChartCard key={chart.id} chart={chart} display={display} theme={theme} onSelect={selectChart}/>)}</div><DeportationRecordsTable filters={filters} onSearchChange={setRecordSearch} onFilterCountChange={setColumnFilterCount}/><FilterDrawer open={drawer} available={dashboardFilterOptions} filters={filters} onClose={()=>setDrawer(false)} onChange={setFilters} onReset={clear}/></section>;
}

export function DeportationRecordsTable({filters,onSearchChange,onFilterCountChange}:{filters:Record<string,string[]>;onSearchChange:(search:string)=>void;onFilterCountChange?:(count:number)=>void}){
  const [result,setResult]=useState<LegalExplorerResult|null>(null),[search,setSearch]=useState(""),[sortColumn,setSortColumn]=useState(""),[sortDirection,setSortDirection]=useState<"asc"|"desc">("asc"),[selected,setSelected]=useState<Map<string,Record<string,unknown>>>(new Map());
  const debouncedSearch=useDebouncedValue(search);
  const [page,setPage]=useQueryPage(JSON.stringify([filters,debouncedSearch]));
  const recordFilters=useLegalRecordFilters("deportationrecords","deportationrecords",filters,debouncedSearch,()=>setPage(1));
  useEffect(()=>onSearchChange(debouncedSearch),[debouncedSearch,onSearchChange]);
  useEffect(()=>{onFilterCountChange?.(recordFilters.columnFilters.length)},[recordFilters.columnFilters,onFilterCountChange]);
  useEffect(()=>{let active=true;getLegalExplorer("deportationrecords",debouncedSearch,page,recordFilters.requestLegacy,sortColumn,sortDirection,100,undefined,recordFilters.columnFilters).then(data=>{if(active)setResult(data)}).catch(()=>{if(active)setResult(null)});return()=>{active=false}},[filters,debouncedSearch,page,sortColumn,sortDirection,recordFilters.columnFilters]);
  return <section className="glass legal-table-card deportation-records-table"><div className="legal-card-heading"><label className="detention-table-search"><Search/><input className="table-search-input" value={search} onChange={(event)=>{setSearch(event.target.value)}} placeholder="Search deportation records"/></label><div className="indicator-total-block detention-table-total"><strong>{result?.total.toLocaleString()||0}</strong><span>Total</span></div><TableSelectionActions selected={selected} onResetFilters={recordFilters.clear} hasActiveFilters={recordFilters.control.filters.length>0} filename="selected-deportation-records.xlsx" onClear={()=>setSelected(new Map())} onDownloadAll={()=>exportLegalExplorer("xlsx","deportationrecords",debouncedSearch,recordFilters.requestLegacy,undefined,recordFilters.columnFilters)} iconOnly/>{result&&<Pager compact page={page} total={result.total} onChange={setPage}/>}</div><div className="legal-table-wrap"><ValueTable recordFilters={{...recordFilters.control,showClearAll:false}}><thead><tr><th><RowSelectionCheckbox label="Select visible deportation records" total={(result?.rows||[]).length} selectedCount={(result?.rows||[]).filter((row:any)=>selected.has(String(row.__rowKey))).length} onChange={checked=>setSelected((current)=>{const next=new Map(current);result?.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(checked)next.set(key,row);else next.delete(key)});return next})}/></th>{result?.columns.map((column)=><SortableHeader key={column} direction={sortColumn===column?sortDirection:undefined} onSort={()=>{setSortColumn(column);setSortDirection(sortColumn===column&&sortDirection==="asc"?"desc":"asc");setPage(1)}} buttonProps={{}}>{column}</SortableHeader>)}</tr></thead><tbody>{result?.rows.map((row:any,index)=><tr key={index}><td><input aria-label="Select deportation record" type="checkbox" checked={selected.has(String(row.__rowKey))} onChange={()=>setSelected((current)=>{const next=new Map(current),key=String(row.__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>{result.columns.map((column)=><td key={column}>{isDeportationIdColumn(column)?<DeportationIdButton pnId={row[column]} identifierColumn={column}/>:value(row[column])}</td>)}</tr>)}</tbody></ValueTable></div></section>;
}
