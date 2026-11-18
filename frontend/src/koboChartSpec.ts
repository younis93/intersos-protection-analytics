import {projectKoboChart} from './koboChartDensity';
import {measured} from './koboMeasures';
import {measureChartSpec} from './koboMeasureChartSpec';
import {advancedChartSpec} from './koboAdvancedChartSpec';
import {displayPercent,formatPercent,percentageDecimals,type PercentageValue} from './koboPercentages';
import {resultWithColors,markColor} from './koboMarkColors';
import type {Data,Layout} from 'plotly.js';
import type {Theme} from './types';
import type {KoboQuestionSettings} from './koboTypes';
import {koboThemeColor} from './koboThemeColors';
import {chartGrid,chartInk} from './ChartPrimitives';
import {barCategoryGutter,categoryCaption,chartCaption,rotatedCategoryDepth} from './koboChartLabels';
import {barValueLabel,insideBarValueLabel,labelInk,outsideBarLabelPadding,outsideBarValueRange,supportsBarLabelPosition} from './koboDataLabels';
import {chartLabel,koboChartFontFamily,resolveAppearance,titleSpacingPoints} from './koboAppearance';
import {koboScreenChartRows,isDenseKoboChart,readableKoboChartType,type KoboChartPanel} from './koboChartDensity';

