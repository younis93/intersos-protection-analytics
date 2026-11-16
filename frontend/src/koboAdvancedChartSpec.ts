import type {Data,Layout} from 'plotly.js';
import type {KoboResult} from './koboTypes';
import {resolveAppearance,chartLabel} from './koboAppearance';
import {categoryCaption,chartCaption,rotatedCategoryDepth} from './koboChartLabels';
import type {Theme} from './types';
import {koboThemeColor,koboThemePalette,koboHeatmapScale} from './koboThemeColors';
import {percentageDecimals,formatPercent} from './koboPercentages';

export function singlePeriodTrendNotice(result:KoboResult,language:string){
 const trend=result.chart==='line'?result.trend:null;
 if(!trend||trend.periods.length!==1)return '';
 if(language==='ar')return trend.unit==='day'?'جميع الاستجابات المؤرخة تقع في يوم واحد. يحتاج الخط إلى فترتين زمنيتين على الأقل.':`جميع الاستجابات المؤرخة تقع في ${trend.unit==='month'?'شهر':'عام'} واحد. اختر التجميع حسب اليوم لرؤية التغيرات داخل هذه الفترة.`;
 return trend.unit==='day'?'All dated responses fall on one day. A line needs at least two time periods.':`All dated responses fall in one ${trend.unit}. Choose Day grouping to see changes within this period.`;
}

