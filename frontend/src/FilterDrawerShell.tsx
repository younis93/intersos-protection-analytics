import {ChevronDown} from 'lucide-react';
import {useLayoutEffect,useState,type ComponentPropsWithoutRef,type ReactNode} from 'react';

/** Layout slots preserve each page's filter semantics and existing CSS variants. */
export function FilterDrawerShell({backdrop,header,footer,children,...props}:ComponentPropsWithoutRef<'aside'>&{backdrop?:ReactNode;header:ReactNode;footer?:ReactNode}){
  return <>{backdrop}<aside {...props}>{header}{children}{footer}</aside></>;
}

export function FilterSection({label,badge,children,open,onToggle,...props}:Omit<ComponentPropsWithoutRef<'details'>,'children'>&{label:ReactNode;badge?:ReactNode;children:ReactNode}){
  const [expanded,setExpanded]=useState(Boolean(open));
  useLayoutEffect(()=>setExpanded(Boolean(open)),[open]);
  return <details {...props} open={open} onToggle={event=>{setExpanded(event.currentTarget.open);onToggle?.(event)}}><summary><span>{label}</span>{badge}<ChevronDown/></summary>{expanded&&children}</details>;
}
