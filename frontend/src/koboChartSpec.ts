import {projectKoboChart} from './koboChartDensity';
import {measured} from './koboMeasures';
import {measureChartSpec} from './koboMeasureChartSpec';
import {advancedChartSpec} from './koboAdvancedChartSpec';
import {chartPercent,formatPercent,percentageDecimals,type PercentageValue} from './koboPercentages';
import {resultWithColors,markColor} from './koboMarkColors';
import type {Data,Layout} from 'plotly.js';
import type {Theme} from './types';
import type {KoboQuestionSettings} from './koboTypes';
import {currentKoboTheme,koboThemeColor} from './koboThemeColors';
import {chartGrid,chartInk} from './ChartPrimitives';
import {barCategoryGutter,categoryCaption,chartCaption,columnLabelSlot,fittedLegendHeight,fittedLegendLabel,fixedColumnCaptions,fixedSideLegendWidth,rotatedCategoryDepth} from './koboChartLabels';
import {barValueLabel,insideBarValueLabel,labelInk,outsideBarLabelPadding,outsideBarValueRange,supportsBarLabelPosition} from './koboDataLabels';
import {answerRowPadding,barWidthLayout,chartAxisLines,chartLabel,chartLegendPlacement,columnDomain,fixedChartWidth,koboChartFontFamily,requestedChartHeight,resolveAppearance,titleSpacingPoints,valueAxisVisibility} from './koboAppearance';
import {koboScreenChartPage,koboScreenChartRows,isDenseKoboChart,readableKoboChartType,type KoboChartPanel} from './koboChartDensity';
import {groupedBarPositions} from './koboGroupedBars';

export type KoboChartImageView={width:number;page:number;pageOnly?:boolean;rendered?:{data:Data[];layout:Partial<Layout>;width:number;height:number}};

function pieAnswerLabels(rows:KoboChartPanel['rows']){
 const counts=new Map<string,number>();
 for(const {label} of rows)counts.set(label,(counts.get(label)??0)+1);
 const used=new Set(counts.keys());
 // Plotly combines slices with identical labels.
 return rows.map(({label,id})=>{
  if(counts.get(label)===1)return label;
  const caption=`${label} [${id}]`;
  let unique=caption,suffix=2;
  while(used.has(unique))unique=`${caption} (${suffix++})`;
  used.add(unique);
  return unique;
 });
}

export function chartImageSpec(result:KoboChartPanel,language:string,view:KoboChartImageView,theme=currentKoboTheme()){
 const rows=koboScreenChartRows(result);
 const page=koboScreenChartPage(result,rows,view.page);
 const paper=theme==='glass-dark'?'#162d3f':'#ffffff';
 const combinePages=page.paged&&!view.pageOnly;
 if(view.rendered&&!combinePages){
  const {data,layout,width,height}=view.rendered;
  return {data,layout:{...layout,width,height,paper_bgcolor:paper,plot_bgcolor:paper,autosize:false}};
 }
 const imageWidth=combinePages&&['line','histogram'].includes(page.result.chart)?view.width*page.pages:view.width;
 const spec=chartSpec(combinePages?{...projectKoboChart(result),chart:page.result.chart,sourceChart:result.chart}:page.result,language,false,theme,imageWidth);
 const {layout}=spec;
 if(combinePages){
  const captions={xaxis:new Map<string|number,string>(),yaxis:new Map<string|number,string>()};
  let titleSpec:typeof spec|undefined;
  let bottom=layout.margin?.b??0;
  for(let index=0;index<page.pages;index++){
   const panel=koboScreenChartPage(result,rows,index).result;
   const panelSpec=chartSpec(panel,language,false,theme,view.width);
   if(index===page.page)titleSpec=panelSpec;
   bottom=Math.max(bottom,panelSpec.layout.margin?.b??0);
   for(const key of ['xaxis','yaxis'] as const){
    const axis=panelSpec.layout[key];
    axis?.tickvals?.forEach((value,i)=>{if(axis.ticktext?.[i]!==undefined)captions[key].set(value,axis.ticktext[i])});
   }
  }
  for(const key of ['xaxis','yaxis'] as const){
   const axis=layout[key],labels=captions[key];
   if(axis&&labels.size){axis.tickvals=[...labels.keys()];axis.ticktext=[...labels.values()]}
  }
  layout.height=Number(layout.height)+bottom-(layout.margin?.b??0);
  layout.margin={...layout.margin,b:bottom};
  if(page.result.chart==='column'){
   const font=layout.xaxis?.tickfont?.size??layout.font?.size??12;
   const slot=barCategoryGutter([...captions.xaxis.values()],font,Infinity);
   layout.width=Math.max(Number(layout.width)||view.width,rows.length*slot+(layout.margin.l??0)+(layout.margin.r??0));
  }
  const title=titleSpec?.layout.title;
  if(title&&typeof title==='object'&&typeof title.y==='number'){
   const topDifference=(titleSpec?.layout.margin?.t??0)-(layout.margin?.t??0);
   layout.height=Number(layout.height)+topDifference;
   layout.margin={...layout.margin,t:titleSpec?.layout.margin?.t};
   const scale=Number(titleSpec?.layout.height)/Number(layout.height);
   layout.title={...title,y:1-(1-title.y)*scale};
   const legend=titleSpec?.layout.legend;
   if(legend?.yref==='container'&&legend.yanchor==='top'&&typeof legend.y==='number'){
    layout.legend={...layout.legend,y:1-(1-legend.y)*scale};
   }
  }
 }
 const width=Number(layout.width)||(result.chart==='heatmap'?Math.max(imageWidth,400,result.breakdowns.length*130+280):imageWidth);
 return {...spec,layout:{...layout,width,paper_bgcolor:paper,plot_bgcolor:paper,autosize:false}};
}

