import type {Data,Layout} from 'plotly.js';
import type {KoboResult} from './koboTypes';
import type {KoboChartPanel} from './koboChartDensity';
import {resolveAppearance,requestedChartHeight,chartAxisLines,chartLabel,chartLegendPlacement} from './koboAppearance';
import {barCategoryGutter,categoryCaption,chartCaption,chartTickIndices,fittedLegendHeight,fittedLegendLabel,fixedSideLegendWidth,rotatedCategoryDepth} from './koboChartLabels';
import type {Theme} from './types';
import {koboThemeColor,koboThemePalette,koboHeatmapScale} from './koboThemeColors';
import {chartPercent,percentageDecimals,formatPercent} from './koboPercentages';

export function singlePeriodTrendNotice(result:KoboResult,language:string){
 const trend=result.chart==='line'?result.trend:null;
 if(!trend||trend.periods.length!==1)return '';
 if(language==='ar')return trend.unit==='day'?'جميع الاستجابات المؤرخة تقع في يوم واحد. يحتاج الخط إلى فترتين زمنيتين على الأقل.':`جميع الاستجابات المؤرخة تقع في ${trend.unit==='month'?'شهر':'عام'} واحد. اختر التجميع حسب اليوم لرؤية التغيرات داخل هذه الفترة.`;
 return trend.unit==='day'?'All dated responses fall on one day. A line needs at least two time periods.':`All dated responses fall in one ${trend.unit}. Choose Day grouping to see changes within this period.`;
}

