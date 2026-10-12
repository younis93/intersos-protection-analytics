import {ChevronDown} from 'lucide-react';
import type {ComponentPropsWithoutRef, ReactNode} from 'react';

/** Layout slots preserve each page's filter semantics and existing CSS variants. */
export function FilterDrawerShell({backdrop,header,footer,children,...props}:ComponentPropsWithoutRef<'aside'>&{backdrop?:ReactNode;header:ReactNode;footer?:ReactNode}){
  return <>{backdrop}<aside {...props}>{header}{children}{footer}</aside></>;
}

export function FilterSection({label,badge,children,...props}:Omit<ComponentPropsWithoutRef<'details'>,'children'>&{label:ReactNode;badge?:ReactNode;children:ReactNode}){
  return <details {...props}><summary><span>{label}</span>{badge}<ChevronDown/></summary>{children}</details>;
}
