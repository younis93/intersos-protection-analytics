import './customAnalysisIcon.css';

export default function CustomAnalysisIcon(){
 return <svg className="custom-analysis-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  <path d="M14 26H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v8"/>
  <path d="M7 9h5" opacity=".5"/>
  <g fill="currentColor" stroke="none">
   <rect className="custom-icon-bar custom-icon-bar-one" x="7" y="17" width="3" height="5" rx="1"/>
   <rect className="custom-icon-bar custom-icon-bar-two" x="13" y="13" width="3" height="9" rx="1"/>
   <rect className="custom-icon-bar custom-icon-bar-three" x="19" y="9" width="3" height="5" rx="1"/>
  </g>
  <g className="custom-icon-lens">
   <circle cx="22" cy="21" r="6"/>
   <path d="m26.5 25.5 3.5 3.5" strokeWidth="2.4"/>
   <path className="custom-icon-lens-glint" d="M19 21a3 3 0 0 1 3-3" opacity=".55"/>
  </g>
 </svg>;
}
