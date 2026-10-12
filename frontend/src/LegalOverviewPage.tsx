
import {
RotateCcw,
Search,
SlidersHorizontal,
X
} from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { getLegalOverview,getLegalOverviewFilters } from "./api";
import { ChartCard,TrendCard } from './ChartComponents';
import { formatYearMonthFilterValue } from "./dateFormat";
import { FilterDrawerShell,FilterSection } from './FilterDrawerShell';
import { filterValue,isExcludedValue } from "./filterSelection";
import { IraqDetentionMapMetrics } from './LegalMapMetrics';
import { LegalScrollControls } from './LegalScrollControls';
import { CheckboxMultiSelect,FilterValueList } from './SelectionControls';
import type { LegalMetadata,LegalOverviewResult,OverviewFilters,Theme } from "./types";
import { ValueTable } from "./ValueTable";

export function Overview({
  metadata,
  theme,
}: {
  metadata: LegalMetadata;
  theme: Theme;
}) {
  const emptyFilters = ():OverviewFilters => ({projects:[],locations:[],months:[],filters:{}});
  const [selection,setSelection]=useState<OverviewFilters>(emptyFilters);
  const latestSelection=useRef(selection);latestSelection.current=selection;
  const [draft,setDraft]=useState<OverviewFilters>(emptyFilters);
  const latestDraft=useRef(draft);latestDraft.current=draft;
  const [result,setResult]=useState<LegalOverviewResult|null>(null);
  const [drawer,setDrawer]=useState(false),[filterSearch,setFilterSearch]=useState("");
  const [loading,setLoading]=useState(false),[error,setError]=useState("");
  const [draftOptions,setDraftOptions]=useState<LegalOverviewResult["filterOptions"]|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    const current=()=>!controller.signal.aborted&&latestSelection.current===selection;
    setLoading(true);setError("");
    const load=()=>getLegalOverview(selection,controller.signal).then(next=>{
      if(current())setResult(next);
    }).catch(reason=>{if(current()&&reason.name!=="AbortError")setError(reason.message||"Unable to load overview.")}).finally(()=>{if(current())setLoading(false)});
    const active=selection.projects.length||selection.locations.length||selection.months.length||Object.values(selection.filters).some(items=>items.length);
    const timer=active?window.setTimeout(load,120):undefined;
    if(!active)void load();
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[selection,metadata.revision]);
  useEffect(()=>{
    if(!drawer)return;
    const controller=new AbortController();
    const current=()=>!controller.signal.aborted&&latestDraft.current===draft;
    const timer=window.setTimeout(()=>getLegalOverviewFilters(draft,controller.signal).then(next=>{
      if(current())setDraftOptions(next.filterOptions);
    }).catch(reason=>{if(current()&&reason.name!=="AbortError")setError(reason.message)}),120);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[drawer,draft,metadata.revision]);
  const activeFilters={...selection.filters,Project:selection.projects,"Project location":selection.locations,Date:selection.months};
  const filterLabel=(field:string)=>{
    const group=result?.filterOptions.groups.find(group=>group.columns.some(option=>option.key===field));
    const option=group?.columns.find(option=>option.key===field);
    return option?`${group!.label} · ${option.name}`:field;
  };
  const removeFilter=(field:string,item:string)=>setSelection(current=>field==="Project"?{...current,projects:current.projects.filter(value=>value!==item)}:field==="Project location"?{...current,locations:current.locations.filter(value=>value!==item)}:field==="Date"?{...current,months:current.months.filter(value=>value!==item)}:{...current,filters:{...current.filters,[field]:(current.filters[field]||[]).filter(value=>value!==item)}});
  const activeCount=Object.values(activeFilters).reduce((sum,items)=>sum+items.length,0);
  const reset=()=>{setSelection(emptyFilters());setDraft(emptyFilters())};
  const openDrawer=()=>{setDraft(selection);setDraftOptions(result?.filterOptions||null);setDrawer(true)};
  const quickFilters=(hideLabel=false)=> ([ ["projects","Project"],["locations","Project location"],["months","Date"] ] as const).map(([key,label])=><CheckboxMultiSelect key={key} label={label} hideLabel={hideLabel} values={result?.filterOptions[key]||[]} selected={selection[key]} onChange={items=>setSelection(current=>({...current,[key]:items}))}/>);
  const o = result?.overview || metadata.overview;
  const primary = [
    ["Beneficiaries", o?.beneficiaries, "People registered"],
    ["Assessments", o?.assessments, "Protection records"],
    ["Legal services", o?.services, "Services delivered"],
    ["Representation completion", o?.representationCompletionRate===undefined?"-":`${(o.representationCompletionRate*100).toFixed(1)}%`, "Completed representation services"],
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
      <LegalScrollControls onFilters={openDrawer} activeCount={activeCount} onClear={reset} compactFilters={quickFilters(true)}>
        <div className="overview-filter-bar glass">{quickFilters()}<button className="soft case-filter-button" onClick={openDrawer}><SlidersHorizontal/>Filters {activeCount>0&&<b>{activeCount}</b>}</button><button className="soft filter-reset-button" onClick={reset} disabled={!activeCount}><RotateCcw/>Reset</button></div>
      </LegalScrollControls>
      {activeCount>0&&<div className="active-filters">{Object.entries(activeFilters).flatMap(([field,items])=>items.map(item=><button key={`${field}-${item}`} onClick={()=>removeFilter(field,item)}><span>{filterLabel(field)}: {isExcludedValue(item)?"Excluding ":""}{formatYearMonthFilterValue(field,filterValue(item))}</span><X/></button>))}</div>}
      {error&&<div className="error glass" role="alert">{error}</div>}
      {drawer&&<><FilterDrawerShell className="case-filter-drawer" header={<header><div><span className="eyebrow">OVERVIEW FILTERS</span><h2>Filter overview</h2></div><button onClick={()=>setDrawer(false)} aria-label="Close filters"><X/></button></header>} footer={<footer><button className="soft filter-reset-button" onClick={reset} disabled={!activeCount&&!Object.values(draft.filters).some(items=>items.length)}><RotateCcw/>Reset</button><button className="primary" onClick={()=>{setSelection(draft);setDrawer(false)}}>Apply filters</button></footer>} backdrop={<button className="filter-backdrop" aria-label="Close overview filters" onClick={()=>setDrawer(false)}/>}><label className="filter-search"><Search/><input value={filterSearch} onChange={event=>setFilterSearch(event.target.value)} placeholder="Search filters"/></label><div className="case-filter-scroll">{(draftOptions?.groups||[]).flatMap(group=>group.columns.map(option=>({...option,label:`${group.label} · ${option.name}`}))).filter(option=>option.label.toLowerCase().includes(filterSearch.toLowerCase())).map(option=><FilterSection key={option.key} open={Boolean(draft.filters[option.key]?.length)} label={<>{option.label}</>} badge={<>{draft.filters[option.key]?.length>0&&<b>{draft.filters[option.key].length}</b>}</>}><div><FilterValueList values={option.values} formatCaption={item=>formatYearMonthFilterValue(option.label,item)} selected={draft.filters[option.key]||[]} onChange={items=>setDraft(current=>({...current,filters:{...current.filters,[option.key]:items}}))}/></div></FilterSection>)}</div></FilterDrawerShell></>}
      <div className={`overview-results${loading?" refreshing":""}`} aria-busy={loading}>
      <section className="overview-primary-kpis">
        {primary.map(([label, count, detail], index) => (
          <div
            className={`glass executive-kpi ${index === 3 ? "attention" : ""}`}
            key={String(label)}
          >
            <span>{label}</span>
            <strong>
              {typeof count === "string" ? count : count === null ? "-" : Number(count || 0).toLocaleString()}
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
              {count === null ? "-" : Number(count || 0).toLocaleString()}
            </strong>
            <small>{count === null ? result?.unavailable.includes(label==="Deportations"?"deportationrecords":String(label).toLowerCase()) ? "Unavailable for selected case filters" : "Not loaded" : "records"}</small>
          </div>
        ))}
      </section>
      <TrendCard rows={(o?.activityTrend||[]).map((row)=>({label:row.month,count:row.assessments,percent:0}))} hoverMetrics={[{label:"Open assessments",icon:"●",color:"#d4852f",rows:(o?.activityTrend||[]).map(row=>({label:row.month,count:row.open}))},{label:"Closed assessments",icon:"✓",color:"#2f9e68",rows:(o?.activityTrend||[]).map(row=>({label:row.month,count:row.closed}))}]} primaryLabel="Assessments" display="count" theme={theme} title="Monthly Assessment" subtitle="2026 only · Assessment workload by month"/>
      <TrendCard rows={(o?.representationTrend||[]).map((row)=>({label:row.month,count:row.representation,percent:0}))} hoverMetrics={[{label:"Open representation",icon:"●",color:"#d4852f",rows:(o?.representationTrend||[]).map(row=>({label:row.month,count:row.open}))},{label:"Closed representation",icon:"✓",color:"#2f9e68",rows:(o?.representationTrend||[]).map(row=>({label:row.month,count:row.closed}))}]} primaryLabel="Representation services" display="count" theme={theme} title="Monthly representation services" subtitle="2026 only · Legal Representation and Legal Assistance services by provision month"/>
      <section className="overview-analysis-grid" aria-label="Operational analysis">
        <ChartCard chart={overviewChart("assessment-status","Assessment status",o?.charts?.assessmentStatus||[])} display="count" theme={theme} onSelect={()=>{}}/>
        <ChartCard chart={overviewChart("representation-status","Representation service status",o?.charts?.representationServiceStatus||[])} display="count" theme={theme} onSelect={()=>{}}/>
        <ChartCard chart={overviewChart("assessment-location","Assessments by project location",o?.charts?.assessmentsByLocation||[])} display="count" theme={theme} onSelect={()=>{}}/>
        <ChartCard chart={overviewChart("assessment-lawyer","Assessments by lawyer",o?.charts?.assessmentsByLawyer||[])} display="count" theme={theme} onSelect={()=>{}}/>
      </section>
      {showDetentionDetails && <section className="overview-detention-grid" aria-label="2026 detention analysis">
        <TrendCard rows={(o?.detention2026?.trend||[]).map((row)=>({label:row.month,count:row.detainedAssessments,percent:0}))} comparisonRows={(o?.detention2026?.trend||[]).map((row)=>({label:row.month,count:row.released,percent:0}))} primaryLabel="Detained assessments" comparisonLabel="Released" display="count" theme={theme} title="Detained assessments and releases" subtitle="2026 only · Assessment date and release/deportation date"/>
        {metadata.features?.deportation && (result?.unavailable.includes("deportationrecords")?<div className="glass overview-unavailable"><strong>Deportations by governorate</strong><p>Unavailable for selected case filters</p></div>:<ChartCard chart={overviewChart("deportation-governorate","Deportations by governorate",o?.deportationsByGovernorate||[])} display="count" theme={theme} onSelect={()=>{}}/>)}
        <IraqDetentionMapMetrics items={o?.detention2026?.map||[]} selected={[]} onSelect={()=>{}} showFooter={false}/>
      </section>}
      <section className="glass overview-location-performance"><header><div><span className="eyebrow">LOCATION PERFORMANCE</span><h3>Operational activity by project location</h3></div></header><div className="legal-table-wrap"><ValueTable><thead><tr><th>Project location</th><th>Assessments</th><th>Representation services</th><th>Representation services closed</th><th>Representation services open</th><th>Representation completion</th>{showDetentionDetails && <><th>Detained (2026)</th><th>Released (2026)</th></>}</tr></thead><tbody>{(o?.locationPerformance||[]).map((row)=><tr key={row.location}><td><strong>{row.location}</strong></td><td>{row.assessments.toLocaleString()}</td><td>{row.representationServices.toLocaleString()}</td><td>{row.closedRepresentationServices.toLocaleString()}</td><td>{row.openRepresentationServices.toLocaleString()}</td><td>{row.representationServices?`${(row.completionRate*100).toFixed(1)}%`:"-"}</td>{showDetentionDetails && <><td>{row.detained.toLocaleString()}</td><td>{row.released.toLocaleString()}</td></>}</tr>)}</tbody></ValueTable></div></section>
      </div>
    </div>
  );
}
