import {useEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';

export default function SendIssuesModal({children,contacts=false,onClose,labelledBy,returnFocus}:{children:ReactNode;contacts?:boolean;onClose:()=>void;labelledBy:string;returnFocus?:HTMLElement|null}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [left,setLeft]=useState(24);
  useEffect(()=>{
    const previous=returnFocus||document.activeElement as HTMLElement|null;
    const sidebar=document.querySelector<HTMLElement>('.legal-shell .sidebar');
    const measure=()=>setLeft(window.innerWidth>900&&sidebar?Math.max(24,sidebar.getBoundingClientRect().right+16):12);
    measure();
    const observer=new ResizeObserver(measure);
    if(sidebar)observer.observe(sidebar);
    window.addEventListener('resize',measure);
    sidebar?.addEventListener('transitionend',measure);
    const element=dialog.current;
    element?.showModal();
    const trap=(event:KeyboardEvent)=>{
      if(event.key!=='Tab'||!element)return;
      const controls=Array.from(element.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,iframe,a[href],[tabindex]')).filter(control=>!control.matches(':disabled')&&control.tabIndex>=0&&control.getClientRects().length>0);
      const first=controls[0],last=controls[controls.length-1];
      if(!first){event.preventDefault();element.focus();return;}
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    element?.addEventListener('keydown',trap);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);sidebar?.removeEventListener('transitionend',measure);element?.removeEventListener('keydown',trap);element?.close();previous?.focus();};
  },[]);
  return createPortal(<dialog ref={dialog} className="send-issues si-modal-root" aria-modal="true" aria-labelledby={labelledBy} onCancel={event=>{event.preventDefault();onClose();}}><div className={`si-overlay si-modal-overlay ${contacts?'si-contacts-overlay':''}`} style={{'--si-modal-left':`${left}px`} as CSSProperties}>{children}</div></dialog>,document.body);
}
