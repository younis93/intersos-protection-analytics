import {SharedFilterDrawer} from './SharedFilterDrawer';
import { Pager } from './TableControls';

import type { jsPDF } from "jspdf";
import {
AlertTriangle,
Backpack,
ChartColumnIncreasing,
CheckCheck,
CheckCircle2,
ChevronDown,
Copy,
Download,
FileText,
FolderOpen,
Maximize2,
RefreshCw,
RotateCcw,
Search,
SlidersHorizontal,
TableProperties,
Tent,
Users,
X
} from "lucide-react";
import { memo,useEffect,useMemo,useRef,useState } from "react";
import { createPortal } from "react-dom";
import {
exportIndicatorReconciliation,
exportLegalIndicators,
exportLegalNarrative,
exportTableWorkbook,
getIndicatorReconciliationMetadata,
getLegalIndicators,
getLegalIndicatorsMonthly,
reconcileLegalIndicators,
selectIndicatorMasterSheet,
uploadIndicatorMasterWorkbook
} from "./api";
import { exportSvgChart } from './chartExportLoader';
import { formatFilterMonth } from "./dateFormat";
import { isExcludedValue,matchesSelection } from "./filterSelection";
import { formatProjectLabel } from './formatting';
import { findIndicatorItem,indicatorLines,reportMatchesIndicatorScope } from "./indicatorCopy";
import { legalLoadScheduler } from "./legalLoadScheduler";
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import NotificationToast from './NotificationToast';
import { CheckboxMultiSelect,ExcelDownloadButton } from './SelectionControls';
import SingleMonthIndicatorChart from "./SingleMonthIndicatorChart";
import { isSingleMonth } from "./timelineChart";
import type { IndicatorReconciliation,IndicatorReconciliationMetadata,IndicatorReport,IndicatorReportGroup,IndicatorReportItem,IndicatorSection } from "./types";
import { useDebouncedValue } from "./useDebouncedValue";
import { ValueTable } from "./ValueTable";
import { VirtualRows } from "./VirtualRows";

export function IndicatorValue({value,ids,onOpen}:{value:number;ids:string[];onOpen:(ids:string[],value:number)=>void}){
  if(!value)return <span className="indicator-value-empty" aria-label="Zero"> </span>;
  return <button type="button" className="indicator-value-button" onClick={()=>onOpen(ids,value)} title="View matching Beneficiary IDs">{value.toLocaleString()}</button>;
}

export function PopulationIndicatorMatrix({sections,ageGroups,onOpenIds,idpTotalColumn=false}:{sections:IndicatorSection[];ageGroups:string[];onOpenIds:(ids:string[],value:number)=>void;idpTotalColumn?:boolean}){
  const rows=sections[0]?.rows||[];
  if(idpTotalColumn)return <section className="indicator-population-block horizontal-population-matrix"><div className="indicator-table-wrap"><ValueTable className="indicator-matrix"><thead><tr><th rowSpan={3} className="no-sort fixed-dimension">Project</th><th rowSpan={3} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={12} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}<th rowSpan={3} className="no-sort indicator-total overall-total">Total</th></tr><tr>{sections.flatMap((section)=>[<th colSpan={6} className="no-sort indicator-male" key={`${section.id}-male`}>Male</th>,<th colSpan={6} className="no-sort indicator-female" key={`${section.id}-female`}>Female</th>])}</tr><tr>{sections.flatMap((section)=>[...ageGroups.map((age)=><th className="no-sort indicator-male" key={`${section.id}-m-${age}`}>{age}</th>),...ageGroups.map((age)=><th className="no-sort indicator-female" key={`${section.id}-f-${age}`}>{age}</th>)])}</tr></thead><tbody>{rows.map((row,index)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[index]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[index]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>(section.rows[index]?.values||Array(13).fill(0)).slice(0,12)).map((number,valueIndex)=>{const section=sections[Math.floor(valueIndex/12)],cellIndex=valueIndex%12;return <td className={cellIndex<6?"indicator-male":"indicator-female"} key={valueIndex}><IndicatorValue value={number} ids={section.rows[index]?.beneficiaryIds?.[cellIndex]||[]} onOpen={onOpenIds}/></td>})}<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td></tr>})}</tbody></ValueTable></div><footer className="population-matrix-summary">{sections.map((section)=><span key={section.id}><strong>{section.label}</strong>{section.total.toLocaleString()}{(section.warnings.unclassified>0||section.warnings.unknownLocation>0)&&<small><AlertTriangle/>{section.warnings.unclassified+section.warnings.unknownLocation} excluded</small>}</span>)}</footer></section>;
  const hideTotalColumns=false;
  return <section className="indicator-population-block horizontal-population-matrix"><div className="indicator-table-wrap"><ValueTable className="indicator-matrix"><thead><tr><th rowSpan={3} className="no-sort fixed-dimension">Project</th><th rowSpan={3} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={hideTotalColumns?12:13} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}{!hideTotalColumns&&<th rowSpan={3} className="no-sort indicator-total overall-total">Total</th>}</tr><tr>{sections.flatMap((section)=>[<th colSpan={6} className="no-sort indicator-male" key={`${section.id}-male`}>Male</th>,<th colSpan={6} className="no-sort indicator-female" key={`${section.id}-female`}>Female</th>,...(!hideTotalColumns?[<th rowSpan={2} className="no-sort indicator-total" key={`${section.id}-activity`}>Activity</th>]:[])])}</tr><tr>{sections.flatMap((section)=>[...ageGroups.map((age)=><th className="no-sort indicator-male" key={`${section.id}-m-${age}`}>{age}</th>),...ageGroups.map((age)=><th className="no-sort indicator-female" key={`${section.id}-f-${age}`}>{age}</th>)])}</tr></thead><tbody>{rows.map((row,index)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[index]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[index]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>(section.rows[index]?.values||Array(13).fill(0)).slice(0,hideTotalColumns?12:13)).map((number,valueIndex)=>{const section=sections[Math.floor(valueIndex/(hideTotalColumns?12:13))],cellIndex=valueIndex%(hideTotalColumns?12:13);return <td className={cellIndex<6?"indicator-male":cellIndex<12?"indicator-female":"indicator-total"} key={valueIndex}>{cellIndex===12?<span className="indicator-value-empty" aria-label="Zero"> </span>:<IndicatorValue value={number} ids={section.rows[index]?.beneficiaryIds?.[cellIndex]||[]} onOpen={onOpenIds}/>}</td>})}{!hideTotalColumns&&<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td>}</tr>})}<tr className="indicator-grand-total"><td>Total</td><td>All selected locations</td>{sections.flatMap((section)=>section.totals.slice(0,hideTotalColumns?12:13)).map((number,index)=>{const cellIndex=index%(hideTotalColumns?12:13);return <td className={cellIndex<6?"indicator-male":cellIndex<12?"indicator-female":"indicator-total"} key={index}>{cellIndex===12?<span className="indicator-value-empty" aria-label="Zero"> </span>:<IndicatorValue value={number} ids={sections[Math.floor(index/(hideTotalColumns?12:13))].totalBeneficiaryIds?.[cellIndex]||[]} onOpen={onOpenIds}/>}</td>})}{!hideTotalColumns&&<td className="indicator-total overall-total"><IndicatorValue value={sections.reduce((sum,section)=>sum+section.total,0)} ids={sections.flatMap((section)=>section.totalBeneficiaryIds?.[12]||[])} onOpen={onOpenIds}/></td>}</tr></tbody></ValueTable></div><footer className="population-matrix-summary">{sections.map((section)=><span key={section.id}><strong>{section.label}</strong>{section.total.toLocaleString()}{(section.warnings.unclassified>0||section.warnings.unknownLocation>0)&&<small><AlertTriangle/>{section.warnings.unclassified+section.warnings.unknownLocation} excluded</small>}</span>)}</footer></section>;
}

