import {useColumnFilters,type RecordFilterControl} from './ColumnFilterControls';
import {koboRequest} from './koboApi';
import type {FilterColumn,ValuePage} from './columnFilters';

export function useRemoteRecordFilters(scope:string,path:string,query:Record<string,unknown>,columns:FilterColumn[],onResetPage:()=>void){
 const [filters,setFilters]=useColumnFilters(scope);
 const control:RecordFilterControl={filters,columns,onChange:next=>{setFilters(next);onResetPage()},loadValues:(column,valueSearch,offset,signal)=>koboRequest<ValuePage>(path,{...query,columnFilters:filters,column,valueSearch,offset},'POST',signal)};
 return {control,columnFilters:filters,clear:()=>{setFilters([]);onResetPage()}};
}
