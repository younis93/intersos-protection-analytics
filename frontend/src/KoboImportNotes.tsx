import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Info,SlidersHorizontal,X} from 'lucide-react';
import {koboLabel,type KoboProject,type KoboImportNote,type KoboForm} from './koboTypes';
import {koboApi} from './koboApi';
import {importNoteKey,importNoteDescription} from './koboImportNoteState';
import './koboImportNotes.css';

export function KoboImportNoteList({notes,form,language='en',onMark,busy=false}:{notes:KoboImportNote[];form:KoboForm;language?:'en'|'ar';onMark:(keys:string[])=>void;busy?:boolean}){
 const[showReviewed,setShowReviewed]=useState(false);
 const pending=notes.filter(note=>!note.reviewed),reviewed=notes.filter(note=>note.reviewed);
 if(!notes.length)return null;
 return <section className="kobo-note-review" aria-label="Import notes">
  <div className="kobo-import-notes-actions"><strong>Import notes <span className="kobo-note-count">{pending.length}</span></strong><div className="kobo-note-review-controls">{reviewed.length>0&&<label><input type="checkbox" checked={showReviewed} onChange={event=>setShowReviewed(event.target.checked)}/> Show reviewed notes ({reviewed.length})</label>}{pending.length>0&&<button type="button" className="soft" disabled={busy} onClick={()=>onMark(pending.map(importNoteKey))}>Mark all reviewed</button>}</div></div>
  {!pending.length&&<p role="status">All import notes have been reviewed.</p>}
  <ul className="kobo-import-notes-list">{notes.filter(note=>showReviewed||!note.reviewed).map(note=>{
   const question=form.questions.find(q=>q.id===note.question);
   return <li className={note.reviewed?'is-reviewed':undefined} key={importNoteKey(note)}><span className="kobo-import-note-dot" aria-hidden="true"/><div className="kobo-note-content"><div className="kobo-note-heading"><strong>{question?koboLabel(question,language):note.kind==='issue'?note.question:'Import information'}</strong>{note.count!=null&&<span className="kobo-import-note-rows">{note.count} affected {note.count===1?'row':'rows'}</span>}</div><p>{importNoteDescription(note.message)}</p><details className="kobo-note-technical"><summary>Technical details</summary><p>{note.message}</p></details></div><div className="kobo-note-action">{note.reviewed?<span className="kobo-note-reviewed">Reviewed</span>:<button type="button" className="soft kobo-note-mark" disabled={busy} onClick={()=>onMark([importNoteKey(note)])}>Mark reviewed</button>}</div></li>;
  })}</ul>
 </section>;
}

export default function KoboImportNotes({project,onReview,onReviewed}:{project:KoboProject;onReview:()=>void;onReviewed?:(project:KoboProject)=>void}){
 const[notes,setNotes]=useState(project.importNotes||[]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[open,setOpen]=useState(false),id=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const count=notes.filter(note=>!note.reviewed).length;
 useEffect(()=>{setNotes(project.importNotes||[])},[project.importNotes]);
 useEffect(()=>{if(!open)return;const node=dialog.current;node?.showModal();return()=>{node?.close();trigger.current?.focus({preventScroll:true})}},[open]);
 const mark=async(keys:string[])=>{
  if(busy)return;setBusy(true);setError('');
  try{const updated=await koboApi.reviewNotes(project.id,keys);setNotes(updated.importNotes||[]);onReviewed?.(updated);if(!updated.importNotes?.some(note=>!note.reviewed))setOpen(false)}catch(issue){setError(issue instanceof Error?issue.message:String(issue))}finally{setBusy(false)}
 };
 if(!count&&!open)return null;
 return <><button ref={trigger} type="button" className="soft kobo-import-notes-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(true)}><Info aria-hidden="true"/><span>Important notes</span><span className="kobo-import-notes-count">{count}</span></button>
  {open&&createPortal(<dialog ref={dialog} id={id} className="kobo-dialog glass kobo-import-notes-dialog" aria-labelledby={`${id}-title`} onCancel={event=>{event.preventDefault();setOpen(false)}}>
   <header><div className="kobo-import-notes-heading"><span className="kobo-import-notes-icon"><Info aria-hidden="true"/></span><div><h2 id={`${id}-title`}>Important notes</h2><p>{count} import {count===1?'note':'notes'} to review</p></div></div><button type="button" className="soft" aria-label="Close important notes" onClick={()=>setOpen(false)}><X aria-hidden="true"/></button></header>
   <div className="kobo-import-notes-body"><div className="kobo-import-notes-actions"><p>Review saved mappings and answer checks.</p><button type="button" className="soft kobo-import-notes-review" onClick={()=>{setOpen(false);onReview()}}><SlidersHorizontal aria-hidden="true"/><span>Review and correct import</span><ArrowRight aria-hidden="true"/></button></div>{error&&<p role="alert" className="error">{error}</p>}<KoboImportNoteList notes={notes} form={project.form} language={project.settings.language} onMark={keys=>void mark(keys)} busy={busy}/></div>
  </dialog>,document.body)}
 </>;
}
