import {useLegalRecordFilters} from './useLegalRecordFilters';
import {isAwarenessIdColumn} from './awarenessCase';
import {AwarenessIdButton} from './DeportationCaseModal';
import {AnimatedActionIcon} from './AnimatedActionIcon';
import {AnimatedSectionIcon} from './AnimatedNavigationIcon';
import type {LucideIcon} from 'lucide-react';
import type {NavigationIconStyle} from './navigationIconNodes';
import {SharedFilterDrawer} from './SharedFilterDrawer';
import {
ArrowRight,
BarChart3,
BriefcaseBusiness,
CheckCheck,
Download,
Megaphone,
Search,
Users,
X
} from "lucide-react";
import { useCallback,useEffect,useMemo,useState,type ReactNode } from "react";
import {
exportLegalExplorer,
getLegalAnalyticsDashboard,
getLegalStudio
} from "./api";
import { ChartCard,TrendCard } from './ChartComponents';
import { formatYearMonthFilterValue } from "./dateFormat";
import Studio from "./LazyStudio";
import { legalLoadScheduler } from "./legalLoadScheduler";
import { labels,LegalPage } from './legalPageMetadata';
import { value } from './LegalRecordCells';
import { LegalScrollControls } from './LegalScrollControls';
import { CheckboxMultiSelect } from './SelectionControls';
import { Pager,RowSelectionCheckbox,SortableHeader } from './TableControls';
import { TableSelectionActions } from './TableSelectionActions';
import type { LegalAnalyticsDashboard,LegalMetadata,Metadata,Theme } from "./types";
import { useDebouncedValue } from "./useDebouncedValue";
import { ValueTable } from "./ValueTable";
import { deferredComponent } from './DeferredComponent';
import { initialSamplingState } from './samplingTypes';

const Sampling=deferredComponent(()=>import('./LegalSampling'),<div className="glass studio-section-loading" role="status">Loading Sampling…</div>);

export function LegalAnalyticsStudio({metadata,theme,onOpenCase}:{metadata:LegalMetadata;theme:Theme;onOpenCase:(id:string)=>void}){
  const sectionIcons:Record<string,{Icon:LucideIcon;iconStyle:NavigationIconStyle}>={assessments:{Icon:CheckCheck,iconStyle:'check-check'},legalservices:{Icon:BriefcaseBusiness,iconStyle:'briefcase-business'},sampling:{Icon:Users,iconStyle:'users'},beneficiaries:{Icon:Users,iconStyle:'users'},awareness:{Icon:Megaphone,iconStyle:'megaphone'},builder:{Icon:BarChart3,iconStyle:'chart-column'}};
  const sections=[...["assessments","legalservices","beneficiaries"].map((id)=>[id,labels[id as LegalPage].replace(" Review","")] as [string,string]),...(metadata.availability.awareness?[["awareness","Awareness"] as [string,string]]:[]),["builder","Custom Builder"] as [string,string],["sampling","Sampling"] as [string,string]];
  const [samplingState,setSamplingState]=useState(initialSamplingState);
  useEffect(()=>setSamplingState(initialSamplingState()),[metadata.revision]);
  const [section,setSection]=useState("assessments"),[sectionState,setSectionState]=useState<Record<string,{filters:Record<string,string[]>;search:string;page:number;sortColumn:string;sortDirection:"asc"|"desc"}>>({});
  const hideDetentionInfo=metadata.features?.detention===false;
  const isDetentionField=useCallback((field:string)=>/detain|immigration related charge/i.test(field),[]);
  const studioSheets=useMemo(()=>metadata.sheets.map((sheet)=>sheet.id==="assessments"&&hideDetentionInfo?{...sheet,columns:sheet.columns.filter((column)=>!isDetentionField(column))}:sheet),[metadata.sheets,hideDetentionInfo,isDetentionField]);
  const studioMetadata=useMemo<Metadata>(()=>({ready:true,source:metadata.source,loadedAt:null,pages:Object.fromEntries(studioSheets.map((sheet)=>[sheet.id,{rows:sheet.rows,filters:Object.fromEntries(sheet.columns.map((column)=>[column,[]])),dimensions:sheet.columns}]))}),[metadata.source,studioSheets]);
  const studioSourceOptions=useMemo<[string,string][]>(()=>studioSheets.map((sheet)=>[sheet.id,sheet.name]),[studioSheets]);
  const state=useMemo(()=>sectionState[section]||{filters:{},search:"",page:1,sortColumn:"",sortDirection:"asc" as const},[sectionState,section]);
  const update=(patch:Partial<typeof state>)=>setSectionState((current)=>({...current,[section]:{...state,...patch}}));
  return <div className="legal-analytics-studio"><nav className="glass studio-section-tabs" aria-label="Analytics Studio sections">{sections.map(([id,label])=><button className={section===id?"active":""} key={id} onClick={()=>{legalLoadScheduler.promotePage("studio",id);setSection(id)}}><AnimatedSectionIcon Icon={sectionIcons[id].Icon} iconStyle={sectionIcons[id].iconStyle} active={section===id} size={17}/><span>{label}</span></button>)}</nav>{section==="builder"?<Studio metadata={studioMetadata} theme={theme} sourceOptions={studioSourceOptions} studioLoader={getLegalStudio} excludeFields={hideDetentionInfo?isDetentionField:undefined}/>:section==="sampling"?<Sampling state={samplingState} update={patch=>setSamplingState(current=>({...current,...patch}))}/>:<LegalAnalyticsSection key={section} dataset={section} theme={theme} state={state} update={update} onOpenCase={onOpenCase}/>}</div>;
}

