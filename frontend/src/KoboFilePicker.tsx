import {useId,useRef,type ReactNode} from 'react';
import {Upload,X} from 'lucide-react';
import KoboUploadCard from './KoboUploadCard';
import './koboFilePicker.css';

export default function KoboFilePicker({title,description,accept,format,file,icon,disabled,onChange,inputLabel=title,chooseLabel='Choose file',removeLabel=`Remove ${title} file`,className='',children}:{title:string;description:string;accept:string;format:string;file:File|null;icon:ReactNode;disabled:boolean;onChange:(file:File|null)=>void;inputLabel?:string;chooseLabel?:string;removeLabel?:string;className?:string;children?:ReactNode}){
 const input=useRef<HTMLInputElement>(null),choose=useRef<HTMLButtonElement>(null),descriptionId=useId();
 return <KoboUploadCard className={`kobo-file-picker ${className}`} title={title} description={description} descriptionId={descriptionId} format={format} icon={icon} file={file}>
  <input ref={input} type="file" hidden accept={accept} aria-label={inputLabel} aria-describedby={descriptionId} disabled={disabled} onChange={event=>{const selected=event.target.files?.[0];event.target.value='';if(selected)onChange(selected)}}/>
  <div className="kobo-upload-card-actions"><button ref={choose} type="button" className="primary" disabled={disabled} aria-label={file?`Change file for ${inputLabel}`:chooseLabel==='Choose file'?`Choose file for ${inputLabel}`:chooseLabel} aria-describedby={descriptionId} onClick={()=>input.current?.click()}><Upload aria-hidden="true"/>{file?'Change file':chooseLabel}</button>{file&&<button type="button" className="soft kobo-file-picker-remove" disabled={disabled} aria-label={removeLabel} title="Remove file" onClick={()=>{if(input.current)input.current.value='';onChange(null);choose.current?.focus()}}><X aria-hidden="true"/></button>}</div>
  {children}
 </KoboUploadCard>;
}
