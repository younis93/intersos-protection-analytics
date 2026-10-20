export default function KoboProjectActionIcon({type}:{type:'folder'|'trash'}){
 return <svg className={`kobo-project-action-icon is-${type}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  {type==='folder'?<><path d="M3 19V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10"/><path className="kobo-folder-flap" d="M3 19V10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>:<><path d="m5 7 1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M10 10v7m4-7v7"/><g className="kobo-trash-lid"><path d="M3 6h18M9 6V3h6v3"/></g></>}
 </svg>;
}
