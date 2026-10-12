import {useState} from 'react';
import {ChevronDown,Search,X} from 'lucide-react';
import {AppSelect,FilterValueList,formatProjectLabel} from './components';

const dateLabels:Record<string,string>={beneficiaries:'Date of identification',assessments:'Date of assessment',legalservices:'Date of Service Provision',awareness:'Date of awareness',legalhotlines:'Contact date'};

// Every review page uses this drawer, including its dropdown sizing and spacing.
export default function ReviewFiltersDrawer({dataset,options,filters,onChange,onClose,fieldOptions={},fieldFilters={},onFieldChange}:{
  dataset:string;
  options?:Record<string,string[]>;
  filters:Record<string,string>;
  onChange:(filters:Record<string,string>)=>void;
  onClose:()=>void;
  fieldOptions?:Record<string,string[]>;
  fieldFilters?:Record<string,string[]>;
  onFieldChange?:(filters:Record<string,string[]>)=>void;
}){
  const [fieldSearch,setFieldSearch]=useState('');
  const hotline=dataset==='legalhotlines';
  const activeCount=Object.values(filters).filter(Boolean).length+(hotline?Object.values(fieldFilters).reduce((sum,values)=>sum+values.length,0):0);
  return <>
    <button className="filter-backdrop" aria-label="Close filters" onClick={onClose}/>
    <aside className="case-filter-drawer review-filters-drawer" aria-label="Review filters">
      <header>
        <div><span className="eyebrow">REVIEW FILTERS</span><h2>Filter all finding tables</h2></div>
        <button type="button" onClick={onClose} aria-label="Close filters"><X/></button>
      </header>
      {hotline&&<label className="filter-search"><Search/><input aria-label="Search hotline filter fields" placeholder="Search fields" value={fieldSearch} onChange={event=>setFieldSearch(event.target.value)}/></label>}
      <div className="case-filter-scroll review-checkbox-filters">
        {hotline?Object.entries(fieldOptions).filter(([field])=>field.toLocaleLowerCase().includes(fieldSearch.trim().toLocaleLowerCase())).map(([field,values])=><details key={field} open={Boolean(fieldFilters[field]?.length)}>
          <summary><span>{field}</span>{Boolean(fieldFilters[field]?.length)&&<b>{fieldFilters[field].length}</b>}<ChevronDown/></summary>
          <div><FilterValueList field={field} values={values} selected={fieldFilters[field]||[]} onChange={items=>onFieldChange?.({...fieldFilters,[field]:items})}/></div>
        </details>):(['project','location','date'] as const).map(key=>{
          const label=key==='location'?'Project location':key==='date'?'Date':'Project';
          return <details key={key} open>
            <summary><span>{key==='date'?dateLabels[dataset]||'Date':label}</span>{filters[key]&&<b>1</b>}<ChevronDown/></summary>
            <div className="review-filter-field">
              <AppSelect label={label} searchable value={filters[key]||''}
                options={[['','All values'],...(options?.[key]||[]).map(item=>[item,key==='project'?formatProjectLabel(item):item] as [string,string])]}
                onChange={item=>onChange({...filters,[key]:item})}/>
            </div>
          </details>;
        })}
      </div>
      <footer>
        <button type="button" className="soft" onClick={()=>{onChange({});if(hotline)onFieldChange?.({});}} disabled={!activeCount}>Reset</button>
        <button type="button" className="primary" onClick={onClose}>Apply filters {activeCount>0&&`(${activeCount})`}</button>
      </footer>
    </aside>
  </>;
}
