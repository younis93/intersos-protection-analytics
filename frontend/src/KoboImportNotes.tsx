import {useState} from 'react';
import {koboLabel,type KoboImportNote,type KoboForm} from './koboTypes';
import {importNoteKey,importNoteDescription} from './koboImportNoteState';
import './koboImportNotes.css';

export function KoboImportNoteList({notes,form,language='en',onMark,busy=false}:{notes:KoboImportNote[];form:KoboForm;language?:'en'|'ar';onMark:(keys:string[])=>void;busy?:boolean}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const[showReviewed,setShowReviewed]=useState(false);
 const pending=notes.filter(note=>!note.reviewed),reviewed=notes.filter(note=>note.reviewed);
 if(!notes.length)return null;
 return <section className="kobo-note-review" aria-label={t('Import notes','ملاحظات الاستيراد')}>
  <div className="kobo-import-notes-actions"><strong>{t('Import notes','ملاحظات الاستيراد')} <span className="kobo-note-count">{pending.length}</span></strong><div className="kobo-note-review-controls">{reviewed.length>0&&<label><input type="checkbox" checked={showReviewed} onChange={event=>setShowReviewed(event.target.checked)}/> {t('Show reviewed notes','إظهار الملاحظات المراجعة')} ({reviewed.length})</label>}{pending.length>0&&<button type="button" className="soft" disabled={busy} onClick={()=>onMark(pending.map(importNoteKey))}>{t('Mark all reviewed','تحديد الكل كمراجَع')}</button>}</div></div>
  {!pending.length&&<p role="status">{t('All import notes have been reviewed.','تمت مراجعة جميع ملاحظات الاستيراد.')}</p>}
  <ul className="kobo-import-notes-list">{notes.filter(note=>showReviewed||!note.reviewed).map(note=>{
   const question=form.questions.find(q=>q.id===note.question);
   return <li className={note.reviewed?'is-reviewed':undefined} key={importNoteKey(note)}><span className="kobo-import-note-dot" aria-hidden="true"/><div className="kobo-note-content"><div className="kobo-note-heading"><strong>{question?koboLabel(question,language):note.kind==='issue'?note.question:t('Import information','معلومات الاستيراد')}</strong>{note.count!=null&&<span className="kobo-import-note-rows">{t(`${note.count} affected ${note.count===1?'row':'rows'}`,`${note.count} ${note.count===1?'صف متأثر':'صفوف متأثرة'}`)}</span>}</div><p dir="auto">{importNoteDescription(note.message,language)}</p><details className="kobo-note-technical"><summary>{t('Technical details','تفاصيل تقنية')}</summary><p dir="auto">{note.message}</p></details></div><div className="kobo-note-action">{note.reviewed?<span className="kobo-note-reviewed">{t('Reviewed','تمت المراجعة')}</span>:<button type="button" className="soft kobo-note-mark" disabled={busy} onClick={()=>onMark([importNoteKey(note)])}>{t('Mark reviewed','تحديد كمراجَع')}</button>}</div></li>;
  })}</ul>
 </section>;
}
