import type {ReactNode} from 'react';
import {CheckCircle2,FileSpreadsheet,Table2} from 'lucide-react';
import type {KoboPreview} from './koboTypes';

export default function KoboImportSourceSummary({preview,mode='uploaded',replaceForm}:{preview:KoboPreview;mode?:'saved'|'uploaded'|'replacement';replaceForm?:ReactNode}){
 const responses=preview.sheets[0]?.rows||0;
 return <section className="kobo-source-summary" aria-label="Import source files">
  <header><span className="kobo-source-ready-icon"><CheckCircle2 aria-hidden="true"/></span><div><h3>{mode==='saved'?'Using saved files':mode==='replacement'?'Replacement files ready':'Uploaded files ready'}</h3><p>{mode==='saved'?'Your saved form and responses are ready to review.':'Your form and responses are ready to review.'}</p></div></header>
  <div className="kobo-source-files">
   <div className="kobo-source-file"><FileSpreadsheet aria-hidden="true"/><div><span>Form</span><strong dir="auto">{preview.source?.formFilename||(mode==='saved'?'Saved XLSForm':'XLSForm workbook')}</strong>{replaceForm&&<details className="kobo-source-replace"><summary>Replace form</summary><div>{replaceForm}</div></details>}</div></div>
   <div className="kobo-source-file"><Table2 aria-hidden="true"/><div><span>Responses</span><strong dir="auto">{preview.source?.filename||'Response data'}</strong></div></div>
  </div>
  <div className="kobo-source-summary-bottom"><div className="kobo-source-metrics"><span><b>{responses.toLocaleString()}</b> {responses===1?'response':'responses'}</span><span><b>{preview.sheets.length}</b> {preview.sheets.length===1?'worksheet':'worksheets'}</span><span><b>{preview.mappings.length}</b> {preview.mappings.length===1?'column':'columns'}</span></div>
   <details className="kobo-source-file-details"><summary>File details</summary><dl><div><dt>Form version</dt><dd>{preview.expectedVersion||'Not specified'}</dd></div><div><dt>Response versions</dt><dd>{Object.entries(preview.sourceVersions||{}).map(([version,count])=>`${version} (${count.toLocaleString()} rows)`).join(', ')||'Not specified'}</dd></div>{preview.sheets.map((sheet,index)=><div key={`${sheet.name}:${index}`}><dt dir="auto">{sheet.name}</dt><dd>{sheet.rows.toLocaleString()} {sheet.rows===1?'row':'rows'} · {sheet.columns} {sheet.columns===1?'column':'columns'}{index>0?' · Repeat table':''}</dd></div>)}</dl></details>
  </div>
 </section>;
}
