import {formatPercent,chartPercent,percentageDecimals,type PercentageValue} from './koboPercentages';
import {chartInk} from './ChartPrimitives';
import {markColor} from './koboMarkColors';
import {currentKoboTheme,koboHeatmapScale} from './koboThemeColors';
import type {Data,Layout} from 'plotly.js';
import type {KoboMeasureCell} from './koboTypes';
import {measureNumber} from './koboMeasures';
import {barCategoryGutter,categoryCaption,chartCaption,chartTickIndices,columnLabelSlot,fittedLegendHeight,fittedLegendLabel,fixedColumnCaptions,fixedSideLegendWidth,rotatedCategoryDepth} from './koboChartLabels';
import {answerRowPadding,barWidthLayout,chartAxisLines,chartLegendPlacement,columnDomain,hideZeroPercentLabel,requestedChartHeight,resolveAppearance,valueAxisVisibility} from './koboAppearance';
import type {KoboChartPanel} from './koboChartDensity';
import {groupedBarPositions} from './koboGroupedBars';
import {insideBarValueLabel,labelInk,outsideBarLabelPadding,outsideBarValueRange,supportsBarLabelPosition} from './koboDataLabels';
export function measureChartSpec(result:KoboChartPanel,language:string,exporting=false,containerWidth=900,fixedWidth=false):{data:Data[];layout:Partial<Layout>}{
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
 const categoryFont=appearance.categoryLabelSize?appearance.categoryLabelSize*(exporting?1.8:1):font;
 const columns=result.breakdowns;
 const legendLeft=appearance.legend==='left',legendRight=appearance.legend==='right';
 const sideLegend=legendLeft||legendRight;
 const sideWidth=fixedWidth&&sideLegend?fixedSideLegendWidth(containerWidth):0;
 const categoryLimit=Math.min(exporting?460:300,(exporting?1300:Math.max(240,containerWidth))*.38);
 const barCharacters=Math.min(44,Math.max(5,(categoryLimit-24)/(categoryFont*.6)));
 const rowLimit=fixedWidth?Math.min(containerWidth*.36,220):Math.max(220,categoryLimit);
 const {gap,pitch,columnShare}=barWidthLayout(appearance,horizontal);
 const columnSpace=(containerWidth-130-sideWidth)*columnShare;
 const labelSlot=result.chart==='column'&&categoryFont>12*(exporting?1.8:1)?columnLabelSlot(rows.map(row=>row.label),categoryFont,appearance.categoryLabels):0;
 const heatmapCharacters=fixedWidth?Math.min(26,(rowLimit-24)/(categoryFont*.6)):26;
 const fixedCaptions=fixedWidth&&result.chart==='column'
  ?fixedColumnCaptions(rows.map(row=>row.label),columnSpace,categoryFont,appearance.categoryLabels,appearance.categoryLabelLines||Infinity)
  :undefined;
 const captions=fixedCaptions?.captions??rows.map(row=>categoryCaption(row.label,horizontal?barCharacters:heatmap?heatmapCharacters:12,appearance.categoryLabelLines||(horizontal&&!exporting&&!fixedWidth?5:Infinity),appearance.categoryLabels,horizontal||heatmap,result.chart==='column'));
 const rotate=appearance.categoryLabels==='rotate';
 const lineCount=(labels:string[])=>Math.max(1,...labels.map(label=>label.split('<br>').length));
 const rowPadding=horizontal?answerRowPadding[appearance.answerSpacing]:14;
 const standardBand=Math.max(55,lineCount(captions)*categoryFont*1.35+14);
 const seriesBand=columns.length*(font*1.35+5)/.8;
 const seriesMinimum=rowPadding===14?0:rowPadding<14?Math.min(standardBand,seriesBand):seriesBand;
 const rowBand=Math.max(55*(horizontal?pitch:1)+rowPadding-14,lineCount(captions)*categoryFont*1.35+rowPadding,seriesMinimum+Math.max(0,rowPadding-14));
 const breakdownSpace=containerWidth-rowLimit-76;
 const breakdownTicks=fixedWidth&&heatmap?chartTickIndices(columns.length,breakdownSpace,categoryFont).map(index=>columns[index]):columns;
 const breakdownCharacters=fixedWidth?Math.min(18,(breakdownSpace/Math.max(1,breakdownTicks.length)-8)/(categoryFont*.6)):12;
 const breakdownCaptions=breakdownTicks.map(column=>categoryCaption(column.label,breakdownCharacters,appearance.categoryLabelLines||Infinity,appearance.categoryLabels));
 const categoryTicks=(ids:string[],ticktext:string[],angle=0)=>({type:'category' as const,categoryorder:'array' as const,categoryarray:ids,tickmode:'array' as const,tickvals:ids,ticktext,tickangle:angle,tickfont:{size:categoryFont}});
 const layout:Partial<Layout>={autosize:true,height:Math.max(requestedChartHeight(appearance),horizontal?rows.length*rowBand+160:appearance.customHeight?240:440),paper_bgcolor:exporting?'#ffffff':'transparent',plot_bgcolor:exporting?'#ffffff':'transparent',font:{size:font,color:exporting?'#243746':chartInk(theme)},margin:{l:horizontal?barCategoryGutter(captions,categoryFont,categoryLimit):75,r:40,t:35,b:100},hovermode:'closest',xaxis:{type:horizontal?'linear':'category',automargin:true,fixedrange:true},yaxis:{type:horizontal||heatmap?'category':'linear',automargin:true,fixedrange:true,autorange:horizontal||heatmap?'reversed':true}};
 const hasTimeTrend=result.chart==='line'&&!!result.trend;
 layout.showlegend=!heatmap&&appearance.legend!=='hidden'&&(appearance.legend!=='auto'||hasTimeTrend||columns.length>0);
 const legendName=(label:string)=>fittedLegendLabel(label,fixedWidth,containerWidth,font,sideLegend);
 const legendLabels=hasTimeTrend?result.trend!.series.map(series=>series.label):columns.length?columns.map(column=>column.label):[result.measure!.label];
 const legendHeight=fixedWidth&&layout.showlegend&&!sideLegend?fittedLegendHeight(legendLabels.map(legendName),Math.max(80,containerWidth-130),font):0;
 layout.legend={...chartLegendPlacement(appearance.legend,appearance.legendAlign,undefined,appearance.legendVerticalAlign),...(fixedWidth?{font:{size:font}}:{})};
 if(layout.showlegend&&appearance.legend==='top')layout.margin!.t=80;
 if(horizontal)layout.yaxis={...layout.yaxis,...categoryTicks(rows.map(row=>row.id),captions)};
 if(!heatmap){
  layout.xaxis={...layout.xaxis,...chartAxisLines(appearance,'x',horizontal)};
  layout.yaxis={...layout.yaxis,...chartAxisLines(appearance,'y',!horizontal)};
  const axis=horizontal?'xaxis':'yaxis',scaleFont=exporting?22:12;
  layout[axis]={...layout[axis],tickfont:{size:scaleFont},title:{text:percentMode?result.percentageBasis:result.measure!.label,font:{size:scaleFont}},ticksuffix:percentMode?'%':'',...valueAxisVisibility(appearance)};
 }
 if(result.appearance?.grid!=='auto'){layout.xaxis={...layout.xaxis,showgrid:result.appearance?.grid==='show'};layout.yaxis={...layout.yaxis,showgrid:result.appearance?.grid==='show'}}
 if(!result.trend){
  const rowAxis=horizontal||heatmap?'yaxis':'xaxis';
  layout[rowAxis]={...layout[rowAxis],...categoryTicks(rows.map(row=>row.id),captions,rotate&&!horizontal&&!heatmap?-45:0)};
  if(heatmap)layout.xaxis={...layout.xaxis,...categoryTicks(columns.map(column=>column.id),breakdownCaptions,rotate?-45:0),tickvals:breakdownTicks.map(column=>column.id)};
  if(!horizontal)layout.margin!.l=heatmap?barCategoryGutter(captions,categoryFont,rowLimit):90;
  if(fixedWidth&&heatmap)layout.margin!.r=76;
  const axisCaptions=heatmap?breakdownCaptions:horizontal?[]:captions;
  const captionDepth=fixedCaptions?.depth??(rotate?rotatedCategoryDepth(axisCaptions,categoryFont):lineCount(axisCaptions)*categoryFont*1.3);
  layout.margin!.b=Math.max(100,captionDepth+55);
  if(!fixedWidth&&(exporting||heatmap||result.chart==='column')){
   const slot=Math.max(categoryFont*9*(result.chart==='column'?pitch:1),labelSlot/columnShare);
   layout.width=Math.max(exporting?1300:containerWidth,(heatmap?columns.length:horizontal?0:rows.length)*slot+(layout.margin!.l??0)+100);
   if(!exporting&&layout.width<=containerWidth)delete layout.width;
  }
  layout.height=Math.max(Number(layout.height),layout.margin!.b+layout.margin!.t!+25+(horizontal||heatmap?rows.length*rowBand:appearance.customHeight?140:320));
 }
 if(fixedWidth&&layout.showlegend){
  if(sideLegend){
   if(legendLeft){
    const labelWidth=layout.margin!.l!;
    layout.margin!.l=labelWidth+sideWidth;
    layout.legend={...layout.legend,...chartLegendPlacement(appearance.legend,appearance.legendAlign,-labelWidth/Math.max(80,containerWidth-layout.margin!.l-layout.margin!.r!),appearance.legendVerticalAlign)};
   }else layout.margin!.r=sideWidth;
  }else{
   if(appearance.legend==='top')layout.margin!.t=Math.max(80,legendHeight+24);
   else layout.margin!.b=layout.margin!.b!+legendHeight;
   layout.height=Number(layout.height)+legendHeight;
  }
 }
 if(heatmap)return {layout,data:[{type:'heatmap',x:columns.map(column=>column.id),y:rows.map(row=>row.id),z:rows.map(row=>result.breakdowns.map(column=>percentMode?plottedPercent(row.series?.find(cell=>cell.id===column.id)):row.series?.find(cell=>cell.id===column.id)?.value??null)),text:rows.map(row=>result.breakdowns.map(column=>text(row.series?.find(cell=>cell.id===column.id)||{}))),customdata:rows.map(row=>columns.map(column=>[row.label,column.label])),hovertemplate:'%{customdata[0]}<br>%{customdata[1]}<br>%{text}<extra></extra>',
  colorbar:{...(percentMode?{ticksuffix:'%'}:{}),...(fixedWidth?{thickness:12}:{})},colorscale:result.heatmapRamp?koboHeatmapScale(theme,result.colors.series,result.heatmapRamp):'Blues'} as unknown as Data]};
 if(result.chart==='line'&&result.trend){
  layout.xaxis={...layout.xaxis,type:'category',autorange:true};
  return {layout,data:result.trend.series.map(series=>({type:'scatter',mode:result.appearance?.labels==='hidden'?'lines+markers':'lines+markers+text',textposition:'top center',name:legendName(series.label),...(result.colors[series.id]?{line:{color:result.colors[series.id]},marker:{color:result.colors[series.id]}}:{}),x:result.trend!.periods,y:series.points.map(point=>percentMode?plottedPercent(point):point.value??null),text:series.points.map(point=>text(point,true)),hovertext:series.points.map(point=>text(point)),hovertemplate:'%{x}<br>%{hovertext}<extra>%{fullData.name}</extra>',connectgaps:false} as Data))};
 }
 const series=columns.length?columns:[{id:'',label:result.measure!.label}];
 const labelsVisible=result.appearance?.labels!=='hidden';
 const placement=labelsVisible&&supportsBarLabelPosition(result.chart)?appearance.labelPosition:'auto';
 const stacked=columns.length>0&&result.appearance?.bars==='stack';
 const inside=placement==='inside',outside=placement==='outside'&&!stacked;
 const plotWidth=Math.max(1,(layout.width??containerWidth)-layout.margin!.l!-layout.margin!.r!);
 const plotHeight=Math.max(1,layout.height!-layout.margin!.t!-layout.margin!.b!);
 const extent=horizontal?plotWidth:plotHeight;
 if(horizontal||result.chart==='column')layout.bargap=gap;
 if(result.chart==='column')layout.xaxis={...layout.xaxis,domain:columnDomain(columnShare)};
 const thickness=(horizontal?plotHeight:plotWidth*(result.chart==='column'?columnShare:1))/Math.max(1,rows.length)/series.length*(1-gap);
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
 const labels=rows.map(row=>row.id);
 const positions=!stacked&&(horizontal||result.chart==='column')
  ?groupedBarPositions(prepared.map(({values})=>values),gap):undefined;
 return {layout,data:prepared.map(({column,cells,values,captions},index)=>{
  const placed=insidePlacements[index];
  const colors=rows.map(row=>markColor(result,{answer:row.id,...(column.id?{breakdown:column.id}:{})},theme));
  return {type:result.chart==='line'?'scatter':'bar',orientation:horizontal?'h':'v',name:legendName(column.label),x:horizontal?values:labels,y:horizontal?labels:values,marker:{color:colors},...positions?.[index],
   text:placed?.map(label=>label.text)??captions,textposition:result.chart==='line'?'top center':placed?.map(label=>label.position)??(outside?'outside':'auto'),
   ...(inside?{insidetextanchor:'end',insidetextfont:{size:placed?.map(label=>label.size),color:colors.map(labelInk)},constraintext:'inside',textangle:0}:{}),
   ...(outside||inside?{outsidetextfont:{size:font,color:layout.font!.color},cliponaxis:false,textangle:0}:{}),
   ...(outside?{constraintext:'none'}:{}),
   customdata:rows.map((row,i)=>[cells[i].contributingCount??0,null,row.label,row.id,column.id||undefined]),hovertext:cells.map((cell,i)=>`${chartCaption(rows[i].label,42,Infinity)}<br>${text(cell)}<br>${cell.contributingCount??0} contributing records`),hovertemplate:'%{hovertext}<extra>%{fullData.name}</extra>'} as unknown as Data;
 })};
}
