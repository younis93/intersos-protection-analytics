import {useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Columns3,Download,Eye,EyeOff,Filter,RotateCcw,Search,ShieldAlert} from 'lucide-react';
import {exportExplorer,getExplorer,type ExplorerQuery} from './api';
import {AppSelect,ExcelDownloadButton,formatNumber} from './components';
import {formatTableValue} from './dateFormat';
import type {ExplorerColumn,ExplorerFilter,ExplorerResult,Metadata} from './types';

const PAGE_SIZE=100;
const operators=(type:ExplorerColumn['type']):[string,string][]=> type==='number'
  ? [['equals','Equals'],['gte','At least'],['lte','At most'],['between','Between'],['blank','Is blank'],['not_blank','Is not blank']]
  : type==='date'
    ? [['date_on','On'],['date_after','On or after'],['date_before','On or before'],['date_between','Between'],['blank','Is blank'],['not_blank','Is not blank']]
    : [['contains','Contains'],['equals','Equals'],['blank','Is blank'],['not_blank','Is not blank']];

export default function DataExplorer({metadata}:{metadata:Metadata}){
  const sheets=metadata.dataExplorer?.sheets||[];
  const [sheetId,setSheetId]=useState(sheets[0]?.id||'');
  const sheet=sheets.find(item=>item.id===sheetId)||sheets[0];
  const [searchInput,setSearchInput]=useState(''),[search,setSearch]=useState('');
  const [filters,setFilters]=useState<ExplorerFilter[]>([]),[sortColumn,setSortColumn]=useState<string|null>(null),[sortDirection,setSortDirection]=useState<'asc'|'desc'>('asc');
  const [hidden,setHidden]=useState<string[]>([]),[page,setPage]=useState(1),[result,setResult]=useState<ExplorerResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [filterOpen,setFilterOpen]=useState(false),[columnsOpen,setColumnsOpen]=useState(false),[exporting,setExporting]=useState('');
  useEffect(()=>{const timer=window.setTimeout(()=>setSearch(searchInput),300);return()=>window.clearTimeout(timer)},[searchInput]);
  useEffect(()=>{if(!sheetId&&sheets[0])setSheetId(sheets[0].id)},[sheetId,sheets]);
  useEffect(()=>{setFilters([]);setSortColumn(null);setHidden([]);setPage(1);setSearchInput('');setSearch('')},[sheetId]);
  useEffect(()=>setPage(1),[search,filters,sortColumn,sortDirection]);
  const visible=useMemo(()=>sheet?.columns.map(c=>c.name).filter(c=>!hidden.includes(c))||[],[sheet,hidden]);
  const query:ExplorerQuery={sheetId:sheet?.id||'',search,filters,sortColumn,sortDirection,page,pageSize:PAGE_SIZE,columns:visible};
  useEffect(()=>{if(!sheet)return;const controller=new AbortController();setBusy(true);setError('');getExplorer(query,controller.signal).then(setResult).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[sheet?.id,search,filters,sortColumn,sortDirection,page,hidden]);
  const clear=()=>{setSearchInput('');setSearch('');setFilters([]);setSortColumn(null);setSortDirection('asc');setPage(1)};
  const updateFilter=(column:string,patch:Partial<ExplorerFilter>)=>setFilters(current=>{const found=current.find(item=>item.column===column);const next={column,operator:'contains',...found,...patch};return[...current.filter(item=>item.column!==column),next]});
  const removeFilter=(column:string)=>setFilters(current=>current.filter(item=>item.column!==column));
  const sort=(column:string)=>{if(sortColumn===column)setSortDirection(value=>value==='asc'?'desc':'asc');else{setSortColumn(column);setSortDirection('asc')}};
  const download=async()=>{setExporting('xlsx');setError('');try{await exportExplorer('xlsx',{...query,page:1})}catch(e:any){setError(e.message)}finally{setExporting('')}};
  if(!sheet)return <div className="explorer-empty glass"><h2>No worksheets available</h2><p>The uploaded workbook does not contain a non-empty worksheet that can be displayed.</p></div>;
  const pages=Math.max(1,Math.ceil((result?.matchedRows||0)/PAGE_SIZE));
  return <div className="explorer-page">
    <section className="explorer-notice glass"><ShieldAlert/><div><strong>Local sensitive data</strong><span>This read-only view includes every worksheet column. Data remains on this computer unless you export it.</span></div></section>
    {(metadata.dataExplorer?.warnings||[]).map(warning=><div className="explorer-warning" key={warning}>{warning}</div>)}
    <section className="explorer-controls glass">
      <div className="explorer-main-controls">
        <AppSelect label="Worksheet" value={sheet.id} onChange={setSheetId} options={sheets.map(item=>[item.id,`${item.name} · ${formatNumber(item.rows)} rows`])}/>
        <label className="explorer-search"><Search/><input className="table-search-input" value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Search all columns…"/></label>
        <button className={filterOpen?'primary':'soft'} onClick={()=>setFilterOpen(v=>!v)}><Filter/>Filters {filters.length>0&&<b>{filters.length}</b>}</button>
        <button className="soft explorer-clear" onClick={clear} disabled={!searchInput&&!filters.length&&!sortColumn}><RotateCcw/>Clear</button>
        <button className={columnsOpen?'primary':'soft'} onClick={()=>setColumnsOpen(v=>!v)}><Columns3/>Columns</button>
      </div>
      {filterOpen&&<div className="explorer-filter-grid">{sheet.columns.map(column=><ColumnFilter key={column.name} column={column} value={filters.find(item=>item.column===column.name)} onChange={patch=>updateFilter(column.name,patch)} onRemove={()=>removeFilter(column.name)}/>)}</div>}
      {columnsOpen&&<div className="explorer-column-grid">{sheet.columns.map(column=><label key={column.name}><input type="checkbox" checked={!hidden.includes(column.name)} disabled={visible.length===1&&!hidden.includes(column.name)} onChange={()=>setHidden(current=>current.includes(column.name)?current.filter(c=>c!==column.name):[...current,column.name])}/>{hidden.includes(column.name)?<EyeOff/>:<Eye/>}<span>{column.name}</span></label>)}</div>}
    </section>
    {error&&<div className="error glass">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
    <section className="explorer-table-card glass">
      <header><div><h3>{sheet.name}</h3><p>{formatNumber(result?.matchedRows||0)} matched of {formatNumber(result?.totalRows||sheet.rows)} rows · {visible.length} of {sheet.columns.length} columns</p></div><div className="explorer-export"><ExcelDownloadButton className="soft" onClick={download} busy={Boolean(exporting)}/></div></header>
      <div className={`explorer-table-wrap ${busy?'busy':''}`}><table><thead><tr>{visible.map(column=><th key={column}><button onClick={()=>sort(column)} title="Sort column">{column}{sortColumn===column?<span>{sortDirection==='asc'?' ↑':' ↓'}</span>:null}</button></th>)}</tr></thead><tbody>{result?.rows.map((row,index)=><tr key={`${page}-${index}`}>{visible.map(column=>{const rendered=display(row[column],sheet.columns.find(item=>item.name===column)?.type==='date');return <td key={column} title={rendered}>{rendered}</td>})}</tr>)}</tbody></table>{busy&&<div className="explorer-busy">Loading…</div>}{!busy&&result?.rows.length===0&&<div className="explorer-no-results">No rows match the current search and filters.</div>}</div>
      <footer><span>Page {page} of {pages}</span><div><button className="soft" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}><ChevronLeft/>Previous</button><button className="soft" onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page>=pages}>Next<ChevronRight/></button></div></footer>
    </section>
  </div>
}

