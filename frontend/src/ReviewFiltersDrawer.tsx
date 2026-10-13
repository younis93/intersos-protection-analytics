import {SharedFilterDrawer} from './SharedFilterDrawer';
import {useState} from 'react';
import {formatProjectLabel,formatProjectLocationLabel} from './formatting';

const dateLabels:Record<string,string>={beneficiaries:'Date of identification',assessments:'Date of assessment',legalservices:'Date of Service Provision',awareness:'Date of awareness',legalhotlines:'Contact date'};

// All review pages share Hotline Review's searchable checkbox sections.
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
  const groups=hotline?Object.entries(fieldOptions).map(([key,values])=>({key,label:key,values,selected:fieldFilters[key]||[]})):
    (['project','location','date'] as const).map(key=>({key,label:key==='project'?'Project':key==='location'?'Project location':dateLabels[dataset]||'Date',values:options?.[key]||[],selected:fieldFilters[key]??(filters[key]?[filters[key]]:[])}));
  const activeCount=Object.values(filters).filter(Boolean).length+Object.values(fieldFilters).reduce((sum,values)=>sum+values.length,0);
  const changeGroup=(key:string,items:string[])=>{
    if(!hotline&&filters[key]){const next={...filters};delete next[key];onChange(next)}
    onFieldChange?.({...fieldFilters,[key]:items});
  };
  return <SharedFilterDrawer title="Filter all finding tables" eyebrow="REVIEW FILTERS" className="review-filters-drawer" onClose={onClose} onReset={()=>{onChange({});onFieldChange?.({})}} resetDisabled={!activeCount} search={fieldSearch} onSearchChange={setFieldSearch} searchLabel={hotline?'Search hotline filter fields':'Search review filter fields'}
    fields={groups.map(group=>({...group,onChange:(items:string[])=>changeGroup(group.key,items),formatCaption:(item:string)=>group.key==='project'?formatProjectLabel(item):group.key==='location'?formatProjectLocationLabel(item):item}))}/>;
}
