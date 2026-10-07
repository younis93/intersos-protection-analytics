import {matchesSelection} from "./filterSelection";
import type {IssueFinding} from './sendIssuesApi';

export type IssueFilters=Partial<Record<'project'|'lawyer'|'dataset'|'rule',string[]>>;
export function filterIssueFindings(rows:IssueFinding[],filters:IssueFilters,assignments:Record<string,string>={}){
  return rows.filter(row=>Object.entries(filters).every(([key,values])=>!values?.length||matchesSelection(key==='lawyer'?issueOwner(row,assignments):String(row[key as keyof IssueFinding]||''),values)));
}
export function issueOwner(row:IssueFinding,assignments:Record<string,string>={}){
  return row.lawyer==='Unassigned'?assignments[row.id]||'Unassigned':row.lawyer;
}
export function activeIssueLawyer(current:string,available:string[]){return available.includes(current)?current:available[0]||'';}

export function issueFilterOptions(rows:IssueFinding[],filters:IssueFilters,key:keyof IssueFilters,assignments:Record<string,string>={}) {
  const others={...filters};delete others[key];
  return Array.from(new Set(filterIssueFindings(rows,others,assignments).map(row=>key==='lawyer'?issueOwner(row,assignments):String(row[key]||'')).filter(Boolean))).sort();
}
