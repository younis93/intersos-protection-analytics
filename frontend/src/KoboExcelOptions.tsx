import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,FileSpreadsheet,Layers,ListChecks,ListX,RotateCcw,Search,Table2,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {koboApi} from './koboApi';
import type {KoboAnalysis,KoboSettings} from './koboTypes';
import {initialExcelGroups,excelGroupChoices,excelSheetPreview} from './koboExcelLayoutOptions';
import './koboExcelOptions.css';
export type ExcelChartMetric='count'|'percent'|'both';
export type KoboExcelOptionsInput={projectId:string;projectName:string;settings:KoboSettings;analysis:KoboAnalysis;question:string};
export default function KoboExcelOptions({input,onClose,onExport}:{input:KoboExcelOptionsInput;onClose:()=>void;onExport:(groups:string[],chartMetric:ExcelChartMetric)=>void}){
 const[chartMetric,setChartMetric]=useState<ExcelChartMetric>('count');
 const dialog=useRef<HTMLDialogElement>(null),scoped=useMemo(()=>({...input.analysis,questions:input.question?input.analysis.questions.filter(question=>question.id===input.question):input.analysis.questions}),[input]);
 const matches=JSON.stringify(input.analysis.settings)===JSON.stringify(input.settings);
 const[snapshot,setSnapshot]=useState<KoboAnalysis|null>(matches?scoped:null),[selected,setSelected]=useState<string[]>(matches?initialExcelGroups(scoped,input.settings.excelGroups):[]),[search,setSearch]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[]);
 useEffect(()=>{
  if(matches)return;
  const controller=new AbortController();setError('');
  void koboApi.analyze(input.projectId,input.settings,controller.signal,input.question).then(snapshot=>{if(!controller.signal.aborted){setSnapshot(snapshot);setSelected(initialExcelGroups(snapshot,input.settings.excelGroups))}}).catch(issue=>{if(!controller.signal.aborted)setError(issue instanceof Error?issue.message:String(issue))});return()=>controller.abort();
 },[input,matches,retry]);
 const repeatGroups=snapshot?.groups.filter(group=>group.repeat)||[];
 const groups=useMemo(()=>snapshot?excelGroupChoices(snapshot):[],[snapshot]),sheets=useMemo(()=>snapshot?excelSheetPreview(snapshot,selected):[],[snapshot,selected]);
 const query=search.trim().normalize('NFC').toLocaleLowerCase(),shown=groups.filter(group=>`${group.path} ${group.id}`.normalize('NFC').toLocaleLowerCase().includes(query));
 const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
 return <dialog ref={dialog} className="kobo-dialog glass kobo-excel-options" aria-label="Excel export options" dir="ltr" onCancel={event=>{event.preventDefault();onClose()}}>
  <header><span className="kobo-excel-options-icon"><FileSpreadsheet aria-hidden="true"/></span><div><span className="eyebrow">EXCEL WORKBOOK</span><h2>Excel export options</h2><p dir="auto">{input.projectName}{input.question?' · Single-question export':''}</p></div><button type="button" className="soft" aria-label="Close Excel export options" onClick={onClose}><X/></button></header>
  {error?<div className="kobo-excel-options-message" role="alert"><h3>Could not prepare export options</h3><p>{error}</p><button type="button" className="soft" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:!snapshot?<div className="kobo-excel-options-message" role="status">Preparing question groups…</div>:<div className="kobo-excel-options-body">
   <section className="kobo-excel-chart-options" aria-label="Chart settings"><div><h3>Chart values</h3><p>{chartMetric==='both'?'Bars show counts, with labels such as 40 (32.5%).':chartMetric==='percent'?'Charts show the percentage for each answer.':'Charts show the number of responses for each answer.'} Pivot tables keep their current display.</p></div><AppSelect label="Chart values" value={chartMetric} onChange={value=>setChartMetric(value as ExcelChartMetric)} options={[["count","# Count"],["percent","% Percentage"],["both","Both"]]}/></section>
   <div className="kobo-excel-options-columns">
   <section className="kobo-excel-options-groups" aria-label="Separate analysis sheets"><div className="kobo-excel-groups-heading"><h3>Choose groups to separate</h3><p>Selected groups get their own sheet. Other groups stay together on <strong>Analysis</strong>.</p></div>
    <label className="kobo-excel-group-search"><Search aria-hidden="true"/><input aria-label="Search export groups" placeholder="Search groups…" value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button type="button" aria-label="Clear export group search" onClick={()=>setSearch('')}><X/></button>}</label>
    <div className="kobo-excel-group-actions"><small>{selected.length} of {groups.length} selected{query?` · ${shown.length} matching`:""}</small><button type="button" className="kobo-excel-select-all" onClick={()=>setSelected(groups.map(group=>group.id))}><ListChecks aria-hidden="true"/>All groups</button><button type="button" className="kobo-excel-use-default" onClick={()=>setSelected(initialExcelGroups(snapshot,input.settings.excelGroups))}><RotateCcw aria-hidden="true"/>Use default</button><button type="button" className="kobo-excel-clear-groups" disabled={!selected.length} onClick={()=>setSelected([])}><ListX aria-hidden="true"/>Clear</button></div>
    <div className="kobo-excel-group-list">{shown.map(group=><label key={group.id} className={`kobo-excel-group-row${selected.includes(group.id)?' is-selected':''}`} style={{paddingInlineStart:12+Math.min(group.depth,4)*16}}><input type="checkbox" aria-label={`Separate ${group.path}`} checked={selected.includes(group.id)} onChange={()=>toggle(group.id)}/><Layers aria-hidden="true"/><span><strong dir="auto" title={group.path}>{group.label||group.name}</strong><small>{group.depth?'Nested group':'Main group'} · {group.count} {group.count===1?'question':'questions'}</small></span>{selected.includes(group.id)&&<Check aria-hidden="true"/>}</label>)}{!shown.length&&<p className="kobo-excel-no-groups">{query?'No matching groups. Try another name.':'No grouped questions in this export.'}</p>}</div>
    <p className="kobo-excel-options-hint">Selecting a nested group gives it its own sheet without duplicating questions. {input.question?'These choices apply to this export only.':'Your choices are saved for the next full analysis export.'}</p>
   </section>
   <section className="kobo-excel-workbook-preview" aria-label="Workbook preview"><div><span className="eyebrow">WORKBOOK PREVIEW</span><h3>{sheets.length+2+repeatGroups.length} visible worksheets</h3><p>{snapshot.questions.length} {snapshot.questions.length===1?'question':'questions'} · Response filters and breakdowns</p></div>
    <ol><li className="is-data"><Table2 aria-hidden="true"/><span><strong>Data</strong><small>All non-identifying fields · One row per response</small></span><span className="kobo-excel-sheet-type">Source</span></li>{repeatGroups.map(group=><li key={`data-${group.id}`} className="is-data"><Table2 aria-hidden="true"/><span><strong dir="auto">Data - {group.label||group.name}</strong><small>Repeat entries with response and parent keys</small></span><span className="kobo-excel-sheet-type">Source</span></li>)}<li><Table2 aria-hidden="true"/><span><strong>Workbook guide</strong><small>Editing instructions and choice-code legend</small></span></li>{sheets.map(sheet=><li key={sheet.id}><FileSpreadsheet aria-hidden="true"/><span><strong title={sheet.path} dir="auto">{sheet.sheetName}</strong><small>{sheet.questions.length} {sheet.questions.length===1?'question':'questions'} · {sheet.kind==='combined'?'Remaining groups':sheet.kind==='general'?'Ungrouped questions':'Separate group'}</small></span><span className="kobo-excel-sheet-type">Analysis</span></li>)}</ol>
    <details className="kobo-excel-workbook-details"><summary>Workbook details</summary><div><p>All responses are included, with current filters selected initially. Repeat entries use separate Data sheets.</p><p>Edit response fields or add rows inside the Data table, then choose Data &gt; Refresh All in Excel. Keep collapsed calculated columns intact. See Workbook guide for editing instructions and reference sheets.</p><p>Identifying fields are excluded. Remove them from questions, filters and breakdowns before exporting. Multi-choice and repeat filter fields are not supported.</p></div></details>
   </section>
   </div>
  </div>}
  <footer className="kobo-dialog-actions"><p>The file will be prepared in the background.</p><div className="kobo-dialog-action-buttons"><button type="button" className="soft" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!snapshot?.questions.length||!!error} onClick={()=>onExport([...selected],chartMetric)}><FileSpreadsheet aria-hidden="true"/>Start Excel export</button></div></footer>
 </dialog>;
}

