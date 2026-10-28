import type {KoboResult} from './koboTypes';
import {chartLabel,resolveAppearance} from './koboAppearance';

export type KoboChartPanel=KoboResult&{chartMaximum?:number};

export function koboChartRows(result:KoboResult){
 const rows=result.rows.filter(row=>row.id!=='__blank__');
 return result.kind==='text'?[...rows].sort((a,b)=>b.count-a.count).slice(0,20):rows;
}
/** Change crowded categorical comparisons to bars before dropping any value labels. */
export function readableKoboChartType(result:KoboResult,exporting=false,containerWidth=900):KoboResult['chart']{
 const rows=koboChartRows(result),series=Math.max(1,result.breakdowns.length),appearance=resolveAppearance(result.appearance);
 if(['bar','line','histogram','heatmap'].includes(result.chart))return result.chart;
 if(result.chart==='pie'||result.chart==='donut')return result.breakdowns.length||rows.length>8?'bar':result.chart;
 const width=exporting?1300:Math.max(240,containerWidth),font=(appearance.fontSize||14)*(exporting?2.3:1);
 const metric=appearance.labels==='auto'?(appearance.metric==='percent'?'percent':'count'):appearance.labels;
 const maxCharacters=Math.max(1,...rows.flatMap(row=>result.breakdowns.length?(row.series||[]):[row]).map(entry=>chartLabel(entry.count,entry.percent,metric==='hidden'?'count':metric,'en',result.percentageDecimals??0).length));
 const barSpace=(width-(exporting?115:80))/Math.max(1,rows.length*series)*.8;
 return rows.length>8||barSpace<maxCharacters*font*.64+10?'bar':'column';
}


/** Dense screen views do not change saved answer order or export row selection. */
export function isDenseKoboChart(result:KoboResult){
 if(['line','histogram','heatmap'].includes(result.chart)||result.kind==='date')return false;
 const count=result.rows.filter(row=>row.id!=='__blank__').length;
 if(count>12)return true;
 const appearance=resolveAppearance(result.appearance),series=appearance.bars==='stack'?1:result.breakdowns.length;
 const band=Math.max(40,series*((appearance.fontSize||14)*1.5+8)/.8);
 return result.breakdowns.length>0&&readableKoboChartType(result)==='bar'&&count*band+110>720;
}
export function koboScreenChartRows(result:KoboResult){
 if(!isDenseKoboChart(result))return koboChartRows(result);
 return result.rows.filter(row=>row.id!=='__blank__').slice().sort((a,b)=>b.count-a.count||(a.id<b.id?-1:a.id>b.id?1:0));
}

/** Bound a single live plot as well as the number of cached plots. Exports use the full result. */
export function koboScreenChartPage(result:KoboResult,rows:KoboResult['rows'],requestedPage=0){
 const pageSize=Math.max(1,Math.min(100,Math.floor(1000/Math.max(1,result.breakdowns.length))));
 const paged=!result.trend&&rows.length>pageSize;
 const pages=paged?Math.ceil(rows.length/pageSize):1;
 const page=Math.max(0,Math.min(pages-1,requestedPage));
 const start=paged?page*pageSize:0,end=paged?Math.min(rows.length,start+pageSize):rows.length;
 return{result:paged?{...result,chart:isDenseKoboChart(result)?'bar':readableKoboChartType(result),rows:rows.slice(start,end)}:result,paged,page,pages,start,end,total:rows.length};
}

/** Bound printed panels so labels stay legible after proportional page placement. */
export function koboPdfChartPanels(result:KoboResult){
 if(result.chart==='line'&&result.trend)return [result as KoboChartPanel];
 const rows=koboChartRows(result),chart=readableKoboChartType(result,true);
 const limit=chart==='heatmap'?8:chart==='bar'?Math.max(1,Math.min(8,Math.floor(20/Math.max(1,result.breakdowns.length)))):Math.max(1,rows.length);
 const appearance=resolveAppearance(result.appearance),metric=(entry:{count:number;percent:number|null})=>appearance.metric==='percent'?entry.percent??0:entry.count;
 const chartMaximum=Math.max(0,...rows.map(row=>result.breakdowns.length?(appearance.bars==='stack'&&chart!=='heatmap'?(row.series||[]).reduce((sum,entry)=>sum+metric(entry),0):Math.max(0,...(row.series||[]).map(metric))):metric(row)));
 const panels:KoboChartPanel[]=[];
 const count=Math.ceil(rows.length/limit),base=Math.floor(rows.length/Math.max(1,count)),extra=rows.length%Math.max(1,count);
 let start=0;
 for(let index=0;index<count;index++){const size=base+(index<extra?1:0);panels.push({...result,chart,chartMaximum,rows:rows.slice(start,start+size)});start+=size}
 if(chart==='heatmap'){const matrix:KoboChartPanel[]=[];for(const panel of panels)for(let column=0;column<result.breakdowns.length;column+=5)matrix.push({...panel,breakdowns:result.breakdowns.slice(column,column+5)});return matrix.length?matrix:panels}
 return panels;
}
export const koboPdfChartKey=(result:KoboResult)=>JSON.stringify([result.id,result.chart,result.rows.map(row=>row.id),result.breakdowns.map(column=>column.id)]);
