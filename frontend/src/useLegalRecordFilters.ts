import {useCallback,useEffect,useRef} from 'react';
import {useColumnFilters,type RecordFilterControl} from './ColumnFilterControls';
import type {ColumnFilter,ValuePage} from './columnFilters';
import {API} from './api';

/** A server-backed controller. Each caller owns its table and pagination. */
export function useLegalRecordFilters(scope:string,dataset:string,legacy:Record<string,string[]>,search:string,onPageReset:()=>void,source:'explorer'|'detention'|'studio'|'cases'|'sampling'='explorer',onLegacyChange?:(filters:Record<string,string[]>)=>void,extraQuery:Record<string,unknown>={}){
 const [rules,setRules]=useColumnFilters(scope);
 const latest=useRef({rules,legacy,search,dataset,source,extraQuery,syncLegacy:Boolean(onLegacyChange)});latest.current={rules,legacy,search,dataset,source,extraQuery,syncLegacy:Boolean(onLegacyChange)};
 const previousLegacy=useRef(legacy),ownLegacyChange=useRef<string|null>(null);
 const inherited=(onLegacyChange?Object.entries(legacy):[]).filter(([column,values])=>values.length&&!rules.some(rule=>rule.column===column)).map(([column,values]):ColumnFilter=>{const included=values.filter(v=>!v.startsWith('\0exclude:'));return {column,type:'text',values:included.length?included:null,excluded:values.filter(v=>v.startsWith('\0exclude:')).map(v=>v.slice(9))}});
 useEffect(()=>{
  const previous=previousLegacy.current;previousLegacy.current=legacy;
  if(ownLegacyChange.current===JSON.stringify(legacy)){ownLegacyChange.current=null;return}
  if(previous===legacy)return;
  if(Object.values(legacy).every(values=>!values.length)){setRules([]);return}
  const changed=rules.map(rule=>{if(JSON.stringify(previous[rule.column]||[])===JSON.stringify(legacy[rule.column]||[]))return rule;const selection=legacy[rule.column]||[],included=selection.filter(v=>!v.startsWith('\0exclude:'));return {...rule,values:included.length?included:null,valueSearch:null,included:[],excluded:selection.filter(v=>v.startsWith('\0exclude:')).map(v=>v.slice(9))}}).filter(rule=>rule.values!=null||rule.valueSearch!=null||rule.excluded?.length||rule.condition);
  if(JSON.stringify(changed)!==JSON.stringify(rules))setRules(changed);
 },[legacy]);
 const filters=[...rules,...inherited];
 const requestLegacy=onLegacyChange?Object.fromEntries(Object.entries(legacy).filter(([key])=>!rules.some(rule=>rule.column===key))):legacy;
 const loadValues=useCallback(async(column:string,valueSearch:string,offset:number,signal:AbortSignal)=>{const state=latest.current;const response=await fetch(`${API}/legal/record-values`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state.extraQuery,dataset:state.dataset,source:state.source,search:state.search,filters:state.syncLegacy?Object.fromEntries(Object.entries(state.legacy).filter(([key])=>!state.rules.some(rule=>rule.column===key))):state.legacy,columnFilters:state.rules,column,valueSearch,offset}),signal});if(!response.ok){const issue=await response.json();throw new Error(issue.detail||'Unable to load values.')}return response.json() as Promise<ValuePage>},[]);
 const control:RecordFilterControl={filters,onChange:next=>{
  const nextRules=next.filter(rule=>!inherited.some(value=>JSON.stringify(value)===JSON.stringify(rule)));
  setRules(nextRules);onPageReset();
  if(onLegacyChange){
   const nextLegacy={...legacy};
   for(const previous of filters)if(!next.some(rule=>rule.column===previous.column))delete nextLegacy[previous.column];
   for(const rule of nextRules){if(rule.values!=null&&!rule.valueSearch&&!rule.excluded?.length&&!rule.values.includes(''))nextLegacy[rule.column]=rule.values;else delete nextLegacy[rule.column]}
   ownLegacyChange.current=JSON.stringify(nextLegacy);onLegacyChange(nextLegacy);
  }
 },loadValues};
 return {control,columnFilters:rules,requestLegacy,clear:()=>{setRules([]);onLegacyChange?.({});onPageReset()}};
}
