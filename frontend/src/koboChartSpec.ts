import {advancedChartSpec} from './koboAdvancedChartSpec';
import {displayPercent,formatPercent,percentageDecimals} from './koboPercentages';
import {markColor} from './koboMarkColors';
import type {Data,Layout} from 'plotly.js';
import type {Theme} from './types';
import {chartGrid,chartInk,chartPrimary,chartCategoryColor} from './ChartPrimitives';
import {chartCaption} from './koboChartLabels';
import {barValueLabel,labelInk} from './koboDataLabels';
import {chartLabel,resolveAppearance} from './koboAppearance';
import {koboChartRows,koboScreenChartRows,isDenseKoboChart,readableKoboChartType,type KoboChartPanel} from './koboChartDensity';

export function chartSpec(result:KoboChartPanel,language:string,exporting=false,themeOverride?:Theme,containerWidth=900):{data:Data[];layout:Partial<Layout>}{
 const appearance=resolveAppearance(result.appearance),shown=exporting?koboChartRows(result):koboScreenChartRows(result);
 const dense=!exporting&&isDenseKoboChart(result);
 const type=dense?'bar':readableKoboChartType(result,exporting,containerWidth);
 const horizontal=type==='bar',pie=type==='pie'||type==='donut',percentage=appearance.metric==='percent';
 const colors=shown.map(row=>markColor(result,{answer:row.id}));
 const value=(count:number,percent:number|null|undefined)=>percentage?percent??0:count;
 const theme=themeOverride||(typeof document!=='undefined'?document.documentElement.dataset.theme||'glass-light':'glass-light') as Theme;
 const ink=exporting?'#263746':chartInk(theme),grid=exporting?'#e4ebf0':chartGrid(theme),scale=exporting?2.3:1;
 const advanced=advancedChartSpec(result,language,exporting,ink,grid);if(advanced)return advanced;
 const legendPosition=appearance.legend,legendRight=legendPosition==='right',legendLeft=legendPosition==='left',legendTop=legendPosition==='top';
 const showlegend=legendPosition==='hidden'?false:legendPosition==='auto'?result.breakdowns.length>0||pie:true;
 const axis={fixedrange:true,automargin:true,gridcolor:grid,rangemode:'tozero' as const,...(appearance.grid!=='auto'?{showgrid:appearance.grid==='show'}:{})};
 const metricAxis=percentage?{ticksuffix:'%',tickformat:`.${percentageDecimals(result)}f`,title:{text:'%'}}:{};
 const font=appearance.fontSize?Math.max(dense?12:0,appearance.fontSize)*scale:exporting?28:12,width=exporting?1300:Math.max(240,containerWidth);
 const labelFont=(appearance.fontSize||14)*scale;
 const seriesCount=Math.max(1,result.breakdowns.length),stacked=appearance.bars==='stack'&&result.breakdowns.length>0;
 const categoryWidth=horizontal?Math.min(exporting?460:300,width*.38):exporting?90:55;
 const legendWidth=Math.min(width*.22,exporting?240:180);
 const left=categoryWidth+(showlegend&&legendLeft?legendWidth:0),right=showlegend&&legendRight?legendWidth:Math.max(25,labelFont*2);
 const usable=Math.max(80,width-left-right),stride=horizontal?1:Math.max(1,Math.ceil(shown.length*(font*5.5+12)/usable));
 const ticks=shown.filter((_,index)=>index%stride===0);
 const captionWidth=horizontal?categoryWidth-24:usable/Math.max(1,ticks.length)-12;
 const captions=ticks.map(row=>chartCaption(row.label,Math.min(horizontal?44:32,Math.max(5,captionWidth/(font*.57))),horizontal?5:4));
 const lines=Math.max(1,...captions.map(text=>text.split('<br>').length));
 const legendFont=appearance.fontSize?appearance.fontSize*scale:exporting?24:12;
 const legendLabels=result.breakdowns.length?result.breakdowns.map(column=>column.label):pie?shown.map(row=>row.label):[result.label];
 const legendRows=Math.max(1,Math.ceil(legendLabels.reduce((sum,label)=>sum+Math.min(width-40,label.length*legendFont*.55+55),0)/Math.max(80,width-40)));
 const legendSpace=showlegend&&!legendRight&&!legendLeft&&!legendTop?legendRows*(legendFont+12)+18:0;
 const bottom=horizontal?Math.max(45,legendSpace+28):Math.max(60,lines*font*1.3+legendSpace+24);
 const top=showlegend&&legendTop?Math.max(80,legendRows*(legendFont+12)+24):25;
 const legend:Partial<Layout['legend']>={orientation:legendRight||legendLeft?'v':'h',x:legendRight?1.03:legendLeft?-(categoryWidth+16)/usable:0,xanchor:legendLeft?'right':'left',yref:legendRight||legendLeft?'paper':'container',y:legendTop?.99:legendRight||legendLeft?1:.01,yanchor:legendTop||legendRight||legendLeft?'top':'bottom',font:{size:legendFont}};
 const band=Math.max(exporting?34:40,lines*font*1.35+14,(stacked?1:seriesCount)*(labelFont*1.5+8)/.8);
 const automaticHeight=horizontal?Math.max(exporting?650:330,shown.length*band+bottom+top):exporting?750:Math.max(360,bottom+220);
 // A requested height is a minimum for horizontal comparisons: never squeeze labels into thinner rows.
 const requestedHeight=appearance.height?Math.round(appearance.height*(exporting?1.4:1)):automaticHeight;
 const height=horizontal?Math.max(requestedHeight,automaticHeight):requestedHeight;
 const position=(row:typeof shown[number])=>!exporting&&type!=='line'?row.id:row.label;
 const categoryAxis={...(exporting||type==='line'?{}:{type:'category' as const,categoryorder:'array' as const,categoryarray:shown.map(position)}),tickmode:'array' as const,tickvals:ticks.map(position),ticktext:captions,tickangle:0,ticklabelposition:'outside' as const,ticklabelstandoff:horizontal?10:6};
 const labelMode=appearance.labels==='auto'?(percentage?'percent':'count'):appearance.labels,visibleLabels=appearance.labels!=='hidden';
 const maximum=Math.max(result.chartMaximum||0,...shown.map(row=>result.breakdowns.length?(stacked?row.series?.reduce((sum,entry)=>sum+value(entry.count,entry.percent),0)||0:Math.max(0,...(row.series||[]).map(entry=>value(entry.count,entry.percent)))):value(row.count,row.percent)));
 const plotHeight=Math.max(80,height-bottom-top);
 const thickness=(horizontal?plotHeight:usable)/Math.max(1,shown.length)/(stacked?1:seriesCount)*.8;
 const pieTotal=shown.reduce((sum,row)=>sum+value(row.count,row.percent),0);
 const decimals=percentageDecimals(result);
 const hoverNumber=new Intl.NumberFormat(language,{maximumFractionDigits:2});
 const hoverText=(label:string,count:number|undefined,percent:number|null|undefined,breakdown?:string)=>
  `<b>${chartCaption(label,42,4)}</b>${breakdown?`<br>${chartCaption(breakdown,48,4)}`:''}<br>${language==='ar'?'# العدد':'# Count'}: <b>${count===undefined?'-':hoverNumber.format(count)}</b><br>${language==='ar'?'% النسبة':'% Share'}: <b>${formatPercent(percent,decimals,language)}</b>`;
 const data:Data[]=[];
 if(pie){
  data.push({type:'pie',labels:shown.map(row=>row.label),values:shown.map(row=>value(row.count,row.percent)),hole:type==='donut'?.55:0,marker:{colors},sort:false,
   textinfo:appearance.labels==='hidden'?'none':'text',text:shown.map(row=>appearance.labels==='auto'?(pieTotal&&value(row.count,row.percent)/pieTotal>=.035?`${chartCaption(row.label,24,2)}<br>${chartLabel(row.count,displayPercent(row),labelMode,language,decimals)}`:''):chartLabel(row.count,displayPercent(row),labelMode,language,decimals)),textposition:'auto',automargin:true,textfont:{size:labelFont,weight:700},insidetextfont:{color:colors.map(labelInk),size:labelFont,weight:700},outsidetextfont:{color:ink,size:labelFont,weight:700},
   customdata:shown.map(row=>[row.count,row.percent==null?'-':`${row.percent}%`,row.label,row.id,null]),hovertext:shown.map(row=>hoverText(row.label,row.count,displayPercent(row))),hovertemplate:'%{hovertext}<extra></extra>'} as unknown as Data);
 }else{
  const series=result.breakdowns.length?result.breakdowns:[{id:'',label:''}],indexed=shown.map(row=>new Map(row.series?.map(entry=>[entry.id,entry])));
  series.forEach(column=>{
   const entries=shown.map((row,index)=>column.id?indexed[index].get(column.id):row),values=entries.map(entry=>entry?value(entry.count,entry.percent):0);
   const labels=entries.map((entry,index)=>entry&&(appearance.labels!=='auto'||values[index]>0)?chartLabel(entry.count,displayPercent(entry),labelMode,language,decimals):'');
   const placed=labels.map((text,index)=>barValueLabel(text,values[index],maximum,(horizontal?usable:plotHeight)*.88,thickness,labelFont,horizontal,stacked));
   const fill=shown.map(row=>markColor(result,{answer:row.id,...(column.id?{breakdown:column.id}:{})}));
   const contrast=Array.isArray(fill)?fill.map(labelInk):labelInk(fill);
   data.push({type:type==='line'?'scatter':'bar',mode:type==='line'?visibleLabels?'text+lines+markers':'lines+markers':undefined,name:column.label||result.label,orientation:horizontal?'h':undefined,
    x:horizontal?values:shown.map(position),y:horizontal?shown.map(position):values,text:visibleLabels?(type==='line'?labels.map((text,index)=>appearance.labels==='auto'&&index%Math.max(stride,Math.ceil(shown.length*labelFont*4/usable))!==0?'':text):placed.map(label=>label.text)):undefined,textposition:type==='line'?'top center':visibleLabels?placed.map(label=>label.position):'none',cliponaxis:false,
    ...(type!=='line'?{insidetextanchor:'end' as const,insidetextfont:{color:contrast,size:labelFont,weight:700},outsidetextfont:{color:ink,size:labelFont,weight:700},textangle:0,constraintext:'none' as const}:{textfont:{color:ink,size:labelFont,weight:700}}),
    marker:{color:fill},line:{color:result.colors[column.id||'series']||(column.id?chartCategoryColor(column.id):chartPrimary)},
    customdata:entries.map((entry,index)=>[entry?.count??0,entry?.percent==null?'-':`${entry.percent}%`,shown[index].label,shown[index].id,column.id||null]),hovertext:entries.map((entry,index)=>hoverText(shown[index].label,entry?.count,displayPercent(entry),column.id?column.label:undefined)),hovertemplate:'%{hovertext}<extra></extra>'} as unknown as Data); // Plotly supports per-point positions and font colors beyond the bundled TS declarations.
  });
 }
 return {data,layout:{height,autosize:true,dragmode:false,
  hovermode:'closest',hoverlabel:{bgcolor:'#17324d',bordercolor:'#577997',font:{family:'Segoe UI, Arial, sans-serif',size:13,color:'#ffffff'},align:'left',namelength:0},
  paper_bgcolor:exporting?'#ffffff':'transparent',plot_bgcolor:exporting?'#ffffff':'transparent',font:{family:language==='ar'?'Noto Naskh Arabic, Segoe UI, sans-serif':'DM Sans, Segoe UI, sans-serif',color:ink,size:font},
  margin:{l:left,r:right,t:top,b:bottom},
  xaxis:{...axis,...(horizontal?{...metricAxis,...(visibleLabels&&maximum>0?{range:[0,maximum*1.14]}:{})}:categoryAxis)},yaxis:{...axis,autorange:horizontal?'reversed':visibleLabels&&type!=='line'&&maximum>0?false:true,...(!horizontal?{...metricAxis,...(visibleLabels&&type!=='line'&&maximum>0?{range:[0,maximum*1.14]}:{})}:categoryAxis)},barmode:appearance.bars,bargap:type==='histogram'?0:.2,bargroupgap:type==='histogram'?0:.04,showlegend,legend}};
}

export function withoutKoboChartGrid(spec:{data:Data[];layout:Partial<Layout>}){return {...spec,layout:{...spec.layout,...Object.fromEntries((['xaxis','yaxis'] as const).map(key=>[key,{...spec.layout[key],showgrid:false,zeroline:false,minor:{showgrid:false}}]))}}}
