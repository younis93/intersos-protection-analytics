import {registerKoboDraftNavigation} from './koboDraftNavigation';
import {useEffect,useRef,useState} from 'react';
import KoboConfirmDialog from './KoboConfirmDialog';

/** Protect draft dialogs without committing anything until Save is chosen. */
export function useKoboUnsavedChanges({dirty,canSave,onSave,onClose,reason=''}:{dirty:boolean;canSave:boolean;onSave:()=>void;onClose:()=>void;reason?:string}){
 const[open,setOpen]=useState(false);
 const pending=useRef<(()=>void)|null>(null),allowNavigation=useRef(false);
 const current=useRef({dirty,canSave,onSave,onClose});current.current={dirty,canSave,onSave,onClose};
 const requestClose=()=>{if(current.current.dirty)setOpen(true);else current.current.onClose()};
 useEffect(()=>{
  const unload=(event:BeforeUnloadEvent)=>{if(current.current.dirty&&!allowNavigation.current){event.preventDefault();event.returnValue=''}};
  const navigate=(event:HashChangeEvent)=>{
   if(!current.current.dirty||allowNavigation.current)return true;
   event.stopImmediatePropagation();
   const next=new URL(event.newURL).hash;
   window.history.replaceState(null,'',event.oldURL);
   pending.current=()=>{window.location.hash=next};setOpen(true);return false;
  };
  const unregister=registerKoboDraftNavigation(navigate);window.addEventListener('beforeunload',unload);
  return()=>{window.removeEventListener('beforeunload',unload);unregister()};
 },[]);
 const finish=(save:boolean)=>{
  if(save&&!current.current.canSave)return;
  const navigate=pending.current;pending.current=null;allowNavigation.current=true;setOpen(false);
  if(save)current.current.onSave();else current.current.onClose();
  navigate?.();
 };
 const confirmation=open?<KoboConfirmDialog title="Save your changes?" confirmLabel="Save changes" confirmDisabled={!canSave} cancelLabel="Keep editing" className="kobo-unsaved-changes" onConfirm={()=>finish(true)} onCancel={()=>{pending.current=null;setOpen(false)}} extraAction={{label:'Discard changes',onClick:()=>finish(false)}}><p>You have unsaved changes. Save them before leaving, or discard them.</p>{!canSave&&reason&&<p role="status">{reason}</p>}</KoboConfirmDialog>:null;
 return {requestClose,confirmation};
}