export function GenderGroupIndicatorMatrix({sections,onOpenIds,idpTotalColumn=false}:{sections:IndicatorSection[];onOpenIds:(ids:string[],value:number)=>void;idpTotalColumn?:boolean}){
  const rows=sections[0]?.rows||[];
  const groups=[
    {label:"Girls", indexes:[6,7,8], className:"indicator-female"},
    {label:"Women", indexes:[9,10,11], className:"indicator-female"},
    {label:"Boys", indexes:[0,1,2], className:"indicator-male"},
    {label:"Men", indexes:[3,4,5], className:"indicator-male"},
  ];
  const valueFor=(values:number[],indexes:number[])=>indexes.reduce((sum,index)=>sum+(values[index]||0),0);
  const idsFor=(ids:string[][]|undefined,indexes:number[])=>indexes.flatMap((index)=>ids?.[index]||[]);
  if(idpTotalColumn)return <section className="indicator-population-block indicator-gender-group"><header><div><strong>Gender group disaggregation</strong><span>Girls, Women, Boys, and Men</span></div></header><div className="indicator-table-wrap"><ValueTable className="indicator-matrix"><colgroup><col className="gender-project-column"/><col className="gender-location-column"/>{Array.from({length:sections.length*groups.length+1},(_,index)=><col className="gender-data-column" key={index}/>)}</colgroup><thead><tr><th rowSpan={2} className="no-sort fixed-dimension">Project</th><th rowSpan={2} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={4} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}<th rowSpan={2} className="no-sort indicator-total overall-total">Total</th></tr><tr>{sections.flatMap((section)=>groups.map((group)=><th className={`no-sort ${group.className}`} key={`${section.id}-${group.label}`}>{group.label}</th>))}</tr></thead><tbody>{rows.map((row,rowIndex)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[rowIndex]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[rowIndex]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>groups.map((group)=>{const values=section.rows[rowIndex]?.values||[];const ids=section.rows[rowIndex]?.beneficiaryIds;return <td className={group.className} key={`${section.id}-${group.label}`}><IndicatorValue value={valueFor(values,group.indexes)} ids={idsFor(ids,group.indexes)} onOpen={onOpenIds}/></td>}))}<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td></tr>})}</tbody></ValueTable></div></section>;
  const hideTotalColumns=false;
  const dataColumnCount=sections.length*groups.length+(idpTotalColumn?1:groups.length+1);
  return <section className="indicator-population-block indicator-gender-group"><header><div><strong>Gender group disaggregation</strong><span>Girls, Women, Boys, and Men</span></div></header><div className="indicator-table-wrap"><ValueTable className="indicator-matrix"><colgroup><col className="gender-project-column"/><col className="gender-location-column"/>{Array.from({length:dataColumnCount},(_,index)=><col className="gender-data-column" key={index}/>)}</colgroup><thead><tr><th rowSpan={2} className="no-sort fixed-dimension">Project</th><th rowSpan={2} className="no-sort fixed-dimension">Project location</th>{sections.map((section)=><th colSpan={4} className={`no-sort population-band population-${section.id}`} key={section.id}>{section.label}</th>)}{!hideTotalColumns&&<><th colSpan={4} className="no-sort indicator-total">Total</th><th rowSpan={2} className="no-sort indicator-total overall-total">Grand total</th></>}</tr><tr>{sections.flatMap((section)=>groups.map((group)=><th className={`no-sort ${group.className}`} key={`${section.id}-${group.label}`}>{group.label}</th>))}{!hideTotalColumns&&groups.map((group)=><th className={`no-sort ${group.className}`} key={`total-${group.label}`}>{group.label}</th>)}</tr></thead><tbody>{rows.map((row,rowIndex)=>{const total=sections.reduce((sum,section)=>sum+(section.rows[rowIndex]?.values[12]||0),0);const totalIds=sections.flatMap((section)=>section.rows[rowIndex]?.beneficiaryIds?.[12]||[]);return <tr key={`${row.project}-${row.location}`}><td>{formatProjectLabel(row.project)}</td><td>{row.location}</td>{sections.flatMap((section)=>groups.map((group)=>{const values=section.rows[rowIndex]?.values||[];const ids=section.rows[rowIndex]?.beneficiaryIds;const value=valueFor(values,group.indexes);return <td className={group.className} key={`${section.id}-${group.label}`}><IndicatorValue value={value} ids={idsFor(ids,group.indexes)} onOpen={onOpenIds}/></td>}))}{!hideTotalColumns&&<>{groups.map((group)=>{const value=sections.reduce((sum,section)=>sum+valueFor(section.rows[rowIndex]?.values||[],group.indexes),0);const ids=sections.flatMap((section)=>idsFor(section.rows[rowIndex]?.beneficiaryIds,group.indexes));return <td className={group.className} key={`total-${group.label}`}><IndicatorValue value={value} ids={ids} onOpen={onOpenIds}/></td>})}<td className="indicator-total overall-total"><IndicatorValue value={total} ids={totalIds} onOpen={onOpenIds}/></td></>}</tr>})}<tr className="indicator-grand-total"><td>Total</td><td>All selected locations</td>{sections.flatMap((section)=>groups.map((group)=>{const value=valueFor(section.totals,group.indexes);return <td className={group.className} key={`${section.id}-${group.label}`}><IndicatorValue value={value} ids={idsFor(section.totalBeneficiaryIds,group.indexes)} onOpen={onOpenIds}/></td>}))}{!hideTotalColumns&&<>{groups.map((group)=>{const value=sections.reduce((sum,section)=>sum+valueFor(section.totals,group.indexes),0);const ids=sections.flatMap((section)=>idsFor(section.totalBeneficiaryIds,group.indexes));return <td className={group.className} key={`total-${group.label}`}><IndicatorValue value={value} ids={ids} onOpen={onOpenIds}/></td>})}<td className="indicator-total overall-total"><IndicatorValue value={sections.reduce((sum,section)=>sum+section.total,0)} ids={sections.flatMap((section)=>section.totalBeneficiaryIds?.[12]||[])} onOpen={onOpenIds}/></td></>}</tr></tbody></ValueTable></div></section>;
}

export function NarrativeRemark({item,achievementLabel}:{item:IndicatorReportItem;achievementLabel:string}){
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
  return <><section className={`indicator-narrative${remarkCopied?" copied":""}`}><header><div><strong>Narrative report</strong></div><button className="soft" onClick={()=>setExpanded(true)}><Maximize2/>Expand</button></header>{narrative.remark?<button type="button" className="narrative-copy-text" onClick={copyRemark} title="Copy narrative as plain text"><span>{narrative.remark}</span>{remarkCopied&&<small className="narrative-cell-confirm"><CheckCircle2/>Copied</small>}</button>:<div className="narrative-blank"/>}</section>{expanded&&createPortal(<div className="indicator-modal narrative-modal" role="dialog" aria-modal="true"><button className="case-modal-backdrop" aria-label="Close narrative" onClick={()=>setExpanded(false)}/><section className="indicator-modal-panel"><header><div><span>NARRATIVE REPORT</span><h2>{item.title}</h2><p>Click any table cell to copy its plain value</p></div><div className="indicator-modal-actions"><button className="soft" onClick={copyData}>{copied?<CheckCircle2/>:<Copy/>}{copied?"Copied":"Copy data"}</button><button className="icon" onClick={()=>setExpanded(false)} aria-label="Close narrative"><X/></button></div></header><div className="indicator-modal-scroll"><ValueTable className="narrative-table"><thead><tr><th>Indicators</th><th>Population</th><th>{achievementLabel}</th><th>Remarks</th></tr></thead><tbody>{narrative.rows.map((row,rowIndex)=>{const values=[row.indicator,row.population,String(row.totalAchievement),row.remarks];return <tr key={`${row.indicator}-${row.population}`}>{values.map((value,columnIndex)=>{const key=`${rowIndex}-${columnIndex}`;return <td key={key} tabIndex={0} role="button" title="Click to copy this value" className={cellCopied===key?"narrative-cell-copied":""} onClick={()=>void copyCell(value,key)} onKeyDown={(event)=>copyCellKey(event,value,key)}>{columnIndex===3?<><p>{row.remarks}</p>{row.locations.length>0&&<div className="narrative-location-list">{row.locations.map((location)=><span key={`${location.project}-${location.location}`}><b>{location.location}</b>{location.total.toLocaleString()}</span>)}</div>}</>:columnIndex===2?row.totalAchievement.toLocaleString():value}{cellCopied===key&&<small className="narrative-cell-confirm"><CheckCircle2/>Copied</small>}</td>})}</tr>})}</tbody></ValueTable></div></section></div>,document.body)}</>;
}