export function LegalAnalyticsSection({dataset,theme,state,update,onOpenCase}:{dataset:string;theme:Theme;state:{filters:Record<string,string[]>;search:string;page:number;sortColumn:string;sortDirection:"asc"|"desc"};update:(patch:Partial<typeof state>)=>void;onOpenCase:(id:string)=>void}){
  const [data,setData]=useState<LegalAnalyticsDashboard|null>(null),[busy,setBusy]=useState(true),[drawer,setDrawer]=useState(false),[filterSearch,setFilterSearch]=useState(""),[error,setError]=useState(""),[selected,setSelected]=useState<Map<string,Record<string,unknown>>>(new Map());
  const debouncedSearch=useDebouncedValue(state.search);
  const recordFilters=useLegalRecordFilters(dataset,dataset,state.filters,debouncedSearch,()=>update({page:1}),"studio");
  useEffect(()=>{const controller=new AbortController();setBusy(true);setError("");getLegalAnalyticsDashboard({dataset,...state,filters:recordFilters.requestLegacy,columnFilters:recordFilters.columnFilters,search:debouncedSearch,pageSize:100},controller.signal).then(next=>{if(!controller.signal.aborted)setData(next)}).catch((reason)=>{if(reason.name!=="AbortError")setError(reason.message||"Unable to load this section.")}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[dataset,state.filters,debouncedSearch,state.page,state.sortColumn,state.sortDirection,recordFilters.columnFilters]);
  const active=recordFilters.control.filters.length+Object.values(state.filters).reduce((n,values)=>n+values.length,0),setFilter=(column:string,values:string[])=>update({page:1,filters:{...state.filters,[column]:values}}),clear=()=>{recordFilters.clear();update({page:1,filters:{}})};
  const hints:Record<string,string[]>={assessments:["project","project location","assessment status","month"],legalservices:["project","project location","service status","month"],beneficiaries:["project","project location","nationality","month"],awareness:["project","project location","community type","month"]};
  const optionKeys=Object.keys(data?.filterOptions||{}),quick=(hints[dataset]||[]).map((hint)=>optionKeys.find((key)=>key.trim().toLowerCase()===hint||key.trim().toLowerCase().includes(hint))).filter((key):key is string=>Boolean(key));
  const kpi=(item:{value:number;format:string})=>item.format==="percent"?`${(item.value*100).toFixed(1)}%`:item.value.toLocaleString();
  const toolbarFilterLabel=(column:string)=>column.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g,"").replace(/\s*[-–,:/]\s*$/,"").replace(/\s{2,}/g," ").trim()||"Filter";
  const statusColors=["#d4852f","#2f9e68","#8b5cf6","#e05252","#1683d8","#64748b"];
  const statusHoverMetrics=(data?.statusTrends||[]).map((status,index)=>({label:status.label,icon:"●",color:statusColors[index%statusColors.length],rows:status.rows}));
  return <section className={`studio-fixed-section ${busy?"refreshing":""}`}>
    <LegalScrollControls filterLabel="Filters" onFilters={()=>setDrawer(true)} activeCount={active} onClear={clear}>
      <div className="glass studio-quick-toolbar">
      <div className="studio-quick-fields">{quick.map((column)=><CheckboxMultiSelect key={column} hideLabel label={toolbarFilterLabel(column)} values={data?.filterOptions[column]||[]} selected={state.filters[column]||[]} onChange={(values)=>setFilter(column,values)}/>)}</div>
      <div className="studio-quick-actions"><button className="primary" onClick={()=>setDrawer(true)}><AnimatedActionIcon type="filters"/>Filters {active>0&&<b>{active}</b>}</button><button className="soft detention-filter-clear" disabled={!active} onClick={clear}><AnimatedActionIcon type="reset"/>Reset</button><button className="primary studio-excel" onClick={()=>void exportLegalExplorer("xlsx",dataset,debouncedSearch,recordFilters.requestLegacy,undefined,recordFilters.columnFilters).catch(reason=>setError(reason.message||"Unable to export filtered records."))}><Download/>Excel</button></div>
    </div>
    </LegalScrollControls>
    {error&&<div className="error glass">{error}</div>}
    {busy&&data&&<div className="studio-section-refreshing" role="status"><span/><span>Updating analysis…</span></div>}
    {busy&&!data?<div className="glass studio-section-loading" role="status"><div/><span>Loading analysis…</span></div>:data&&<><div className="legal-kpis">{data.kpis.map((item)=><div className="glass legal-kpi" key={item.label}><span>{item.label}</span><strong>{kpi(item)}</strong></div>)}</div>
    <div className="dashboard-grid"><TrendCard rows={data.trend} hoverMetrics={dataset==="assessments"||dataset==="legalservices"?statusHoverMetrics:undefined} primaryLabel={dataset==="assessments"?"Assessments":dataset==="legalservices"?"Legal services":undefined} display="both" theme={theme} selected={state.filters.Month||[]} onSelect={(months,replace)=>setFilter("Month",replace?months:Array.from(new Set([...(state.filters.Month||[]),...months])))} title={dataset==="assessments"?"Monthly Assessment":dataset==="legalservices"?"Monthly Legal Services":"Activity over time"} subtitle="Based on the section source date"/>{data.charts.filter(chart=>dataset!=="legalservices"||chart.title!=="Assessment legal-service need").map((chart)=><ChartCard key={`${chart.id}-${chart.title}`} chart={chart} display="both" theme={theme} onSelect={(field,item)=>setFilter(field,state.filters[field]?.includes(item)?state.filters[field].filter((value)=>value!==item):[...(state.filters[field]||[]),item])}/>)}</div>
    <div className="glass legal-table-card studio-records-table"><div className="legal-card-heading"><label className="studio-table-search"><Search/><input value={state.search} placeholder={`Search ${dataset} data`} onChange={(event)=>update({search:event.target.value,page:1})}/></label><div className="indicator-total-block detention-table-total"><strong>{data.matchedRows.toLocaleString()}</strong><span>Total</span></div><TableSelectionActions selected={selected} onResetFilters={recordFilters.clear} hasActiveFilters={recordFilters.control.filters.length>0} filename={`${dataset}-selected.xlsx`} onClear={()=>setSelected(new Map())} iconOnly/><Pager compact page={state.page} total={data.matchedRows} onChange={(page)=>update({page})}/></div><div className="legal-table-wrap"><ValueTable recordFilters={{...recordFilters.control,showClearAll:false}}><thead><tr><th><RowSelectionCheckbox label="Select visible records" total={(data.rows||[]).length} selectedCount={(data.rows||[]).filter((row:any)=>selected.has(String(row.__rowKey))).length} onChange={checked=>setSelected((current)=>{const next=new Map(current);data.rows.forEach((row:any)=>{const key=String(row.__rowKey);if(checked)next.set(key,row);else next.delete(key)});return next})}/></th>{data.columns.map((column)=><SortableHeader key={column} direction={state.sortColumn===column?state.sortDirection:undefined} onSort={()=>update({page:1,sortColumn:column,sortDirection:state.sortColumn===column&&state.sortDirection==="asc"?"desc":"asc"})} buttonProps={{}}>{column} {state.sortColumn===column?(state.sortDirection==="asc"?"▲":"▼"):"↕"}</SortableHeader>)}</tr></thead><tbody>{data.rows.map((row:any,index)=><tr key={index}><td><input type="checkbox" aria-label="Select record" checked={selected.has(String(row.__rowKey))} onChange={()=>setSelected((current)=>{const next=new Map(current),key=String(row.__rowKey);if(next.has(key))next.delete(key);else next.set(key,row);return next})}/></td>{data.columns.map((column)=><td key={column}>{dataset==="awareness"&&isAwarenessIdColumn(column)?<AwarenessIdButton awarenessId={row[column]} identifierColumn={column}/>:column==="Beneficiary ID"||column==="Case ID"?<button className="table-action" onClick={()=>onOpenCase(String(row[column]||""))}>{value(row[column])}<ArrowRight/></button>:value(row[column])}</td>)}</tr>)}</tbody></ValueTable></div></div></>}
    {drawer&&<SharedFilterDrawer title={`Filter ${dataset==="legalservices"?"Legal Services":dataset[0].toUpperCase()+dataset.slice(1)}`} eyebrow="ANALYTICS STUDIO FILTERS" onClose={()=>setDrawer(false)} onReset={clear} resetDisabled={!active} search={filterSearch} onSearchChange={setFilterSearch}
      fields={Object.entries(data?.filterOptions||{}).map(([column,values])=>({key:column,label:column,values,selected:state.filters[column]||[],formatCaption:(item:string)=>formatYearMonthFilterValue(column,item),onChange:(items:string[])=>setFilter(column,items)}))}/>}
  </section>;
}
import './studio.css';
