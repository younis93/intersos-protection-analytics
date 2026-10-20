import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Info,SlidersHorizontal,X} from 'lucide-react';
import {koboLabel,type KoboProject} from './koboTypes';
import './koboImportNotes.css';

export default function KoboImportNotes({project,onReview}:{project:KoboProject;onReview:()=>void}){
 const count=project.warnings.length+project.issues.length;
 const[open,setOpen]=useState(false),id=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const node=dialog.current;node?.showModal();return()=>{node?.close();trigger.current?.focus({preventScroll:true})}},[open]);
 return <><button ref={trigger} type="button" className="soft kobo-import-notes-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(true)}><Info aria-hidden="true"/><span>Important notes</span><span className="kobo-import-notes-count">{count}</span></button>
  {open&&createPortal(<dialog ref={dialog} id={id} className="kobo-dialog glass kobo-import-notes-dialog" aria-labelledby={`${id}-title`} onCancel={event=>{event.preventDefault();setOpen(false)}}>
   <header><div className="kobo-import-notes-heading"><span className="kobo-import-notes-icon"><Info aria-hidden="true"/></span><div><h2 id={`${id}-title`}>Important notes</h2><p>{count} import {count===1?'note':'notes'} to review</p></div></div><button type="button" className="soft" aria-label="Close important notes" onClick={()=>setOpen(false)}><X aria-hidden="true"/></button></header>
  <div className="kobo-import-notes-body">
   <ul className="kobo-import-notes-list">
    {project.warnings.map((warning,index)=><li key={`warning:${index}`}><span className="kobo-import-note-dot" aria-hidden="true"/><div><strong>{/version/i.test(warning)?'Source version check':'Import information'}</strong><p>{warning}</p></div></li>)}
    {project.issues.map((issue,index)=>{const question=project.form.questions.find(q=>q.id===issue.question);return <li key={`issue:${index}`}><span className="kobo-import-note-dot" aria-hidden="true"/><div><strong>{question?koboLabel(question,project.settings.language):issue.question}</strong><p>{issue.message}</p><span className="kobo-import-note-rows">{issue.count} affected {issue.count===1?'row':'rows'}</span></div></li>})}
   </ul>
   <footer><p>Review saved mappings and answer checks.</p><button type="button" className="soft kobo-import-notes-review" onClick={()=>{setOpen(false);onReview()}}><SlidersHorizontal aria-hidden="true"/><span>Review and correct import</span><ArrowRight aria-hidden="true"/></button></footer>
  </div>
 </dialog>,document.body)}
 </>;
}
