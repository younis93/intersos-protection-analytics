import {formatPercent,chartPercent,percentageDecimals,type PercentageValue} from './koboPercentages';
import {chartInk} from './ChartPrimitives';
import {markColor} from './koboMarkColors';
import {currentKoboTheme} from './koboThemeColors';
import type {Data,Layout} from 'plotly.js';
import type {KoboResult,KoboMeasureCell} from './koboTypes';
import {measureNumber} from './koboMeasures';
import {barCategoryGutter,categoryCaption,rotatedCategoryDepth} from './koboChartLabels';
import {hideZeroPercentLabel,resolveAppearance} from './koboAppearance';
import {insideBarValueLabel,labelInk,outsideBarLabelPadding,outsideBarValueRange,supportsBarLabelPosition} from './koboDataLabels';
export function measureChartSpec(result:KoboResult,language:string,exporting=false,containerWidth=900):{data:Data[];layout:Partial<Layout>}{
 const theme=currentKoboTheme(),appearance=resolveAppearance(result.appearance);
 const rows=result.rows.filter(row=>row.id!=='__blank__'),horizontal=result.chart==='bar',heatmap=result.chart==='heatmap';
 const percentMode=result.measure?.operation==='sum'&&(result.percentageMode??'legacy-respondents')!=='legacy-respondents'&&result.appearance?.metric==='percent';
 const showBoth=result.measure?.operation==='sum'&&result.appearance?.labels==='both'&&(result.percentageMode??'legacy-respondents')!=='legacy-respondents';
 const decimals=percentageDecimals(result);
 const plottedPercent=(cell:(KoboMeasureCell&PercentageValue)|undefined)=>chartPercent(cell,decimals);
 const text=(cell:KoboMeasureCell&PercentageValue,chartLabel=false)=>{
  const amount=measureNumber(result,cell.value,language);
  if(!showBoth&&!percentMode)return amount;
  const percent=plottedPercent(cell);
  if(chartLabel&&hideZeroPercentLabel(percent,decimals,result.appearance?.zeroPercentLabels))return showBoth?amount:'';
  const formatted=formatPercent(percent,decimals,language);
  return showBoth?`${amount} (${formatted})`:formatted;
 };
 const font=(result.appearance?.fontSize||12)*(exporting?1.8:1);
 const columns=result.breakdowns;
 const categoryLimit=Math.min(exporting?460:300,(exporting?1300:Math.max(240,containerWidth))*.38);
 const barCharacters=Math.min(44,Math.max(5,(categoryLimit-24)/(font*.6)));
 const captions=rows.map(row=>categoryCaption(row.label,horizontal?barCharacters:heatmap?26:12,horizontal&&!exporting?5:Infinity,appearance.categoryLabels,horizontal||heatmap));
 const explicitCategories=appearance.categoryLabels!=='wrap'&&!result.trend;
 const rotate=appearance.categoryLabels==='rotate';
 const lineCount=(labels:string[])=>Math.max(1,...labels.map(label=>label.split('<br>').length));
 const rowBand=Math.max(55,lineCount(captions)*font*1.35+14);
 const breakdownCaptions=columns.map(column=>categoryCaption(column.label,12,Infinity,appearance.categoryLabels));
 const categoryTicks=(ids:string[],ticktext:string[],angle=0)=>({type:'category' as const,categoryorder:'array' as const,categoryarray:ids,tickmode:'array' as const,tickvals:ids,ticktext,tickangle:angle});
 const layout:Partial<Layout>={autosize:true,height:Math.max(result.appearance?.height||0,horizontal?rows.length*rowBand+160:440),paper_bgcolor:exporting?'#ffffff':'transparent',plot_bgcolor:exporting?'#ffffff':'transparent',font:{size:font,color:exporting?'#243746':chartInk(theme)},margin:{l:horizontal?barCategoryGutter(captions,font,categoryLimit):75,r:40,t:35,b:100},hovermode:'closest',showlegend:result.appearance?.legend==='hidden'?false:result.breakdowns.length>0,xaxis:{type:horizontal?'linear':'category',automargin:true,fixedrange:true},yaxis:{type:horizontal||heatmap?'category':'linear',automargin:true,fixedrange:true,autorange:horizontal||heatmap?'reversed':true}};
 if(horizontal)layout.yaxis={...layout.yaxis,...categoryTicks(rows.map(row=>row.id),captions)};
 if(!exporting&&!explicitCategories&&!horizontal&&!result.trend){
  layout.xaxis={...layout.xaxis,...(heatmap?categoryTicks(columns.map(column=>column.label),breakdownCaptions):categoryTicks(rows.map(row=>row.label),captions))};
  if(heatmap)layout.yaxis={...layout.yaxis,...categoryTicks(rows.map(row=>row.label),captions)};
 }
 if(!heatmap){const axis=horizontal?'xaxis':'yaxis';layout[axis]={...layout[axis],title:{text:percentMode?result.percentageBasis:result.measure!.label},ticksuffix:percentMode?'%':''}}
 if(!heatmap&&result.appearance?.valueAxis==='hide'){const axis=horizontal?'xaxis':'yaxis';layout[axis]={...layout[axis],showticklabels:false,ticks:'',showline:false,zeroline:false,title:{text:''}}}
 if(result.appearance?.grid!=='auto'){layout.xaxis={...layout.xaxis,showgrid:result.appearance?.grid==='show'};layout.yaxis={...layout.yaxis,showgrid:result.appearance?.grid==='show'}}
 if((exporting||explicitCategories)&&!(result.chart==='line'&&result.trend)){
  const rowAxis=horizontal||heatmap?'yaxis':'xaxis';
  layout[rowAxis]={...layout[rowAxis],...categoryTicks(rows.map(row=>row.id),captions,rotate&&!horizontal&&!heatmap?-45:0)};
  if(heatmap)layout.xaxis={...layout.xaxis,...categoryTicks(columns.map(column=>column.id),breakdownCaptions,rotate?-45:0)};
  if(!horizontal)layout.margin!.l=heatmap?Math.ceil(font*26*.67+32):90;
  const axisCaptions=heatmap?breakdownCaptions:horizontal?[]:captions;
  layout.margin!.b=Math.max(100,(rotate?rotatedCategoryDepth(axisCaptions,font):lineCount(axisCaptions)*font*1.3)+55);
  if(exporting)layout.width=Math.max(1300,(heatmap?columns.length:horizontal?0:rows.length)*font*9+(layout.margin!.l??0)+100);
  layout.height=Math.max(Number(layout.height),layout.margin!.b+60+(horizontal||heatmap?rows.length*rowBand:320));
 }
 if(heatmap)return {layout,data:[{type:'heatmap',x:columns.map(column=>exporting||explicitCategories?column.id:column.label),y:rows.map(row=>exporting||explicitCategories?row.id:row.label),z:rows.map(row=>result.breakdowns.map(column=>percentMode?plottedPercent(row.series?.find(cell=>cell.id===column.id)):row.series?.find(cell=>cell.id===column.id)?.value??null)),text:rows.map(row=>result.breakdowns.map(column=>text(row.series?.find(cell=>cell.id===column.id)||{}))),customdata:rows.map(row=>columns.map(column=>[row.label,column.label])),hovertemplate:'%{customdata[0]}<br>%{customdata[1]}<br>%{text}<extra></extra>',colorbar:percentMode?{ticksuffix:'%'}:undefined,colorscale:'Blues'} as unknown as Data]};
 if(result.chart==='line'&&result.trend){
  layout.xaxis={type:'category',automargin:true};layout.showlegend=true;
  return {layout,data:result.trend.series.map(series=>({type:'scatter',mode:result.appearance?.labels==='hidden'?'lines+markers':'lines+markers+text',textposition:'top center',name:series.label,x:result.trend!.periods,y:series.points.map(point=>percentMode?plottedPercent(point):point.value??null),text:series.points.map(point=>text(point,true)),hovertext:series.points.map(point=>text(point)),hovertemplate:'%{x}<br>%{hovertext}<extra>%{fullData.name}</extra>',connectgaps:false} as Data))};
 }
 const series=columns.length?columns:[{id:'',label:result.measure!.label}];
 const labelsVisible=result.appearance?.labels!=='hidden';
 const placement=labelsVisible&&supportsBarLabelPosition(result.chart)?appearance.labelPosition:'auto';
 const stacked=columns.length>0&&result.appearance?.bars==='stack';
 const inside=placement==='inside',outside=placement==='outside'&&!stacked;
 const plotWidth=Math.max(1,(layout.width??containerWidth)-layout.margin!.l!-layout.margin!.r!);
 const plotHeight=Math.max(1,layout.height!-layout.margin!.t!-layout.margin!.b!);
 const extent=horizontal?plotWidth:plotHeight;
 const thickness=(horizontal?plotHeight:plotWidth)/Math.max(1,rows.length)/series.length*.8;
 let minimum=0,maximum=0,padding=0;
 const prepared=series.map(column=>{
  const cells:(KoboMeasureCell&PercentageValue)[]=rows.map(row=>column.id?row.series?.find(cell=>cell.id===column.id)||{}:row);
  const values=cells.map(cell=>percentMode?plottedPercent(cell):cell.value??null);
  const captions=labelsVisible?cells.map(cell=>text(cell,true)):undefined;
  if(inside||outside)for(const [index,value] of values.entries()){
   if(value===null)continue;
   minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
   const caption=captions?.[index];
   if(outside&&caption)padding=Math.max(padding,outsideBarLabelPadding(caption,font,horizontal));
  }
  return {column,cells,values,captions};
 });
 const insidePlacements=inside?prepared.map(({values,captions})=>captions?.map((caption,index)=>{
  const value=values[index]??0, span=maximum-minimum;
  const label=insideBarValueLabel(caption,value,span,extent*.86,thickness,font,8*(exporting?1.8:1),horizontal,stacked);
  if(label.position==='outside'&&values[index]!==null){
   const distance=value<0?value-minimum:maximum-value;
   const room=span>0?distance/span*extent*.86:0;
   padding=Math.max(padding,outsideBarLabelPadding(caption,font,horizontal)-room);
  }
  return label;
 })):[];
 if(padding){
  const axis=horizontal?'xaxis':'yaxis';
  layout[axis]={...layout[axis],range:outsideBarValueRange(minimum,maximum,extent,padding),autorange:false};
 }
 const labels=rows.map(row=>exporting||horizontal||explicitCategories?row.id:row.label);
 return {layout,data:prepared.map(({column,cells,values,captions},index)=>{
  const placed=insidePlacements[index];
  const colors=rows.map(row=>markColor(result,{answer:row.id,...(column.id?{breakdown:column.id}:{})},theme));
  return {type:result.chart==='line'?'scatter':'bar',orientation:horizontal?'h':'v',name:column.label,x:horizontal?values:labels,y:horizontal?labels:values,marker:{color:colors},
   text:placed?.map(label=>label.text)??captions,textposition:result.chart==='line'?'top center':placed?.map(label=>label.position)??(outside?'outside':'auto'),
   ...(inside?{insidetextanchor:'end',insidetextfont:{size:placed?.map(label=>label.size),color:colors.map(labelInk)},constraintext:'inside',textangle:0}:{}),
   ...(outside||inside?{outsidetextfont:{size:font,color:layout.font!.color},cliponaxis:false,textangle:0}:{}),
   ...(outside?{constraintext:'none'}:{}),
   customdata:rows.map((row,i)=>[cells[i].contributingCount??0,null,null,row.id,column.id||undefined]),hovertext:cells.map(cell=>`${text(cell)}<br>${cell.contributingCount??0} contributing records`),hovertemplate:'%{hovertext}<extra>%{fullData.name}</extra>'} as unknown as Data;
 })};
}