export function chartSpec(result:KoboChartPanel,language:string,exporting=false,themeOverride?:Theme,containerWidth=900,colorSettings?:KoboQuestionSettings):{data:Data[];layout:Partial<Layout>}{
 const spec=baseChartSpec(result,language,exporting,themeOverride,containerWidth,colorSettings);
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

function baseChartSpec(result:KoboChartPanel,language:string,exporting=false,themeOverride?:Theme,containerWidth=900,colorSettings?:KoboQuestionSettings):{data:Data[];layout:Partial<Layout>}{
 result=projectKoboChart(result);
 const theme=themeOverride||(typeof document!=='undefined'?document.documentElement.dataset.theme||'glass-light':'glass-light') as Theme;
 if(colorSettings)result=resultWithColors(result,colorSettings,theme);
 if(measured(result))return measureChartSpec(result,language,exporting,containerWidth);
 const appearance=resolveAppearance(result.appearance),shown=koboScreenChartRows(result);
 const dense=isDenseKoboChart(result);
 const type=dense?'bar':readableKoboChartType(result);
 const horizontal=type==='bar',pie=type==='pie'||type==='donut',percentage=appearance.metric==='percent';
 const fullExportCaptions=exporting&&!pie;
 const value=(count:number,percent:number|null|undefined)=>percentage?percent??0:count;
 const colors=shown.map(row=>markColor(result,{answer:row.id},theme));
 const ink=exporting?'#263746':chartInk(theme),grid=exporting?'#e4ebf0':chartGrid(theme),scale=exporting?2.3:1;
 const advanced=advancedChartSpec(result,language,exporting,ink,grid,theme,containerWidth);if(advanced)return advanced;
 const legendPosition=appearance.legend,legendRight=legendPosition==='right',legendLeft=legendPosition==='left',legendTop=legendPosition==='top';
 const showlegend=legendPosition==='hidden'?false:legendPosition==='auto'?result.breakdowns.length>0||pie:true;
 const axis={fixedrange:true,automargin:true,gridcolor:grid,rangemode:'tozero' as const,...(appearance.grid!=='auto'?{showgrid:appearance.grid==='show'}:{})};
 const metricAxis={...(percentage?{ticksuffix:'%',tickformat:`.${percentageDecimals(result)}f`,title:{text:'%'}}:{}),...(appearance.valueAxis==='hide'?{showticklabels:false,ticks:'' as const,showline:false,zeroline:false,title:{text:''}}:{})};
 const font=appearance.fontSize?appearance.fontSize*scale:exporting?28:12,width=exporting?1300:Math.max(240,containerWidth);
 const labelFont=(appearance.fontSize||14)*scale;
 const seriesCount=Math.max(1,result.breakdowns.length),stacked=appearance.bars==='stack'&&result.breakdowns.length>0;
 const categoryLimit=Math.min(exporting?460:300,width*.38);
 const barCaptions=horizontal?shown.map(row=>categoryCaption(row.label,Math.min(44,Math.max(5,(categoryLimit-24)/(font*.6))),fullExportCaptions?Infinity:5,appearance.categoryLabels,true)):[];
 const categoryWidth=horizontal?barCategoryGutter(barCaptions,font,categoryLimit):exporting?90:55;
 const legendWidth=Math.min(width*.22,exporting?240:180);
 const left=categoryWidth+(showlegend&&legendLeft?legendWidth:0),right=showlegend&&legendRight?legendWidth:Math.max(25,labelFont*2);
 const captionSpacing=font*5.5+12;
 const columnWidth=type==='column'||(exporting&&type==='line')
  ?Math.max(width,shown.length*Math.max(captionSpacing,72,(stacked?1:seriesCount)*(labelFont*3+16))+left+right):undefined;
 const usable=Math.max(80,(columnWidth||width)-left-right),stride=fullExportCaptions||horizontal||type==='column'?1:Math.max(1,Math.ceil(shown.length*captionSpacing/usable));
 const ticks=shown.filter((_,index)=>index%stride===0);
 const captionWidth=usable/Math.max(1,ticks.length)-12;
 const rotate=!horizontal&&appearance.categoryLabels==='rotate';
 const captions=horizontal?barCaptions:ticks.map(row=>categoryCaption(row.label,Math.min(32,Math.max(5,captionWidth/(font*.57))),fullExportCaptions?Infinity:4,appearance.categoryLabels));
 const lines=Math.max(1,...captions.map(text=>text.split('<br>').length));
 const legendFont=appearance.fontSize?appearance.fontSize*scale:exporting?24:12;
 const legendLabels=result.breakdowns.length?result.breakdowns.map(column=>column.label):pie?shown.map(row=>row.label):[result.label];
 const legendRows=Math.max(1,Math.ceil(legendLabels.reduce((sum,label)=>sum+Math.min(width-40,label.length*legendFont*.55+55),0)/Math.max(80,width-40)));
 const legendSpace=showlegend&&!legendRight&&!legendLeft&&!legendTop?legendRows*(legendFont+12)+18:0;
 const bottom=horizontal?Math.max(45,legendSpace+28):Math.max(60,(rotate?rotatedCategoryDepth(captions,font):lines*font*1.3)+legendSpace+24);
 const top=showlegend&&legendTop?Math.max(80,legendRows*(legendFont+12)+24):25;
 const legend:Partial<Layout['legend']>={orientation:legendRight||legendLeft?'v':'h',x:legendRight?1.03:legendLeft?-(categoryWidth+16)/usable:0,xanchor:legendLeft?'right':'left',yref:legendRight||legendLeft?'paper':'container',y:legendTop?.99:legendRight||legendLeft?1:.01,yanchor:legendTop||legendRight||legendLeft?'top':'bottom',font:{size:legendFont}};
 const band=Math.max(exporting?34:40,lines*font*1.35+14,(stacked?1:seriesCount)*(labelFont*1.5+8)/.8);
 const automaticHeight=horizontal?Math.max(exporting?650:330,shown.length*band+bottom+top):exporting?750:Math.max(360,bottom+220);
 // A requested height is a minimum for horizontal comparisons: never squeeze labels into thinner rows.
 const requestedHeight=appearance.height?Math.round(appearance.height*(exporting?1.4:1)):automaticHeight;
 const height=horizontal?Math.max(requestedHeight,automaticHeight):fullExportCaptions||rotate?Math.max(requestedHeight,bottom+top+220):requestedHeight;
 const useCategoryIds=fullExportCaptions||!exporting&&type!=='line';
 const position=(row:typeof shown[number])=>useCategoryIds?row.id:row.label;
 const categoryAxis={...(useCategoryIds?{type:'category' as const,categoryorder:'array' as const,categoryarray:shown.map(position)}:{}),tickmode:'array' as const,tickvals:ticks.map(position),ticktext:captions,tickangle:rotate?-45:0,ticklabelposition:'outside' as const,ticklabelstandoff:horizontal?10:6};
 const labelMode=appearance.labels==='auto'?(percentage?'percent':'count'):appearance.labels,visibleLabels=appearance.labels!=='hidden';
 const labelPosition=visibleLabels&&supportsBarLabelPosition(result.chart)?appearance.labelPosition:'auto';
 const insideLabels=labelPosition==='inside',outsideLabels=labelPosition==='outside'&&!stacked;
 const maximum=Math.max(result.chartMaximum||0,...shown.map(row=>result.breakdowns.length?(stacked?row.series?.reduce((sum,entry)=>sum+value(entry.count,entry.percent),0)||0:Math.max(0,...(row.series||[]).map(entry=>value(entry.count,entry.percent)))):value(row.count,row.percent)));
 const plotHeight=Math.max(80,height-bottom-top);
 const valueExtent=horizontal?usable:plotHeight;
 const thickness=(horizontal?plotHeight:usable)/Math.max(1,shown.length)/(stacked?1:seriesCount)*.8;
 let outsidePadding=0;
 const pieTotal=shown.reduce((sum,row)=>sum+value(row.count,row.percent),0);
 const decimals=percentageDecimals(result);
 const hoverNumber=new Intl.NumberFormat(language,{maximumFractionDigits:2});
 const hoverText=(label:string,count:number|undefined,percent:number|null|undefined,breakdown?:string)=>
  `<b>${chartCaption(label,42,4)}</b>${breakdown?`<br>${chartCaption(breakdown,48,4)}`:''}<br>${language==='ar'?'# العدد':'# Count'}: <b>${count===undefined?'-':hoverNumber.format(count)}</b><br>${language==='ar'?'% النسبة':'% Share'}: <b>${formatPercent(percent,decimals,language)}</b>`;
 const data:Data[]=[];
 const dataLabel=(entry:PercentageValue&{count:number})=>chartLabel(entry.count,displayPercent(entry),labelMode,language,decimals,appearance.zeroPercentLabels);
 if(pie){
  data.push({type:'pie',labels:shown.map(row=>row.label),values:shown.map(row=>value(row.count,row.percent)),hole:type==='donut'?.55:0,marker:{colors},sort:false,
   textinfo:appearance.labels==='hidden'?'none':'text',text:shown.map(row=>appearance.labels==='auto'?(pieTotal&&value(row.count,row.percent)/pieTotal>=.035?[chartCaption(row.label,24,2),dataLabel(row)].filter(Boolean).join('<br>'):''):dataLabel(row)),textposition:'auto',automargin:true,textfont:{size:labelFont,weight:700},insidetextfont:{color:colors.map(labelInk),size:labelFont,weight:700},outsidetextfont:{color:ink,size:labelFont,weight:700},
   customdata:shown.map(row=>[row.count,row.percent==null?'-':`${row.percent}%`,row.label,row.id,null]),hovertext:shown.map(row=>hoverText(row.label,row.count,displayPercent(row))),hovertemplate:'%{hovertext}<extra></extra>'} as unknown as Data);
 }else{
  const series=result.breakdowns.length?result.breakdowns:[{id:'',label:''}],indexed=shown.map(row=>new Map(row.series?.map(entry=>[entry.id,entry])));
  series.forEach(column=>{
   const entries=shown.map((row,index)=>column.id?indexed[index].get(column.id):row),values=entries.map(entry=>entry?value(entry.count,entry.percent):0);
   const labels=entries.map((entry,index)=>entry&&(appearance.labels!=='auto'||values[index]>0)?dataLabel(entry):'');
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
   data.push({type:type==='line'?'scatter':'bar',mode:type==='line'?visibleLabels?'text+lines+markers':'lines+markers':undefined,name:column.label||result.label,orientation:horizontal?'h':undefined,
    x:horizontal?values:shown.map(position),y:horizontal?shown.map(position):values,text:visibleLabels?(type==='line'?labels.map((text,index)=>appearance.labels==='auto'&&index%Math.max(stride,Math.ceil(shown.length*labelFont*4/usable))!==0?'':text):placed.map(label=>label.text)):undefined,textposition:type==='line'?'top center':visibleLabels?placed.map(label=>label.position):'none',cliponaxis:false,
    ...(type!=='line'?{insidetextanchor:'end' as const,insidetextfont:{color:contrast,size:insideLabels?inside.map(label=>label.size):labelFont,weight:700},outsidetextfont:{color:ink,size:labelFont,weight:700},textangle:0,constraintext:insideLabels?'inside':'none'}:{textfont:{color:ink,size:labelFont,weight:700}}),
    marker:{color:fill},line:{color:result.colors[column.id||'series']||(koboThemeColor(column.id||'series',theme))},
    customdata:entries.map((entry,index)=>[entry?.count??0,entry?.percent==null?'-':`${entry.percent}%`,shown[index].label,shown[index].id,column.id||null]),hovertext:entries.map((entry,index)=>hoverText(shown[index].label,entry?.count,displayPercent(entry),column.id?column.label:undefined)),hovertemplate:'%{hovertext}<extra></extra>'} as unknown as Data); // Plotly supports per-point positions and font colors beyond the bundled TS declarations.
  });
 }
 const outsideRange=outsidePadding?outsideBarValueRange(0,maximum,valueExtent,outsidePadding):undefined;
 const valueRange=insideLabels&&maximum>0?[0,Math.max(maximum*1.14,outsideRange?.[1]??0)]:outsideRange??(visibleLabels&&type!=='line'&&maximum>0?[0,maximum*1.14]:undefined);
 return {data,layout:{height,...(columnWidth&&columnWidth>width?{width:columnWidth}:{}),autosize:!columnWidth||columnWidth<=width,dragmode:false,
  hovermode:'closest',hoverlabel:{bgcolor:'#17324d',bordercolor:'#577997',font:{size:13,color:'#ffffff'},align:'left',namelength:0},
  paper_bgcolor:exporting?'#ffffff':'transparent',plot_bgcolor:exporting?'#ffffff':'transparent',font:{color:ink,size:font},
  margin:{l:left,r:right,t:top,b:bottom},
  xaxis:{...axis,...(horizontal?{...metricAxis,...(valueRange?{range:valueRange}:{})}:categoryAxis)},yaxis:{...axis,autorange:horizontal?'reversed':!valueRange,...(!horizontal?{...metricAxis,...(valueRange?{range:valueRange}:{})}:categoryAxis)},barmode:appearance.bars,bargap:type==='histogram'?0:.2,bargroupgap:type==='histogram'?0:.04,showlegend,legend}};
}