export function fixedChartImageSpec(result:KoboChartPanel,language:string,theme=currentKoboTheme()){
 const width=fixedChartWidth(result.appearance);
 if(!width)return undefined;
 const paper=theme==='glass-dark'?'#162d3f':'#ffffff';
 const spec=chartSpec(result,language,false,theme,width);
 return {...spec,layout:{...spec.layout,paper_bgcolor:paper,plot_bgcolor:paper}};
}

export function chartSpec(result:KoboChartPanel,language:string,exporting=false,themeOverride?:Theme,containerWidth=900,colorSettings?:KoboQuestionSettings):{data:Data[];layout:Partial<Layout>}{
 const fixedWidth=exporting?undefined:fixedChartWidth(result.appearance);
 const spec=baseChartSpec(result,language,exporting,themeOverride,fixedWidth??containerWidth,colorSettings,!!fixedWidth);
 if(fixedWidth){spec.layout.width=fixedWidth;spec.layout.autosize=false}
 const appearance=resolveAppearance(result.appearance);
 const chartFont=koboChartFontFamily(appearance.fontFamily,language);
 spec.layout.font={...spec.layout.font,family:chartFont};
 const title=appearance.title.trim();
 if(!title)return spec;
 const font=(appearance.titleSize||16)*(exporting?2:1);
 const screenWidth=result.chart==='heatmap'?Math.max(containerWidth,400,result.breakdowns.length*130+280):containerWidth;
 const width=Number(spec.layout.width)||(exporting?1300:screenWidth);
 const inset=exporting?32:16;
 let text=chartCaption(title,(width-2*inset)/(font*.65),20);
 const lines=text.split('<br>').length;
 if(appearance.titleBold)text=`<b>${text}</b>`;
 if(appearance.titleItalic)text=`<i>${text}</i>`;
 if(appearance.titleUnderline)text=`<u>${text}</u>`;
 const gap=titleSpacingPoints(appearance.titleSpacing)*4/3*(exporting?2:1);
 const wrappedHeight=Math.ceil(font*1.3*(lines-1));
 const fontDescent=Math.ceil(font*.25);
 const titleBottom=Math.ceil(font*1.3)+(exporting?20:12)+wrappedHeight;
 const baseTop=spec.layout.margin?.t??0;
 const topLegend=Boolean(spec.layout.showlegend&&appearance.legend==='top');
 const extra=topLegend?titleBottom+gap:Math.max(0,titleBottom+gap-baseTop);
 const top=baseTop+extra,height=(Number(spec.layout.height)||440)+extra;
 return {...spec,layout:{
  ...spec.layout,height,margin:{...spec.layout.margin,t:top},
  title:{text,x:appearance.titleAlign==='left'?0:appearance.titleAlign==='right'?1:.5,xanchor:appearance.titleAlign,xref:'container',
   pad:{l:inset,r:inset},
   // Plotly positions the first baseline at y and draws wrapped lines below it.
   y:1-((topLegend?titleBottom:top-gap)-wrappedHeight-fontDescent)/height,yref:'container',yanchor:'bottom',
   font:{size:font,family:appearance.titleFont==='inherit'?chartFont:appearance.titleFont==='Helvetica Neue'?koboChartFontFamily(appearance.titleFont,language):appearance.titleFont,...(appearance.titleColor?{color:appearance.titleColor}:{})}},
  ...(topLegend?{legend:{...spec.layout.legend,yref:'container',yanchor:'top',y:.99-extra/height}}:{})
 }};
}

