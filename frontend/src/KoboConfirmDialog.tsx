import {useEffect,useId,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,LoaderCircle,Trash2,X} from 'lucide-react';
import './koboConfirmDialog.css';

export default function KoboConfirmDialog({title,children,confirmLabel,onConfirm,onCancel,variant='warning',busy=false,busyLabel='Working…',error='',cancelLabel='Cancel'}:{title:string;cancelLabel?:string;children:ReactNode;confirmLabel:string;onConfirm:()=>void;onCancel:()=>void;variant?:'warning'|'danger';busy?:boolean;busyLabel?:string;error?:string}){
 const ref=useRef<HTMLDialogElement>(null);
 const openerRef=useRef(document.activeElement);
 const direction=useRef((openerRef.current instanceof HTMLElement?openerRef.current.closest('[dir]')?.getAttribute('dir'):null)||document.documentElement.dir||'ltr');
 const cancelRef=useRef<HTMLButtonElement>(null);
 const id=useId();
 const Icon=variant==='danger'?Trash2:AlertTriangle;
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();cancelRef.current?.focus();return()=>{dialog?.close();const opener=openerRef.current;if(opener instanceof HTMLElement&&opener.isConnected)opener.focus()}},[]);
 return createPortal(<dialog ref={ref} className={`kobo-dialog glass kobo-confirm-dialog is-${variant}`} dir={direction.current} role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} aria-busy={busy} onCancel={e=>{e.preventDefault();e.stopPropagation();if(!busy)onCancel()}}>
  <header><div className="kobo-confirm-heading"><span className="kobo-confirm-icon"><Icon aria-hidden="true"/></span>{variant==='danger'&&<h2 id={`${id}-title`}>{title}</h2>}</div><button className="soft" type="button" disabled={busy} aria-label="Close confirmation" onClick={onCancel}><X aria-hidden="true"/></button></header>
  {variant!=='danger'&&<h2 id={`${id}-title`}>{title}</h2>}
  <div id={`${id}-message`} className="kobo-confirm-message">{children}</div>
  {error&&<p className="kobo-confirm-error" role="alert">{error}</p>}
  <footer className="kobo-dialog-actions"><div className="kobo-dialog-action-buttons"><button className="soft" ref={cancelRef} type="button" autoFocus disabled={busy} onClick={onCancel}>{cancelLabel}</button><button className={`primary${variant==='danger'?' kobo-confirm-danger':''}`} type="button" disabled={busy} onClick={onConfirm}>{busy?<LoaderCircle className="kobo-confirm-spinner" aria-hidden="true"/>:variant==='danger'?<Trash2 aria-hidden="true"/>:null}{busy?busyLabel:confirmLabel}</button></div></footer>
 </dialog>,document.body);
}
