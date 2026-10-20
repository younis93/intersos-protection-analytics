import {useId,type ReactNode} from 'react';
import './koboUploadCard.css';

export default function KoboUploadCard({title,description,descriptionId,format,icon,file,emptyLabel,children,className='',label}:{title:string;description:string;descriptionId?:string;format:string;icon:ReactNode;file?:File|null;emptyLabel?:string;children:ReactNode;className?:string;label?:string}){
 const id=useId();
 const size=file?(file.size<1024*1024?`${Math.max(1,Math.ceil(file.size/1024))} KB`:`${(file.size/(1024*1024)).toFixed(1)} MB`):'';
 return <section className={`kobo-upload-card${file?' has-file':''} ${className}`} aria-label={label} aria-labelledby={label?undefined:id}>
  <div className="kobo-upload-card-heading"><span className="kobo-upload-card-icon">{icon}</span><span className="kobo-upload-card-format">{format}</span></div>
  <div><h3 id={id}>{title}</h3><p id={descriptionId}>{description}</p></div>
  {(file||emptyLabel)&&<div className="kobo-upload-card-selection" role="status" aria-live="polite">{file?<><strong dir="auto" title={file.name}>{file.name}</strong><span>{size}</span></>:<span>{emptyLabel}</span>}</div>}
  {children}
 </section>;
}
