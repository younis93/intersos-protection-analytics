import {RotateCcw,Search,SlidersHorizontal,X} from 'lucide-react';
import {useEffect,useState} from 'react';
import {exportLegalSampling,getLegalSampling} from './api';
import {formatTableValue,formatYearMonthFilterValue} from './dateFormat';
import {FilterDrawerShell,FilterSection} from './FilterDrawerShell';
import {LegalScrollControls} from './LegalScrollControls';
import {CheckboxMultiSelect,ExcelDownloadButton,FilterValueList} from './SelectionControls';
import {Pager,TableState} from './TableControls';
import {useDebouncedValue} from './useDebouncedValue';
import {ValueTable} from './ValueTable';
import {initialSamplingState,type SamplingResult,type SamplingState} from './samplingTypes';
import './sampling.css';

export default function LegalSampling({state,update}:{state:SamplingState;update:(patch:Partial<SamplingState>)=>void}){
  const [data,setData]=useState<SamplingResult|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const [drawer,setDrawer]=useState(false),[filterSearch,setFilterSearch]=useState(''),[attempt,setAttempt]=useState(0);
  const search=useDebouncedValue(state.search);
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setError('');
    getLegalSampling({...state,search},controller.signal).then(result=>{if(!controller.signal.aborted)setData(result)})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason.message||'Unable to load Sampling.')})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    return()=>controller.abort();
  },[search,state.filters,state.page,state.removeDuplicateBeneficiaryIds,state.removeDuplicateContacts,attempt]);
  const active=Object.values(state.filters).reduce((sum,values)=>sum+values.length,0);
  const changed=active+Number(Boolean(state.search))+Number(state.removeDuplicateBeneficiaryIds)+Number(state.removeDuplicateContacts);
  const reset=()=>update(initialSamplingState());
  const setFilter=(column:string,values:string[])=>update({page:1,filters:{...state.filters,[column]:values}});
  const options={...Object.fromEntries(Object.keys(state.filters).map(key=>[key,[] as string[]])),...data?.filterOptions};
  const download=async()=>{try{await exportLegalSampling(state)}catch(reason){setError(reason instanceof Error?reason.message:'Sampling export failed.')}};
  return <section className="studio-fixed-section sampling-section" aria-label="Sampling" aria-busy={busy}>
    <LegalScrollControls onFilters={()=>setDrawer(true)} activeCount={changed} onClear={reset} filterLabel="All filters">
      <div className="glass studio-quick-toolbar">
        <div className="studio-quick-fields">{data?.quickFilters.map(column=><CheckboxMultiSelect key={column} hideLabel
          label={/date/i.test(column)?'Date Service Completed month':/location/i.test(column)?'Project Location':'Project'} values={options[column]||[]}
          selected={state.filters[column]||[]} onChange={values=>setFilter(column,values)}/>)}</div>
        <div className="studio-quick-actions">
          <button className="soft detention-filter-clear" disabled={!changed&&state.page===1} onClick={reset}><RotateCcw/>Reset</button>
          <button className="primary" onClick={()=>setDrawer(true)}><SlidersHorizontal/>All filters {active>0&&<b>{active}</b>}</button>
          <ExcelDownloadButton className="primary studio-excel" onClick={download} disabled={busy||search!==state.search||Boolean(error)||!data?.available}>Excel</ExcelDownloadButton>
        </div>
      </div>
    </LegalScrollControls>
    <div className="glass sampling-options">
      <label><input type="checkbox" checked={state.removeDuplicateBeneficiaryIds} onChange={event=>update({removeDuplicateBeneficiaryIds:event.target.checked,page:1})}/>Remove duplicate Beneficiary IDs</label>
      <label><input type="checkbox" checked={state.removeDuplicateContacts} onChange={event=>update({removeDuplicateContacts:event.target.checked,page:1})}/>Remove duplicate contact numbers</label>
    </div>
    {error&&<TableState error className="error glass">{error} <button className="soft" onClick={()=>setAttempt(value=>value+1)}>Retry</button></TableState>}
    <div className="glass legal-table-card studio-records-table">
      <div className="legal-card-heading">
        <label className="studio-table-search"><Search/><input aria-label="Search Sampling" placeholder="Search Sampling data" value={state.search} onChange={event=>update({search:event.target.value,page:1})}/></label>
        <div className="indicator-total-block detention-table-total"><strong>{(data?.total||0).toLocaleString()}</strong><span>Records</span></div>
        <Pager compact page={data?.page||state.page} pageSize={100} total={data?.total||0} onChange={page=>update({page})}/>
      </div>
      {busy&&<TableState className="studio-section-loading">Loading Sampling records…</TableState>}
      {!busy&&!error&&data&&!data.available&&<TableState className="sampling-message">{data.reason}</TableState>}
      {!busy&&!error&&data?.available&&<>
        {data.total===0&&<TableState className="sampling-message">No eligible legal-services records match these settings. Primary contacts must contain exactly ten digits starting with 77, 78, or 75.</TableState>}
        <div className="legal-table-wrap"><ValueTable><thead><tr>{data.columns.map(column=><th className="no-sort" key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{data.rows.map((row,index)=><tr key={index}>{data.columns.map(column=><td key={column}>{formatTableValue(row[column])}</td>)}</tr>)}</tbody>
        </ValueTable></div>
      </>}
    </div>
    {drawer&&<FilterDrawerShell className="case-filter-drawer analytics-filter-drawer"
      header={<header><div><span className="eyebrow">ANALYTICS STUDIO FILTERS</span><h2>Filter Sampling</h2></div><button onClick={()=>setDrawer(false)} aria-label="Close filters"><X/></button></header>}
      footer={<footer><button className="soft" disabled={!changed} onClick={reset}>Reset all</button><button className="primary" onClick={()=>setDrawer(false)}>Apply filters {active>0&&`(${active})`}</button></footer>}
      backdrop={<button className="filter-backdrop" aria-label="Close Sampling filters" onClick={()=>setDrawer(false)}/>}>
      <label className="filter-search"><Search/><input aria-label="Search Sampling filters" placeholder="Search filters" value={filterSearch} onChange={event=>setFilterSearch(event.target.value)}/></label>
      <div className="case-filter-scroll">{Object.entries(options).filter(([column])=>column.toLowerCase().includes(filterSearch.toLowerCase())).map(([column,values])=>
        <FilterSection key={column} open={Boolean(state.filters[column]?.length)} label={column} badge={state.filters[column]?.length?<b>{state.filters[column].length}</b>:null}>
          <FilterValueList field={column} values={values} selected={state.filters[column]||[]} formatCaption={item=>formatYearMonthFilterValue(column,item)} onChange={items=>setFilter(column,items)}/>
        </FilterSection>)}</div>
    </FilterDrawerShell>}
  </section>;
}