export function ExpandedIndicatorCard({item,ageGroups,achievementLabel,onCopy,onCopyTitle,onView,onOpenIds}:{item:IndicatorReportItem;ageGroups:string[];achievementLabel:string;onCopy:(item:IndicatorReportItem)=>void;onCopyTitle:(title:string)=>void;onView:(item:IndicatorReportItem)=>void;onOpenIds:(ids:string[],count:number,title:string)=>void}){
  const main=item.id==="individuals-reached";
  const idpTotalColumn=item.sections.length>0&&item.sections.every((section)=>section.id==="idp");
  return <article className={`indicator-card indicator-card-${item.id} glass${main?" indicator-card-main":""}`}><header className="indicator-card-header"><div className="indicator-card-title"><div className="indicator-card-badges"><span>{item.source}</span>{main&&<em>Main indicator</em>}</div><button type="button" className="indicator-title-copy" onClick={()=>onCopyTitle(item.title)} title="Copy indicator name"><h3>{item.title}</h3></button><small>{item.dateField}</small></div><div className="indicator-card-summary"><div className="indicator-total-block"><strong>{item.total?item.total.toLocaleString():""}</strong><span>Total</span></div>{typeof item.contributions.assessmentPeriod==="number"&&<div className="indicator-summary-contributions"><span>Assessment period <b>{Number(item.contributions.assessmentPeriod).toLocaleString()}</b></span><span>Carry-over <b>{Number(item.contributions.carryOver||0).toLocaleString()}</b></span></div>}<div className="indicator-summary-actions"><button className="soft indicator-copy-button" onClick={()=>onCopy(item)} title="Copy numbers" aria-label="Copy numbers"><Copy/></button><button className="soft indicator-view-button" onClick={()=>onView(item)} title="View full disaggregation" aria-label="View full disaggregation"><Maximize2/></button></div></div></header><div className="indicator-card-body"><div className="indicator-rule"><p><b>How it is counted</b>{item.rule}</p></div><PopulationIndicatorMatrix sections={item.sections} ageGroups={ageGroups} idpTotalColumn={idpTotalColumn} onOpenIds={(ids,value)=>onOpenIds(ids,value,item.title)}/><NarrativeRemark item={item} achievementLabel={achievementLabel}/>{item.children.length>0&&<div className="indicator-subindicators"><h4>Subindicators</h4>{item.children.map((child)=><article key={child.id} className={`indicator-child indicator-child-${child.id.endsWith("detainee")?"detainee":"other"}`}><header><div><button type="button" className="indicator-title-copy" onClick={()=>onCopyTitle(child.title)} title="Copy indicator name"><strong>{child.title}</strong></button><small>{child.rule}</small></div><b>{child.total?child.total.toLocaleString():""}</b><div className="indicator-child-actions">{typeof child.contributions.assessmentPeriod==="number"&&<><span>Assessment period <strong>{Number(child.contributions.assessmentPeriod).toLocaleString()}</strong></span><span>Carry-over <strong>{Number(child.contributions.carryOver||0).toLocaleString()}</strong></span></>}<button className="soft" onClick={()=>onView(child)} title="View full disaggregation"><Maximize2/></button><button className="soft" onClick={()=>onCopy(child)} title="Copy numbers"><Copy/></button></div></header><div><PopulationIndicatorMatrix sections={child.sections} ageGroups={ageGroups} idpTotalColumn={child.sections.length>0&&child.sections.every((section)=>section.id==="idp")} onOpenIds={(ids,value)=>onOpenIds(ids,value,child.title)}/><NarrativeRemark item={child} achievementLabel={achievementLabel}/></div></article>)}</div>}</div></article>;
}

export function ExpandedIndicatorGroup({group,ageGroups,achievementLabel,onCopy,onCopyTitle,onView,onOpenIds}:{group:IndicatorReportGroup;ageGroups:string[];achievementLabel:string;onCopy:(item:IndicatorReportItem)=>void;onCopyTitle:(title:string)=>void;onView:(item:IndicatorReportItem)=>void;onOpenIds:(ids:string[],count:number,title:string)=>void}){
  const icon=group.id==="refugee"?<Backpack/>:group.id==="idp"?<Tent/>:<Users/>;
  const uidTotal=group.indicators.find((item)=>item.id==="uid-secured")?.total??0,securedTotal=group.indicators.find((item)=>item.id==="secured-civil-documentation")?.total??0,uidWarning=uidTotal>securedTotal;
  return <section className={`indicator-group indicator-group-${group.id}`}><header className="indicator-group-header"><i className="indicator-group-icon">{icon}</i><div><span>{group.label}</span><strong>{group.indicators.length} indicator{group.indicators.length===1?"":"s"}</strong></div><small>Indicators may overlap; totals are shown per indicator.</small></header><div>{uidWarning&&<div className="indicator-consistency-warning" role="alert"><AlertTriangle/><div><strong>Data consistency check</strong><span>UIDs received ({uidTotal.toLocaleString()}) are higher than secured civil documentation ({securedTotal.toLocaleString()}). Please review the selected records.</span></div></div>}{group.indicators.map((item)=><ExpandedIndicatorCard key={item.id} item={item} ageGroups={ageGroups} achievementLabel={achievementLabel} onCopy={onCopy} onCopyTitle={onCopyTitle} onView={onView} onOpenIds={onOpenIds}/>)}</div></section>;
}

export function IdpDurableSolutions({report}:{report:IndicatorReport}){
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
  return <section className="indicator-group indicator-group-idp-durable-solutions"><header className="indicator-group-header"><i className="indicator-group-icon"><Tent/></i><div><span>IDP Durable Solutions</span></div></header><div><section className="indicator-population-block idp-durable-solutions-table"><div className="indicator-table-wrap"><ValueTable className="indicator-matrix"><thead><tr><th className="no-sort">Indicator</th>{genderGroups.map((group)=><th className={`no-sort ${group.className}`} key={group.label}>{group.label}</th>)}</tr></thead><tbody>{rows.map((row)=><tr key={row.label}><td>{row.label}</td>{row.values.map((value,index)=><td className={genderGroups[index].className} key={genderGroups[index].label}>{value?value.toLocaleString():""}</td>)}</tr>)}</tbody></ValueTable></div></section></div></section>;
}

