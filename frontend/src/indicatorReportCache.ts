import {subscribeLegalQueryInvalidation} from './legalQueryCache';
import type {IndicatorReport} from './types';

// One parsed, unfiltered report for the current session. No browser storage.
let report:IndicatorReport|null=null;
let generation=0;
subscribeLegalQueryInvalidation(()=>{report=null;generation++});

export const defaultIndicatorReport=()=>report;
export const indicatorReportGeneration=()=>generation;
export function retainDefaultIndicatorReport(next:IndicatorReport,expectedGeneration:number){
  if(expectedGeneration===generation)report=next;
}
