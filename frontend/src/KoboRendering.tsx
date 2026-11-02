import {isDenseKoboChart} from './koboChartDensity';
import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode,type Dispatch,type SetStateAction} from 'react';
import type {KoboResult} from './koboTypes';
import type {Theme} from './types';
import {KoboRenderScheduler} from './koboRenderScheduler';
import './koboRendering.css';

const SchedulerContext=createContext<KoboRenderScheduler|null>(null);
const CardStoresContext=createContext<Map<string,Map<string,unknown>>|null>(null);
export const retainedKoboCards=new Map<string,Map<string,Map<string,unknown>>>();
const RetainedContext=createContext<Map<string,unknown>|null>(null);
/** UI state belongs to the field host, which survives card eviction. */
export function useRetainedKoboState<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
 const store=useContext(RetainedContext);
 const[value,setValue]=useState<T>(()=>store?.has(key)?store.get(key) as T:initial);
 const update:Dispatch<SetStateAction<T>>=next=>setValue(current=>{const value=typeof next==='function'?(next as (value:T)=>T)(current):next;store?.set(key,value);return value});
 return[value,update];
}
export const useKoboCardState=()=>useContext(RetainedContext);
const ThemeContext=createContext<Theme>('glass-light');

export function KoboRendering({children,enabled=true,scope=''}:{children:ReactNode;enabled?:boolean;scope?:string}){
 const[stores]=useState(()=>{if(!scope)return new Map<string,Map<string,unknown>>();let store=retainedKoboCards.get(scope);if(!store){store=new Map();retainedKoboCards.set(scope,store)}return store});
 const[scheduler]=useState(()=>new KoboRenderScheduler());
 const[theme,setTheme]=useState(()=>(document.documentElement.dataset.theme||'glass-light') as Theme);
 useEffect(()=>{
  const resume=()=>scheduler.resume();window.addEventListener('analysis-resume',resume);
  const observer=new MutationObserver(()=>setTheme((document.documentElement.dataset.theme||'glass-light') as Theme));
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return()=>{window.removeEventListener('analysis-resume',resume);observer.disconnect();scheduler.dispose()};
 },[scheduler]);
 return <CardStoresContext.Provider value={stores}><ThemeContext.Provider value={theme}><SchedulerContext.Provider value={enabled?scheduler:null}>{children}</SchedulerContext.Provider></ThemeContext.Provider></CardStoresContext.Provider>;
}
export const useKoboTheme=()=>useContext(ThemeContext);

export function useScheduledKoboChart(enabled=true){
 const scheduler=useContext(SchedulerContext),host=useRef<HTMLDivElement>(null);
 const[active,setActive]=useState(false),[height,setHeight]=useState(0);
 const[attempt,setAttempt]=useState(0);
 useEffect(()=>{setActive(false);const node=host.current;if(!node||!enabled)return;if(!scheduler){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setActive(true);observer.disconnect()}},{rootMargin:'400px'});observer.observe(node);return()=>observer.disconnect()}return scheduler.register(node,'chart',setActive)},[scheduler,enabled,attempt]);
 useEffect(()=>{
  const node=host.current?.querySelector('.kobo-chart-viewport');if(!node||!active)return;
  const observer=new ResizeObserver(entries=>{const next=entries[0]?.contentRect.height;if(next>0)setHeight(current=>Math.abs(current-next)>1?next:current)});
  observer.observe(node);return()=>observer.disconnect();
 },[active]);
 const complete=()=>{if(host.current)scheduler?.complete(host.current)};
 const retry=()=>{setActive(false);setAttempt(value=>value+1)};
 return{host,active,height,complete,retry,attempt};
}

export function estimatedQuestionHeight(result:KoboResult,width:number,tableOnly=false){
 const shown=result.kind==='text'?Math.min(20,result.rows.length):result.rows.length;
 const type=result.breakdowns.length&&['pie','donut'].includes(result.chart)?'bar':result.chart;
 const dense=isDenseKoboChart(result);
 const chart=dense?700:result.denominator?Math.max(330,type==='bar'?Math.min(900,shown*30+70):360):330;
 const table=Math.min(640,Math.min(30,result.rows.length)*44+(result.breakdowns.length?Math.max(1,result.breakdownFields?.length||1)+1:1)*33+44);
 return 180+(tableOnly?table:dense||result.breakdowns.length||width<=1000?table+chart:Math.max(table,chart));
}

/** Keep a lightweight, measured host while distant card content is released. */
export function KoboDeferredQuestion({question,eager=false,children,tableOnly=false}:{question:KoboResult;eager?:boolean;children:ReactNode;tableOnly?:boolean}){
 const scheduler=useContext(SchedulerContext),host=useRef<HTMLDivElement>(null),focusRequested=useRef(false);
 const[ready,setReady]=useState(eager||!scheduler);
 const stores=useContext(CardStoresContext);
 const retained=useRef(stores?.get(question.id)||new Map<string,unknown>()),height=useRef(0);
 if(stores&&!stores.has(question.id))stores.set(question.id,retained.current);
 useLayoutEffect(()=>{const node=host.current;if(!node||!ready)return;const measure=()=>{const next=node.getBoundingClientRect().height;if(next>0)height.current=next};measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect()},[ready,question,tableOnly]);
 const estimate=estimatedQuestionHeight(question,window.innerWidth,tableOnly);
 useEffect(()=>{const node=host.current;if(!node||!scheduler)return;return scheduler.register(node,'question',active=>{if(!active){const measured=node.getBoundingClientRect().height;if(measured>0)height.current=measured}setReady(active)},ready)},[scheduler]);
 useLayoutEffect(()=>{const node=host.current;if(ready&&focusRequested.current){focusRequested.current=false;node?.querySelector<HTMLElement>('button,a,input')?.focus({preventScroll:true})}},[ready]);
 if(!scheduler)return <>{children}</>;
 return <div ref={host} className={`kobo-deferred-question${ready?' is-ready':''}`} tabIndex={ready?-1:0} aria-label={ready?undefined:question.label} onFocus={event=>{if(!ready&&event.target===event.currentTarget){focusRequested.current=true;setReady(true)}}} data-question-id={question.id}>
  {ready?<RetainedContext.Provider value={retained.current}>{children}</RetainedContext.Provider>:<div className="kobo-question-placeholder glass" style={{height:height.current||estimate}} aria-hidden="true"><span>{question.name}</span><strong>{question.label}</strong></div>}
 </div>;
}