export function advancedChartSpec(result:KoboResult&{chartMaximum?:number},language:string,exporting:boolean,ink:string,grid:string,theme?:Theme,containerWidth=900):{data:Data[];layout:Partial<Layout>}|null{
 const heatmap=result.chart==='heatmap',trend=result.chart==='line'?result.trend:null;
 if(!heatmap&&!trend)return null;
 const appearance=resolveAppearance(result.appearance),percentage=appearance.metric==='percent',decimals=percentageDecimals(result);
 const font=(appearance.fontSize||14)*(exporting?2:1),rows=result.rows.filter(row=>row.id!=='__blank__');
 const axis={automargin:true,fixedrange:true,gridcolor:grid,showgrid:appearance.grid==='show'||appearance.grid==='auto'&&!heatmap,zeroline:false};
 const layout:Partial<Layout>={autosize:true,height:Math.max(appearance.height||0,heatmap?rows.length*(exporting?64:48)+210:exporting?750:440),
  paper_bgcolor:exporting?'#fff':'transparent',plot_bgcolor:exporting?'#fff':'transparent',dragmode:false,hovermode:'closest',
  font:{color:ink,size:font},
  margin:{l:heatmap?exporting?360:220:80,r:heatmap?100:35,t:40,b:heatmap?150:130},
  xaxis:{...axis,type:'category'},yaxis:{...axis},showlegend:!heatmap&&appearance.legend!=='hidden',
  legend:{orientation:['left','right'].includes(appearance.legend)?'v':'h',x:appearance.legend==='right'?1.02:0,y:appearance.legend==='top'?1.15:-.25}};
 if(trend){
  const tickCount=Math.min(trend.periods.length,exporting?6:4),ticks=Array.from({length:tickCount},(_,index)=>trend.periods[tickCount===1?0:Math.round(index*(trend.periods.length-1)/(tickCount-1))]);
  layout.xaxis={...axis,type:'category',tickmode:'array',tickvals:ticks,ticktext:ticks.map(period=>trend.unit==='day'?period.slice(0,4)+'<br>'+period.slice(5):period),tickangle:0};
  layout.yaxis={...axis,rangemode:'tozero',...(percentage?{ticksuffix:'%'}:{})};
  const noteFont=exporting?20:12;
  const excluded=language==='ar'?`استجابات بلا تاريخ صالح: ${trend.excluded}`:`Excluded missing/invalid dates: ${trend.excluded}`;
  const width=exporting?1300:containerWidth;
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
   headerHeight+=rows*(font*1.3+10)+15;
   layout.legend={...layout.legend,yref:'container',y:.99,yanchor:'top'};
  }
  layout.margin!.t=40+Math.ceil(headerHeight);
  layout.height=Number(layout.height)+Math.ceil(headerHeight);
  layout.annotations=[{text:note,x:0,y:1,xref:'paper',yref:'paper',showarrow:false,xanchor:'left',yanchor:'bottom',yshift:8,font:{size:noteFont,color:ink}}];
  if(!trend.periods.length)layout.annotations.push({text:language==='ar'?'لا توجد تواريخ صالحة':'No valid dates under the current filters',x:.5,y:.5,xref:'paper',yref:'paper',showarrow:false});
  return {layout,data:trend.series.map(series=>({type:'scatter',mode:appearance.labels==='hidden'?'lines+markers':'lines+markers+text',name:series.label,
   x:trend.periods,y:series.points.map(point=>percentage?point.percent:point.count),connectgaps:false,
   line:{color:result.colors[series.id]||koboThemeColor(series.id,theme)},marker:{color:result.colors[series.id]||koboThemeColor(series.id,theme)},
   text:series.points.map(point=>point.percent===null&&percentage||appearance.labels==='auto'&&!point.count?'':chartLabel(point.count,point.percent,appearance.labels==='auto'?percentage?'percent':'count':appearance.labels,language,decimals,appearance.zeroPercentLabels)),textposition:'top center',cliponaxis:false,
   hovertext:series.points.map((point,index)=>`${chartCaption(series.label,42,4)}<br>${trend.periods[index]}<br># ${point.count}<br>${formatPercent(point.percent,decimals,language)}`),hovertemplate:'%{hovertext}<extra></extra>'} as Data))};
 }
 const columns=result.breakdowns;
 const columnCaptions=columns.map(column=>categoryCaption(column.label,22,exporting?Infinity:5,appearance.categoryLabels));
 const rowCaptions=rows.map(row=>categoryCaption(row.label,30,exporting?Infinity:5,appearance.categoryLabels,true));
 const rotate=appearance.categoryLabels==='rotate';
 if(rotate){
  const extra=Math.max(0,rotatedCategoryDepth(columnCaptions,font)+24-150);
  layout.margin!.b=150+extra;
  layout.height=Number(layout.height)+extra;
 }
 if(exporting){
  const lines=(caption:string)=>caption.split('<br>').length;
  if(!rotate)layout.margin!.b=Math.max(150,...columnCaptions.map(caption=>lines(caption)*font*1.3+24));
  layout.height=Math.max(Number(layout.height),rows.length*Math.max(64,...rowCaptions.map(caption=>lines(caption)*font*1.35+14))+(layout.margin!.b??150)+60);
 }
 if(exporting)layout.width=Math.max(1300,columns.length*320+460);
 layout.xaxis={...axis,type:'category',tickmode:'array',tickvals:columns.map(column=>column.id),ticktext:columnCaptions,tickangle:rotate?-45:0};
 layout.yaxis={...axis,type:'category',autorange:'reversed',tickmode:'array',tickvals:rows.map(row=>row.id),ticktext:rowCaptions};
 return {layout,data:[{type:'heatmap',x:columns.map(column=>column.id),y:rows.map(row=>row.id),
  z:rows.map(row=>columns.map(column=>{const entry=row.series?.find(entry=>entry.id===column.id);return percentage?entry?.percent??null:entry?.count??0})),
  colorscale:koboHeatmapScale(theme,result.colors.series===koboThemePalette(theme)[0]?undefined:result.colors.series),zmin:0,...(result.chartMaximum?{zmax:result.chartMaximum}:{}),hoverongaps:false,
  text:rows.map(row=>columns.map(column=>{const entry=row.series?.find(entry=>entry.id===column.id);return chartLabel(entry?.count??0,entry?.percent??null,appearance.labels==='auto'?percentage?'percent':'count':appearance.labels,language,decimals,appearance.zeroPercentLabels)})),
  texttemplate:appearance.labels==='hidden'?'':'%{text}',textfont:{size:font},
  hovertext:rows.map(row=>columns.map(column=>{const entry=row.series?.find(entry=>entry.id===column.id);return `${chartCaption(row.label,42,4)}<br>${chartCaption(column.label,42,4)}<br># ${entry?.count??0}<br>${formatPercent(entry?.percent??null,decimals,language)}`})),hovertemplate:'%{hovertext}<extra></extra>',
  colorbar:{title:{text:percentage?'%':'#'},ticksuffix:percentage?'%':''}} as unknown as Data]};
}
