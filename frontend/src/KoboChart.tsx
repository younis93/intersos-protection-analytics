import {singlePeriodTrendNotice} from './koboAdvancedChartSpec';
import KoboMarkColorPicker,{type KoboMarkEdit} from './KoboMarkColorPicker';
import {activeAllBarsColor,editMarkColor,markColor,markTargetFromPoint,resultWithColors,type KoboMarkTarget} from './koboMarkColors';
import {normalizeHex} from './koboCustomizeOptions';
import {koboScreenChartRows,koboScreenChartPage,isDenseKoboChart,projectKoboChart} from './koboChartDensity';
import './koboDenseChart.css';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {useKoboTheme,useScheduledKoboChart} from './KoboRendering';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from './plotlyEngine';
import {chartImageSpec,chartSpec,fixedChartImageSpec,type KoboChartImageView} from './koboChartSpec';
import {fixedChartWidth} from './koboAppearance';
export {chartSpec} from './koboChartSpec';
import type {KoboQuestionSettings,KoboResult} from './koboTypes';
import {downloadBlob} from './koboApi';
import {chartCategoryColor} from './ChartPrimitives';
import {KoboChartSkeleton,KoboChartFailure,KoboChartBoundary} from './KoboChartLoading';

const Plot=createPlotlyComponent(Plotly);
const config={displayModeBar:false,responsive:true,scrollZoom:false,doubleClick:false} as const;

export const koboColor=chartCategoryColor;
const maxImageSide=16384,maxImageArea=32_000_000;
async function renderChartImage(spec:ReturnType<typeof chartSpec>,format:'png'|'svg',scale:number,signal?:AbortSignal){
 signal?.throwIfAborted();
 const width=Number(spec.layout.width)||1300,height=Number(spec.layout.height)||750;
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:1300px';document.body.appendChild(host);
 const cleanup=()=>{Plotly.purge(host);host.remove()};
 signal?.addEventListener('abort',cleanup,{once:true});
 try{
  await document.fonts?.ready;
  signal?.throwIfAborted();
  await Plotly.newPlot(host,spec.data,{...spec.layout,width,height,autosize:false},{staticPlot:true});
  signal?.throwIfAborted();
  const image=await Plotly.toImage(host,{format,width,height,scale});
  signal?.throwIfAborted();
  return image;
 }finally{signal?.removeEventListener('abort',cleanup);cleanup()}
}

