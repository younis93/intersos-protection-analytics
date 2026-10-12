import {
Megaphone,
RotateCcw,
Search,
X
} from "lucide-react";
import { useEffect,useState } from "react";
import { exportLegalExplorer,getLegalExplorer,getLegalHotlineDashboard } from "./api";
import { ChartCard,TrendCard } from './ChartComponents';
import { formatFilterMonth } from "./dateFormat";
import { ActiveFilters } from './FilterControls';
import { FilterDrawerShell,FilterSection } from './FilterDrawerShell';
import { KpiCard } from './KpiCard';
import { IraqDetentionMapMetrics } from './LegalMapMetrics';
import { value } from './LegalRecordCells';
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import { CheckboxMultiSelect,FilterValueList } from './SelectionControls';
import { Pager,RowSelectionCheckbox,SortableHeader,TableState } from './TableControls';
import { TableSelectionActions } from './TableSelectionActions';
import type { Dashboard,LegalExplorerResult,LegalMetadata,Theme } from "./types";
import { useDebouncedValue } from "./useDebouncedValue";
import { useQueryPage } from "./useQueryPage";
import { ValueTable } from "./ValueTable";

export function HotlineDashboard({metadata,theme}:{metadata:LegalMetadata;theme:Theme}) {
  const [recordSearch,setRecordSearch]=useState("");
  const [dash,setDash]=useState<(Omit<Dashboard,"trend"> & {trend:{label:string;count:number;percent:number;detained:number;notDetained:number}[];missingContactDates:number;map:{items:{label:string;count:number;detained:number;notDetained:number;values:string[]}[]}})|null>(null),[filters,setFilters]=useState<Record<string,string[]>>({}),[drawer,setDrawer]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{if(!metadata.availability.legalhotlines)return;const controller=new AbortController();setBusy(true);setError("");getLegalHotlineDashboard(filters,controller.signal,recordSearch).then(data=>{if(!controller.signal.aborted)setDash(data)}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message||"Unable to load Hotline.")}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[metadata.revision,metadata.source,metadata.availability.legalhotlines,filters,retry,recordSearch]);
  const clear=()=>setFilters({}),activeCount=Object.values(filters).reduce((sum,items)=>sum+items.length,0);
  const select=(field:string,label:string)=>setFilters(current=>({...current,[field]:current[field]?.includes(label)?current[field].filter(item=>item!==label):[...(current[field]||[]),label]}));
  if(!metadata.availability.legalhotlines)return <section className="glass legal-empty"><Megaphone/><h2>Load hotline data</h2><p>Add legalhotlines.csv alongside the required datasets using the Data source folder or multiple-file selector.</p></section>;
  if(error)return <section className="glass legal-empty" role="alert"><h2>Unable to load Hotline</h2><p>{error}</p><button className="primary" onClick={()=>setRetry(n=>n+1)}>Retry</button></section>;
  if(!dash)return <LegalSkeleton variant="deportation"/>;
  const available=dash.filterOptions||{},quickFields=["Contact Date","Is the beneficiary detained","Has the beneficiary referred to the helpline?","Governorate of detention","Priority"];
  return <section className="hotline-dashboard dashboard-content" aria-busy={busy}>
    <LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={activeCount} onClear={clear}><div className="toolbar hotline-filter-bar">{quickFields.map(field=><CheckboxMultiSelect key={field} hideLabel label={field==="Contact Date"?"Contact Date (month)":field} values={available[field]||[]} selected={filters[field]||[]} onChange={items=>setFilters(current=>({...current,[field]:items}))}/>)}<button className="soft filter-reset-button" onClick={clear} disabled={!activeCount}><RotateCcw/>Reset</button></div></LegalScrollControls>
    <ActiveFilters filters={filters} onRemove={(field,label)=>setFilters(current=>({...current,[field]:current[field].filter(item=>item!==label)}))}/>
    {busy&&<TableState as="p">Updating hotline data...</TableState>}
    <div className="kpi-grid">{dash.kpis.map(item=><KpiCard key={item.label} {...item}/>)}</div>
    {dash.total===0&&<p className="glass legal-empty">No hotline records match these filters.</p>}
    <TrendCard rows={dash.trend} hoverMetrics={[{label:"Detained",icon:"●",color:"#d4852f",rows:dash.trend.map(row=>({label:row.label,count:row.detained}))},{label:"Not detained",icon:"✓",color:"#2f9e68",rows:dash.trend.map(row=>({label:row.label,count:row.notDetained}))}]} primaryLabel="Hotline contacts" display="both" theme={theme} title="Monthly hotline contacts" subtitle="Records by Contact Date" selected={filters["Contact Date"]||[]} onSelect={(months,replace)=>setFilters(current=>({...current,"Contact Date":replace?months:Array.from(new Set([...(current["Contact Date"]||[]),...months]))}))} onRemove={month=>setFilters(current=>({...current,"Contact Date":(current["Contact Date"]||[]).filter(item=>item!==month)}))}/>
    {dash.missingContactDates>0&&<p role="note">{dash.missingContactDates.toLocaleString()} records have missing or invalid Contact Dates and are excluded from the timeline.</p>}
    <IraqDetentionMapMetrics mode="hotline" items={(dash.map?.items||[]).filter(item=>item.detained>0).map(item=>({...item,count:item.detained,released:0}))} selected={filters["Governorate of detention"]||[]} onSelect={(values)=>{const current=filters["Governorate of detention"]||[],remove=values.length>0&&values.every(value=>current.includes(value));setFilters(existing=>({...existing,"Governorate of detention":remove?current.filter(value=>!values.includes(value)):Array.from(new Set([...current,...values]))}))}}/>
    <div className="overview-analysis-grid">{dash.charts.map(chart=><ChartCard key={chart.id} chart={chart} display="both" theme={theme} onSelect={select}/>)}</div>
    <HotlineRecordsTable filters={filters} onSearchChange={setRecordSearch}/>
    {drawer&&<><FilterDrawerShell className="case-filter-drawer" header={<header><div><span className="eyebrow">HOTLINE FILTERS</span><h2>Filter hotline records</h2></div><button onClick={()=>setDrawer(false)} aria-label="Close filters"><X/></button></header>} footer={<footer><button className="soft filter-reset-button" disabled={!activeCount} onClick={clear}><RotateCcw/>Reset</button><button className="primary" onClick={()=>setDrawer(false)}>Apply filters {activeCount>0&&`(${activeCount})`}</button></footer>} backdrop={<button className="filter-backdrop" aria-label="Close hotline filters" onClick={()=>setDrawer(false)}/>}><div className="case-filter-scroll review-checkbox-filters">{Object.entries(available).map(([label,values])=><FilterSection key={label} open={Boolean(filters[label]?.length)} label={<>{label}</>} badge={<>{filters[label]?.length>0&&<b>{filters[label].length}</b>}</>}><div>{<FilterValueList field={label} values={values} formatCaption={item=>/date/i.test(label)?formatFilterMonth(item):item} selected={filters[label]||[]} onChange={items=>setFilters(current=>({...current,[label]:items}))}/>}</div></FilterSection>)}</div></FilterDrawerShell></>}
  </section>;
}

