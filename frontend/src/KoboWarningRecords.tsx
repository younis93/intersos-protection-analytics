import {useEffect,useMemo,useRef} from 'react';
import {Table2,X} from 'lucide-react';
import KoboDataExplorer from './KoboDataExplorer';
import {koboLabel,type KoboProject,type KoboSettings} from './koboTypes';
import './koboPivotRecords.css';

export type WarningRecordFocus={id:string;row:number;question:string;wholeRow?:boolean};
export default function KoboWarningRecords({project,settings,focus,onClose}:{project:KoboProject;settings:KoboSettings;focus:WarningRecordFocus;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),question=project.form.questions.find(q=>q.id===focus.question);
 const t=(en:string,ar:string)=>settings.language==='ar'?ar:en;
 // Exact record identity finds the stored answer even when analysis filters exclude it.
 const rawSettings=useMemo(()=>({...settings,filters:[]}),[settings]);
 const scope=question?.repeat||'',group=project.form.groups.find(g=>g.id===scope);
 useEffect(()=>{const node=dialog.current,opener=document.activeElement;node?.showModal();return()=>{node?.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});else document.querySelector<HTMLButtonElement>('.kobo-review[open] .kobo-data-review-categories button[aria-pressed=true]')?.focus({preventScroll:true})}},[]);
 return <dialog ref={dialog} className="kobo-dialog glass kobo-pivot-records kobo-warning-records" aria-label={t('Warning source row','صف مصدر التحذير')} dir="ltr" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}}>
  <header><span className="kobo-visibility-icon"><Table2 aria-hidden="true"/></span><div><h2>{t('Warning source row','صف مصدر التحذير')}</h2><p dir="auto">{t('Source row','صف المصدر')} {focus.row} · {group?koboLabel(group,settings.language):t('Main submissions','الاستجابات الرئيسية')}</p></div><button type="button" className="soft" aria-label={t('Close warning source row','إغلاق صف مصدر التحذير')} onClick={onClose}><X aria-hidden="true"/></button></header>
  <div className="kobo-pivot-records-context"><strong dir="auto">{focus.wholeRow?t('Whole response','الاستجابة الكاملة'):question?koboLabel(question,settings.language):focus.question}</strong><p>{focus.wholeRow?t('The highlighted row is the response related to this finding. Click an editable cell to correct it.','الصف المظلل هو الاستجابة المرتبطة بهذه النتيجة. انقر على خلية قابلة للتعديل لتصحيحها.'):t('The highlighted cell is the answer related to this warning. Click a cell to edit it. All fields in this response table are shown, including hidden fields.','الخلية المظللة هي الإجابة المرتبطة بهذا التحذير. انقر على خلية لتعديلها. تظهر جميع حقول جدول الاستجابة، بما فيها الحقول المخفية.')}</p><p>{t('This view shows the stored row regardless of analysis filters or exclusions. Local corrections refresh the warning when you return to Review.','يعرض هذا الجدول الصف المخزن بغض النظر عن مرشحات التحليل أو الاستبعادات. تُحدّث التصحيحات المحلية التحذير عند العودة إلى المراجعة.')}</p></div>
  <div className="kobo-pivot-records-body"><KoboDataExplorer key={`${focus.id}:${scope}`} project={project} settings={rawSettings} groupId="@all" questionSearch="" initialScope={scope} recordFocus={focus}/></div>
  <footer className="kobo-dialog-actions"><button type="button" className="primary" onClick={onClose}>{t('Back to review','العودة إلى المراجعة')}</button></footer>
 </dialog>;
}