export async function koboChartImage(result:KoboResult,language:string,format:'png'|'svg'='png',signal?:AbortSignal,view?:KoboChartImageView){
 signal?.throwIfAborted();
 const fixed=format==='png'?fixedChartWidth(result.appearance):undefined;
 if(fixed){
  const spec=view?.rendered?chartImageSpec(result,language,view):fixedChartImageSpec(result,language)!;
  const height=Math.ceil(Number(spec.layout.height)||750);
  if(height>maxImageSide||fixed*height>maxImageArea)
   throw new Error(language==='ar'?'الصورة طويلة جدًا. قلّل عدد الإجابات ثم حاول مجددًا.':'This chart is too tall for a single image. Filter the answers and try again.');
  return renderChartImage(spec,'png',1,signal);
 }
 const spec=view?chartImageSpec(result,language,view):chartSpec(result,language,true);
 const width=Number(spec.layout.width)||1300,height=Number(spec.layout.height)||750;
 const scale=format==='svg'?2:Math.min(view?1:2,maxImageSide/Math.max(width,height),Math.sqrt(maxImageArea/(width*height)));
 return renderChartImage(spec,format,scale,signal);
}
export async function downloadKoboPng(result:KoboResult,language:string,view:KoboChartImageView={width:900,page:0}){
 const url=await koboChartImage(result,language,'png',undefined,view);
 downloadBlob(await(await fetch(url)).blob(),`${result.name}.png`);
}
function KoboChart({result:sourceResult,language,showLegend=true,colorSettings,onColorApply,inline=false}:{result:KoboResult;language:string;showLegend?:boolean;inline?:boolean;colorSettings?:KoboQuestionSettings;onColorApply?:(target:KoboMarkTarget,color:string|null)=>void}){
 const fullResult=useMemo(()=>projectKoboChart(sourceResult),[sourceResult]);
 const allRows=useMemo(()=>koboScreenChartRows(fullResult),[fullResult]);
 const fixedWidth=fixedChartWidth(sourceResult.appearance);
 const[pageSelection,setPageSelection]=useState({source:sourceResult,page:0});
 const paging=useMemo(()=>koboScreenChartPage(fullResult,allRows,pageSelection.source===sourceResult?pageSelection.page:0),[fullResult,sourceResult,allRows,pageSelection]);
 const result=paging.result;
 const[edit,setEdit]=useState<KoboMarkEdit|null>(null);
 const theme=useKoboTheme();
 const{host,active,height,complete,retry,attempt}=useScheduledKoboChart(result.denominator>0,inline);
 const[failed,setFailed]=useState(false),[loadedSpec,setLoadedSpec]=useState<unknown>(null);
 useEffect(()=>{setFailed(false)},[result]);
 useEffect(()=>{if(!active)setLoadedSpec(null)},[active]);
 const colorized=useMemo(()=>active&&colorSettings?resultWithColors(fullResult,colorSettings,theme):fullResult,[active,fullResult,colorSettings,theme]);
 const resolved=useMemo(()=>({...result,colors:colorized.colors,pointColors:colorized.pointColors,allBarsColor:colorized.allBarsColor}),[result,colorized]);
 const rows=koboScreenChartRows(result),dense=isDenseKoboChart(result),editable=Boolean(colorSettings&&onColorApply&&rows.length&&result.chart!=='heatmap'&&!result.trend&&!result.stackedAnswers&&!activeAllBarsColor(resolved));
 const openColor=(target:KoboMarkTarget,anchor?:{x:number;y:number})=>{const box=host.current?.getBoundingClientRect();host.current?.focus({preventScroll:true});setEdit({target,hex:markColor(resolved,target,theme),anchor:anchor||{x:box?.left||12,y:box?.bottom||12}})};
 useEffect(()=>{if(edit&&(!rows.some(row=>row.id===edit.target.answer)||edit.target.breakdown!==undefined&&!result.breakdowns.some(column=>column.id===edit.target.breakdown)))setEdit(null)},[result]);
 const shown=useMemo(()=>{
  if(!edit||edit.value===undefined||!colorSettings)return resolved;
  const recolored=resultWithColors(fullResult,editMarkColor(result,colorSettings,edit.target,edit.value),theme);
  return {...resolved,colors:recolored.colors,pointColors:recolored.pointColors};
 },[fullResult,result,resolved,colorSettings,edit,theme]);
 const[width,setWidth]=useState(900);
 useEffect(()=>{const resume=()=>{const node=host.current?.querySelector<HTMLElement>('.js-plotly-plot');if(active&&node)void Plotly.Plots.resize(node)};window.addEventListener('analysis-resume',resume);return()=>window.removeEventListener('analysis-resume',resume)},[active]);
 const lastLayoutHeight=useRef(0);
 useEffect(()=>{const viewport=host.current?.querySelector('.kobo-chart-viewport');if(viewport)viewport.scrollTop=0;setEdit(null)},[result]);
 useEffect(()=>{
  const node=host.current;if(!node||!active)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let measuredWidth=Math.round(node.getBoundingClientRect().width/16)*16;
  if(measuredWidth>0)setWidth(measuredWidth);
  const observer=new ResizeObserver(()=>{
   const next=Math.round(node.getBoundingClientRect().width/16)*16;
   if(next<=0||next===measuredWidth)return;
   measuredWidth=next;
   clearTimeout(timer);
   // Plotly resizes the existing plot. Rebuild the width-dependent spec after
   // the window settles so dragging does not repeatedly rebuild chart data.
   timer=setTimeout(()=>setWidth(next),120);
  });
  observer.observe(node);
  return()=>{observer.disconnect();clearTimeout(timer)};
 },[active,host]);
 const renderWidth=fixedWidth??width;
 const spec=useMemo(()=>{if(!active)return null;const value=chartSpec(shown,language,false,theme,renderWidth);return showLegend?value:{...value,layout:{...value.layout,showlegend:false}}},[active,shown,language,theme,showLegend,renderWidth]);
 if(spec)lastLayoutHeight.current=Number(spec.layout.height)||330;
 const chartHeight=lastLayoutHeight.current||height||(dense?640:330),reserved=Math.min(dense?640:720,chartHeight);
 const rangeText=(paging.start+1).toLocaleString(language)+'-'+paging.end.toLocaleString(language);
 const scrollLabel=language==='ar'?'رسم بياني قابل للتمرير':'Scrollable chart';
 const canScroll=!!fixedWidth||dense||chartHeight>720||result.chart==='heatmap'||result.chart==='column';
 return <div className={`kobo-chart${dense?' is-dense':''}`} data-dense={dense} data-chart-width={active?renderWidth:undefined} data-chart-page={paging.page} ref={host} style={{minHeight:result.denominator&&!dense?(active?reserved:Math.max(height,reserved)):330}} data-color-editable={editable} tabIndex={editable?0:undefined} role={editable?'group':undefined} aria-label={editable?`Chart for ${result.label}. Press Enter to edit a chart color.`:undefined} onKeyDown={event=>{if(editable&&event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();openColor({answer:rows[0].id,...(result.breakdowns.length?{breakdown:result.breakdowns[0].id}:{})})}}}
 data-chart-active={active&&result.denominator>0?'true':'false'}>{!result.stackedAnswers&&sourceResult.chartProjection&&!sourceResult.chartProjection.axisOrder&&<p role="status">Top {sourceResult.chartProjection.topNShown} of {sourceResult.chartProjection.topNTotal}{sourceResult.chartProjection.topNOther?' · Other combines remaining answers':''}</p>}{result.chart==='line'&&result.trend&&<small role="status">{language==='ar'?`استجابات بلا تاريخ صالح: ${result.trend.excluded}`:`Responses excluded for missing or invalid dates: ${result.trend.excluded}`}</small>}{singlePeriodTrendNotice(result,language)&&<p role="status">{singlePeriodTrendNotice(result,language)}</p>}{paging.paged&&<div className="kobo-chart-paging" aria-label="Chart categories"><span role="status">Showing categories {rangeText} of {paging.total.toLocaleString(language)}</span><div><button type="button" className="soft" aria-label="First chart categories" disabled={paging.page===0} onClick={()=>setPageSelection({source:sourceResult,page:0})}>First</button><button type="button" className="soft" aria-label="Previous chart categories" disabled={paging.page===0} onClick={()=>setPageSelection({source:sourceResult,page:paging.page-1})}>Previous</button><span>Page {paging.page+1} of {paging.pages}</span><button type="button" className="soft" aria-label="Next chart categories" disabled={paging.page===paging.pages-1} onClick={()=>setPageSelection({source:sourceResult,page:paging.page+1})}>Next</button><button type="button" className="soft" aria-label="Last chart categories" disabled={paging.page===paging.pages-1} onClick={()=>setPageSelection({source:sourceResult,page:paging.pages-1})}>Last</button></div></div>}{dense&&!paging.paged&&result.denominator>0&&<div className="kobo-chart-status" role="status">{language==='ar'?`عرض جميع الفئات (${rows.length.toLocaleString(language)})`:`Showing all ${rows.length.toLocaleString(language)} categories`}<small>{language==='ar'?'مرّر لرؤية جميع الفئات':'Scroll to see every category'}</small></div>}{!result.denominator?<div className="kobo-empty">{'No answered responses under the current filters.'}</div>:failed?<KoboChartFailure onRetry={()=>{setFailed(false);setLoadedSpec(null);retry()}}/>:active&&spec?<KoboChartBoundary key={attempt} onFailure={complete}><div className={dense?'kobo-chart-viewport is-dense':'kobo-chart-viewport'} style={dense?{overflowX:fixedWidth?'auto':undefined}:{maxHeight:inline?undefined:720,overflowY:inline?'hidden':'auto',overflowX:canScroll?'auto':'hidden'}} tabIndex={canScroll?0:undefined} role={canScroll?'region':undefined} aria-label={canScroll?scrollLabel:undefined}>{loadedSpec!==spec&&<div className="kobo-chart-loading-overlay"><KoboChartSkeleton height={reserved}/></div>}<Plot onClick={editable?event=>{const target=markTargetFromPoint(result,event.points[0]?.customdata);if(target)openColor(target,{x:event.event.clientX,y:event.event.clientY})}:undefined} data={spec.data} layout={spec.layout} config={config} useResizeHandler onInitialized={()=>{setLoadedSpec(spec);complete()}} onUpdate={()=>{setLoadedSpec(spec);complete()}} onError={()=>{setFailed(true);complete()}} style={{width:fixedWidth??'100%',marginInline:fixedWidth?'auto':undefined,minWidth:spec.layout.width?Number(spec.layout.width):result.chart==='heatmap'?Math.max(400,result.breakdowns.length*130+280):undefined,height:chartHeight,minHeight:chartHeight,flexShrink:0}}/></div></KoboChartBoundary>:dense?<div className="kobo-chart-viewport is-dense"><KoboChartSkeleton height="100%"/></div>:<KoboChartSkeleton height={Math.max(330,Math.min(720,height||330))}/>}{result.chart==='heatmap'&&<small>{language==='ar'?'مرّر أفقياً لرؤية جميع فئات التقسيم.':'Scroll horizontally to see every breakdown.'}</small>}{!inline&&!dense&&chartHeight>720&&<small>Scroll within the chart to see all categories.</small>}{!paging.paged&&!dense&&result.kind==='text'&&result.rows.length>20&&<small>Chart shows the first 20 responses in the selected order. All answers remain in the table.</small>}{edit&&colorSettings&&onColorApply&&<KoboMarkColorPicker result={result} settings={colorSettings} edit={edit} onClose={()=>setEdit(null)} onTarget={target=>setEdit(current=>current?{...current,target,value:undefined,hex:markColor(resolved,target,theme)}:null)} onColor={hex=>setEdit(current=>current?{...current,hex,...(normalizeHex(hex)?{value:normalizeHex(hex)!}:{})}:null)} onReset={()=>{const reset=resultWithColors(fullResult,editMarkColor(result,colorSettings,edit.target,null),theme);setEdit({...edit,value:null,hex:markColor(reset,edit.target,theme)})}} onApply={()=>{if(edit.value!==undefined){onColorApply(edit.target,edit.value);setEdit(null)}}}/>}</div>;
}
export default memo(KoboChart);