function baseChartSpec(result:KoboChartPanel,language:string,exporting=false,themeOverride?:Theme,containerWidth=900,colorSettings?:KoboQuestionSettings,fixedWidth=false):{data:Data[];layout:Partial<Layout>}{
 result=projectKoboChart(result);
 const theme=themeOverride||(typeof document!=='undefined'?document.documentElement.dataset.theme||'glass-light':'glass-light') as Theme;
 if(colorSettings)result=resultWithColors(result,colorSettings,theme);
 if(measured(result))return measureChartSpec(result,language,exporting,containerWidth,fixedWidth);
 const appearance=resolveAppearance(result.appearance),shown=koboScreenChartRows(result);
 const dense=isDenseKoboChart(result);
 const type=dense?'bar':readableKoboChartType(result);
 const horizontal=type==='bar',pie=type==='pie'||type==='donut',percentage=appearance.metric==='percent';
 const fullExportCaptions=exporting&&!pie;
 const decimals=percentageDecimals(result);
 const value=(entry:PercentageValue&{count:number})=>percentage?(result.stackedAnswers?entry.percent:chartPercent(entry,decimals))??0:entry.count;
 const colors=shown.map(row=>markColor(result,{answer:row.id},theme));
 const ink=exporting?'#263746':chartInk(theme),grid=exporting?'#e4ebf0':chartGrid(theme),scale=exporting?2.3:1;
 const advanced=advancedChartSpec(result,language,exporting,ink,grid,theme,containerWidth,fixedWidth);if(advanced)return advanced;
 const legendPosition=appearance.legend,legendRight=legendPosition==='right',legendLeft=legendPosition==='left',legendTop=legendPosition==='top';
 const showlegend=legendPosition==='hidden'?false:legendPosition==='auto'?result.breakdowns.length>0||pie:true;
 const axis={fixedrange:true,automargin:true,gridcolor:grid,rangemode:'tozero' as const,...(appearance.grid!=='auto'?{showgrid:appearance.grid==='show'}:{})};
 const metricAxis={tickfont:{size:exporting?28:12},...(percentage?{ticksuffix:'%',tickformat:`.${percentageDecimals(result)}f`,title:{text:'%',font:{size:exporting?28:12}}}:{}),...valueAxisVisibility(appearance)};
 const font=appearance.fontSize?appearance.fontSize*scale:exporting?28:12,width=exporting?1300:Math.max(240,containerWidth);
 const categoryFont=appearance.categoryLabelSize?appearance.categoryLabelSize*scale:font;
 const labelFont=(appearance.fontSize||14)*scale;
 const seriesCount=Math.max(1,result.breakdowns.length),stacked=appearance.bars==='stack'&&result.breakdowns.length>0;
 const categoryLimit=Math.min(exporting?460:300,width*.38);
 const barCaptions=horizontal?shown.map(row=>categoryCaption(row.label,Math.min(44,Math.max(5,(categoryLimit-24)/(categoryFont*.6))),appearance.categoryLabelLines||(fullExportCaptions||fixedWidth?Infinity:5),appearance.categoryLabels,true)):[];
 const categoryWidth=horizontal?barCategoryGutter(barCaptions,categoryFont,categoryLimit):exporting?90:55;
 const legendWidth=fixedWidth?fixedSideLegendWidth(width):Math.min(width*.22,exporting?240:180);
 const left=categoryWidth+(showlegend&&legendLeft?legendWidth:0),right=showlegend&&legendRight?legendWidth:Math.max(25,labelFont*2);
 const captionSpacing=categoryFont*5.5+12;
 const barWidth=barWidthLayout(appearance,horizontal),pitch=barWidth.pitch;
 const columnShare=type==='column'?barWidth.columnShare:1;
 const labelSlot=type==='column'&&categoryFont>(exporting?28:12)?columnLabelSlot(shown.map(row=>row.label),categoryFont,appearance.categoryLabels):0;
 const columnWidth=!fixedWidth&&(type==='column'||(exporting&&type==='line'))
  ?Math.max(width,shown.length*Math.max(labelSlot/columnShare,captionSpacing,72*(type==='column'?pitch:1),(stacked?1:seriesCount)*(labelFont*3+16)*(type==='column'?pitch:1))+left+right):undefined;
 const usable=Math.max(80,(columnWidth||width)-left-right),stride=fullExportCaptions||horizontal||type==='column'?1:Math.max(1,Math.ceil(shown.length*captionSpacing/usable));
 const ticks=shown.filter((_,index)=>index%stride===0);
 const captionWidth=usable*columnShare/Math.max(1,ticks.length)-12;
 const rotate=!horizontal&&appearance.categoryLabels==='rotate';
 const fixedCaptions=fixedWidth&&type==='column'
  ?fixedColumnCaptions(ticks.map(row=>row.label),usable*columnShare,categoryFont,appearance.categoryLabels,appearance.categoryLabelLines||Infinity)
  :undefined;
 const captions=fixedCaptions?.captions??(horizontal?barCaptions:ticks.map(row=>categoryCaption(row.label,Math.min(32,Math.max(5,captionWidth/(categoryFont*.57))),appearance.categoryLabelLines||(fullExportCaptions||fixedWidth?Infinity:4),appearance.categoryLabels,false,type==='column')));
 const lines=Math.max(1,...captions.map(text=>text.split('<br>').length));
 const legendFont=appearance.fontSize?appearance.fontSize*scale:exporting?24:12;
 const pieLabels=pie?pieAnswerLabels(shown):[];
 const legendLabels=result.breakdowns.length?result.breakdowns.map(column=>column.label):pie?pieLabels:[result.label];
 const legendSide=legendLeft||legendRight;
 const legendLabel=(label:string)=>fittedLegendLabel(label,fixedWidth,width,legendFont,legendSide);
 const renderedPieLabels=pie&&fixedWidth?pieAnswerLabels(shown.map((row,index)=>({...row,label:legendLabel(pieLabels[index])}))):pieLabels;
 const renderedLegendLabels=pie?renderedPieLabels:legendLabels.map(legendLabel);
 const legendRows=Math.max(1,Math.ceil(legendLabels.reduce((sum,label)=>sum+Math.min(width-40,label.length*legendFont*.55+55),0)/Math.max(80,width-40)));
 const legendHeight=fixedWidth&&showlegend&&!legendSide?fittedLegendHeight(renderedLegendLabels,Math.max(80,usable),legendFont):legendRows*(legendFont+12);
 const legendSpace=showlegend&&!legendSide&&!legendTop?legendHeight+18:0;
 const captionDepth=fixedCaptions?.depth??(rotate?rotatedCategoryDepth(captions,categoryFont):lines*categoryFont*1.3);
 const bottom=horizontal?Math.max(45,legendSpace+28):Math.max(60,captionDepth+legendSpace+24);
 const top=showlegend&&legendTop?Math.max(80,legendHeight+24):25;
 const legend={...chartLegendPlacement(legendPosition,appearance.legendAlign,-(categoryWidth+16)/usable,appearance.legendVerticalAlign),font:{size:legendFont}};
 const rowPadding=answerRowPadding[appearance.answerSpacing];
 const band=Math.max((exporting?34:40)*pitch+rowPadding-14,lines*categoryFont*1.35+rowPadding,
  (stacked?1:seriesCount)*(labelFont*1.5+8+(rowPadding-14)/2)*pitch/.8);
 const automaticHeight=horizontal?Math.max(bottom+top+((exporting?650:330)-bottom-top)*pitch+(rowPadding-14)*4,shown.length*band+bottom+top):exporting?750:Math.max(360,bottom+220);
 // A requested height is a minimum for horizontal comparisons: never squeeze labels into thinner rows.
 const configuredHeight=requestedChartHeight(appearance);
 const requestedHeight=configuredHeight?Math.round(configuredHeight*(exporting?1.4:1)):automaticHeight;
 const height=horizontal||fixedWidth||fullExportCaptions||rotate||appearance.categoryLabelSize||appearance.categoryLabelLines||appearance.customHeight?Math.max(requestedHeight,horizontal?automaticHeight:bottom+top+(appearance.customHeight?140:220)):requestedHeight;
 const useCategoryIds=exporting||type!=='line'||result.kind!=='date';
 const position=(row:typeof shown[number])=>useCategoryIds?row.id:row.label;
 const categoryAxis={...(useCategoryIds?{type:'category' as const,categoryorder:'array' as const,categoryarray:shown.map(position)}:{}),tickmode:'array' as const,tickvals:ticks.map(position),ticktext:captions,tickangle:rotate?-45:0,tickfont:{size:categoryFont},ticklabelposition:'outside' as const,ticklabelstandoff:horizontal?10:6};
 const labelMode=appearance.labels==='auto'?(percentage?'percent':'count'):appearance.labels,visibleLabels=appearance.labels!=='hidden';
 const labelPosition=visibleLabels&&supportsBarLabelPosition(result.chart)?appearance.labelPosition:'auto';
 const insideLabels=labelPosition==='inside',outsideLabels=labelPosition==='outside'&&!stacked;
 const maximum=Math.max(result.chartMaximum||0,...shown.map(row=>result.breakdowns.length?(stacked?row.series?.reduce((sum,entry)=>sum+value(entry),0)||0:Math.max(0,...(row.series||[]).map(entry=>value(entry)))):value(row)));
 const plotHeight=Math.max(80,height-bottom-top);
 const valueExtent=horizontal?usable:plotHeight;
 const gap=type==='histogram'?0:barWidth.gap;
 const groupGap=type==='histogram'?0:.04;
 const thickness=(horizontal?plotHeight:usable*columnShare)/Math.max(1,shown.length)/(stacked?1:seriesCount)*(1-gap);
 let outsidePadding=0;
 const pieTotal=shown.reduce((sum,row)=>sum+value(row),0);
 const hoverNumber=new Intl.NumberFormat(language,{maximumFractionDigits:2});
 const hoverText=(label:string,count:number|undefined,percent:number|null|undefined,breakdown?:string)=>
  `<b>${chartCaption(label,42,Infinity)}</b>${breakdown?`<br>${chartCaption(breakdown,48,Infinity)}`:''}<br>${language==='ar'?'# العدد':'# Count'}: <b>${count===undefined?'-':hoverNumber.format(count)}</b><br>${language==='ar'?'% النسبة':'% Share'}: <b>${formatPercent(percent,decimals,language)}</b>`;
 const data:Data[]=[];
 const dataLabel=(entry:PercentageValue&{count:number})=>chartLabel(entry.count,chartPercent(entry,decimals),labelMode,language,decimals,appearance.zeroPercentLabels);
 if(pie){
  data.push({type:'pie',labels:renderedPieLabels,values:shown.map(row=>value(row)),hole:type==='donut'?.55:0,marker:{colors},sort:false,
   textinfo:appearance.labels==='hidden'?'none':'text',text:shown.map((row,index)=>appearance.labels==='auto'?(pieTotal&&value(row)/pieTotal>=.035?[chartCaption(pieLabels[index],24,2),dataLabel(row)].filter(Boolean).join('<br>'):''):dataLabel(row)),textposition:'auto',automargin:true,textfont:{size:labelFont,weight:700},insidetextfont:{color:colors.map(labelInk),size:labelFont,weight:700},outsidetextfont:{color:ink,size:labelFont,weight:700},
   customdata:shown.map(row=>[row.count,row.percent==null?'-':`${row.percent}%`,row.label,row.id,null]),hovertext:shown.map((row,index)=>hoverText(pieLabels[index],row.count,chartPercent(row,decimals))),hovertemplate:'%{hovertext}<extra></extra>'} as unknown as Data);
 }else{
  const series=result.breakdowns.length?result.breakdowns:[{id:'',label:''}],indexed=shown.map(row=>new Map(row.series?.map(entry=>[entry.id,entry])));
  const prepared=series.map(column=>{
   const entries=shown.map((row,index)=>column.id?indexed[index].get(column.id):row),values=entries.map(entry=>entry?value(entry):0);
   return {column,entries,values};
  });
  const positions=!stacked&&(type==='bar'||type==='column')
   ?groupedBarPositions(prepared.map(({values})=>values),gap,groupGap):undefined;
  prepared.forEach(({column,entries,values},seriesIndex)=>{
   const labels=entries.map(entry=>entry&&(appearance.labels!=='auto'||(percentage?entry.percent??0:entry.count)>0)?dataLabel(entry):'');
   const inside=insideLabels?labels.map((text,index)=>insideBarValueLabel(text,values[index],maximum,valueExtent*.88,thickness,labelFont,8*scale,horizontal,stacked)):[];
   const placed=labels.map((text,index)=>{
    const label=insideLabels?inside[index]:outsideLabels?{text,position:'outside'}:barValueLabel(text,values[index],maximum,valueExtent*.88,thickness,labelFont,horizontal,stacked);
    if(label.text&&label.position==='outside'&&(outsideLabels||insideLabels)){
     const padding=outsideBarLabelPadding(label.text,labelFont,horizontal);
     const room=insideLabels&&maximum>0?Math.max(0,1-values[index]/maximum)*valueExtent*.88:0;
     outsidePadding=Math.max(outsidePadding,padding-room);
    }
    return label;
   });
   const fill=shown.map(row=>markColor(result,{answer:row.id,...(column.id?{breakdown:column.id}:{})},theme));
   const contrast=Array.isArray(fill)?fill.map(labelInk):labelInk(fill);
   data.push({type:type==='line'?'scatter':'bar',mode:type==='line'?visibleLabels?'text+lines+markers':'lines+markers':undefined,name:legendLabel(column.label||result.label),orientation:horizontal?'h':undefined,...positions?.[seriesIndex],
    x:horizontal?values:shown.map(position),y:horizontal?shown.map(position):values,text:visibleLabels?(type==='line'?labels.map((text,index)=>appearance.labels==='auto'&&index%Math.max(stride,Math.ceil(shown.length*labelFont*4/usable))!==0?'':text):placed.map(label=>label.text)):undefined,textposition:type==='line'?'top center':visibleLabels?placed.map(label=>label.position):'none',cliponaxis:false,
    ...(type!=='line'?{insidetextanchor:'end' as const,insidetextfont:{color:contrast,size:insideLabels?inside.map(label=>label.size):labelFont,weight:700},outsidetextfont:{color:ink,size:labelFont,weight:700},textangle:0,constraintext:insideLabels?'inside':'none'}:{textfont:{color:ink,size:labelFont,weight:700}}),
    marker:{color:result.stackedAnswers?markColor(result,{answer:'',breakdown:column.id},theme):fill},line:{color:result.colors[column.id||'series']||(koboThemeColor(column.id||'series',theme))},
    ...(result.stackedAnswers?.highlightedSeries?{opacity:result.stackedAnswers.highlightedSeries===column.id?1:.55}:{}),
    customdata:entries.map((entry,index)=>[entry?.count??0,entry?.percent==null?'-':`${entry.percent}%`,shown[index].label,shown[index].id,column.id||null]),hovertext:entries.map((entry,index)=>hoverText(shown[index].label,entry?.count,chartPercent(entry,decimals),column.id?column.label:undefined)),hovertemplate:'%{hovertext}<extra></extra>'} as unknown as Data); // Plotly supports per-point positions and font colors beyond the bundled TS declarations.
  });
 }
 const outsideRange=outsidePadding?outsideBarValueRange(0,maximum,valueExtent,outsidePadding):undefined;
 const valueRange=result.stackedAnswers?.mode==='percent'?[0,100]:insideLabels&&maximum>0?[0,Math.max(maximum*1.14,outsideRange?.[1]??0)]:outsideRange??(visibleLabels&&type!=='line'&&maximum>0?[0,maximum*1.14]:undefined);
 return {data,layout:{height,...(columnWidth&&columnWidth>width?{width:columnWidth}:{}),autosize:!columnWidth||columnWidth<=width,dragmode:false,
  hovermode:'closest',hoverlabel:{bgcolor:'#17324d',bordercolor:'#577997',font:{size:13,color:'#ffffff'},align:'left',namelength:0},
  paper_bgcolor:exporting?'#ffffff':'transparent',plot_bgcolor:exporting?'#ffffff':'transparent',font:{color:ink,size:font},
  margin:{l:left,r:right,t:top,b:bottom},
  xaxis:{...axis,...chartAxisLines(appearance,'x',horizontal),...(horizontal?{...metricAxis,...(valueRange?{range:valueRange}:{})}:categoryAxis),...(type==='column'?{domain:columnDomain(columnShare)}:{})},
  yaxis:{...axis,...chartAxisLines(appearance,'y',!horizontal),autorange:horizontal?'reversed':!valueRange,...(!horizontal?{...metricAxis,...(valueRange?{range:valueRange}:{})}:categoryAxis)},
  barmode:appearance.bars,bargap:gap,bargroupgap:groupGap,showlegend,legend}};
}
