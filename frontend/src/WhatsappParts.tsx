import {Copy,ChevronLeft,ChevronRight} from 'lucide-react';
import {useEffect,useRef} from 'react';
import {whatsappCharacterCount,type WhatsappPart} from './whatsappIssues';

export default function WhatsappParts({parts,selected,onSelect,onCopy,disabled}:{parts:WhatsappPart[];selected:number;onSelect:(index:number)=>void;onCopy:(index:number)=>void;disabled:boolean}){
  const container=useRef<HTMLDivElement>(null),previous=useRef(selected);
  useEffect(()=>{if(previous.current!==selected)container.current?.querySelector('.si-whatsapp-part.active')?.scrollIntoView({block:'nearest'});previous.current=selected;},[selected]);
  return <div ref={container} className="si-chat-preview si-whatsapp-parts">
    {parts.length>1&&<nav className="si-part-navigation" aria-label="WhatsApp message parts"><button className="soft" aria-label="Previous message part" disabled={selected===0||disabled} onClick={()=>onSelect(selected-1)}><ChevronLeft/></button><span aria-live="polite">{parts[selected]?.label}</span><button className="soft" aria-label="Next message part" disabled={selected===parts.length-1||disabled} onClick={()=>onSelect(selected+1)}><ChevronRight/></button></nav>}
    {parts.map((part,index)=><article key={index} className={`si-chat-bubble si-whatsapp-part${index===selected?' active':''}`} aria-label={part.label}>
      <header><button className="si-part-select" aria-pressed={index===selected} disabled={disabled} onClick={()=>onSelect(index)}>{part.label}</button><small>{whatsappCharacterCount(part.text).toLocaleString()} / 4,000 characters</small></header>
      <div dir="auto">{part.text}</div>
      <footer><button className="soft" disabled={disabled} aria-label={`Copy ${part.label}`} onClick={()=>onCopy(index)}><Copy/> Copy this part</button></footer>
    </article>)}
  </div>;
}
