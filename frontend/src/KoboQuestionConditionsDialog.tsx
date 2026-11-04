import {useEffect,useRef,useState} from 'react';
import {CircleMinus,X} from 'lucide-react';
import KoboQuestionConditions,{type QuestionConditionControls} from './KoboQuestionConditions';
import {koboLabel,type KoboProject} from './koboTypes';
import './koboQuestionConditionsDialog.css';
export default function KoboQuestionConditionsDialog({project,question,language,onClose,onSaved}:{project:KoboProject;question:string;language:'en'|'ar';onClose:()=>void;onSaved?:(project:KoboProject)=>void}){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const modal=useRef<HTMLDialogElement>(null),opener=useRef(document.activeElement);const[controls,setControls]=useState<QuestionConditionControls|null>(null);
 const close=()=>{if(!controls?.busy)onClose()};
 useEffect(()=>{const node=modal.current;node?.showModal();return()=>{node?.close();if(opener.current instanceof HTMLElement&&opener.current.isConnected)opener.current.focus({preventScroll:true})}},[]);
 const target=project.form.questions.find(q=>q.id===question);
 return <dialog ref={modal} className="kobo-dialog glass kobo-question-conditions-dialog" aria-label={t('Ignore conditions','تجاهل الشروط')} dir={language==='ar'?'rtl':'ltr'} onCancel={event=>{event.preventDefault();event.stopPropagation();close()}}><header><span className="kobo-question-ignore-symbol"><CircleMinus aria-hidden="true"/></span><div><h2>{t('Ignore conditions','تجاهل الشروط')}</h2><p dir="auto">{target?koboLabel(target,language):question}</p><span className="kobo-condition-state">{t('This question only','هذا السؤال فقط')}</span></div><button type="button" className="soft" aria-label={t('Close condition selection','إغلاق اختيار الشروط')} disabled={controls?.busy} onClick={close}><X aria-hidden="true"/></button></header><div className="kobo-question-conditions-dialog-body"><KoboQuestionConditions project={project} question={question} language={language} hideQuestion onControlsChange={setControls} onSaved={saved=>{onSaved?.(saved);onClose()}}/></div><footer><button type="button" className="soft" disabled={controls?.busy} onClick={close}>{t('Cancel','إلغاء')}</button><button type="button" className="primary" disabled={!controls?.canApply} onClick={()=>void controls?.apply()}>{controls?.label||t('Ignore selected conditions','تجاهل الشروط المحددة')}</button></footer></dialog>;
}
