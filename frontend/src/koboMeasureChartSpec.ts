import {formatPercent,displayPercent} from './koboPercentages';
import {chartInk} from './ChartPrimitives';
import {markColor} from './koboMarkColors';
import {currentKoboTheme} from './koboThemeColors';
import type {Data,Layout} from 'plotly.js';
import type {KoboResult,KoboMeasureCell} from './koboTypes';
import {measureNumber} from './koboMeasures';
export function measureChartSpec(result:KoboResult,language:string,exporting=false):{data:Data[];layout:Partial<Layout>}{
 const theme=currentKoboTheme();
 const rows=result.rows.filter(row=>row.id!=='__blank__'),horizontal=result.chart==='bar',heatmap=result.chart==='heatmap';
 const percentMode=result.measure?.operation==='sum'&&(result.percentageMode??'legacy-respondents')!=='legacy-respondents'&&result.appearance?.metric==='percent';
 const percent=(cell:KoboMeasureCell)=>formatPercent(displayPercent(cell as KoboMeasureCell&{percent:number|null}),result.percentageDecimals??0,language);
 const text=(cell:KoboMeasureCell)=>result.measure?.operation==='sum'&&result.appearance?.labels==='both'&&(result.percentageMode??'legacy-respondents')!=='legacy-respondents'?`${measureNumber(result,cell.value,language)} (${percent(cell)})`:percentMode?percent(cell):measureNumber(result,cell.value,language),font=(result.appearance?.fontSize||12)*(exporting?1.8:1);
 const layout:Partial<Layout>={autosize:true,height:Math.max(result.appearance?.height||0,horizontal?rows.length*55+160:440),paper_bgcolor:exporting?'#ffffff':'transparent',plot_bgcolor:exporting?'#ffffff':'transparent',font:{size:font,color:exporting?'#243746':chartInk(theme)},margin:{l:horizontal?220:75,r:40,t:35,b:100},hovermode:'closest',showlegend:result.appearance?.legend==='hidden'?false:result.breakdowns.length>0,xaxis:{type:horizontal?'linear':'category',automargin:true,fixedrange:true},yaxis:{type:horizontal||heatmap?'category':'linear',automargin:true,fixedrange:true,autorange:horizontal||heatmap?'reversed':true}};
 if(!heatmap){const axis=horizontal?'xaxis':'yaxis';layout[axis]={...layout[axis],title:{text:percentMode?result.percentageBasis:result.measure!.label},ticksuffix:percentMode?'%':''}}
 if(!heatmap&&result.appearance?.valueAxis==='hide'){const axis=horizontal?'xaxis':'yaxis';layout[axis]={...layout[axis],showticklabels:false,ticks:'',showline:false,zeroline:false,title:{text:''}}}
 if(result.appearance?.grid!=='auto'){layout.xaxis={...layout.xaxis,showgrid:result.appearance?.grid==='show'};layout.yaxis={...layout.yaxis,showgrid:result.appearance?.grid==='show'}}
 if(heatmap)return {layout,data:[{type:'heatmap',x:result.breakdowns.map(column=>column.label),y:rows.map(row=>row.label),z:rows.map(row=>result.breakdowns.map(column=>row.series?.find(cell=>cell.id===column.id)?.[percentMode?'percent':'value']??null)),text:rows.map(row=>result.breakdowns.map(column=>text(row.series?.find(cell=>cell.id===column.id)||{}))),hovertemplate:'%{y}<br>%{x}<br>%{text}<extra></extra>',colorbar:percentMode?{ticksuffix:'%'}:undefined,colorscale:'Blues'} as unknown as Data]};
 if(result.chart==='line'&&result.trend){
  layout.xaxis={type:'category',automargin:true};layout.showlegend=true;
  return {layout,data:result.trend.series.map(series=>({type:'scatter',mode:result.appearance?.labels==='hidden'?'lines+markers':'lines+markers+text',textposition:'top center',name:series.label,x:result.trend!.periods,y:series.points.map(point=>percentMode?point.percent:point.value??null),text:series.points.map(text),hovertemplate:'%{x}<br>%{text}<extra>%{fullData.name}</extra>',connectgaps:false} as Data))};
 }
 const columns=result.breakdowns.length?result.breakdowns:[{id:'',label:result.measure!.label}];
 return {layout,data:columns.map(column=>{
  const cells:KoboMeasureCell[]=rows.map(row=>column.id?row.series?.find(cell=>cell.id===column.id)||{}:row),values=cells.map(cell=>percentMode?(cell as KoboMeasureCell&{percent?:number|null}).percent??null:cell.value??null),labels=rows.map(row=>row.label);
  return {type:result.chart==='line'?'scatter':'bar',orientation:horizontal?'h':'v',name:column.label,x:horizontal?values:labels,y:horizontal?labels:values,marker:{color:rows.map(row=>markColor(result,{answer:row.id,...(column.id?{breakdown:column.id}:{})},theme))},text:result.appearance?.labels==='hidden'?undefined:cells.map(text),textposition:result.chart==='line'?'top center':'auto',customdata:rows.map((row,i)=>[cells[i].contributingCount??0,null,null,row.id,column.id||undefined]),hovertext:cells.map(cell=>`${text(cell)}<br>${cell.contributingCount??0} contributing records`),hovertemplate:'%{hovertext}<extra>%{fullData.name}</extra>'} as Data;
 })};
}