export function HotlineRecordsTable({filters,onSearchChange}:{filters:Record<string,string[]>;onSearchChange:(search:string)=>void}){
  const [result,setResult]=useState<LegalExplorerResult|null>(null),[search,setSearch]=useState(""),[sortColumn,setSortColumn]=useState(""),[sortDirection,setSortDirection]=useState<"asc"|"desc">("asc"),[selected,setSelected]=useState<Map<string,Record<string,unknown>>>(new Map());
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const debouncedSearch=useDebouncedValue(search);
  const [page,setPage]=useQueryPage(JSON.stringify([filters,debouncedSearch]));
  useEffect(()=>onSearchChange(debouncedSearch),[debouncedSearch,onSearchChange]);
  useEffect(()=>{setSelected(new Map())},[filters,debouncedSearch]);
  useEffect(()=>{let active=true;setBusy(true);setError("");getLegalExplorer("legalhotlines",debouncedSearch,page,filters,sortColumn,sortDirection).then(data=>{if(active)setResult(data)}).catch((reason)=>{if(active){setResult(null);setError(reason.message||"Unable to load hotline records.")}}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[filters,debouncedSearch,page,sortColumn,sortDirection,retry]);
  const contactColumn=(column:string)=>/contact.*(number|phone)|phone.*number|رقم.*(هاتف|اتصال|متصل)/i.test(column);
  const nameColumn=(column:string)=>/name of (the )?(detained person|caller)|اسم.*(معتقل|متصل)/i.test(column);
  const columns=[...(result?.columns||[])].filter((column)=>!/^record[\s_-]*(?:id|identifier)\b/i.test(column.trim())).sort((left,right)=>Number(!(nameColumn(left)||contactColumn(left)))-Number(!(nameColumn(right)||contactColumn(right))));
  return <section className="glass legal-table-card deportation-records-table hotline-records-table"><div className="legal-card-heading"><label className="detention-table-search"><Search/><input className="table-search-input" value={search} onChange={(event)=>{setSearch(event.target.value)}} placeholder="Search hotline records"/></label><div className="indicator-total-block detention-table-total"><strong>{result?.total.toLocaleString()||0}</strong><span>Total</span></div><TableSelectionActions selected={selected} filename="selected-hotline-records.xlsx" onClear={()=>setSelected(new Map())} onDownloadAll={()=>exportLegalExplorer("xlsx","legalhotlines",debouncedSearch,filters)} iconOnly/>{result&&<Pager compact page={page} total={result.total} onChange={setPage}/>}</div>{error&&<div className="error" role="alert">{error}<button className="soft" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}{busy&&<TableState as="p">Loading records...</TableState>}{!busy&&!error&&result?.total===0&&<TableState as="p">No hotline records match these filters.</TableState>}<div className="legal-table-wrap" aria-busy={busy}><ValueTable><thead><tr><th><RowSelectionCheckbox label="Select visible hotline records" total={(result?.rows||[]).length} selectedCount={(result?.rows||[]).filter((row:any)=>selected.has(String(row.__rowKey))).length} onChange={checked=>setSelected((current)=>{const next=new Map(current);result?.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(checked)next.set(key,row);else next.delete(key)});return next})}/></th>{columns.map((column)=><SortableHeader key={column} direction={sortColumn===column?sortDirection:undefined} onSort={()=>{setSortColumn(column);setSortDirection(sortColumn===column&&sortDirection==="asc"?"desc":"asc");setPage(1)}} buttonProps={{"className":sortColumn===column?"active":""}}><span>{column}</span><b>{sortColumn===column?(sortDirection==="asc"?"▲":"▼"):"↕"}</b></SortableHeader>)}</tr></thead><tbody>{result?.rows.map((row:any,index)=><tr key={String(row.__rowKey??index)}><td><input aria-label="Select hotline record" type="checkbox" checked={selected.has(String(row.__rowKey))} onChange={()=>setSelected((current)=>{const next=new Map(current),key=String(row.__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>{columns.map((column)=>{const cell=value(row[column]),priority=/^priority\b/i.test(column)?String(cell).match(/high|عالية/i)?"high":String(cell).match(/medium|متوسطة/i)?"medium":String(cell).match(/low|منخفضة/i)?"low":"unknown":"";return <td key={column} className={nameColumn(column)?"hotline-person-name":contactColumn(column)?"hotline-contact-number":undefined}>{priority?<span className={`hotline-priority hotline-priority-${priority}`}>{cell}</span>:cell}</td>})}</tr>)}</tbody></ValueTable></div></section>;
}