export function IndicatorFullView({item,ageGroups,onClose,onOpenIds,onCopy}:{item:IndicatorReportItem;ageGroups:string[];onClose:()=>void;onOpenIds:(ids:string[],count:number,title:string)=>void;onCopy:()=>void}){
  const idpTotalColumn=item.sections.length>0&&item.sections.every((section)=>section.id==="idp");
  return <div className="indicator-modal" role="dialog" aria-modal="true" aria-label={`Full view: ${item.title}`}><button className="case-modal-backdrop" aria-label="Close full view" onClick={onClose}/><section className="indicator-modal-panel"><header><div><span>INDICATOR DISAGGREGATION</span><h2>{item.title}</h2><p>{item.total.toLocaleString()} total · Select any figure to view Beneficiary IDs.</p></div><div className="indicator-modal-actions"><button className="soft" onClick={onCopy}><Copy/>Copy numbers</button><button className="icon" onClick={onClose} aria-label="Close full view"><X/></button></div></header><div className="indicator-modal-scroll"><PopulationIndicatorMatrix sections={item.sections} ageGroups={ageGroups} idpTotalColumn={idpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,item.title)}/><GenderGroupIndicatorMatrix sections={item.sections} idpTotalColumn={idpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,item.title)}/>{item.children.map((child)=>{const childIdpTotalColumn=child.sections.length>0&&child.sections.every((section)=>section.id==="idp");return <section className="indicator-modal-child" key={child.id}><h3>{child.title}</h3><PopulationIndicatorMatrix sections={child.sections} ageGroups={ageGroups} idpTotalColumn={childIdpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,child.title)}/><GenderGroupIndicatorMatrix sections={child.sections} idpTotalColumn={childIdpTotalColumn} onOpenIds={(ids,count)=>onOpenIds(ids,count,child.title)}/></section>})}</div></section></div>;
}

export function BeneficiaryIdModal({ids,count,title,onClose,onCopy}:{ids:string[];count:number;title:string;onClose:()=>void;onCopy:(text:string,label:string)=>void}){
  const [sort,setSort]=useState<{key:"beneficiaryId"|"assessmentId"|"name"|"source";ascending:boolean}>({key:"beneficiaryId",ascending:true});
  const isDeportation=title.toLowerCase().includes("persons deported from detention");
  const rows=Array.from(new Set(ids)).map((value)=>{const [beneficiaryId="",assessmentPart="",namePart="",sourcePart=""]=value.split("  |  ");return {beneficiaryId,assessmentId:assessmentPart.replace("Assessment ID: ",""),name:namePart.replace("Name: ",""),source:sourcePart.replace("Source: ","")||"source record"}});
  const sortedRows=[...rows].sort((left,right)=>left[sort.key].localeCompare(right[sort.key],undefined,{numeric:true})*(sort.ascending?1:-1));
  const sourceCounts=rows.reduce<Record<string,number>>((result,row)=>({...result,[row.source]:(result[row.source]||0)+1}),{});
  if(isDeportation){
    const sortDeportation=(key:"beneficiaryId"|"name"|"source")=>setSort((current)=>({key,ascending:current.key===key?!current.ascending:true}));
    const deportationMark=(key:"beneficiaryId"|"name"|"source")=>sort.key===key?(sort.ascending?" ↑":" ↓"):"";
    const copiedRows=sortedRows.map((row)=>`${row.beneficiaryId}\t${row.name}\t${row.source}`).join("\n");
    return <div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Deportation records"><button className="case-modal-backdrop" aria-label="Close IDs" onClick={onClose}/><section className="beneficiary-id-modal"><header><div><span>DEPORTATION DRILL-DOWN</span><h2>Matching deportation records</h2><p>{title}</p></div><button className="icon" onClick={onClose} aria-label="Close IDs"><X/></button></header><div className="beneficiary-id-summary"><strong>{count.toLocaleString()}</strong><span>reported count</span><b>{rows.length.toLocaleString()}</b><span>unique records</span><button className="soft" disabled={!rows.length} onClick={()=>onCopy(copiedRows,"PN IDs copied")}><Copy/>Copy PN IDs</button></div><div className="drill-source-summary">{Object.entries(sourceCounts).map(([source,total])=><span key={source}><b>{total.toLocaleString()}</b> from {source}</span>)}</div><div className="beneficiary-id-list">{rows.length?<ValueTable className="drilldown-table drilldown-table-deportation"><thead><tr><th><button onClick={()=>sortDeportation("beneficiaryId")}>PN ID{deportationMark("beneficiaryId")}</button></th><th><button onClick={()=>sortDeportation("name")}>Name{deportationMark("name")}</button></th><th><button onClick={()=>sortDeportation("source")}>Source{deportationMark("source")}</button></th></tr></thead><tbody>{sortedRows.map((row,index)=><tr key={`${row.beneficiaryId}-${row.source}-${index}`}><td><code>{row.beneficiaryId}</code></td><td><code>{row.name||"—"}</code></td><td><span className={`drill-source drill-source-${row.source.toLowerCase().replace(/\s+/g,"-")}`}>{row.source}</span></td></tr>)}</tbody></ValueTable>:<p>No PN ID is available for these matching records.</p>}</div></section></div>;
  }
  const sortBy=(key:"beneficiaryId"|"assessmentId"|"name"|"source")=>setSort((current)=>({key,ascending:current.key===key?!current.ascending:true}));
  const sortMark=(key:"beneficiaryId"|"assessmentId"|"name"|"source")=>sort.key===key?(sort.ascending?" ↑":" ↓"):"";
  const exportRows=()=>exportTableWorkbook("beneficiary-assessment-id-drill-down.xlsx",["Beneficiary ID","Assessment ID","Name","Source"],sortedRows.map((row)=>({"Beneficiary ID":row.beneficiaryId,"Assessment ID":row.assessmentId,Name:row.name,Source:row.source})));
  return <div className="indicator-modal" role="dialog" aria-modal="true" aria-label="Beneficiary and Assessment IDs"><button className="case-modal-backdrop" aria-label="Close IDs" onClick={onClose}/><section className="beneficiary-id-modal"><header><div><span>BENEFICIARY &amp; ASSESSMENT ID DRILL-DOWN</span><h2>Matching case records</h2><p>{title}</p></div><button className="icon" onClick={onClose} aria-label="Close IDs"><X/></button></header><div className="beneficiary-id-summary"><strong>{count.toLocaleString()}</strong><span>reported count</span><b>{rows.length.toLocaleString()}</b><span>unique records</span><button className="soft" disabled={!rows.length} onClick={()=>onCopy(sortedRows.map((row)=>`${row.beneficiaryId}\t${row.assessmentId}\t${row.name}\t${row.source}`).join("\n"),"Beneficiary and Assessment IDs copied")}><Copy/>Copy IDs</button><ExcelDownloadButton className="primary" disabled={!rows.length} onClick={exportRows}/></div><div className="drill-source-summary">{Object.entries(sourceCounts).map(([source,total])=><span key={source}><b>{total.toLocaleString()}</b> from {source}</span>)}</div><div className="beneficiary-id-list">{rows.length?<ValueTable className="drilldown-table"><thead><tr><th><button onClick={()=>sortBy("beneficiaryId")}>Beneficiary ID{sortMark("beneficiaryId")}</button></th><th><button onClick={()=>sortBy("assessmentId")}>Assessment ID{sortMark("assessmentId")}</button></th><th><button onClick={()=>sortBy("name")}>Name{sortMark("name")}</button></th><th><button onClick={()=>sortBy("source")}>Source{sortMark("source")}</button></th></tr></thead><tbody>{sortedRows.map((row,index)=><tr key={`${row.beneficiaryId}-${row.assessmentId}-${row.source}-${index}`}><td><code>{row.beneficiaryId}</code></td><td><code>{row.assessmentId||"—"}</code></td><td><code>{row.name||"—"}</code></td><td><span className={`drill-source drill-source-${row.source.toLowerCase().replace(/\s+/g,"-")}`}>{row.source}</span></td></tr>)}</tbody></ValueTable>:<p>No Beneficiary ID is available for these matching records.</p>}</div></section></div>;
}