function ColumnFilter({column,value,onChange,onRemove}:{column:ExplorerColumn;value?:ExplorerFilter;onChange:(patch:Partial<ExplorerFilter>)=>void;onRemove:()=>void}){
  const operator=value?.operator||operators(column.type)[0][0];
  const noValue=['blank','not_blank'].includes(operator),between=['between','date_between'].includes(operator);
  return <div className={value?'explorer-column-filter active':'explorer-column-filter'}><strong title={column.name}>{column.name}</strong><AppSelect label="Condition" value={operator} onChange={next=>onChange({operator:next,value:'',value2:''})} options={operators(column.type)}/>{!noValue&&<>{column.values.length>0&&operator==='equals'?<AppSelect label="Value" value={value?.value||''} onChange={next=>onChange({value:next})} options={[['','Choose…'],...column.values.map(item=>[item,item] as [string,string])]}/>:<input type={column.type==='date'?'date':column.type==='number'?'number':'text'} value={value?.value||''} onChange={e=>onChange({value:e.target.value})} placeholder={between?'From':'Value'}/>} {between&&<input type={column.type==='date'?'date':'number'} value={value?.value2||''} onChange={e=>onChange({value2:e.target.value})} placeholder="To"/>}</>}<button className="explorer-remove" onClick={onRemove} disabled={!value}>Remove</button></div>
}

function display(value:unknown,isDateColumn=false){return formatTableValue(value,isDateColumn)}
