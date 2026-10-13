import {SharedFilterDrawer} from './SharedFilterDrawer';

import {
CheckCircle2,
Eye,
EyeOff,
FolderOpen,
RotateCcw,
SlidersHorizontal,
X
} from "lucide-react";
import { useEffect,useMemo,useState } from "react";
import { createPortal } from "react-dom";
import type { LegalIntelligence,RepresentationCaseLoad,RepresentationCaseLoadService } from "./api";
import {
exportTableWorkbook,
exportTableWorkbookSheets,
getLegalIntelligence,
getRepresentationCaseLoad
} from "./api";
import { formatProjectLabel } from './formatting';
import { legalLoadScheduler } from "./legalLoadScheduler";
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import { CheckboxMultiSelect,ExcelDownloadButton } from './SelectionControls';
import type { LegalMetadata } from "./types";
import { ValueTable } from "./ValueTable";

export type IntelligencePageId = "lawyer-intelligence";

export function IntelligencePage({page,filters,setFilters}:{page:IntelligencePageId;filters:Record<string,string[]>;setFilters:(next:Record<string,string[]>)=>void}){
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
      <LegalScrollControls onFilters={()=>setFilterDrawer(true)} activeCount={activeFilters} onClear={()=>setFilters({})} compactFilters={null}><div className="indicator-filter-bar lawyer-overview-filter-bar">{filterControls}<button className="soft case-filter-button" onClick={()=>setFilterDrawer(true)}><SlidersHorizontal/>Filters {activeFilters>0&&<b>{activeFilters}</b>}</button><button className="soft lawyer-filter-clear" disabled={!activeFilters} onClick={()=>setFilters({})}><RotateCcw/>Reset</button></div></LegalScrollControls>
      {filterDrawer&&<SharedFilterDrawer title="Filter Lawyer Overview" eyebrow="LAWYER OVERVIEW FILTERS" onClose={()=>setFilterDrawer(false)} onReset={()=>setFilters({})} resetDisabled={!activeFilters}
        fields={(["project","location","lawyer","createdBy","assessmentMonth"] as const).map(key=>({key,label:key==="createdBy"?"Original created by":key==="location"?"Project location":key==="assessmentMonth"?"Assessment date":key,values:filterOptionValues(key),selected:filters[key]||[],onChange:(items:string[])=>setFilters({...filters,[key]:items})}))}/>}
      <section className="intelligence-kpis">{data.kpis.map((item)=><article className="glass" key={item.label}><span>{item.label}</span><strong>{format(item)}</strong><small>{item.label==="Awareness participants"?"Reported separately from case beneficiaries":"Distinct source records"}</small></article>)}</section>
      <section className="glass intelligence-panel intelligence-operational-mix lawyer-section"><header><div><span className="eyebrow">SERVICE DELIVERY PROFILE</span><h3>Service delivery profile</h3></div><small>Leading distribution categories in the current selection</small></header><div className="operational-mix-grid">{data.breakdowns.map((group)=>{const total=Math.max(group.total,1);return <article key={group.title}><strong>{group.title}</strong>{group.items.slice(0,5).map((item)=><div key={item.label}><span title={item.label}>{item.label}</span><b><em>{item.value.toLocaleString()}</em><small>{((item.value/total)*100).toFixed(1)}%</small></b></div>)}</article>})}</div></section>
      <Lawyers data={data.lawyerSummary} workload={data.lawyers} showAwareness={data.kpis.some((item)=>item.label==="Awareness participants")} filters={filters}/>
    </>}
  </div>;
}

