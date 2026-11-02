import {useRetainedKoboState,useKoboCardState} from './KoboRendering';
import {useEffect,useMemo,useRef,useState,type PointerEvent,type KeyboardEvent,type RefObject} from 'react';
import {Calculator,X} from 'lucide-react';
import type {KoboResult,KoboRow} from './koboTypes';
import {pivotValue,pivotGrandTotal,pivotColumnTotal,pivotBottomPercent,pivotHasMetrics} from './koboPivotValues';
import {koboPivotTotals,type BreakdownDisplay} from './koboTableData';
import './koboPivotSelection.css';
const resultTokens=new WeakMap<object,number>();let nextResultToken=0;
const resultToken=(result:object)=>{let token=resultTokens.get(result);if(!token){token=++nextResultToken;resultTokens.set(result,token)}return token};
type Cell={value:number|null;unit:'count'|'percent'|'value';total:boolean};
export type SelectionRange={r0:number;c0:number;r1:number;c1:number};
export function selectionSummary(grid:Cell[][],ranges:SelectionRange[]){
 const groups=new Map<string,{sum:number;count:number;average:number;totals:boolean}>(),seen=new Set<string>();
 for(const range of ranges)for(let r=Math.max(0,Math.min(range.r0,range.r1));r<=Math.min(grid.length-1,Math.max(range.r0,range.r1));r++)for(let c=Math.max(0,Math.min(range.c0,range.c1));c<=Math.min((grid[r]?.length||0)-1,Math.max(range.c0,range.c1));c++){
  const key=`${r}:${c}`,cell=grid[r]?.[c];if(seen.has(key)||cell?.value==null||!Number.isFinite(cell.value))continue;seen.add(key);const group=groups.get(cell.unit)||{sum:0,count:0,average:0,totals:false};group.sum+=cell.value;group.count++;group.average=group.sum/group.count;group.totals ||=cell.total;groups.set(cell.unit,group)
 }return [...groups].map(([unit,group])=>({unit,...group}));
}
export function pivotSelectionGrid(result:KoboResult,rows:KoboRow[],display:BreakdownDisplay):Cell[][]{
 const metrics=pivotHasMetrics(result)?display==='both'?['count','percent']:[display]:['count'],policy=koboPivotTotals(result),columns=result.breakdowns;
 const make=(value:number|null|undefined,unit:Cell['unit'],total=false):Cell=>({value:value??null,unit,total});
 const metric=(value:number|null|undefined,percent:number|null|undefined,total=false)=>metrics.map(m=>make(m==='percent'?percent:value,m==='percent'?'percent':result.measure?'value':'count',total));
 const grid=rows.map(row=>[...columns.flatMap(column=>{const cell=row.series?.find(c=>c.id===column.id);return metric(pivotValue(result,cell),cell?.percent)}),...(!columns.length||policy.column?metric(pivotValue(result,row),row.percent,!!columns.length):[])]);
 if(policy.row)grid.push([...columns.flatMap(column=>metric(pivotColumnTotal(result,column),pivotBottomPercent(result,column),true)),...(!columns.length||policy.column?metric(pivotGrandTotal(result),pivotBottomPercent(result),true):[])]);
 return grid;
}
export function usePivotSelection(result:KoboResult,rows:KoboRow[],display:BreakdownDisplay,root:RefObject<HTMLDivElement|null>,revealColumn:(column:number)=>void,resetKey:string,inactive=false){
 const store=useKoboCardState(),prefix=inactive?'unusedSelection':'pivotSelection',token=resetKey+'|'+resultToken(result),previousToken=useRef(store?.get(prefix+'Token')??token);
 const enabled=!inactive;
 const[ranges,setRanges]=useRetainedKoboState<SelectionRange[]>(prefix+'Ranges',[]),[focusRow,setFocusRow]=useState<number|null>(null);
 const grid=useMemo(()=>inactive?[]:pivotSelectionGrid(result,rows,display),[result,rows,display,inactive]),summary=useMemo(()=>selectionSummary(grid,ranges),[grid,ranges]);
 const suppressClick=useRef(false),candidate=useRef<{r:number;c:number;x:number;y:number;base:SelectionRange[];anchor:{r:number;c:number}}|null>(null);
 const drag=useRef<{anchor:{r:number;c:number};base:SelectionRange[];x:number;y:number}|null>(null),frame=useRef(0),pending=useRef<{r:number;c:number}|null>(null);
 useEffect(()=>{if(previousToken.current!==token){setRanges([]);setFocusRow(null)}previousToken.current=token;store?.set(prefix+'Token',token)},[token,store,prefix]);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 const coordinates=(target:EventTarget|null)=>{const cell=target instanceof Element?target.closest<HTMLElement>('[data-select-row][data-select-column]'):null;return cell&&root.current?.contains(cell)?{r:Number(cell.dataset.selectRow),c:Number(cell.dataset.selectColumn)}:null};
 const setEnd=(r:number,c:number,anchor=drag.current?.anchor,base=drag.current?.base)=>{if(anchor)setRanges([...(base||[]),{r0:anchor.r,c0:anchor.c,r1:r,c1:c}])};
 const tick=()=>{const d=drag.current,node=root.current;if(!d||!node)return;const b=node.getBoundingClientRect(),speed=(p:number,min:number,max:number)=>p<min+36?-Math.ceil((min+36-p)/4):p>max-36?Math.ceil((p-max+36)/4):0;node.scrollTop+=speed(d.y,b.top,b.bottom);node.scrollLeft+=speed(d.x,b.left,b.right);const target=coordinates(document.elementFromPoint(Math.max(b.left+2,Math.min(b.right-2,d.x)),Math.max(b.top+2,Math.min(b.bottom-2,d.y))));if(target)setEnd(target.r,target.c);frame.current=requestAnimationFrame(tick)};
 const down=(e:PointerEvent<HTMLDivElement>)=>{if(!enabled||e.button!==0||e.pointerType==='touch')return;const cell=coordinates(e.target);if(!cell)return;suppressClick.current=false;const last=ranges.at(-1);candidate.current={...cell,x:e.clientX,y:e.clientY,base:e.ctrlKey||e.metaKey?ranges:[],anchor:e.shiftKey&&last?{r:last.r0,c:last.c0}:cell};};
 const move=(e:PointerEvent<HTMLDivElement>)=>{if(e.buttons!==1){candidate.current=null;return}const start=candidate.current;if(start&&!drag.current&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>=5){e.preventDefault();drag.current={anchor:start.anchor,base:start.base,x:e.clientX,y:e.clientY};suppressClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);setEnd(start.r,start.c);cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(tick)}if(drag.current){drag.current.x=e.clientX;drag.current.y=e.clientY}};
 const up=()=>{const d=drag.current;if(d){const cell=coordinates(document.elementFromPoint(d.x,d.y));if(cell)setEnd(cell.r,cell.c)}candidate.current=null;drag.current=null;cancelAnimationFrame(frame.current)};
 const keyboard=(e:KeyboardEvent<HTMLDivElement>)=>{if(!enabled)return;if(e.key==='Escape'){setRanges([]);return}const current=coordinates(e.target);if(!current||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();const rtl=getComputedStyle(e.currentTarget).direction==='rtl',r=Math.max(0,Math.min(grid.length-1,current.r+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0))),c=Math.max(0,Math.min((grid[r]?.length||1)-1,current.c+(e.key==='ArrowRight'?(rtl?-1:1):e.key==='ArrowLeft'?(rtl?1:-1):0)));const last=ranges.at(-1);setEnd(r,c,e.shiftKey&&last?{r:last.r0,c:last.c0}:current,[]);pending.current={r,c};setFocusRow(r);revealColumn(c);let attempts=0;const focus=()=>{const target=root.current?.querySelector<HTMLElement>(`[data-select-row="${r}"][data-select-column="${c}"]`);if(target){target.focus({preventScroll:true});pending.current=null}else if(attempts++<30)requestAnimationFrame(focus)};requestAnimationFrame(focus)};
 const selected=(r:number,c:number)=>enabled&&ranges.some(range=>r>=Math.min(range.r0,range.r1)&&r<=Math.max(range.r0,range.r1)&&c>=Math.min(range.c0,range.c1)&&c<=Math.max(range.c0,range.c1));
 const attributes=(r:number,c:number)=>({'data-select-row':r,'data-select-column':c,'data-pivot-selected':selected(r,c)?'true':undefined,tabIndex:enabled?0:-1});
 const format=(n:number,unit:string)=>new Intl.NumberFormat('en',{maximumFractionDigits:unit==='count'?2:result.measure?.decimals??2}).format(n)+(unit==='percent'?'%':'');
 const controls=enabled&&<div className="kobo-select-tools"><span>Drag cells to calculate.</span></div>;
 const bar=enabled&&!!ranges.length&&<div className="kobo-selection-summary" role="status" aria-live="polite"><Calculator aria-hidden="true"/>{summary.length?summary.map(group=><div key={group.unit}><strong>{group.unit==='percent'?'Percentages':group.unit==='count'?'Counts':result.measure?.label||'Values'}</strong><span>Sum <b>{format(group.sum,group.unit)}</b></span><span>Average <b>{format(group.average,group.unit)}</b></span><span>Count <b>{group.count}</b></span>{group.totals&&<small>Includes totals</small>}</div>):<span>Select numeric cells to calculate.</span>}{!!ranges.length&&<button className="soft" type="button" aria-label="Clear cell selection" onClick={()=>setRanges([])}><X/></button>}</div>;
 return{enabled,controls,bar,attributes,focusRow,events:{onPointerDownCapture:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,onKeyDownCapture:keyboard,onClickCapture:(e:React.MouseEvent)=>{if(suppressClick.current){suppressClick.current=false;e.preventDefault();e.stopPropagation()}}}};
}