export function advancedChartSpec(result:KoboChartPanel,language:string,exporting:boolean,ink:string,grid:string,theme?:Theme,containerWidth=900,fixedWidth=false):{data:Data[];layout:Partial<Layout>}|null{
 const heatmap=result.chart==='heatmap',trend=result.chart==='line'?result.trend:null;
 if(!heatmap&&!trend)return null;
 const appearance=resolveAppearance(result.appearance),percentage=appearance.metric==='percent',decimals=percentageDecimals(result);
 const font=(appearance.fontSize||14)*(exporting?2:1),rows=result.rows.filter(row=>row.id!=='__blank__');
 const axis={automargin:true,fixedrange:true,gridcolor:grid,showgrid:appearance.grid==='show'||appearance.grid==='auto'&&!heatmap,zeroline:false};
 const layout:Partial<Layout>={autosize:true,height:Math.max(requestedChartHeight(appearance),heatmap?rows.length*(exporting?64:48)+210:appearance.customHeight?240:exporting?750:440),
  paper_bgcolor:exporting?'#fff':'transparent',plot_bgcolor:exporting?'#fff':'transparent',dragmode:false,hovermode:'closest',
  font:{color:ink,size:font},
  margin:{l:heatmap?exporting?360:220:80,r:heatmap?100:35,t:40,b:heatmap?150:130},
  xaxis:{...axis,type:'category'},yaxis:{...axis},showlegend:!heatmap&&appearance.legend!=='hidden',
  legend:chartLegendPlacement(appearance.legend,appearance.legendAlign,undefined,appearance.legendVerticalAlign)};
 if(trend){
  const tickCount=Math.min(trend.periods.length,exporting?6:4),ticks=Array.from({length:tickCount},(_,index)=>trend.periods[tickCount===1?0:Math.round(index*(trend.periods.length-1)/(tickCount-1))]);
  layout.xaxis={...axis,...chartAxisLines(appearance,'x',false),type:'category',tickmode:'array',tickvals:ticks,ticktext:ticks.map(period=>trend.unit==='day'?period.slice(0,4)+'<br>'+period.slice(5):period),tickangle:0};
  layout.yaxis={...axis,...chartAxisLines(appearance,'y',true),rangemode:'tozero',tickfont:{size:exporting?28:12},...(percentage?{ticksuffix:'%'}:{})};
  const noteFont=exporting?20:12;
  const excluded=language==='ar'?`استجابات بلا تاريخ صالح: ${trend.excluded}`:`Excluded missing/invalid dates: ${trend.excluded}`;
  const width=exporting?1300:containerWidth;
  const sideLegend=['left','right'].includes(appearance.legend);
  const legendName=(label:string)=>fittedLegendLabel(label,fixedWidth,width,font,sideLegend);
  const note=chartCaption(excluded,Math.max(10,(width-115)/(noteFont*.65)));
  const noteHeight=note.split('<br>').length*noteFont*1.3+10;
  let headerHeight=noteHeight;
  if(layout.showlegend&&appearance.legend==='top'){
   const availableWidth=Math.max(100,width-115);
   let rows=1,usedWidth=0;
   for(const series of trend.series){
    const entryWidth=Math.min(availableWidth,series.label.length*font*.65+48);
    if(usedWidth&&usedWidth+entryWidth>availableWidth){rows++;usedWidth=0}
    usedWidth+=entryWidth;
   }
   headerHeight+=(fixedWidth?fittedLegendHeight(trend.series.map(series=>legendName(series.label)),availableWidth,font):rows*(font*1.3+10))+15;
  }
  layout.margin!.t=40+Math.ceil(headerHeight);
  layout.height=Number(layout.height)+Math.ceil(headerHeight);
  if(fixedWidth&&layout.showlegend){
   layout.legend={...layout.legend,font:{size:font}};
   if(sideLegend){
    const sideWidth=fixedSideLegendWidth(width);
    if(appearance.legend==='left'){
     layout.margin!.l=sideWidth+40;
     layout.legend.x=-40/Math.max(80,width-layout.margin!.l-layout.margin!.r!);
    }else layout.margin!.r=sideWidth;
   }else if(appearance.legend!=='top'){
    const footerHeight=fittedLegendHeight(trend.series.map(series=>legendName(series.label)),Math.max(80,width-115),font);
    layout.margin!.b=layout.margin!.b!+footerHeight;
    layout.height=Number(layout.height)+footerHeight;
   }
  }
  layout.annotations=[{text:note,x:0,y:1,xref:'paper',yref:'paper',showarrow:false,xanchor:'left',yanchor:'bottom',yshift:8,font:{size:noteFont,color:ink}}];
  if(!trend.periods.length)layout.annotations.push({text:language==='ar'?'لا توجد تواريخ صالحة':'No valid dates under the current filters',x:.5,y:.5,xref:'paper',yref:'paper',showarrow:false});
  return {layout,data:trend.series.map(series=>({type:'scatter',mode:appearance.labels==='hidden'?'lines+markers':'lines+markers+text',name:legendName(series.label),
   x:trend.periods,y:series.points.map(point=>percentage?chartPercent(point,decimals):point.count),connectgaps:false,
   line:{color:result.colors[series.id]||koboThemeColor(series.id,theme)},marker:{color:result.colors[series.id]||koboThemeColor(series.id,theme)},
   text:series.points.map(point=>point.percent===null&&percentage||appearance.labels==='auto'&&!point.count?'':chartLabel(point.count,chartPercent(point,decimals),appearance.labels==='auto'?percentage?'percent':'count':appearance.labels,language,decimals,appearance.zeroPercentLabels)),textposition:'top center',cliponaxis:false,
   hovertext:series.points.map((point,index)=>`${chartCaption(series.label,42,4)}<br>${trend.periods[index]}<br># ${point.count}<br>${formatPercent(chartPercent(point,decimals),decimals,language)}`),hovertemplate:'%{hovertext}<extra></extra>'} as Data))};
 }
 const columns=result.breakdowns;
 const categoryFont=appearance.categoryLabelSize?appearance.categoryLabelSize*(exporting?2:1):font;
 const maxLines=appearance.categoryLabelLines||(exporting||fixedWidth?Infinity:5);
 const rowLimit=fixedWidth?Math.min(containerWidth*.36,220):Math.max(220,containerWidth*.38);
 const rowCharacters=fixedWidth?Math.min(30,(rowLimit-24)/(categoryFont*.6)):30;
 const rowCaptions=rows.map(row=>categoryCaption(row.label,rowCharacters,maxLines,appearance.categoryLabels,true));
 if(fixedWidth)layout.margin!.r=76;
 layout.margin!.l=fixedWidth?barCategoryGutter(rowCaptions,categoryFont,rowLimit):Math.max(layout.margin!.l!,barCategoryGutter(rowCaptions,categoryFont,rowLimit));
 const available=containerWidth-layout.margin!.l-layout.margin!.r!;
 const columnTicks=fixedWidth?chartTickIndices(columns.length,available,categoryFont).map(index=>columns[index]):columns;
 const columnCharacters=fixedWidth?Math.min(22,(available/Math.max(1,columnTicks.length)-8)/(categoryFont*.6)):22;
 const columnCaptions=columnTicks.map(column=>categoryCaption(column.label,columnCharacters,maxLines,appearance.categoryLabels));
 const rotate=appearance.categoryLabels==='rotate';
 const lines=(caption:string)=>caption.split('<br>').length;
 layout.margin!.b=rotate?Math.max(150,rotatedCategoryDepth(columnCaptions,categoryFont)+24):Math.max(150,...columnCaptions.map(caption=>lines(caption)*categoryFont*1.3+24));
 layout.height=Math.max(Number(layout.height),rows.length*Math.max(exporting?64:48,...rowCaptions.map(caption=>lines(caption)*categoryFont*1.35+14))+layout.margin!.b+60);
 if(exporting)layout.width=Math.max(1300,columns.length*320+460);
 else if(!fixedWidth&&appearance.categoryLabelSize>0)layout.width=Math.max(containerWidth,columns.length*Math.max(130,categoryFont*13)+layout.margin!.l+100);
 const columnIds=columns.map(column=>column.id),rowIds=rows.map(row=>row.id);
 layout.xaxis={...axis,type:'category',categoryorder:'array',categoryarray:columnIds,tickmode:'array',tickvals:columnTicks.map(column=>column.id),ticktext:columnCaptions,tickangle:rotate?-45:0,tickfont:{size:categoryFont}};
 layout.yaxis={...axis,type:'category',categoryorder:'array',categoryarray:rowIds,autorange:'reversed',tickmode:'array',tickvals:rowIds,ticktext:rowCaptions,tickfont:{size:categoryFont}};
 return {layout,data:[{type:'heatmap',x:columns.map(column=>column.id),y:rows.map(row=>row.id),
  z:rows.map(row=>columns.map(column=>{const entry=row.series?.find(entry=>entry.id===column.id);return percentage?chartPercent(entry,decimals):entry?.count??0})),
  colorscale:koboHeatmapScale(theme,result.colors.series===(result.heatmapRamp??koboThemePalette(theme))[0]?undefined:result.colors.series,result.heatmapRamp),zmin:0,...(result.chartMaximum!==undefined?{zmax:result.chartMaximum||1}:{}),hoverongaps:false,
  text:rows.map(row=>columns.map(column=>{const entry=row.series?.find(entry=>entry.id===column.id);return chartLabel(entry?.count??0,chartPercent(entry,decimals),appearance.labels==='auto'?percentage?'percent':'count':appearance.labels,language,decimals,appearance.zeroPercentLabels)})),
  texttemplate:appearance.labels==='hidden'?'':'%{text}',textfont:{size:font},
  hovertext:rows.map(row=>columns.map(column=>{const entry=row.series?.find(entry=>entry.id===column.id);return `${chartCaption(row.label,42,Infinity)}<br>${chartCaption(column.label,42,Infinity)}<br># ${entry?.count??0}<br>${formatPercent(chartPercent(entry,decimals),decimals,language)}`})),hovertemplate:'%{hovertext}<extra></extra>',
  colorbar:{title:{text:percentage?'%':'#'},ticksuffix:percentage?'%':'',...(fixedWidth?{thickness:12}:{})}} as unknown as Data]};
}
