import {isDenseKoboChart} from './koboChartDensity';
import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import type {KoboResult} from './koboTypes';
import type {Theme} from './types';
import {KoboRenderScheduler} from './koboRenderScheduler';
import './koboRendering.css';

const SchedulerContext=createContext<KoboRenderScheduler|null>(null);
const ThemeContext=createContext<Theme>('glass-light');

export function KoboRendering({children,enabled=true}:{children:ReactNode;enabled?:boolean}){
 const[scheduler]=useState(()=>new KoboRenderScheduler());
 const[theme,setTheme]=useState(()=>(document.documentElement.dataset.theme||'glass-light') as Theme);
 useEffect(()=>{
  const observer=new MutationObserver(()=>setTheme((document.documentElement.dataset.theme||'glass-light') as Theme));
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return()=>{observer.disconnect();scheduler.dispose()};
 },[scheduler]);
 return <ThemeContext.Provider value={theme}><SchedulerContext.Provider value={enabled?scheduler:null}>{children}</SchedulerContext.Provider></ThemeContext.Provider>;
}
export const useKoboTheme=()=>useContext(ThemeContext);

export function useScheduledKoboChart(enabled=true){
 const scheduler=useContext(SchedulerContext),host=useRef<HTMLDivElement>(null);
 const[active,setActive]=useState(false),[height,setHeight]=useState(0);
 useEffect(()=>{setActive(false);const node=host.current;if(!node||!enabled)return;if(!scheduler){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setActive(true);observer.disconnect()}},{rootMargin:'400px'});observer.observe(node);return()=>observer.disconnect()}return scheduler.register(node,'chart',setActive)},[scheduler,enabled]);
 useEffect(()=>{
  const node=host.current;if(!node||!active)return;
  const observer=new ResizeObserver(entries=>{const next=entries[0]?.contentRect.height;if(next>0)setHeight(current=>Math.abs(current-next)>1?next:current)});
  observer.observe(node);return()=>observer.disconnect();
 },[active]);
 const complete=()=>{if(host.current)scheduler?.complete(host.current)};
 return{host,active,height,complete};
}

export function estimatedQuestionHeight(result:KoboResult,width:number,tableOnly=false){
 const shown=result.kind==='text'?Math.min(20,result.rows.length):result.rows.length;
 const type=result.breakdowns.length&&['pie','donut'].includes(result.chart)?'bar':result.chart;
 const dense=isDenseKoboChart(result);
 const chart=dense?700:result.denominator?Math.max(330,type==='bar'?Math.min(900,shown*30+70):360):330;
 const table=Math.min(640,Math.min(30,result.rows.length)*44+(result.breakdowns.length?Math.max(1,result.breakdownFields?.length||1)+1:1)*33+44);
 return 180+(tableOnly?table:dense||result.breakdowns.length||width<=1000?table+chart:Math.max(table,chart));
}

/** Keep a question's table mounted once visited, so sort and local scroll state survive. */
export function KoboDeferredQuestion({question,eager=false,children,tableOnly=false}:{question:KoboResult;eager?:boolean;children:ReactNode;tableOnly?:boolean}){
 const scheduler=useContext(SchedulerContext),host=useRef<HTMLDivElement>(null),focusRequested=useRef(false);
 const[ready,setReady]=useState(eager||!scheduler);
 const estimate=estimatedQuestionHeight(question,window.innerWidth,tableOnly);
 useEffect(()=>{const node=host.current;if(!node||ready||!scheduler)return;return scheduler.register(node,'question',setReady)},[scheduler,ready]);
 useLayoutEffect(()=>{const node=host.current;if(ready&&focusRequested.current){focusRequested.current=false;node?.querySelector<HTMLElement>('button,a,input')?.focus({preventScroll:true})}},[ready]);
 if(!scheduler)return <>{children}</>;
 return <div ref={host} className={`kobo-deferred-question${ready?' is-ready':''}`} style={{'--question-estimate':`${estimate}px`} as CSSProperties} tabIndex={ready?-1:0} aria-label={ready?undefined:question.label} onFocus={event=>{if(!ready&&event.target===event.currentTarget){focusRequested.current=true;setReady(true)}}} data-question-id={question.id}>
  {ready?children:<div className="kobo-question-placeholder glass" style={{height:estimate}} aria-hidden="true"><span>{question.name}</span><strong>{question.label}</strong><div/></div>}
 </div>;
}