export function IndicatorTrendChart({months,series}:{title:string;months:string[];series:{label:string;values:number[];color:string}[]}){
  if(isSingleMonth(months))return <SingleMonthIndicatorChart month={months[0]} series={series}/>;
  const width=800,height=360,padding={left:62,right:28,top:64,bottom:64},maximum=Math.max(1,...series.flatMap((item)=>item.values)),plotHeight=height-padding.top-padding.bottom;
  const x=(index:number)=>padding.left+(months.length<=1?0:index*(width-padding.left-padding.right)/(months.length-1));
  const y=(number:number)=>height-padding.bottom-(number/maximum)*plotHeight;
  return <div className="indicator-analysis-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly indicator trend" style={{fontFamily:"Arial, sans-serif"}}><rect width={width} height={height} rx="18" fill="var(--panel-strong)"/>{[0,.25,.5,.75,1].map((ratio)=>{const lineY=height-padding.bottom-ratio*plotHeight,value=Math.round(maximum*ratio);return <g key={ratio}><line x1={padding.left} x2={width-padding.right} y1={lineY} y2={lineY} stroke="var(--line)" strokeDasharray={ratio===0?"":"4 6"}/><text x={padding.left-12} y={lineY+4} textAnchor="end" fill="var(--muted)" fontSize="12">{value.toLocaleString()}</text></g>})}{months.map((month,index)=><text key={month} x={x(index)} y={height-25} textAnchor="middle" fill="var(--muted)" fontSize="12" fontWeight="600">{month}</text>)}{series.map((item,seriesIndex)=>{return <g key={item.label}><polyline points={item.values.map((number,index)=>`${x(index)},${y(number)}`).join(" ")} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{item.values.map((number,index)=>{const label=number.toLocaleString(),labelWidth=Math.max(30,label.length*8+12),labelY=Math.max(26,Math.min(height-padding.bottom-16,y(number)-22-seriesIndex*10));return <g key={index}><circle cx={x(index)} cy={y(number)} r="6" fill="var(--panel-strong)" stroke={item.color} strokeWidth="4"/><rect x={x(index)-labelWidth/2} y={labelY-15} width={labelWidth} height="20" rx="10" fill="var(--panel-strong)" stroke={item.color} strokeOpacity=".7"/><text x={x(index)} y={labelY-1} textAnchor="middle" fill={item.color} fontSize="12" fontWeight="700">{label}</text></g>})}</g>})}</svg><footer>{series.map((item)=><span key={item.label}><i style={{background:item.color}}/>{item.label}</span>)}</footer></div>;
}

export const LazyIndicatorTrendChart=memo(function LazyIndicatorTrendChart(props:{title:string;months:string[];series:{label:string;values:number[];color:string}[]}){
  const host=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{
    if(visible)return;
    const element=host.current;
    if(!element)return;
    const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisible(true);observer.disconnect()}},{rootMargin:"500px 0px"});
    observer.observe(element);
    return()=>observer.disconnect();
  },[visible]);
  return <div ref={host} style={{minHeight:360}}>{visible?<IndicatorTrendChart {...props}/>:null}</div>;
});

