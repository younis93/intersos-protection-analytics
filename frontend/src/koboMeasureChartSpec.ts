import {formatPercent,displayPercent} from './koboPercentages';
import {chartInk} from './ChartPrimitives';
import {markColor} from './koboMarkColors';
import {currentKoboTheme} from './koboThemeColors';
import type {Data,Layout} from 'plotly.js';
import type {KoboResult,KoboMeasureCell} from './koboTypes';
import {measureNumber} from './koboMeasures';
import {chartCaption} from './koboChartLabels';
import {hideZeroPercentLabel} from './koboAppearance';
export function measureChartSpec(result:KoboResult,language:string,exporting=false):{data:Data[];layout:Partial<Layout>}{
 const theme=currentKoboTheme();
 const rows=result.rows.filter(row=>row.id!=='__blank__'),horizontal=result.chart==='bar',heatmap=result.chart==='heatmap';
 const percentMode=result.measure?.operation==='sum'&&(result.percentageMode??'legacy-respondents')!=='legacy-respondents'&&result.appearance?.metric==='percent';
 const showBoth=result.measure?.operation==='sum'&&result.appearance?.labels==='both'&&(result.percentageMode??'legacy-respondents')!=='legacy-respondents';
 const text=(cell:KoboMeasureCell,chartLabel=false)=>{
  const amount=measureNumber(result,cell.value,language);
  if(!showBoth&&!percentMode)return amount;
  const percent=displayPercent(cell as KoboMeasureCell&{percent:number|null}),decimals=result.percentageDecimals??0;
  if(chartLabel&&hideZeroPercentLabel(percent,decimals,result.appearance?.zeroPercentLabels))return showBoth?amount:'';
  const formatted=formatPercent(percent,decimals,language);
  return showBoth?`${amount} (${formatted})`:formatted;
 };
 const font=(result.appearance?.fontSize||12)*(exporting?1.8:1);
 const columns=result.breakdowns;
 const captions=rows.map(row=>chartCaption(row.label,horizontal||heatmap?26:12,Infinity));
 const breakdownCaptions=columns.map(column=>chartCaption(column.label,12,Infinity));
 const categoryTicks=(ids:string[],ticktext:string[])=>({type:'category' as const,categoryorder:'array' as const,categoryarray:ids,tickmode:'array' as const,tickvals:ids,ticktext,tickangle:0});
 const layout:Partial<Layout>={autosize:true,height:Math.max(result.appearance?.height||0,horizontal?rows.length*55+160:440),paper_bgcolor:exporting?'#ffffff':'transparent',plot_bgcolor:exporting?'#ffffff':'transparent',font:{size:font,color:exporting?'#243746':chartInk(theme)},margin:{l:horizontal?220:75,r:40,t:35,b:100},hovermode:'closest',showlegend:result.appearance?.legend==='hidden'?false:result.breakdowns.length>0,xaxis:{type:horizontal?'linear':'category',automargin:true,fixedrange:true},yaxis:{type:horizontal||heatmap?'category':'linear',automargin:true,fixedrange:true,autorange:horizontal||heatmap?'reversed':true}};
 if(!heatmap){const axis=horizontal?'xaxis':'yaxis';layout[axis]={...layout[axis],title:{text:percentMode?result.percentageBasis:result.measure!.label},ticksuffix:percentMode?'%':''}}
 if(!heatmap&&result.appearance?.valueAxis==='hide'){const axis=horizontal?'xaxis':'yaxis';layout[axis]={...layout[axis],showticklabels:false,ticks:'',showline:false,zeroline:false,title:{text:''}}}
 if(result.appearance?.grid!=='auto'){layout.xaxis={...layout.xaxis,showgrid:result.appearance?.grid==='show'};layout.yaxis={...layout.yaxis,showgrid:result.appearance?.grid==='show'}}
 if(exporting&&!(result.chart==='line'&&result.trend)){
  const rowAxis=horizontal||heatmap?'yaxis':'xaxis';
  layout[rowAxis]={...layout[rowAxis],...categoryTicks(rows.map(row=>row.id),captions)};
  if(heatmap)layout.xaxis={...layout.xaxis,...categoryTicks(columns.map(column=>column.id),breakdownCaptions)};
  const lineCount=(labels:string[])=>Math.max(1,...labels.map(label=>label.split('<br>').length));
  const rowBand=Math.max(55,lineCount(captions)*font*1.35+14);
  layout.margin!.l=horizontal||heatmap?Math.ceil(font*26*.67+32):90;
  layout.margin!.b=Math.max(100,lineCount(heatmap?breakdownCaptions:horizontal?[]:captions)*font*1.3+55);
  layout.width=Math.max(1300,(heatmap?columns.length:horizontal?0:rows.length)*font*9+(layout.margin!.l??0)+100);
  layout.height=Math.max(Number(layout.height),layout.margin!.b+60+(horizontal||heatmap?rows.length*rowBand:320));
 }
 if(heatmap)return {layout,data:[{type:'heatmap',x:columns.map(column=>exporting?column.id:column.label),y:rows.map(row=>exporting?row.id:row.label),z:rows.map(row=>result.breakdowns.map(column=>row.series?.find(cell=>cell.id===column.id)?.[percentMode?'percent':'value']??null)),text:rows.map(row=>result.breakdowns.map(column=>text(row.series?.find(cell=>cell.id===column.id)||{}))),customdata:rows.map(row=>columns.map(column=>[row.label,column.label])),hovertemplate:'%{customdata[0]}<br>%{customdata[1]}<br>%{text}<extra></extra>',colorbar:percentMode?{ticksuffix:'%'}:undefined,colorscale:'Blues'} as unknown as Data]};
 if(result.chart==='line'&&result.trend){
  layout.xaxis={type:'category',automargin:true};layout.showlegend=true;
  return {layout,data:result.trend.series.map(series=>({type:'scatter',mode:result.appearance?.labels==='hidden'?'lines+markers':'lines+markers+text',textposition:'top center',name:series.label,x:result.trend!.periods,y:series.points.map(point=>percentMode?point.percent:point.value??null),text:series.points.map(point=>text(point,true)),hovertext:series.points.map(point=>text(point)),hovertemplate:'%{x}<br>%{hovertext}<extra>%{fullData.name}</extra>',connectgaps:false} as Data))};
 }
 const series=columns.length?columns:[{id:'',label:result.measure!.label}];
 return {layout,data:series.map(column=>{
  const cells:KoboMeasureCell[]=rows.map(row=>column.id?row.series?.find(cell=>cell.id===column.id)||{}:row),values=cells.map(cell=>percentMode?(cell as KoboMeasureCell&{percent?:number|null}).percent??null:cell.value??null),labels=rows.map(row=>exporting?row.id:row.label);
  return {type:result.chart==='line'?'scatter':'bar',orientation:horizontal?'h':'v',name:column.label,x:horizontal?values:labels,y:horizontal?labels:values,marker:{color:rows.map(row=>markColor(result,{answer:row.id,...(column.id?{breakdown:column.id}:{})},theme))},text:result.appearance?.labels==='hidden'?undefined:cells.map(cell=>text(cell,true)),textposition:result.chart==='line'?'top center':'auto',customdata:rows.map((row,i)=>[cells[i].contributingCount??0,null,null,row.id,column.id||undefined]),hovertext:cells.map(cell=>`${text(cell)}<br>${cell.contributingCount??0} contributing records`),hovertemplate:'%{hovertext}<extra>%{fullData.name}</extra>'} as Data;
 })};
}
