import {singlePeriodTrendNotice} from './koboAdvancedChartSpec';
import KoboMarkColorPicker,{type KoboMarkEdit} from './KoboMarkColorPicker';
import {editMarkColor,markColor,markTargetFromPoint,resultWithColors,type KoboMarkTarget} from './koboMarkColors';
import {normalizeHex} from './koboCustomizeOptions';
import {koboScreenChartRows,koboScreenChartPage,isDenseKoboChart} from './koboChartDensity';
import './koboDenseChart.css';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {useKoboTheme,useScheduledKoboChart} from './KoboRendering';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from './plotlyEngine';
import {chartSpec,withoutKoboChartGrid} from './koboChartSpec';
import {readableKoboChartType} from './koboChartDensity';
export {chartSpec} from './koboChartSpec';
import type {KoboQuestionSettings,KoboResult} from './koboTypes';
import {downloadBlob} from './koboApi';
import {chartCategoryColor} from './ChartPrimitives';
import {KoboChartSkeleton,KoboChartFailure,KoboChartBoundary} from './KoboChartLoading';

const Plot=createPlotlyComponent(Plotly);
const config={displayModeBar:false,responsive:true,scrollZoom:false,doubleClick:false} as const;

export const koboColor=chartCategoryColor;
export async function koboChartImage(result:KoboResult,language:string,format:'png'|'svg'='png',signal?:AbortSignal,hideGrid=false){
 signal?.throwIfAborted();
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:1300px';document.body.appendChild(host);
 const cleanup=()=>{Plotly.purge(host);host.remove()};
 signal?.addEventListener('abort',cleanup,{once:true});
 try{const original=chartSpec(result,language,true),spec=hideGrid?withoutKoboChartGrid(original):original,width=Number(spec.layout.width)||1300;await Plotly.newPlot(host,spec.data,{...spec.layout,width,height:spec.layout.height||750,autosize:false},{staticPlot:true});signal?.throwIfAborted();const image=await Plotly.toImage(host,{format,width,height:Number(spec.layout.height)||750,scale:2});signal?.throwIfAborted();return image}finally{signal?.removeEventListener('abort',cleanup);cleanup()}
}
export async function downloadKoboPng(result:KoboResult,language:string){const url=await koboChartImage(result,language,'png',undefined,true);downloadBlob(await(await fetch(url)).blob(),`${result.name}.png`)}
function KoboChart({result:sourceResult,language,showLegend=true,colorSettings,onColorApply}:{result:KoboResult;language:string;showLegend?:boolean;colorSettings?:KoboQuestionSettings;onColorApply?:(target:KoboMarkTarget,color:string|null)=>void}){
 const allRows=useMemo(()=>koboScreenChartRows(sourceResult),[sourceResult]);
 const[pageSelection,setPageSelection]=useState({source:sourceResult,page:0});
 const paging=useMemo(()=>koboScreenChartPage(sourceResult,allRows,pageSelection.source===sourceResult?pageSelection.page:0),[sourceResult,allRows,pageSelection]);
 const result=paging.result;
 const[edit,setEdit]=useState<KoboMarkEdit|null>(null);
 const theme=useKoboTheme();
 const{host,active,height,complete,retry,attempt}=useScheduledKoboChart(result.denominator>0);
 const[failed,setFailed]=useState(false),[loadedSpec,setLoadedSpec]=useState<unknown>(null);
 useEffect(()=>{setFailed(false)},[result]);
 useEffect(()=>{if(!active)setLoadedSpec(null)},[active]);
 const resolved=useMemo(()=>active&&colorSettings?resultWithColors(result,colorSettings,theme):result,[active,result,colorSettings,theme]);
 const rows=koboScreenChartRows(result),dense=isDenseKoboChart(result),editable=Boolean(colorSettings&&onColorApply&&rows.length&&result.chart!=='heatmap'&&!result.trend);
 const openColor=(target:KoboMarkTarget,anchor?:{x:number;y:number})=>{const box=host.current?.getBoundingClientRect();host.current?.focus({preventScroll:true});setEdit({target,hex:markColor(resolved,target,theme),anchor:anchor||{x:box?.left||12,y:box?.bottom||12}})};
 useEffect(()=>{if(edit&&(!rows.some(row=>row.id===edit.target.answer)||edit.target.breakdown!==undefined&&!result.breakdowns.some(column=>column.id===edit.target.breakdown)))setEdit(null)},[result]);
 const shown=useMemo(()=>edit&&edit.value!==undefined&&colorSettings?resultWithColors(result,editMarkColor(result,colorSettings,edit.target,edit.value),theme):resolved,[result,resolved,colorSettings,edit,theme]);
 const[width,setWidth]=useState(900);
 const lastLayoutHeight=useRef(0);
 useEffect(()=>{const viewport=host.current?.querySelector('.kobo-chart-viewport');if(viewport)viewport.scrollTop=0;setEdit(null)},[result]);
 useEffect(()=>{
  const node=host.current;if(!node||!active)return;
  let frame=0;
  const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const next=Math.round(node.getBoundingClientRect().width/16)*16;if(next>0)setWidth(current=>current===next?current:next)})};
  const observer=new ResizeObserver(measure);observer.observe(node);measure();
  return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[active,host]);
 const spec=useMemo(()=>{if(!active)return null;const value=chartSpec(shown,language,false,theme,width);return showLegend?value:{...value,layout:{...value.layout,showlegend:false}}},[active,shown,language,theme,showLegend,width]);
 if(spec)lastLayoutHeight.current=Number(spec.layout.height)||330;
 const chartHeight=lastLayoutHeight.current||height||(dense?640:330),reserved=Math.min(dense?640:720,chartHeight);
 return <div className={`kobo-chart${dense?' is-dense':''}`} data-dense={dense} ref={host} style={{minHeight:result.denominator&&!dense?(active?reserved:Math.max(height,reserved)):330}} data-color-editable={editable} tabIndex={editable?0:undefined} role={editable?'group':undefined} aria-label={editable?`Chart for ${result.label}. Press Enter to edit a chart color.`:undefined} onKeyDown={event=>{if(editable&&event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();openColor({answer:rows[0].id,...(result.breakdowns.length?{breakdown:result.breakdowns[0].id}:{})})}}}
 data-chart-active={active&&result.denominator>0?'true':'false'}>{result.chart==='line'&&result.trend&&<small role="status">{language==='ar'?`استجابات بلا تاريخ صالح: ${result.trend.excluded}`:`Responses excluded for missing or invalid dates: ${result.trend.excluded}`}</small>}{singlePeriodTrendNotice(result,language)&&<p role="status">{singlePeriodTrendNotice(result,language)}</p>}{paging.paged&&<div className="kobo-chart-paging" aria-label="Chart categories"><span role="status">Showing categories {(paging.start+1).toLocaleString(language)}-{paging.end.toLocaleString(language)} of {paging.total.toLocaleString(language)}</span><div><button type="button" className="soft" aria-label="First chart categories" disabled={paging.page===0} onClick={()=>setPageSelection({source:sourceResult,page:0})}>First</button><button type="button" className="soft" aria-label="Previous chart categories" disabled={paging.page===0} onClick={()=>setPageSelection({source:sourceResult,page:paging.page-1})}>Previous</button><span>Page {paging.page+1} of {paging.pages}</span><button type="button" className="soft" aria-label="Next chart categories" disabled={paging.page===paging.pages-1} onClick={()=>setPageSelection({source:sourceResult,page:paging.page+1})}>Next</button><button type="button" className="soft" aria-label="Last chart categories" disabled={paging.page===paging.pages-1} onClick={()=>setPageSelection({source:sourceResult,page:paging.pages-1})}>Last</button></div></div>}{dense&&!paging.paged&&result.denominator>0&&<div className="kobo-chart-status" role="status">{language==='ar'?`عرض جميع الفئات (${rows.length.toLocaleString(language)}) · من الأكبر إلى الأصغر`:`Showing all ${rows.length.toLocaleString(language)} categories · Largest first`}<small>{language==='ar'?'مرّر لرؤية جميع الفئات':'Scroll to see every category'}</small></div>}{!result.denominator?<div className="kobo-empty">{'No answered responses under the current filters.'}</div>:failed?<KoboChartFailure onRetry={()=>{setFailed(false);setLoadedSpec(null);retry()}}/>:active&&spec?<KoboChartBoundary key={attempt} onFailure={complete}><div className={dense?'kobo-chart-viewport is-dense':'kobo-chart-viewport'} style={dense?undefined:{maxHeight:720,overflowY:'auto',overflowX:result.chart==='heatmap'?'auto':'hidden'}} tabIndex={dense||chartHeight>720||result.chart==='heatmap'?0:undefined} role={dense||result.chart==='heatmap'?'region':undefined} aria-label={dense||chartHeight>720||result.chart==='heatmap'?(language==='ar'?'رسم بياني قابل للتمرير، جميع الفئات':'Scrollable chart, all categories'):undefined}>{loadedSpec!==spec&&<div className="kobo-chart-loading-overlay"><KoboChartSkeleton height={reserved}/></div>}<Plot onClick={editable?event=>{const target=markTargetFromPoint(result,event.points[0]?.customdata);if(target)openColor(target,{x:event.event.clientX,y:event.event.clientY})}:undefined} data={spec.data} layout={spec.layout} config={config} useResizeHandler onInitialized={()=>{setLoadedSpec(spec);complete()}} onUpdate={()=>{setLoadedSpec(spec);complete()}} onError={()=>{setFailed(true);complete()}} style={{width:'100%',minWidth:result.chart==='heatmap'?Math.max(400,result.breakdowns.length*130+280):undefined,height:chartHeight,minHeight:chartHeight,flexShrink:0}}/></div></KoboChartBoundary>:dense?<div className="kobo-chart-viewport is-dense"><KoboChartSkeleton height="100%"/></div>:<KoboChartSkeleton height={Math.max(330,Math.min(720,height||330))}/>}{!dense&&readableKoboChartType(result,false,width)!==result.chart&&<small>Shown as horizontal bars to keep categories and values readable.</small>}{result.chart==='heatmap'&&<small>{language==='ar'?'مرّر أفقياً لرؤية جميع فئات التقسيم.':'Scroll horizontally to see every breakdown.'}</small>}{!dense&&chartHeight>720&&<small>Scroll within the chart to see all categories.</small>}{!paging.paged&&!dense&&result.kind==='text'&&result.rows.length>20&&<small>Chart shows the 20 most frequent responses. All answers remain in the table.</small>}{edit&&colorSettings&&onColorApply&&<KoboMarkColorPicker result={result} settings={colorSettings} edit={edit} onClose={()=>setEdit(null)} onTarget={target=>setEdit(current=>current?{...current,target,value:undefined,hex:markColor(resolved,target,theme)}:null)} onColor={hex=>setEdit(current=>current?{...current,hex,...(normalizeHex(hex)?{value:normalizeHex(hex)!}:{})}:null)} onReset={()=>{const reset=resultWithColors(result,editMarkColor(result,colorSettings,edit.target,null));setEdit({...edit,value:null,hex:markColor(reset,edit.target,theme)})}} onApply={()=>{if(edit.value!==undefined){onColorApply(edit.target,edit.value);setEdit(null)}}}/>}</div>;
}
export default memo(KoboChart);