export function addIndicatorAnalysisPdfPage(pdf:jsPDF,title:string,months:string[],series:{label:string;values:number[];color:string}[]){
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

export async function downloadIndicatorAnalysisPdf(title:string,months:string[],series:{label:string;values:number[];color:string}[]){
  const {jsPDF} = await import("jspdf");
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  addIndicatorAnalysisPdfPage(pdf,title,months,series);
  pdf.save(`${title.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"indicator-analysis"}-analysis.pdf`);
}

export async function downloadAllIndicatorAnalysisPdf(cards:{item:IndicatorReportItem;series:{label:string;values:number[];color:string}[]}[],months:string[]){
  const {jsPDF} = await import("jspdf");
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  cards.forEach((card,index)=>{if(index)pdf.addPage();addIndicatorAnalysisPdfPage(pdf,card.item.title,months,card.series)});
  pdf.save("indicator-analysis-selected-filters.pdf");
}

export function IndicatorAnalysis({report,monthlyReports,loading}:{report:IndicatorReport;monthlyReports:{month:string;report:IndicatorReport}[];loading:boolean}){
  const {groups,months}=useMemo(()=>{
    const monthLabel=(month:string)=>new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"});
    const allEntries=(source:IndicatorReport)=>Object.fromEntries(source.groups.flatMap((group)=>group.indicators.flatMap((item)=>[item,...item.children])).map((item)=>[item.id,item])) as Record<string,IndicatorReportItem>;
    const orderedReports=[...monthlyReports].sort((left,right)=>left.month.localeCompare(right.month));
    // Build each monthly lookup once. Previously this rebuilt the complete
    // indicator index inside every card, population, and month iteration.
    const monthlyEntries=orderedReports.map(({month,report:monthly})=>({month,entries:allEntries(monthly)}));
    const months=monthlyEntries.map(({month})=>monthLabel(month));
    const cardFor=(item:IndicatorReportItem)=>{
      const sectionIds=new Set(item.sections.map((section)=>section.id));
      const populations=[...(sectionIds.has("syrian-refugee")||sectionIds.has("non-syrian-refugee")?[{label:"Refugees",ids:new Set(["syrian-refugee","non-syrian-refugee"]),color:"#1687d9"}]:[]),...(sectionIds.has("idp")?[{label:"IDP",ids:new Set(["idp"]),color:"#16a394"}]:[])];
      const series=populations.map((population)=>({label:population.label,color:population.color,values:monthlyEntries.map(({entries})=>{const entry=entries[item.id];return entry?entry.sections.filter((section)=>population.ids.has(section.id)).reduce((total,section)=>total+section.total,0):0})}));
      return {item,series,total:series.reduce((sum,population)=>sum+population.values.reduce((subtotal,value)=>subtotal+value,0),0)};
    };
    return {months,groups:report.groups.map((group)=>({group,cards:group.indicators.flatMap((item)=>[item,...item.children]).map(cardFor)}))};
  },[report,monthlyReports]);
  return <section className="indicator-analysis-page">
    <header><div><h2>Monthly indicator trends</h2></div><div className="indicator-analysis-page-actions"><button className="soft indicator-analysis-pdf" disabled={!monthlyReports.length} onClick={()=>downloadAllIndicatorAnalysisPdf(groups.flatMap(({cards})=>cards),months)} title="Download every selected pivot table and chart"><FileText/>Download all PDF</button>{loading&&<small className="analysis-loading-state"><RefreshCw/><span>Loading selected months</span><i>Updating charts</i></small>}</div></header>
    {!monthlyReports.length?<div className="legal-empty"><ChartColumnIncreasing/><h3>{loading?"Preparing the first month of analysis…":"No months are available for this selection."}</h3></div>:<div className="indicator-groups indicator-analysis-groups">{groups.map(({group,cards})=><details className={`indicator-group indicator-group-${group.id}`} open key={group.id}>
      <summary><div><span>{group.label}</span><strong>Monthly indicator analysis</strong></div><b>{cards.length} indicator{cards.length===1?"":"s"}</b><ChevronDown/></summary>
      <div className="indicator-analysis-list">{cards.map(({item,series,total})=><article className="glass indicator-analysis-card" key={item.id}>
        <header><div><span>{item.source}</span><h3>{item.title}</h3></div><div className="indicator-analysis-actions"><button className="soft indicator-analysis-pdf" onClick={()=>downloadIndicatorAnalysisPdf(item.title,months,series)} title="Download pivot table and chart as PDF"><FileText/>PDF</button><button className="soft indicator-analysis-pdf" onClick={(event)=>{const svg=event.currentTarget.closest("article")?.querySelector<SVGSVGElement>(".indicator-analysis-chart svg");if(svg)void exportSvgChart(svg,`${item.title}-monthly-trend`,"png")}} title="Download high-quality PNG"><Download/>PNG</button><strong>{total.toLocaleString()}<small>selected total</small></strong></div></header>
        <div className="indicator-analysis-content"><div className="indicator-analysis-table-wrap"><ValueTable><thead><tr><th>Month</th>{series.map((item)=><th key={item.label}>{item.label}</th>)}</tr></thead><tbody>{months.map((month,index)=><tr key={month}><td>{month}</td>{series.map((item)=><td key={item.label}>{item.values[index]?item.values[index].toLocaleString():""}</td>)}</tr>)}<tr className="indicator-analysis-total"><td>Total</td>{series.map((item)=><td key={item.label}>{item.values.reduce((sum,value)=>sum+value,0).toLocaleString()}</td>)}</tr></tbody></ValueTable></div><LazyIndicatorTrendChart title={item.title} months={months} series={series}/></div>
      </article>)}</div>
    </details>)}</div>}
  </section>;
}

export function IndicatorReportingCheck({projects,months,projectOptions,monthOptions,revision}:{projects:string[];months:string[];projectOptions:string[];monthOptions:string[];revision:number}){
  const [metadata,setMetadata]=useState<IndicatorReconciliationMetadata|null>(null),[result,setResult]=useState<IndicatorReconciliation|null>(null),[busy,setBusy]=useState(false),[importBusy,setImportBusy]=useState(false),[exportBusy,setExportBusy]=useState(false),[error,setError]=useState(""),[query,setQuery]=useState(""),[mode,setMode]=useState<"issues"|"all">("issues"),[page,setPage]=useState(1);
  const [checkProjects,setCheckProjects]=useState<string[]>(projects),[checkMonths,setCheckMonths]=useState<string[]>(months);
  const [linkedOptions,setLinkedOptions]=useState<IndicatorReport["filterOptions"]|null>(null);
  useEffect(()=>{const controller=new AbortController();getLegalIndicators(checkProjects,[],[],[],checkMonths,[],controller.signal).then(next=>{if(!controller.signal.aborted)setLinkedOptions(next.filterOptions)}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)});return()=>controller.abort()},[checkProjects,checkMonths,revision]);
  const fileInput=useRef<HTMLInputElement|null>(null),pageSize=100;
  const checkController=useRef<AbortController|null>(null),checkScope=useRef("");
  checkScope.current=JSON.stringify([checkProjects,checkMonths,metadata?.loadedAt,metadata?.sheet,revision]);
  useEffect(()=>()=>checkController.current?.abort(),[]);
  useEffect(()=>{checkController.current?.abort();setBusy(false);setResult(null)},[checkProjects,checkMonths,metadata,revision]);
  useEffect(()=>{getIndicatorReconciliationMetadata().then(setMetadata).catch((reason)=>setError(reason.message))},[]);
  const availableMonths=useMemo(()=>{const values=linkedOptions?.months||monthOptions;return metadata?.months?.length?values.filter(month=>metadata.months.includes(month)):values},[metadata,monthOptions,linkedOptions]);
  const changeProjects=(next:string[])=>{setCheckProjects(next);setResult(null)};
  const changeMonths=(next:string[])=>{setCheckMonths(next);setResult(null)};
  const run=async()=>{checkController.current?.abort();const controller=new AbortController();checkController.current=controller;const scope=checkScope.current;const current=()=>!controller.signal.aborted&&checkScope.current===scope;setBusy(true);setError("");try{const next=await reconcileLegalIndicators(checkProjects,[],[],checkMonths,[],controller.signal);if(current()){setResult(next);setPage(1)}}catch(reason:any){if(current())setError(reason?.message||"Unable to compare the reporting tools.")}finally{if(current())setBusy(false)}};
  const acceptMetadata=(next:IndicatorReconciliationMetadata)=>{setMetadata(next);setResult(null);setError("")};
  const importBrowserFile=async(file:File|null)=>{if(!file)return;setImportBusy(true);setError("");try{acceptMetadata(await uploadIndicatorMasterWorkbook(file))}catch(reason:any){setError(reason?.message||"Unable to read the master workbook.")}finally{setImportBusy(false)}};
  const chooseWorkbook=async()=>{const desktopApi=(window as any).pywebview?.api;if(!desktopApi?.choose_indicator_master_workbook||!desktopApi?.process_indicator_master_workbook){fileInput.current?.click();return}setImportBusy(true);setError("");try{const path=await desktopApi.choose_indicator_master_workbook();if(path)acceptMetadata(await desktopApi.process_indicator_master_workbook(path))}catch(reason:any){setError(reason?.message||"Unable to read the master workbook.")}finally{setImportBusy(false)}};
  const refreshWorkbook=async()=>{const desktopApi=(window as any).pywebview?.api;if(!desktopApi?.refresh_indicator_master_workbook){fileInput.current?.click();return}setImportBusy(true);setError("");try{acceptMetadata(await desktopApi.refresh_indicator_master_workbook())}catch(reason:any){setError(reason?.message||"Unable to refresh the master workbook.")}finally{setImportBusy(false)}};
  const changeSheet=async(sheet:string)=>{setImportBusy(true);setError("");try{acceptMetadata(await selectIndicatorMasterSheet(sheet))}catch(reason:any){setError(reason?.message||"Unable to read the selected worksheet.")}finally{setImportBusy(false)}};
  const exportResults=async()=>{setExportBusy(true);setError("");try{await exportIndicatorReconciliation(checkProjects,[],[],checkMonths,[])}catch(reason:any){setError(reason?.message||"Unable to export the reporting check.")}finally{setExportBusy(false)}};
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return (result?.rows||[]).filter((row)=>(mode==="all"||row.status!=="matched")&&(!needle||[row.indicator,row.month,row.project,row.location,row.population,row.sex,row.ageGroup,row.status].some(value=>value.toLowerCase().includes(needle))))},[result,mode,query]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),visible=useMemo(()=>filtered.slice((page-1)*pageSize,page*pageSize),[filtered,page]);
  useEffect(()=>setPage(1),[query,mode]);
  const statusLabel=(status:string)=>({matched:"Matched",different:"Different","workbook-only":"Workbook only","platform-only":"Platform only","missing-workbook":"Missing workbook value"}[status]||status);
  return <section className="indicator-reconciliation-page">
    <div className="glass indicator-reconciliation-source">
      <div><span className="eyebrow">MASTER WORKBOOK</span><h2>Reporting Tool comparison</h2><p>Compare cached values from the workbook's Reporting Tool sheet with the platform at month, project/location, population, sex and age level.</p></div>
      <div className="indicator-reconciliation-file"><input ref={fileInput} hidden type="file" accept=".xlsx" onChange={(event)=>{void importBrowserFile(event.target.files?.[0]||null);event.currentTarget.value=""}}/><span>{metadata?.ready?"Current workbook":"No workbook selected"}</span><strong>{metadata?.filename||"Choose the master reporting workbook"}</strong>{metadata?.ready&&<><label><span>Worksheet</span><select value={metadata.sheet} disabled={importBusy} onChange={(event)=>{void changeSheet(event.target.value)}}>{metadata.availableSheets.map((sheet)=><option value={sheet} key={sheet}>{sheet}</option>)}</select></label><small>{metadata.sheet} · {metadata.months.length} month{metadata.months.length===1?"":"s"}</small></>}</div>
      <div className="indicator-reconciliation-source-actions"><button className="soft" disabled={importBusy} onClick={chooseWorkbook}><FolderOpen/>{metadata?.ready?"Replace":"Choose workbook"}</button>{metadata?.remembered&&<button className="soft" disabled={importBusy} onClick={refreshWorkbook}><RefreshCw/>Refresh</button>}<button className="primary" disabled={!metadata?.ready||busy||importBusy} onClick={run}>{busy?<><span className="button-spinner"/>Comparing...</>:<><CheckCheck/>Run check</>}</button></div>
      <div className="indicator-reconciliation-filters"><CheckboxMultiSelect label="Projects" values={linkedOptions?.projects||projectOptions} selected={checkProjects} onChange={changeProjects}/><CheckboxMultiSelect label="Months" values={availableMonths} selected={checkMonths} onChange={changeMonths}/><small>Leave a filter empty to compare all available values.</small></div>
    </div>
    {error&&<div className="error glass"><span>{error}</span></div>}
    {(metadata?.warnings?.length||0)>0&&!result&&<details className="reconciliation-warnings"><summary>{metadata!.warnings.length} workbook warning{metadata!.warnings.length===1?"":"s"}</summary>{metadata!.warnings.map((warning)=><p key={warning}>{warning}</p>)}</details>}
    {result&&<>
      <div className="reconciliation-summary indicator-reconciliation-summary">
        <div className="matched"><span>Matched</span><strong>{result.summary.matched.toLocaleString()}</strong></div><div className={result.summary.different?"unmatched":"matched"}><span>Different</span><strong>{result.summary.different.toLocaleString()}</strong></div><div className={result.summary.workbookOnly?"unmatched":"matched"}><span>Workbook only</span><strong>{result.summary.workbookOnly.toLocaleString()}</strong></div><div className={result.summary.platformOnly?"unmatched":"matched"}><span>Platform only</span><strong>{result.summary.platformOnly.toLocaleString()}</strong></div><div className={result.summary.missingWorkbook?"unmatched":"matched"}><span>Missing workbook</span><strong>{result.summary.missingWorkbook.toLocaleString()}</strong></div><div className={result.summary.warnings?"unmatched":"matched"}><span>Warnings</span><strong>{result.summary.warnings.toLocaleString()}</strong></div>
      </div>
      <div className="glass indicator-reconciliation-results">
        <header><div><span className="eyebrow">COMPARISON RESULTS</span><h3>{filtered.length.toLocaleString()} displayed values</h3><p>{result.months.map(formatFilterMonth).join(", ")}</p></div><div className="indicator-reconciliation-result-actions"><div className="indicator-reconciliation-mode"><button className={mode==="issues"?"active":""} onClick={()=>setMode("issues")}>Differences only</button><button className={mode==="all"?"active":""} onClick={()=>setMode("all")}>All values</button></div><label><Search/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search results"/></label><ExcelDownloadButton busy={exportBusy} onClick={exportResults}/></div></header>
        {result.warnings.length>0&&<details className="reconciliation-warnings"><summary>{result.warnings.length} mapping or workbook warning{result.warnings.length===1?"":"s"}</summary>{result.warnings.map((warning)=><p key={warning}>{warning}</p>)}</details>}
        <div className="legal-table-wrap indicator-reconciliation-table"><ValueTable><thead><tr><th>Indicator</th><th>Month</th><th>Project / location</th><th>Population</th><th>Sex / age</th><th>Platform</th><th>Excel</th><th>Variance</th><th>Status</th></tr></thead>{visible.length?<VirtualRows items={visible} table columns={11} enabled={filtered.length>200} estimate={64} render={(row,index)=><tr key={`${row.indicatorId}-${row.month}-${row.project}-${row.location}-${row.population}-${row.sex}-${row.ageGroup}-${index}`}><td><strong>{row.indicator}</strong></td><td>{formatFilterMonth(row.month)}</td><td><strong>{formatProjectLabel(row.project)}</strong><small>{row.location}</small></td><td>{row.population.replaceAll("-"," ")}</td><td>{row.sex} · {row.ageGroup}</td><td>{row.platformValue===null?"Missing":row.platformValue.toLocaleString()}</td><td>{row.workbookValue===null?"Missing":row.workbookValue.toLocaleString()}</td><td>{row.variance===null?"-":row.variance.toLocaleString()}</td><td><span className={`indicator-reconciliation-status ${row.status}`}>{statusLabel(row.status)}</span></td></tr>}/>:<tbody><tr><td colSpan={11}><div className="reconciliation-empty"><CheckCircle2/><strong>No differences match the current search.</strong></div></td></tr></tbody>}</ValueTable></div>
        <Pager variant="reconciliation" page={page} total={filtered.length} pageSize={pageSize} onChange={setPage}/>
      </div>
    </>}
  </section>;
}

