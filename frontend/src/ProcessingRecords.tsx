import {FolderOpen} from 'lucide-react';
import type {LegalImportProgress} from './importProgress';

const datasets:Record<string,string>={beneficiaries:'beneficiaries',assessments:'assessments',legalservices:'legal services',legalhotlines:'hotline records',awareness:'awareness records',deportationrecords:'deportation records',legalfees:'legal fees',followupslogbooks:'follow-up records'};
export default function ProcessingRecords({progress,uploadPercent,restoring=false}:{progress:LegalImportProgress|null;uploadPercent?:number;restoring?:boolean}){
  const uploading=uploadPercent!==undefined;
  const percent=uploading?uploadPercent:progress?.state==='idle'?null:progress?.percent??null;
  const detail=uploading?'Sending selected CSV files to the local service...':progress?.state==='error'?progress.error:progress?.state==='complete'?'Records are ready.':progress?.state==='processing'?`${progress.stage}${progress.dataset?' - '+(datasets[progress.dataset]||progress.dataset):''}`:'Preparing the processing work plan...';
  return <div className="legal-upload-overlay" role="status" aria-live="polite"><section className="glass legal-upload-progress"><div className="legal-upload-icon"><FolderOpen/></div><span className="eyebrow">{restoring?'LOADING LEGAL DATA':'REPLACING LEGAL DATA'}</span><h2>{uploading?'Uploading folder':'Processing records'}</h2>{percent!==null?<><strong>{percent}%</strong><div role="progressbar" aria-label={uploading?'Legal Platform file upload':'Processing Legal Platform records'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}% - ${detail}`}><i style={{width:`${percent}%`}}/></div></>:<><strong className="legal-upload-indeterminate-label">Preparing...</strong><div className="legal-upload-indeterminate" role="progressbar" aria-label="Preparing Legal Platform records"><i/></div></>}<p>{detail}</p>{!uploading&&percent!==null&&<small>Completed processing work</small>}</section></div>;
}
