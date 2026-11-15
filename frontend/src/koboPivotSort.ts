import type {KoboQuestionSettings,KoboResult,KoboRow} from './koboTypes';
import {displayPercent} from './koboPercentages';
import {pivotBottomPercent,pivotColumnTotal,pivotValue} from './koboPivotValues';

export type PivotSort={id:string;label:string;metric:'answer'|'count'|'percent';series?:string[];direction:'asc'|'desc'};
export type PivotColumnSort={answer?:string|null;metric:'name'|'count'|'percent';direction:'asc'|'desc'};

/** Column visibility is presentation-only. Keep the original totals and percentage bases. */
export function resultWithPivotColumns(result:KoboResult,settings?:Pick<KoboQuestionSettings,'pivotColumnSort'|'hiddenPivotColumns'>,language='en'):KoboResult{
 const sort=settings?.pivotColumnSort,hiddenIds=settings?.hiddenPivotColumns;
 if(result.breakdowns.length===0||!sort&&!hiddenIds?.length)return result;
 const hidden=new Set(hiddenIds);
 let breakdowns=result.breakdowns.filter(column=>!hidden.has(column.id));
 const row=sort?.answer?result.rows.find(row=>row.id===sort.answer):undefined;
 const active=sort&&(!sort.answer||row);
 if(active&&sort){
  const cells=new Map(row?.series?.map(cell=>[cell.id,cell]));
  const collator=new Intl.Collator(language,{numeric:true,sensitivity:'base'});
  const parent=(column:KoboResult['breakdowns'][number])=>JSON.stringify(column.values?.slice(0,-1)??[]);
  const parents=new Map([...new Set(breakdowns.map(parent))].map((key,index)=>[key,index]));
  const entries=breakdowns.map(column=>({
   column,parent:parents.get(parent(column))!,
   value:sort.metric==='name'?column.labels?.at(-1)??column.label
    :row?sort.metric==='percent'?displayPercent(cells.get(column.id)):pivotValue(result,cells.get(column.id))
    :sort.metric==='percent'?pivotBottomPercent(result,column):pivotColumnTotal(result,column)
  }));
  entries.sort((a,b)=>{
   if(a.parent!==b.parent)return a.parent-b.parent;
   if(a.value==null||b.value==null)return Number(a.value==null)-Number(b.value==null);
   const comparison=typeof a.value==='string'&&typeof b.value==='string'?collator.compare(a.value,b.value):Number(a.value)-Number(b.value);
   return comparison*(sort.direction==='asc'?1:-1);
  });
  breakdowns=entries.map(entry=>entry.column);
 }
 if(breakdowns.length===result.breakdowns.length)return active?{...result,breakdowns}:result;
 const visibleRows=(rows:KoboRow[])=>rows.map(row=>({...row,series:row.series?.filter(cell=>!hidden.has(cell.id))}));
 return {...result,breakdowns,rows:visibleRows(result.rows),pivotHasHiddenColumns:true,
  chartProjection:result.chartProjection?{...result.chartProjection,rows:visibleRows(result.chartProjection.rows)}:result.chartProjection};
}

export function resultWithPivotOrdering(result:KoboResult,settings:Pick<KoboQuestionSettings,'pivotSort'|'pivotColumnSort'|'hiddenPivotColumns'>|undefined,display:'count'|'percent'|'both',language:string,manual=settings?.pivotSort){
 return resultWithPivotColumns(resultWithPivotSort(result,manual,display,language,settings?.hiddenPivotColumns),settings,language);
}

/** Apply the pending settings to both views before the analysis request completes. */
export function resultWithPivotSort(result:KoboResult,manual:PivotSort|null|undefined,display:'count'|'percent'|'both',language:string,hiddenIds:string[]=[]):KoboResult{
 const selected=resolvePivotSort(result,display,manual?.series?.some(id=>hiddenIds.includes(id))?null:manual);
 const rows=sortPivotRows(result,selected,language);
 const order=new Map(rows.map((row,index)=>[row.id,index]));
 const rank=(id:string)=>order.get(id)??rows.length;
 const trend=(value:KoboResult['trend'])=>value?{...value,series:[...value.series].sort((a,b)=>rank(a.id)-rank(b.id))}:value;
 const temporal=result.kind==='date'||result.chart==='histogram'||!!result.bins?.length;
 const projection=result.chartProjection;
 return {...result,rows,pivotSort:selected,trend:trend(result.trend),chartProjection:temporal
  ?projection||{rows:result.rows,axisOrder:true,topNTotal:result.rows.length,topNShown:result.rows.length,topNOther:false}
  :projection?{...projection,rows:[...projection.rows].sort((a,b)=>rank(a.id)-rank(b.id)),...(projection.trend?{trend:trend(projection.trend)!}:{})}:projection};
}

/** Surface the shared count/value default while respecting saved and natural order. */
export function defaultPivotSort(result:Pick<KoboResult,'kind'|'chart'|'breakdowns'|'answerSort'|'bins'|'measure'>):PivotSort|null{
 if(result.kind==='date'||result.chart==='histogram'||result.bins?.length||result.answerSort&&result.answerSort!=='count-desc')return null;
 return {id:result.breakdowns.length===1?`${result.breakdowns[0].id}:count`:'total:count',label:result.measure?.label||'Total count',metric:'count',direction:'desc'};
}

export function resolvePivotSort(result:KoboResult,display:'count'|'percent'|'both',manual?:PivotSort|null){
 const fallback=defaultPivotSort(result),selected=manual||fallback;
 return selected?.series&&(selected.series.some(id=>!result.breakdowns.some(column=>column.id===id))||selected.id.endsWith(':count')&&display==='percent'||selected.id.endsWith(':percent')&&display==='count')?fallback:selected;
}

export function sortPivotRows(result:Pick<KoboResult,'rows'|'breakdowns'>&Partial<Pick<KoboResult,'measure'>>,sort:PivotSort|null,language:string):KoboRow[]{
 if(!sort)return result.rows;
 const collator=new Intl.Collator(language,{numeric:true,sensitivity:'base'});
 const ids=sort.series?new Set(sort.series):null;
 const denominator=ids?result.breakdowns.filter(column=>ids.has(column.id)).reduce((sum,column)=>sum+column.denominator,0):0;
 const value=(row:KoboRow):number|string|null=>{
  if(sort.metric==='answer')return row.label;
  if(!ids)return sort.metric==='count'?(result.measure?row.value??null:row.count):displayPercent(row);
  const values=row.series?.filter(series=>ids.has(series.id));
  if(!values?.length||sort.metric==='percent'&&values.every(series=>displayPercent(series)==null))return null;
  if(sort.metric==='count'&&result.measure)return values[0].value??null;
  if(sort.metric==='percent'&&values.length===1)return displayPercent(values[0]);
  const count=values.reduce((sum,series)=>sum+series.count,0);
  return sort.metric==='count'?count:denominator?count/denominator*100:null;
 };
 return result.rows.map((row,index)=>({row,index,value:value(row)})).sort((left,right)=>{
  if(left.row.id==='__blank__'||right.row.id==='__blank__')return left.row.id===right.row.id?left.index-right.index:left.row.id==='__blank__'?1:-1;
  if(left.value==null)return right.value==null?left.index-right.index:1;
  if(right.value==null)return -1;
  const comparison=typeof left.value==='string'&&typeof right.value==='string'?collator.compare(left.value,right.value):Number(left.value)-Number(right.value);
  return (sort.direction==='asc'?comparison:-comparison)||left.index-right.index;
 }).map(item=>item.row);
}
