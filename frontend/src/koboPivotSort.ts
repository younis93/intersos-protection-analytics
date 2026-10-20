import type {KoboResult,KoboRow} from './koboTypes';

export type PivotSort={id:string;label:string;metric:'answer'|'count'|'percent';series?:string[];direction:'asc'|'desc'};

export function sortPivotRows(result:Pick<KoboResult,'rows'|'breakdowns'>,sort:PivotSort|null,language:string):KoboRow[]{
 if(!sort)return result.rows;
 const collator=new Intl.Collator(language,{numeric:true,sensitivity:'base'});
 const ids=sort.series?new Set(sort.series):null;
 const denominator=ids?result.breakdowns.filter(column=>ids.has(column.id)).reduce((sum,column)=>sum+column.denominator,0):0;
 const value=(row:KoboRow):number|string|null=>{
  if(sort.metric==='answer')return row.label;
  if(!ids)return sort.metric==='count'?row.count:row.percent;
  const values=row.series?.filter(series=>ids.has(series.id));
  if(!values?.length||sort.metric==='percent'&&values.every(series=>series.percent==null))return null;
  const count=values.reduce((sum,series)=>sum+series.count,0);
  return sort.metric==='count'?count:denominator?count/denominator*100:null;
 };
 return result.rows.map((row,index)=>({row,index,value:value(row)})).sort((left,right)=>{
  if(left.value==null)return right.value==null?left.index-right.index:1;
  if(right.value==null)return -1;
  const comparison=typeof left.value==='string'&&typeof right.value==='string'?collator.compare(left.value,right.value):Number(left.value)-Number(right.value);
  return (sort.direction==='asc'?comparison:-comparison)||left.index-right.index;
 }).map(item=>item.row);
}
