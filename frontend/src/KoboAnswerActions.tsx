import {useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Eye,EyeOff,MoreHorizontal,Pencil,Settings2} from 'lucide-react';
import './koboAnswerActions.css';

type MenuPosition={x:number;y:number;align:'start'|'end';last?:boolean;anchor?:{left:number;top:number}};
type Props={label:string;children:ReactNode;language?:string;hiddenCount:number;onRename?:()=>void;onManage?:()=>void;onHide?:()=>void;onRestore?:()=>void};
export default function KoboAnswerActions({label,children,language='en',hiddenCount,onRename,onManage,onHide,onRestore}:Props){
 const[position,setPosition]=useState<MenuPosition|null>(null),menu=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 const direction=language==='ar'?'rtl':'ltr';
 const close=(restore=true)=>{setPosition(null);if(restore)trigger.current?.focus({preventScroll:true})};
 const open=(last=false)=>{const b=trigger.current?.getBoundingClientRect();if(b)setPosition({x:direction==='rtl'?b.left:b.right,y:b.bottom+4,align:direction==='rtl'?'start':'end',last,anchor:{left:b.left,top:b.top}})};
 useLayoutEffect(()=>{
  if(!position||!menu.current)return;const node=menu.current,b=node.getBoundingClientRect();
  node.style.left=`${Math.max(8,Math.min(position.align==='end'?position.x-b.width:position.x,innerWidth-b.width-8))}px`;
  node.style.top=`${Math.max(8,Math.min(position.y,innerHeight-b.height-8))}px`;
  const buttons=Array.from(node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  (position.last?buttons.at(-1):buttons[0])?.focus({preventScroll:true});
 },[position]);
 useEffect(()=>{
  if(!position)return;
  const dismiss=(event:Event)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close(false)};
  const moved=(event:Event)=>{
   if(event.target instanceof Node&&menu.current?.contains(event.target))return;
   const anchor=trigger.current?.getBoundingClientRect();
   // Ignore queued scroll notifications from revealing the trigger before opening.
   // A scroll that moves the row invalidates the fixed popup position.
   if(event.type==='resize'||!anchor||!position.anchor||Math.abs(anchor.left-position.anchor.left)>1||Math.abs(anchor.top-position.anchor.top)>1)close(false);
  };
  document.addEventListener('pointerdown',dismiss);window.addEventListener('resize',moved);window.addEventListener('scroll',moved,true);
  return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',moved);window.removeEventListener('scroll',moved,true)};
 },[position]);
 const run=(action:()=>void)=>{close();action()};
 return <span className="kobo-answer-actions" dir={direction} onContextMenu={event=>{event.preventDefault();event.stopPropagation();const b=trigger.current?.getBoundingClientRect();setPosition({x:event.clientX,y:event.clientY,align:'start',anchor:b?{left:b.left,top:b.top}:undefined})}}>
  <span className="kobo-answer-label" dir="auto">{children}</span>
  <button ref={trigger} type="button" className="soft kobo-answer-menu-trigger" title="Answer actions" aria-label={`Answer options: ${label}`} aria-haspopup="menu" aria-controls={position?id:undefined} aria-expanded={!!position} onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();if(position)close();else open()}} onKeyDown={event=>{if(event.key!=='Tab')event.stopPropagation();if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey||event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open(event.key==='ArrowUp')}}}><MoreHorizontal aria-hidden="true"/></button>
  {position&&createPortal(<div ref={menu} id={id} dir={direction} className="kobo-answer-context-menu" role="menu" aria-label={`Answer options: ${label}`} style={{left:position.x,top:position.y}} onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onContextMenu={event=>{event.preventDefault();event.stopPropagation()}} onKeyDown={event=>{
   event.stopPropagation();if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();close();return}
   if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();
   const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
   buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }}>
   {onRename&&<button type="button" role="menuitem" onClick={()=>run(onRename)}><Pencil aria-hidden="true"/>Rename answer</button>}
   {onManage&&<button type="button" role="menuitem" onClick={()=>run(onManage)}><Settings2 aria-hidden="true"/>Manage answers</button>}
   {(onRename||onManage)&&(onHide||onRestore)&&<div className="kobo-answer-menu-divider" role="separator"/>}
   {onHide&&<button type="button" role="menuitem" onClick={()=>run(onHide)}><EyeOff aria-hidden="true"/>Hide answer</button>}
   {onRestore&&<button type="button" role="menuitem" disabled={!hiddenCount} onClick={()=>run(onRestore)}><Eye aria-hidden="true"/>Unhide all answers</button>}
  </div>,document.body)}
 </span>;
}
