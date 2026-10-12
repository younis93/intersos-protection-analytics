import {FilterSection,FilterDrawerShell} from './FilterDrawerShell';
import {useState} from 'react';
import {ChevronDown,Search,X} from 'lucide-react';
import {AppSelect, FilterValueList} from './SelectionControls';
import {formatProjectLabel} from './formatting';

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

    <FilterDrawerShell className="case-filter-drawer review-filters-drawer" aria-label="Review filters" header={<header>
        <div><span className="eyebrow">REVIEW FILTERS</span><h2>Filter all finding tables</h2></div>
        <button type="button" onClick={onClose} aria-label="Close filters"><X/></button>
      </header>} footer={<footer>
        <button type="button" className="soft" onClick={()=>{onChange({});if(hotline)onFieldChange?.({});}} disabled={!activeCount}>Reset</button>
        <button type="button" className="primary" onClick={onClose}>Apply filters {activeCount>0&&`(${activeCount})`}</button>
      </footer>} backdrop={<button className="filter-backdrop" aria-label="Close filters" onClick={onClose}/>}>

      {hotline&&<label className="filter-search"><Search/><input aria-label="Search hotline filter fields" placeholder="Search fields" value={fieldSearch} onChange={event=>setFieldSearch(event.target.value)}/></label>}
      <div className="case-filter-scroll review-checkbox-filters">
        {hotline?Object.entries(fieldOptions).filter(([field])=>field.toLocaleLowerCase().includes(fieldSearch.trim().toLocaleLowerCase())).map(([field,values])=><FilterSection key={field} open={Boolean(fieldFilters[field]?.length)} label={<>{field}</>} badge={<>{Boolean(fieldFilters[field]?.length)&&<b>{fieldFilters[field].length}</b>}</>}>

          <div><FilterValueList field={field} values={values} selected={fieldFilters[field]||[]} onChange={items=>onFieldChange?.({...fieldFilters,[field]:items})}/></div>
        </FilterSection>):(['project','location','date'] as const).map(key=>{
          const label=key==='location'?'Project location':key==='date'?'Date':'Project';
          return <FilterSection key={key} open label={<>{key==='date'?dateLabels[dataset]||'Date':label}</>} badge={<>{filters[key]&&<b>1</b>}</>}>

            <div className="review-filter-field">
              <AppSelect label={label} searchable value={filters[key]||''}
                options={[['','All values'],...(options?.[key]||[]).map(item=>[item,key==='project'?formatProjectLabel(item):item] as [string,string])]}
                onChange={item=>onChange({...filters,[key]:item})}/>
            </div>
          </FilterSection>;
        })}
      </div>

    </FilterDrawerShell>
  </>;
}
