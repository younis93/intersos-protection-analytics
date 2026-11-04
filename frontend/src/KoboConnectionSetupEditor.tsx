import {useEffect,useRef,useState} from 'react';
import KoboQuestionConditionsDialog from './KoboQuestionConditionsDialog';
import {X,CircleMinus} from 'lucide-react';
import KoboSourceCondition from './KoboSourceCondition';
import {KoboConnectionControls} from './KoboConnections';
import {koboRequest} from './koboApi';
import {koboLabel,questionDefaults,type KoboProject,type KoboSettings,type KoboResult} from './koboTypes';
import {prepareDataEdit} from './KoboDataEditing';
import {useReviewDraftGuard} from './useReviewDraftGuard';
import './koboConnectionSetupEditor.css';

export default function KoboConnectionSetupEditor({project,settings,question,onClose}:{project:KoboProject;settings:KoboSettings;question:string;onClose:()=>void}){
 const initialTarget=useRef(project.form.questions.find(q=>q.id===question)!);
 const target=project.form.questions.find(q=>q.id===question)||initialTarget.current;
 const evidence=useRef(target.connectionSetup),initial=useRef({...questionDefaults,...settings.questions[question]});
 const[draft,setDraft]=useState(initial.current),[preview,setPreview]=useState<{key:string;result:KoboResult}|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const blocked=busy;
 const[showConditions,setShowConditions]=useState(false);
 const [confirmShared,setConfirmShared]=useState(!!evidence.current?.shared);
 const shared=evidence.current?.shared;
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef(document.activeElement);
 const t=(en:string,ar:string)=>settings.language==='ar'?ar:en;
 const key=JSON.stringify([project.updated,question,settings,draft]);
 const currentSettings={...settings,questions:{...settings.questions,[question]:draft}};
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{node?.close();if(opener.current instanceof HTMLElement&&opener.current.isConnected)opener.current.focus({preventScroll:true})}},[]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');const timer=setTimeout(()=>{void koboRequest<KoboResult>(`/projects/${project.id}/analysis/preview`,{settings:currentSettings,question,connectionSetup:true},'POST',controller.signal).then(result=>{if(!controller.signal.aborted)setPreview({key,result})}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})},150);return()=>{controller.abort();clearTimeout(timer)}},[key]);
 const ready=preview?.key===key?preview.result:null;
 const original=evidence.current?.recovered,unconditional=!!original&&!original.relevant&&!original.inheritedRelevant.length&&draft.connectionSource!=='manual';
 const valid=!!ready&&(unconditional||!!ready.connections?.effectiveTree)&&!ready.connections?.reviewIssues?.length;
 const save=async()=>{
  if(!valid||blocked||loading)return false;setBusy(true);setError('');
  try{await prepareDataEdit(project.id);const saved=await koboRequest<KoboProject>(`/projects/${project.id}/connection-setup/confirm`,{question,fingerprint:evidence.current?.fingerprint,settings:currentSettings,...(confirmShared&&shared?{sharedFingerprint:shared.fingerprint}:{})});window.dispatchEvent(new CustomEvent('kobo-review-changed',{detail:saved}));onClose();return true}
  catch(e){setError(e instanceof Error?e.message:String(e));return false}finally{setBusy(false)}
 };
 const {request,confirmation}=useReviewDraftGuard({subject:'connection',dirty:JSON.stringify(draft)!==JSON.stringify(initial.current),busy:blocked,save,reset:()=>setDraft(initial.current),language:settings.language});
 return <><dialog ref={dialog} className="kobo-dialog glass kobo-connection-setup-editor" aria-label={t('Edit connection','تعديل الارتباط')} dir={settings.language==='ar'?'rtl':'ltr'} onCancel={event=>{event.preventDefault();event.stopPropagation();request(onClose)}}>
  <header><div><h2>{t('Edit connection','تعديل الارتباط')}</h2><p dir="auto">{koboLabel(target,settings.language)}</p></div><button type="button" className="soft" aria-label={t('Close connection editor','إغلاق محرر الارتباط')} disabled={blocked} onClick={()=>request(onClose)}><X/></button></header>
  <div className="kobo-connection-setup-body"><p>{t('Answer checks are paused. Review the recovered condition, or configure a valid manual connection, then save to resume checking.','فحص الإجابات متوقف مؤقتاً. راجع الشرط المستعاد أو أعد ارتباطاً يدوياً صالحاً، ثم احفظ لاستئناف الفحص.')}</p>
   {target.dependencyReviewNeeded&&<p role="status">{t('A previously ignored dependency is suspended because its source changed. Saving confirms the displayed conditions and restores that dependency for this question.','تم تعليق ارتباط متجاهل سابقاً بسبب تغيّر مصدره. يؤكد الحفظ الشروط المعروضة ويستعيد ذلك الارتباط لهذا السؤال.')}</p>}
   {shared&&<section><label><input type="checkbox" checked={confirmShared} disabled={blocked} onChange={event=>{setConfirmShared(event.target.checked);setDraft(initial.current)}}/>{t(`Confirm the source connection for all ${shared.questions.length} dependent questions`, `تأكيد ارتباط المصدر لجميع الأسئلة التابعة وعددها ${shared.questions.length}`)}</label><p>{t('Each question keeps its own source rule. Answers and manual overrides are unchanged. Uncheck to edit this question individually.','يحتفظ كل سؤال بشرط المصدر الخاص به. تبقى الإجابات والتعديلات اليدوية كما هي. ألغِ التحديد لتعديل هذا السؤال وحده.')}</p><details><summary>{t('Affected questions','الأسئلة المتأثرة')}</summary><ul>{shared.questions.map(id=><li key={id} dir="auto">{koboLabel(project.form.questions.find(q=>q.id===id)!,settings.language)}</li>)}</ul></details></section>}
   {unconditional&&<p>{t('The source form confirms that this question applies to all submissions. Save to confirm this applicability.','تؤكد الاستمارة الأصلية أن هذا السؤال ينطبق على جميع الاستجابات. احفظ لتأكيد الانطباق.')}</p>}
   <div className="kobo-review-setup-actions"><button type="button" className="soft kobo-review-ignore-button" aria-label={t('Ignore conditions','تجاهل الشروط')} aria-haspopup="dialog" disabled={blocked} onClick={()=>request(()=>setShowConditions(value=>!value))}><CircleMinus aria-hidden="true"/><span>{t('Ignore conditions','تجاهل الشروط')}<small>{t('This question only','هذا السؤال فقط')}</small></span></button></div>{showConditions&&<KoboQuestionConditionsDialog project={project} question={question} language={settings.language} onClose={()=>setShowConditions(false)} onSaved={()=>onClose()}/>}
   <KoboSourceCondition project={project} question={question} language={settings.language} result={ready}/>
   {loading&&<p role="status">{t('Checking connection…','جارٍ التحقق من الارتباط…')}</p>}
   {preview&&<fieldset disabled={blocked||confirmShared}><KoboConnectionControls result={preview.result} project={project} value={{...draft,calculation:null}} language={settings.language} section="connection" showOriginal={false} onChange={patch=>setDraft(value=>({...value,...patch}))}/></fieldset>}
   {error&&<p className="error" role="alert">{error}</p>}
   {!loading&&ready&&!valid&&<p role="status">{t('Complete a supported connection with valid references before saving.','أكمل ارتباطاً مدعوماً بمراجع صالحة قبل الحفظ.')}</p>}
  </div><footer><button type="button" className="soft" disabled={blocked} onClick={()=>request(onClose)}>{t('Cancel','إلغاء')}</button><button type="button" className="primary" disabled={blocked||loading||!valid} onClick={()=>void save()}>{busy?t('Saving…','جارٍ الحفظ…'):confirmShared&&shared?t(`Confirm connection for ${shared.questions.length} questions`,`تأكيد الارتباط لـ ${shared.questions.length} سؤالاً`):t('Save connection','حفظ الارتباط')}</button></footer>
 </dialog>{confirmation}</>;
}
