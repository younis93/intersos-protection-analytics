import {useId} from 'react';

// Local SVG inspired by the supplied file-moving reference. No remote player
// or asset requests are needed while importing records.
export default function ProcessingFolder({active}:{active:boolean}){
  const id=useId().replace(/:/g,'');
  return <div className={`legal-upload-icon${active?' is-processing':''}`} aria-hidden="true">
    <svg className="legal-processing-folder" viewBox="0 0 112 112" fill="none" focusable="false">
      <defs>
        <linearGradient id={`${id}-back`} x1="16" y1="42" x2="98" y2="102" gradientUnits="userSpaceOnUse"><stop className="legal-folder-back-start"/><stop className="legal-folder-back-end" offset="1"/></linearGradient>
        <linearGradient id={`${id}-front`} x1="18" y1="58" x2="96" y2="102" gradientUnits="userSpaceOnUse"><stop className="legal-folder-front-start"/><stop className="legal-folder-front-end" offset="1"/></linearGradient>
        <clipPath id={`${id}-pocket`}><rect x="18" y="0" width="78" height="99"/></clipPath>
      </defs>
      <path fill={`url(#${id}-back)`} d="M15 50a8 8 0 0 1 8-8h22a9 9 0 0 1 7 3l7 8h31a8 8 0 0 1 8 8v33a8 8 0 0 1-8 8H23a8 8 0 0 1-8-8z"/>
      <g className="legal-processing-documents" clipPath={`url(#${id}-pocket)`}>
        {[0,1,2].map(index=><g key={index} className={`legal-processing-document legal-processing-document-${['one','two','three'][index]}`}>
          <g transform={`translate(${index*4} 0)`}>
          <path className="legal-processing-paper" d="M33 24a5 5 0 0 1 5-5h23l10 10v44a5 5 0 0 1-5 5H38a5 5 0 0 1-5-5z"/>
          <path className="legal-processing-paper-fold" d="M61 19v7a3 3 0 0 0 3 3h7"/>
          <path className="legal-processing-paper-lines" d="M41 39h20m-20 8h20m-20 8h14"/>
          </g>
        </g>)}
      </g>
      <path className="legal-processing-folder-front" fill={`url(#${id}-front)`} d="M17 65a7 7 0 0 1 7-7h22c8 0 10 8 18 8h27a7 7 0 0 1 7 7v22a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7z"/>
      <path className="legal-processing-folder-highlight" d="M25 62h19c8 0 11 8 19 8h27"/>
    </svg>
  </div>;
}
