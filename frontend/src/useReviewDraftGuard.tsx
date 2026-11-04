import {useEffect,useRef,useState} from 'react';
import KoboConfirmDialog from './KoboConfirmDialog';
import {registerKoboDraftNavigation} from './koboDraftNavigation';

/** Navigation waits for the real correction result, including validation failures. */
export function useReviewDraftGuard({dirty,busy,save,reset,language,subject='answer'}:{subject?:'answer'|'connection';dirty:boolean;busy:boolean;save:()=>Promise<boolean>;reset:()=>void;language:string}){
 const current=useRef({dirty,busy,save,reset});current.current={dirty,busy,save,reset};
 const pending=useRef<(()=>void)|null>(null),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const request=(action:()=>void)=>{if(current.current.busy)return;if(current.current.dirty){pending.current=action;setError('');setOpen(true)}else action()};
 const requestRef=useRef(request);requestRef.current=request;
 useEffect(()=>{
  const unload=(event:BeforeUnloadEvent)=>{if(current.current.dirty){event.preventDefault();event.returnValue=''}};
  const unregister=registerKoboDraftNavigation(event=>{if(!current.current.dirty&&!current.current.busy)return true;event.stopImmediatePropagation();window.history.replaceState(null,'',event.oldURL);requestRef.current(()=>{window.location.hash=new URL(event.newURL).hash});return false});
  window.addEventListener('beforeunload',unload);return()=>{unregister();window.removeEventListener('beforeunload',unload)};
 },[]);
 const finish=async(save:boolean)=>{
  setSaving(true);setError('');
  try{if(save&&!await current.current.save()){setError(subject==='connection'?t('The connection was not saved. Keep editing to check the validation message.','لم يُحفظ الارتباط. تابع التعديل للتحقق من رسالة التحقق.'):t('The answer was not saved. Keep editing to check the validation message.','لم تُحفظ الإجابة. تابع التعديل للتحقق من رسالة التحقق.'));return}
   current.current.reset();current.current.dirty=false;const action=pending.current;pending.current=null;setOpen(false);action?.();
  }finally{setSaving(false)}
 };
 const confirmation=open?<KoboConfirmDialog title={t('Save your changes?','هل تريد حفظ التغييرات؟')} confirmLabel={t('Save changes','حفظ التغييرات')} cancelLabel={t('Keep editing','متابعة التعديل')} busy={saving} error={error} onConfirm={()=>void finish(true)} onCancel={()=>{pending.current=null;setOpen(false)}} extraAction={{label:t('Discard changes','تجاهل التغييرات'),onClick:()=>void finish(false)}}><p>{subject==='connection'?t('This connection has unsaved changes. Save or discard them before leaving.','توجد تغييرات غير محفوظة في هذا الارتباط. احفظها أو تجاهلها قبل المغادرة.'):t('This answer has unsaved changes. Save or discard them before leaving.','توجد تغييرات غير محفوظة في هذه الإجابة. احفظها أو تجاهلها قبل المغادرة.')}</p></KoboConfirmDialog>:null;
 return{request,confirmation};
}
