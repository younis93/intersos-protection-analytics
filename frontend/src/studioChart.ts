import type {StudioChartOptions,StudioResult} from './types';

export interface StudioViewCell {row:string;column:string;count:number;value:number;displayPercent:number;totalShare:number}
export interface StudioView {rows:string[];columns:string[];cells:StudioViewCell[];total:number;valueMode:StudioChartOptions['valueMode']}

const sum=(values:number[])=>values.reduce((total,value)=>total+value,0);

export function transformStudioResult(result:StudioResult,options:StudioChartOptions):StudioView{
  const sourceRows=[...new Set(result.cells.map(cell=>cell.row))];
  const columns=[...new Set(result.cells.map(cell=>cell.column))];
  const lookup=new Map(result.cells.map(cell=>[`${cell.row}\u0000${cell.column}`,cell.count]));
  const count=(row:string,column:string)=>lookup.get(`${row}\u0000${column}`)||0;
  const rowTotal=(row:string)=>sum(columns.map(column=>count(row,column)));
  const ranked=[...sourceRows].sort((a,b)=>rowTotal(b)-rowTotal(a)||a.localeCompare(b));
  const limit=options.topN==='all'?ranked.length:options.topN;
  const included=new Set(ranked.slice(0,limit));
  const excluded=sourceRows.filter(row=>!included.has(row));
  let rows=sourceRows.filter(row=>included.has(row));
  const hasOther=excluded.length>0;
  const displayCount=(row:string,column:string)=>row==='Other'?sum(excluded.map(item=>count(item,column))):count(row,column);
  const displayRowTotal=(row:string)=>sum(columns.map(column=>displayCount(row,column)));
  if(options.sort==='value-desc')rows.sort((a,b)=>displayRowTotal(b)-displayRowTotal(a)||a.localeCompare(b));
  if(options.sort==='value-asc')rows.sort((a,b)=>displayRowTotal(a)-displayRowTotal(b)||a.localeCompare(b));
  if(options.sort==='label-asc')rows.sort((a,b)=>a.localeCompare(b));
  if(options.sort==='label-desc')rows.sort((a,b)=>b.localeCompare(a));
  if(hasOther)rows.push('Other');
  const completeTotal=result.total||sum(result.cells.map(cell=>cell.count));
  const seriesTotals=new Map(columns.map(column=>[column,sum(sourceRows.map(row=>count(row,column)))]));
  const cells=rows.flatMap(row=>columns.map(column=>{
    const raw=displayCount(row,column);
    const rowDenominator=displayRowTotal(row);
    const seriesDenominator=seriesTotals.get(column)||0;
    const denominator=options.valueMode==='percent-row'?rowDenominator:options.valueMode==='percent-series'?seriesDenominator:completeTotal;
    const percent=denominator?raw/denominator:0;
    return {row,column,count:raw,value:options.valueMode==='count'?raw:percent*100,displayPercent:percent,totalShare:completeTotal?raw/completeTotal:0};
  }));
  return {rows,columns,cells,total:completeTotal,valueMode:options.valueMode};
}
