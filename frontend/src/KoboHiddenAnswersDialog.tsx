import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {EyeOff,Eye,Search,X,LoaderCircle} from 'lucide-react';
import {koboRequest} from './koboApi';
import {hiddenAnswerOptions,type HiddenAnswerOption} from './koboHiddenAnswers';
import type {KoboProject,KoboQuestion,KoboResult} from './koboTypes';
import './koboHiddenAnswersDialog.css';
export default function KoboHiddenAnswersDialog({project,question,result,hiddenIds,language,selectAllInitially=false,onApply,onClose,onFallbackFocus}:{project:KoboProject;question?:KoboQuestion;result:KoboResult;hiddenIds:string[];language:'en'|'ar';selectAllInitially?:boolean;onApply:(ids:string[])=>void;onClose:()=>void;onFallbackFocus:()=>void}){
 const[fetched,setFetched]=useState<HiddenAnswerOption[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');void koboRequest<HiddenAnswerOption[]>(`/projects/${project.id}/answers/${encodeURIComponent(result.id)}?language=${language}`,undefined,'GET',controller.signal).then(setFetched).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[project.id,project.dataRevision,result.id,language,retry]);
 const options=useMemo(()=>hiddenAnswerOptions(hiddenIds,question,result,language,fetched),[hiddenIds,question,result,language,fetched]);
 return <KoboHiddenPivotDialog axis="rows" label={result.label} options={options} language={language} selectAllInitially={selectAllInitially} onApply={onApply} onClose={onClose} onFallbackFocus={onFallbackFocus} loading={loading} error={error} onRetry={()=>setRetry(value=>value+1)}/>;
}

type HiddenPivotDialogProps={
 axis:'rows'|'columns';
 label:string;
 options:(HiddenAnswerOption&{showCode?:boolean})[];
 language:'en'|'ar';
 selectAllInitially?:boolean;
 onApply:(ids:string[])=>void;
 onClose:()=>void;
 onFallbackFocus:()=>void;
 loading?:boolean;
 error?:string;
 onRetry?:()=>void;
};
export function KoboHiddenPivotDialog({axis,label,options,language,selectAllInitially=false,onApply,onClose,onFallbackFocus,loading,error,onRetry}:HiddenPivotDialogProps){
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef(document.activeElement),fallback=useRef(onFallbackFocus),id=useId();
 const [selected,setSelected]=useState(()=>new Set(selectAllInitially?options.map(option=>option.id):[])),[query,setQuery]=useState('');
 const ar=language==='ar',t=(en:string,arabic:string)=>ar?arabic:en,n=new Intl.NumberFormat(language);
 const rows=axis==='rows';
 const title=rows?t('Hidden rows','الصفوف المخفية'):t('Hidden columns','الأعمدة المخفية');
 useEffect(()=>{
  const node=dialog.current;
  node?.showModal();
  node?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
  return()=>{node?.close();requestAnimationFrame(()=>{if(opener.current instanceof HTMLElement&&opener.current.isConnected)opener.current.focus({preventScroll:true});else fallback.current()})};
 },[]);
 const chosen=options.filter(option=>selected.has(option.id)),all=options.length>0&&chosen.length===options.length;
 const text=query.normalize('NFKC').toLocaleLowerCase().trim(),visible=options.filter(option=>`${option.label} ${option.id}`.normalize('NFKC').toLocaleLowerCase().includes(text));
 const toggle=(key:string)=>setSelected(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next});
 return createPortal(<dialog ref={dialog} className="kobo-dialog glass kobo-hidden-manager" dir={ar?'rtl':'ltr'} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}}>
 <header><span className="kobo-hidden-manager-icon"><EyeOff aria-hidden="true"/></span><div><h2 id={`${id}-title`}>{title}</h2><p>{n.format(options.length)} {t('hidden','مخفية')}</p></div><button type="button" className="soft" aria-label={t('Close','إغلاق')} onClick={onClose}><X aria-hidden="true"/></button></header>
 <div className="kobo-hidden-manager-context"><strong dir="auto">{label}</strong><p id={`${id}-description`}>{rows?t('Select the rows you want to show in the pivot.','حدد الصفوف التي تريد إظهارها في الجدول المحوري.'):t('Select the columns you want to show in the pivot.','حدد الأعمدة التي تريد إظهارها في الجدول المحوري.')}</p></div>
 {options.length>8&&<label className="kobo-hidden-manager-search"><Search aria-hidden="true"/><input data-initial-focus aria-label={t('Search '+title.toLowerCase(),'البحث في '+title)} placeholder={t('Search '+title.toLowerCase()+'…','البحث في '+title+'…')} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label={t('Clear search','مسح البحث')} onClick={()=>setQuery('')}><X aria-hidden="true"/></button>}</label>}
 <div className="kobo-hidden-manager-toolbar"><button type="button" className="soft" data-initial-focus={options.length<=8?true:undefined} disabled={!options.length} onClick={()=>setSelected(new Set(options.map(option=>option.id)))}>{t('Select all','تحديد الكل')} ({n.format(options.length)})</button><button type="button" className="soft" disabled={!chosen.length} onClick={()=>setSelected(new Set())}>{t('Clear selection','مسح التحديد')}</button></div>
 {loading&&<p className="kobo-hidden-manager-loading" role="status"><LoaderCircle aria-hidden="true"/>{t('Loading answer labels…','جارٍ تحميل تسميات الإجابات…')}</p>}
 {error&&<div className="kobo-hidden-manager-error" role="status"><span>{t('Some labels could not be loaded. Available labels and answer codes are shown.','تعذر تحميل بعض التسميات. تظهر التسميات المتاحة ورموز الإجابات.')}</span><button type="button" className="soft" onClick={onRetry}>{t('Retry','إعادة المحاولة')}</button></div>}
 <div className="kobo-hidden-manager-list" role="group" aria-label={title}>
 {visible.map(option=><label key={option.id} className={`kobo-hidden-manager-row${selected.has(option.id)?' is-selected':''}`}><input type="checkbox" aria-label={option.showCode?`${option.label} (${option.id})`:option.label} checked={selected.has(option.id)} onChange={()=>toggle(option.id)}/><span><strong dir="auto">{option.label}</strong>{option.showCode&&<code dir="auto">{option.id}</code>}</span><Eye aria-hidden="true"/></label>)}
 {!visible.length&&<p className="kobo-hidden-manager-empty">{t('No results match your search.','لا توجد نتائج مطابقة للبحث.')}</p>}
 </div>
 <footer><span role="status">{n.format(chosen.length)} {t('selected','محددة')}</span><div><button type="button" className="soft" onClick={onClose}>{t('Cancel','إلغاء')}</button><button type="button" className="primary" disabled={!chosen.length} onClick={()=>onApply(chosen.map(option=>option.id))}><Eye aria-hidden="true"/>{all?t('Unhide all','إظهار الكل'):t('Unhide selected','إظهار المحدد')} ({n.format(chosen.length)})</button></div></footer>
 </dialog>,document.body);
}
