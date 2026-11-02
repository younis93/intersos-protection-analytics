import {AlertTriangle,ArrowRight,CheckCircle2,LoaderCircle} from 'lucide-react';

export type ImportReviewStatusInput={editorOpen:boolean;checking:boolean;checkError:boolean;pending:number;conflicts:number;issues:number;missing:number;editing:boolean;confirmDisabled:boolean;busy:boolean};
export function importReviewStatus(s:ImportReviewStatusInput):{message:string;tone:'ready'|'warning'|'checking';action?:'answers'|'questions'|'columns'}{
 if(s.busy)return {message:s.editing?'Applying corrections...':'Saving project...',tone:'checking'};
 if(s.editorOpen)return {message:'Finish or cancel the open editor',tone:'warning'};
 if(s.checkError)return {message:'Answer checks could not finish',tone:'warning'};
 if(s.checking)return {message:'Checking updated field links...',tone:'checking'};
 if(s.pending)return {message:`${s.pending} ${s.pending===1?'column needs':'columns need'} a decision`,tone:'warning',action:'columns'};
 if(s.conflicts)return {message:`${s.conflicts} ${s.conflicts===1?'question needs':'questions need'} a conflict decision`,tone:'warning',action:'answers'};
 if(s.issues)return {message:`${s.issues} answer ${s.issues===1?'issue needs':'issues need'} review`,tone:'warning',action:'answers'};
 if(s.missing)return {message:`${s.missing} ${s.missing===1?'question needs':'questions need'} a link or Ignore decision`,tone:'warning',action:'questions'};
 if(s.confirmDisabled)return {message:'Complete the source update review',tone:'warning'};
 return {message:s.editing?'Ready to apply corrections':'Ready to create your project',tone:'ready'};
}

export default function KoboImportFooter({status,readyColumns,totalColumns,missing,editing,busy,disabled,reviewDisabled,confirmLabel,busyLabel,onReview,onCancel,onConfirm}:{status:ReturnType<typeof importReviewStatus>;readyColumns:number;totalColumns:number;missing:number;editing:boolean;busy:boolean;disabled:boolean;reviewDisabled:boolean;confirmLabel:string;busyLabel:string;onReview:()=>void;onCancel?:()=>void;onConfirm:()=>void}){
 const Icon=status.tone==='ready'?CheckCircle2:status.tone==='checking'?LoaderCircle:AlertTriangle;
 return <footer className={`kobo-mapping-confirm kobo-dialog-actions kobo-import-footer is-${status.tone}`}>
  <div className="kobo-import-footer-status"><Icon aria-hidden="true" className={status.tone==='checking'?'spin':undefined}/><div className="kobo-import-footer-copy"><div className="kobo-import-footer-title"><strong role="status" aria-live="polite">{status.message}</strong>{status.action&&<button type="button" className="kobo-import-review-link" disabled={reviewDisabled} onClick={onReview}>{status.action==='answers'?'Review issues':status.action==='questions'?'Review questions':'Review columns'}<ArrowRight aria-hidden="true"/></button>}</div><small>{readyColumns} of {totalColumns} columns ready · {missing} {missing===1?'question':'questions'} without source data</small><span className="kobo-import-save-hint">{editing?'Changes are saved when you apply corrections.':'Your project is saved when you create it.'}</span></div></div>
  <div className="kobo-dialog-action-buttons kobo-import-footer-actions">{onCancel&&<button type="button" className="soft" disabled={busy} onClick={onCancel}>Cancel</button>}<button type="button" className="primary" disabled={disabled} onClick={onConfirm}>{busy?busyLabel:confirmLabel}{!busy&&<ArrowRight aria-hidden="true"/>}</button></div>
 </footer>;
}
