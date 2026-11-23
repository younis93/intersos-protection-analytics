import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Palette,RotateCcw,X} from 'lucide-react';
import {koboPalettes,normalizeHex} from './koboCustomizeOptions';
import KoboColorWheel from './KoboColorWheel';
import {recentChartColors} from './koboRecentColors';
import type {KoboQuestionSettings} from './koboTypes';
import './koboMarkColorPicker.css';

export type ColorPickerAnchor={x:number;y:number};

type Props={
 label:string;
 anchor:ColorPickerAnchor;
 hex:string;
 hexLabel:string;
 colorLabel:string;
 palette?:KoboQuestionSettings['palette'];
 canApply:boolean;
 note:string;
 resetLabel?:string;
 children?:ReactNode;
 onColor:(hex:string)=>void;
 onReset:()=>void;
 onApply:()=>void;
 onClose:()=>void;
};

export default function KoboColorPickerDialog({label,anchor,hex,hexLabel,colorLabel,palette,canApply,note,resetLabel='Reset this color',children,onColor,onReset,onApply,onClose}:Props){
 const ref=useRef<HTMLDialogElement>(null),valid=normalizeHex(hex);
 const[recent]=useState(recentChartColors);
 const paletteColors=koboPalettes.find(option=>option.name===palette)?.colors||[];
 const suggestions=[...new Set([...paletteColors,...koboPalettes[0].colors])];
 useLayoutEffect(()=>{
  const node=ref.current;
  if(!node)return;
  const opener=document.activeElement;
  node.showModal();
  const position=()=>{
   const box=node.getBoundingClientRect();
   node.style.left=`${Math.max(12,Math.min(anchor.x+12,window.innerWidth-box.width-12))}px`;
   node.style.top=`${Math.max(12,Math.min(anchor.y,window.innerHeight-box.height-12))}px`;
  };
  position();
  const observer=new ResizeObserver(position);
  observer.observe(node);
  window.addEventListener('resize',position);
  return()=>{
   observer.disconnect();
   window.removeEventListener('resize',position);
   node.close();
   if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});
  };
 },[anchor]);
 const apply=()=>{
  if(!valid||!canApply)return;
  onApply();
 };
 return createPortal(<dialog ref={ref} className="kobo-dialog glass kobo-mark-color-picker" aria-label="Edit chart color" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose()}}}>
  <header><Palette aria-hidden="true"/><h2>Edit chart color</h2><button type="button" className="soft" aria-label="Close color picker" onClick={onClose}><X aria-hidden="true"/></button></header>
  <p dir="auto">{label}</p>
  {children}
  <KoboColorWheel hex={valid} onColor={onColor}/>
  <div className="kobo-mark-color-inputs"><label>Color<input type="color" aria-label={colorLabel} value={valid||'#1683d8'} onChange={event=>onColor(event.target.value)}/></label><label>HEX color<input autoFocus aria-label={hexLabel} value={hex} spellCheck={false} aria-invalid={!valid} onChange={event=>onColor(event.target.value)}/></label></div>
  {!valid&&<p role="alert">Enter a valid HEX color, such as #1683D8.</p>}
  {recent.length>0&&<section className="kobo-mark-recent-colors" aria-label="Recently used chart colors"><h3>Recently used colors</h3><div className="kobo-mark-color-swatches">{recent.map(color=><button type="button" key={color} title={color} style={{backgroundColor:color}} aria-label={`Use recent color ${color}`} aria-pressed={valid===color} onClick={()=>onColor(color)}/>)}</div></section>}
  <div className="kobo-mark-color-swatches" aria-label="Suggested chart colors">{suggestions.map(color=><button type="button" key={color} style={{backgroundColor:color}} aria-label={`Use ${color}`} aria-pressed={valid?.toLowerCase()===color.toLowerCase()} onClick={()=>onColor(color)}/>)}</div>
  <button type="button" className="soft kobo-mark-color-reset" onClick={onReset}><RotateCcw aria-hidden="true"/>{resetLabel}</button>
  <p className="kobo-mark-color-note">{note}</p>
  <footer><button type="button" className="soft" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!valid||!canApply} onClick={apply}>Apply</button></footer>
 </dialog>,document.body);
}
