import type {KoboResult,KoboRow} from './koboTypes';

export type PivotSort={id:string;label:string;metric:'answer'|'count'|'percent';series?:string[];direction:'asc'|'desc'};

/** Apply the pending settings to both views before the analysis request completes. */
export function resultWithPivotSort(result:KoboResult,manual:PivotSort|null|undefined,display:'count'|'percent'|'both',language:string):KoboResult{
 const selected=resolvePivotSort(result,display,manual);
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
  if(!ids)return sort.metric==='count'?(result.measure?row.value??null:row.count):row.percent;
  const values=row.series?.filter(series=>ids.has(series.id));
  if(!values?.length||sort.metric==='percent'&&values.every(series=>series.percent==null))return null;
  if(sort.metric==='count'&&result.measure)return values[0].value??null;
  if(sort.metric==='percent'&&values.length===1)return values[0].percent;
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
