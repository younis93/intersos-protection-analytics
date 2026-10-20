export default function ProcessingDownload({active=false}:{active?:boolean}){
 return <span className={`kobo-export-icon${active?' is-active':''}`} aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
   <g className="kobo-export-icon-arrow"><path d="M12 3v12m-4-4 4 4 4-4"/></g>
   <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>
  </svg>
 </span>;
}
