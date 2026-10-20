import {useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Palette,RotateCcw,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {koboPalettes,normalizeHex} from './koboCustomizeOptions';
import {koboScreenChartRows} from './koboChartDensity';
import type {KoboMarkTarget} from './koboMarkColors';
import type {KoboQuestionSettings,KoboResult} from './koboTypes';
import './koboMarkColorPicker.css';

export type KoboMarkEdit={target:KoboMarkTarget;hex:string;value?:string|null;anchor:{x:number;y:number}};
export default function KoboMarkColorPicker({result,settings,edit,onTarget,onColor,onReset,onApply,onClose}:{result:KoboResult;settings:KoboQuestionSettings;edit:KoboMarkEdit;onTarget:(target:KoboMarkTarget)=>void;onColor:(value:string)=>void;onReset:()=>void;onApply:()=>void;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),valid=normalizeHex(edit.hex),rows=koboScreenChartRows(result);
 const opener=useRef(document.activeElement instanceof HTMLElement?document.activeElement:null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;node.showModal();
  const position=()=>{const box=node.getBoundingClientRect();node.style.left=`${Math.max(12,Math.min(edit.anchor.x+12,window.innerWidth-box.width-12))}px`;node.style.top=`${Math.max(12,Math.min(edit.anchor.y,window.innerHeight-box.height-12))}px`};
  position();const observer=new ResizeObserver(position);observer.observe(node);window.addEventListener('resize',position);
  return()=>{observer.disconnect();window.removeEventListener('resize',position);node.close();if(opener.current?.isConnected)opener.current.focus({preventScroll:true})};
 },[]);
 const swatches=[...new Set([...(koboPalettes.find(palette=>palette.name===settings.palette)?.colors||[]),...koboPalettes[0].colors])];
 return createPortal(<dialog ref={ref} className="kobo-dialog glass kobo-mark-color-picker" aria-label="Edit chart color" onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose()}}}>
  <header><Palette aria-hidden="true"/><h2>Edit chart color</h2><button type="button" className="soft" aria-label="Close color picker" onClick={onClose}><X aria-hidden="true"/></button></header>
  <p dir="auto">{result.label}</p>
  <AppSelect label="Answer" ariaLabel="Chart color answer" searchable value={edit.target.answer} options={rows.map(row=>[row.id,row.label])} onChange={answer=>onTarget({...edit.target,answer})}/>
  {result.breakdowns.length>0&&<AppSelect label="Breakdown" ariaLabel="Chart color breakdown" searchable value={edit.target.breakdown||''} options={result.breakdowns.map(column=>[column.id,column.label])} onChange={breakdown=>onTarget({...edit.target,breakdown})}/>}
  <div className="kobo-mark-color-inputs"><label>Color<input type="color" aria-label="Choose chart color" value={valid||'#1683d8'} onChange={event=>onColor(event.target.value)}/></label><label>HEX color<input autoFocus aria-label="Chart color HEX" value={edit.hex} spellCheck={false} aria-invalid={!valid} onChange={event=>onColor(event.target.value)}/></label></div>
  {!valid&&<p role="alert">Enter a valid HEX color, such as #1683D8.</p>}
  <div className="kobo-mark-color-swatches" aria-label="Suggested chart colors">{swatches.map(color=><button type="button" key={color} style={{backgroundColor:color}} aria-label={`Use ${color}`} aria-pressed={valid?.toLowerCase()===color.toLowerCase()} onClick={()=>onColor(color)}/>)}</div>
  <button type="button" className="soft kobo-mark-color-reset" onClick={onReset}><RotateCcw aria-hidden="true"/>Reset this color</button>
  <p className="kobo-mark-color-note">Preview only until you apply. Changes affect this mark only.{result.chart==='line'?' The connecting line keeps its color.':''}</p>
  <footer><button type="button" className="soft" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!valid||edit.value===undefined} onClick={onApply}>Apply</button></footer>
 </dialog>,document.body);
}
