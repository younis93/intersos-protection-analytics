import {useId,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {dropdownBlur,dropdownTriggerKey,useDropdownPosition} from './SelectionControls';

/** Native popover escapes card clipping and provides light dismissal. */
export default function KoboActionMenu({label,ariaLabel,icon,children,primary=false,disabled=false,className='',closeOnSelect=true}:{label:string;ariaLabel?:string;icon?:ReactNode;children:ReactNode;primary?:boolean;disabled?:boolean;className?:string;closeOnSelect?:boolean}){
 const[open,setOpen]=useState(false),id=useId();
 const{root,menu}=useDropdownPosition(open,()=>setOpen(false));
 return <div ref={root} className={`kobo-action-menu ${className}`} onBlur={event=>dropdownBlur(event,()=>setOpen(false))}>
  <button type="button" className={`app-select-trigger ${primary?'primary':'soft'}`} disabled={disabled} aria-label={ariaLabel} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>dropdownTriggerKey(event,()=>setOpen(true))}>{icon}<span>{label}</span><ChevronDown aria-hidden="true"/></button>
  {open&&<div id={id} ref={menu} popover="auto" className="kobo-action-popup" onToggle={event=>{if(event.newState==='closed')setOpen(false)}} onKeyDown={event=>{
   if(!closeOnSelect||event.defaultPrevented||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
   const target=event.target as HTMLElement,buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
   if(!buttons.length||target.matches('input')&&['Home','End'].includes(event.key))return;
   const index=buttons.indexOf(target as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?Math.min(index+1,buttons.length-1):index<0?buttons.length-1:Math.max(0,index-1);
   event.preventDefault();buttons[next].focus();
  }} onClick={event=>{if(closeOnSelect&&(event.target as HTMLElement).closest('button:not(:disabled)')){setOpen(false);root.current?.querySelector<HTMLButtonElement>('.app-select-trigger')?.focus({preventScroll:true})}}}>{children}</div>}
 </div>;
}