export function IndicatorReporting({revision}:{revision:number}){
  const [report,setReport]=useState<IndicatorReport|null>(null),[projects,setProjects]=useState<string[]>([]),[locations,setLocations]=useState<string[]>([]),[quarters,setQuarters]=useState<string[]>([]),[months,setMonths]=useState<string[]>([]),[communityTypes,setCommunityTypes]=useState<string[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[toast,setToast]=useState(""),[filterDrawer,setFilterDrawer]=useState(false),[fullView,setFullView]=useState<IndicatorReportItem|null>(null),[idDrill,setIdDrill]=useState<{ids:string[];count:number;title:string}|null>(null),[view,setView]=useState<"report"|"analysis"|"check">("report"),[monthlyReports,setMonthlyReports]=useState<{month:string;report:IndicatorReport}[]>([]),[analysisLoading,setAnalysisLoading]=useState(false),[exporting,setExporting]=useState(false),[narrativeExporting,setNarrativeExporting]=useState(false);
  const toastTimer=useRef<number|undefined>(undefined);
  const indicatorQuery=useMemo(()=>({projects,locations,quarters,months,communityTypes,revision}),[projects,locations,quarters,months,communityTypes,revision]);
  const latestIndicatorQuery=useRef(indicatorQuery);latestIndicatorQuery.current=indicatorQuery;
  const debouncedQuery=useDebouncedValue(indicatorQuery,180);
  const reportMatchesFilters=useMemo(()=>reportMatchesIndicatorScope(report,indicatorQuery),[report,indicatorQuery]);
  useEffect(()=>{const controller=new AbortController();const current=()=>!controller.signal.aborted&&latestIndicatorQuery.current===debouncedQuery;setLoading(true);setError("");getLegalIndicators(debouncedQuery.projects,debouncedQuery.locations,[],debouncedQuery.quarters,debouncedQuery.months,debouncedQuery.communityTypes,controller.signal).then((next)=>{if(current())setReport(next)}).catch((reason)=>{if(current()&&reason.name!=="AbortError")setError(reason.message)}).finally(()=>{if(current())setLoading(false)});return()=>controller.abort()},[debouncedQuery]);
  const locationOptions=report?.filterOptions.locations||[];
  const communityTypeOptions=report?.filterOptions.communityTypes||[];
  const quarterOptions=useMemo(()=>report?.filterOptions.quarters||[],[report]);
  const monthOptions=useMemo(()=>report?.filterOptions.months||[],[report]);
  const analysisMonths=useMemo(()=>[...monthOptions.filter(month=>matchesSelection(month,months))].filter((month)=>month.startsWith("2026-")).sort((left,right)=>right.localeCompare(left)),[months,monthOptions]);
  useEffect(()=>{
    // Wait until the Indicators request is complete, then preload Analysis in
    // the background so opening the tab can reuse already completed months.
    if(view!=="analysis"||loading||!report||!reportMatchesFilters||!analysisMonths.length){setMonthlyReports([]);setAnalysisLoading(false);return;}
    const controller=new AbortController();
    setMonthlyReports([]);setAnalysisLoading(true);
    getLegalIndicatorsMonthly(projects,locations,[],[],analysisMonths,communityTypes,controller.signal)
      .then((result)=>{if(!controller.signal.aborted&&latestIndicatorQuery.current===indicatorQuery)setMonthlyReports(result.reports)})
      .catch((reason)=>{if(!controller.signal.aborted&&reason.name!=="AbortError")setError(reason.message||"Unable to load monthly analysis")})
      .finally(()=>{if(!controller.signal.aborted)setAnalysisLoading(false)});
    return()=>controller.abort();
  },[view,loading,report,analysisMonths,projects,locations,months,communityTypes,revision,reportMatchesFilters,indicatorQuery]);
  const showToast=(message:string)=>{if(toastTimer.current!==undefined)window.clearTimeout(toastTimer.current);setToast(message);toastTimer.current=window.setTimeout(()=>{setToast("");toastTimer.current=undefined},1800)};
  useEffect(()=>()=>{if(toastTimer.current!==undefined)window.clearTimeout(toastTimer.current)},[]);
  const copyText=async(text:string,label:string)=>{try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();document.execCommand("copy");area.remove()}showToast(label)};
  const copyItem=async(item:IndicatorReportItem)=>{
    try{
      const scopedReport=reportMatchesFilters&&report?report:await getLegalIndicators(projects,locations,[],quarters,months,communityTypes);
      const scopedItem=findIndicatorItem(scopedReport,item.id);
      if(!scopedItem)throw new Error("The selected indicator is not available for these filters.");
      const lines=indicatorLines(scopedItem,{projects,locations});
      if(!lines.length){showToast("No filtered rows to copy");return;}
      await copyText(lines.join("\n"),"Filtered indicator numbers copied");
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to copy the filtered indicator numbers")}
  };
  const copyTitle=(title:string)=>copyText(title,"Indicator name copied");
  const exportAll=async()=>{setExporting(true);try{await exportLegalIndicators(projects,locations,[],quarters,months,communityTypes);showToast("Professional Excel downloaded")}catch(reason){setError(reason instanceof Error?reason.message:"Unable to export indicator report")}finally{setExporting(false)}};
  const exportNarrative=async()=>{setNarrativeExporting(true);try{await exportLegalNarrative(projects,locations,[],quarters,months,communityTypes);showToast("Narrative report downloaded")}catch(reason){setError(reason instanceof Error?reason.message:"Unable to export narrative report")}finally{setNarrativeExporting(false)}};
  const achievementLabel=useMemo(()=>{
    if(months.length!==1||isExcludedValue(months[0]))return `Total Achievement - ${months.length?"Selected Period":"Reporting Period"}`;
    const [year,month]=months[0].split("-").map(Number),date=new Date(Date.UTC(year,month-1,1));
    return `Total Achievement - ${Number.isNaN(date.getTime())?months[0]:date.toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"})}`;
  },[months]);
  const activeFilters=projects.length+locations.length+quarters.length+months.length+communityTypes.length;
  const clearFilters=()=>{setProjects([]);setLocations([]);setQuarters([]);setMonths([]);setCommunityTypes([])};
  useEffect(()=>{
    if(!fullView||!report||!reportMatchesFilters)return;
    const refreshed=findIndicatorItem(report,fullView.id);
    if(refreshed&&refreshed!==fullView)setFullView(refreshed);
  },[report,reportMatchesFilters,fullView?.id]);
  const filterControls=<><CheckboxMultiSelect label="Projects" values={report?.filterOptions.projects||[]} selected={projects} onChange={setProjects}/><CheckboxMultiSelect label="Project locations" values={locationOptions} selected={locations} onChange={setLocations}/><CheckboxMultiSelect label="Community type" values={communityTypeOptions} selected={communityTypes} onChange={setCommunityTypes}/><CheckboxMultiSelect label="Quarters" values={quarterOptions} selected={quarters} onChange={setQuarters}/><CheckboxMultiSelect label="Months" values={monthOptions} selected={months} onChange={setMonths}/></>;
  const filterBar=<>{filterControls}<button className="soft case-filter-button" onClick={()=>setFilterDrawer(true)}><SlidersHorizontal/>Filters {activeFilters>0&&<b>{activeFilters}</b>}</button><button className="soft indicator-filter-clear" disabled={!activeFilters} onClick={clearFilters}><RotateCcw/>Reset</button><ExcelDownloadButton disabled={!report||loading} busy={exporting} onClick={exportAll}/><ExcelDownloadButton className="soft narrative-export-button" disabled={!report||loading} busy={narrativeExporting} onClick={exportNarrative}>Narrative</ExcelDownloadButton></>;
  const openIds=(ids:string[],count:number,title:string)=>setIdDrill({ids,count,title});
  return <div className="indicator-reporting"><nav className="indicator-subnav" aria-label="Indicator reporting views"><button className={view==="report"?"active":""} onClick={()=>{legalLoadScheduler.promotePage("indicators");setView("report")}}><TableProperties/>Indicators</button><button className={view==="analysis"?"active":""} onClick={()=>{legalLoadScheduler.promotePage("indicators","analysis");setView("analysis")}}><ChartColumnIncreasing/>Analysis</button><button className={view==="check"?"active":""} onClick={()=>{legalLoadScheduler.promotePage("indicators","check");setView("check")}}><CheckCheck/>Reporting Check</button></nav><LegalScrollControls onFilters={()=>setFilterDrawer(true)} activeCount={activeFilters} onClear={clearFilters} compactFilters={<><div className="indicator-header-project"><CheckboxMultiSelect label="Projects" values={report?.filterOptions.projects||[]} selected={projects} onChange={setProjects}/></div><div className="indicator-header-month"><CheckboxMultiSelect label="Months" values={monthOptions} selected={months} onChange={setMonths}/></div></>}><div className="indicator-filter-bar">{filterBar}</div></LegalScrollControls>{filterDrawer&&<SharedFilterDrawer title="Filter indicator reporting" eyebrow="INDICATOR FILTERS" onClose={()=>setFilterDrawer(false)} onReset={clearFilters} resetDisabled={!activeFilters}
      fields={[{key:"projects",label:"Projects",values:report?.filterOptions.projects||[],selected:projects,onChange:setProjects},{key:"locations",label:"Project locations",values:locationOptions,selected:locations,onChange:setLocations},{key:"communityTypes",label:"Community type",values:communityTypeOptions,selected:communityTypes,onChange:setCommunityTypes},{key:"quarters",label:"Quarters",values:quarterOptions,selected:quarters,onChange:setQuarters},{key:"months",label:"Months",values:monthOptions,selected:months,onChange:setMonths}]}/>}{error&&<div className="error glass">{error}</div>}{view==="check"?<IndicatorReportingCheck revision={revision} projects={projects} months={months} projectOptions={report?.filterOptions.projects||[]} monthOptions={report?.filterOptions.months||[]}/>:loading&&!report?<LegalSkeleton variant="indicator"/>:report&&(view==="report"?<div className={loading?"indicator-groups refreshing":"indicator-groups"}>{report.groups.map((group)=><ExpandedIndicatorGroup key={group.id} group={group} ageGroups={report.ageGroups} achievementLabel={achievementLabel} onCopy={copyItem} onCopyTitle={copyTitle} onView={setFullView} onOpenIds={openIds}/>)}</div>:<IndicatorAnalysis report={report} monthlyReports={monthlyReports} loading={analysisLoading}/>)}{report&&view==="report"&&<IdpDurableSolutions report={report}/>} {fullView&&<IndicatorFullView item={fullView} ageGroups={report?.ageGroups||[]} onClose={()=>setFullView(null)} onOpenIds={openIds} onCopy={()=>void copyItem(fullView)}/>} {idDrill&&<BeneficiaryIdModal {...idDrill} onClose={()=>setIdDrill(null)} onCopy={copyText}/>} <NotificationToast message={toast} label="Copied"/></div>;
}
import './indicators.css';