export type LawyerData = {
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

export const chartColors = [
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

export function LawyerChart({ chart }: { chart: LawyerData["charts"][number] }) {
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

export function RepresentationCaseLoadTable({filters}:{filters:Record<string,string[]>}){
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
  return <><section className={`glass intelligence-panel lawyer-section representation-case-load ${showDocuments?"":"documents-hidden"}`}><header><div><span className="eyebrow">LEGAL SERVICES CASELOAD</span><h3>Representation caseload by lawyer</h3></div><div className="pivot-actions"><button className={status==="open"?"primary":"soft"} onClick={()=>{legalLoadScheduler.promotePage("lawyer-intelligence","open");setStatus("open")}}><FolderOpen/>Open cases</button><button className={status==="closed"?"primary":"soft"} onClick={()=>{legalLoadScheduler.promotePage("lawyer-intelligence","closed");setStatus("closed")}}><CheckCircle2/>Closed cases</button><button className="soft" onClick={()=>setShowDocuments((value)=>!value)}>{showDocuments?<EyeOff/>:<Eye/>}{showDocuments?"Hide Documents":"Show Documents"}</button><ExcelDownloadButton className="primary" onClick={exportWorkbook} disabled={busy}/></div></header><small>{status==="open"?"Open representation services, grouped by the month the service was provided. Select a number to view its services.":"Completed or closed representation services, grouped by the month the service was closed. Select a number to view its services."}</small>{error&&<div className="error">{error}</div>}<div className="legal-table-wrap"><ValueTable><thead><tr><th>Lawyer Name</th>{showDocuments&&<th>Type of Documents</th>}{table.months.map((month)=><th key={month}>{month}</th>)}<th>{totalLabel}</th><th>Average / month</th><th>Workload signal</th></tr></thead><tbody>{table.rows.map((row)=><tr key={`${row.lawyer}-${row.document}`}><td><strong>{row.lawyer}</strong></td>{showDocuments&&<td>{row.document}</td>}{table.months.map((month)=><td key={month}>{row.values[month]?<button className="caseload-count" onClick={()=>openDrill(`${row.lawyer} - ${month}`,row.services.filter((service)=>service.month===month))}>{row.values[month]}</button>:""}</td>)}<td><button className="caseload-count" onClick={()=>openDrill(row.lawyer,row.services)}><strong>{row.total}</strong></button></td><td>{(row.total/Math.max(table.months.length,1)).toFixed(1)}</td><td><i className="score-bar"><b style={{width:`${row.total/workloadMax*100}%`}}/></i></td></tr>)}{!busy&&!table.rows.length&&<tr><td colSpan={4+table.months.length+(showDocuments?1:0)}>No matching representation services.</td></tr>}</tbody></ValueTable></div></section>{drill&&createPortal(<div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Representation service details"><button className="case-modal-backdrop" aria-label="Close service details" onClick={()=>setDrill(null)}/><section className="indicator-modal-panel"><header><div><span>LEGAL SERVICES DRILL-DOWN</span><h2>Matching representation services</h2><p>{drill.title} - {drill.services.length.toLocaleString()} service{drill.services.length===1?"":"s"}</p></div><button className="icon" onClick={()=>setDrill(null)} aria-label="Close service details"><X/></button></header><div className="indicator-modal-scroll"><ValueTable><thead><tr><th>Service ID</th><th>Beneficiary ID</th><th>Assessment ID</th><th>Lawyer</th><th>Document</th><th>Status</th><th>Service provided</th><th>Service closed</th></tr></thead><tbody>{drill.services.map((service)=><tr key={service.serviceId}><td>{service.serviceId}</td><td>{service.beneficiaryId}</td><td>{service.assessmentId}</td><td>{service.lawyer}</td><td>{service.document}</td><td>{service.status}</td><td>{service.provisionDate}</td><td>{service.closeDate}</td></tr>)}</tbody></ValueTable></div></section></div>,document.body)}</>;
}

export function Lawyers({ data, workload, showAwareness, filters }: { data: Pick<LawyerData,"rows"|"monthlyAssessments"|"charts">; workload:LegalIntelligence["lawyers"]; showAwareness:boolean; filters:Record<string,string[]> }) {
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
      <section className="glass intelligence-panel lawyer-section"><header><div><span className="eyebrow">TEAM BENCHMARK</span><h3>Lawyer workload</h3></div><div className="pivot-actions"><small>Grouped by project</small><ExcelDownloadButton className="primary" onClick={exportWorkload} disabled={!workload.some((row)=>row.assessments>0)}/></div></header><div className="legal-table-wrap"><ValueTable><thead><tr><th>Project</th><th>Lawyer</th><th>Assessments</th><th>Average / month</th><th>Services</th><th>Completed</th><th>Completion</th><th>Follow-ups</th><th>Fee records</th>{showAwareness&&<th>Awareness</th>}<th>Workload signal</th></tr></thead><tbody>{workload.filter((row)=>row.assessments>0).map((row)=><tr key={`${row.project}-${row.lawyer}`}><td><strong>{formatProjectLabel(row.project)}</strong></td><td>{row.lawyer}</td><td>{row.assessments}</td><td>{row.monthlyAverage.toFixed(1)}</td><td>{row.services}</td><td>{row.completedServices}</td><td>{(row.completionRate*100).toFixed(0)}%</td><td>{row.followups}</td><td>{row.fees}</td>{showAwareness&&<td>{row.awareness}</td>}<td><i className="score-bar"><b style={{width:`${row.assessments/workloadMax*100}%`}}/></i></td></tr>)}</tbody></ValueTable></div></section>
      <RepresentationCaseLoadTable filters={filters}/>
      <div className="glass legal-table-card lawyer-workload lawyer-section">
        <div className="legal-card-heading">
          <div><strong>Monthly assessments by lawyer</strong></div>
          <div className="pivot-actions"><small>Distinct assessments dated January 2026 or later · average uses all displayed months</small><ExcelDownloadButton className="primary" onClick={exportMonthlyAssessments} disabled={!assessmentLawyers.length}/></div>
        </div>
        <div className="legal-table-wrap">
          <ValueTable>
            <thead><tr><th>Lawyer</th>{assessmentMonths.map((month)=><th key={month}>{month}</th>)}<th>Average / month</th></tr></thead>
            <tbody>{assessmentLawyers.map((lawyer)=>{
              const lawyerRows=data.monthlyAssessments.filter((row)=>row.lawyer===lawyer);
              return <tr key={lawyer}><td><strong>{lawyer}</strong></td>{assessmentMonths.map((month)=><td key={month}>{lawyerRows.find((row)=>row.month===month)?.count||""}</td>)}<td><strong>{(lawyerRows[0]?.average||0).toFixed(1)}</strong></td></tr>;
            })}</tbody>
          </ValueTable>
        </div>
      </div>
  </div>;
}

export function LawyerOverview({ metadata: _metadata }: { metadata: LegalMetadata }) {
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  return <div className="lawyer-overview-page"><IntelligencePage page="lawyer-intelligence" filters={filters} setFilters={setFilters}/></div>;
}
