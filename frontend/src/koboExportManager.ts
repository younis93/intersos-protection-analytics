import {useSyncExternalStore} from 'react';
import {downloadBlob,koboApi} from './koboApi';
import type {KoboAnalysis,KoboSettings} from './koboTypes';

type ExportInput={projectId:string;projectName:string;settings:KoboSettings;format:'excel'|'pdf';question?:string;separateGroups?:string[];chartMetric?:'count'|'percent'|'both';snapshot?:KoboAnalysis};
export type ExportTask={id:string;filename:string;project:string;format:'excel'|'pdf';state:'queued'|'running'|'complete'|'cancelled'|'error'|'expired';progress:number;message:string;downloadError?:string;downloading?:boolean;cancelPending?:boolean;cancelError?:boolean};
type Resource={input:ExportInput;controller:AbortController;job?:string;blob?:Blob;cancelled:boolean;completed?:number;expiry?:number};
const resources=new Map<string,Resource>(),listeners=new Set<()=>void>();
let tasks:ExportTask[]=[],pdfRunning=false;
const lifetime=60*60*1000;
function emit(){for(const listener of listeners)listener()}
function patch(id:string,change:Partial<ExportTask>){tasks=tasks.map(task=>task.id===id?{...task,...change}:task);emit()}
const active=(task:ExportTask)=>task.state==='queued'||task.state==='running';
const emptyTasks:ExportTask[]=[];
export const getKoboExports=()=>tasks;
export function useKoboExports(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener)}},getKoboExports,()=>emptyTasks)}
function finish(id:string,state:'complete'|'cancelled'|'error',message:string){
 const resource=resources.get(id);if(!resource)return;
 clearTimeout(resource.expiry);resource.completed=Date.now();patch(id,{state,message,progress:state==='complete'?100:tasks.find(task=>task.id===id)?.progress||0});
 resource.expiry=window.setTimeout(()=>{
  if(resources.get(id)!==resource)return;
  resource.blob=undefined;resource.input.snapshot=undefined;resources.delete(id);
  patch(id,{state:'expired',message:'This file has expired. Start a new export.',downloading:false,downloadError:undefined});
 },lifetime);
}
export function startKoboExport(input:ExportInput){
 const settings=structuredClone(input.settings);
 const snapshot=input.snapshot&&JSON.stringify(input.snapshot.settings)===JSON.stringify(settings)?{...input.snapshot,settings,questions:input.question?input.snapshot.questions.filter(question=>question.id===input.question):input.snapshot.questions}:undefined;
 const captured={...input,settings,snapshot,separateGroups:input.separateGroups?[...input.separateGroups]:undefined};
 const id=crypto.randomUUID(),suffix=input.question?`-${input.question.split('/').pop()}`:'';
 const filename=(input.projectName+suffix).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+(input.format==='pdf'?'.pdf':'.xlsx');
 resources.set(id,{input:captured,controller:new AbortController(),cancelled:false});
 tasks=[...tasks,{id,filename,project:input.projectName,format:input.format,state:'queued',progress:0,message:input.format==='pdf'?'Waiting for PDF processing':'Preparing Excel export'}];emit();
 if(input.format==='pdf')pumpPdf();else void runExcel(id);
 return id;
}
async function runExcel(id:string){
 const resource=resources.get(id);if(!resource)return;
 const {input,controller}=resource;
 try{
  // Do not abort submission: retain the returned job ID so cancellation can stop it.
  let job=await koboApi.export(input.projectId,input.settings,input.question,undefined,input.separateGroups,input.chartMetric);
  resource.job=job.id;
  if(resource.cancelled){await stopExcel(id,resource);return}
  for(;;){
   controller.signal.throwIfAborted();
   if(job.state==='error')throw new Error(job.message);
   if(job.state==='cancelled'){finish(id,'cancelled','Export cancelled');return}
   if(job.state==='complete')break;
   patch(id,{state:job.state,progress:job.progress,message:job.message});
   await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve()};const timer=window.setTimeout(done,1000);controller.signal.addEventListener('abort',done,{once:true})});
   controller.signal.throwIfAborted();job=await koboApi.job(job.id);
  }
  patch(id,{state:'running',progress:99,message:'Receiving Excel file'});
  resource.blob=await koboApi.exportBlob(job.id,controller.signal);
  controller.signal.throwIfAborted();finish(id,'complete','Excel file ready');void downloadKoboExport(id);
 }catch(error){if(!resource.job||!resource.cancelled){patch(id,{cancelPending:false});finish(id,'error',error instanceof Error?error.message:String(error))}}
}
function pumpPdf(){
 if(pdfRunning)return;
 const next=tasks.find(task=>task.format==='pdf'&&task.state==='queued');if(!next)return;
 pdfRunning=true;void runPdf(next.id).finally(()=>{pdfRunning=false;pumpPdf()});
}
async function runPdf(id:string){
 const resource=resources.get(id);if(!resource||resource.cancelled)return;
 const {input,controller}=resource;
 patch(id,{state:'running',message:'Preparing PDF results'});
 try{
  const snapshot=input.snapshot||await koboApi.analyze(input.projectId,input.settings,controller.signal,input.question);
  controller.signal.throwIfAborted();
  const {buildKoboPdf}=await import('./koboPdf');controller.signal.throwIfAborted();
  resource.blob=await buildKoboPdf(input.projectName,snapshot,controller.signal,(progress,message)=>patch(id,{progress,message}));
  controller.signal.throwIfAborted();finish(id,'complete','PDF file ready');void downloadKoboExport(id);
 }catch(error){if(!resource.cancelled)finish(id,'error',error instanceof Error?error.message:String(error))}
}
async function stopExcel(id:string,resource:Resource){
 try{await koboApi.cancel(resource.job!);patch(id,{cancelPending:false,cancelError:false});finish(id,'cancelled','Export cancelled')}
 catch(error){patch(id,{cancelPending:false,cancelError:true});finish(id,'error',`Could not cancel: ${error instanceof Error?error.message:String(error)}`)}
}
export async function cancelKoboExport(id:string){
 const resource=resources.get(id),task=tasks.find(task=>task.id===id);if(!resource||!task||task.cancelPending)return;
 if(!active(task)&&!task.cancelError)return;
 resource.cancelled=true;resource.controller.abort();patch(id,{cancelPending:true,cancelError:false,message:'Cancelling export…'});
 if(resource.input.format==='excel'){
  // An in-flight submission must return its ID before cancellation is confirmed.
  if(resource.job)await stopExcel(id,resource);
  return;
 }
 patch(id,{cancelPending:false});finish(id,'cancelled','Export cancelled');pumpPdf();
}
export async function downloadKoboExport(id:string){
 const resource=resources.get(id),task=tasks.find(task=>task.id===id);if(!resource||!task||task.downloading)return;
 patch(id,{downloading:true,downloadError:undefined});
 try{
  if(!resource.blob)throw new Error('File is no longer available. Please retry the export.');
  downloadBlob(resource.blob,task.filename);
 }catch(error){patch(id,{downloadError:`Download failed: ${error instanceof Error?error.message:String(error)}`})}
 finally{patch(id,{downloading:false})}
}
export function retryKoboExport(id:string){
 const resource=resources.get(id);if(!resource)return;
 const input={...resource.input};dismissKoboExport(id);startKoboExport(input);
}
export function dismissKoboExport(id:string){
 const task=tasks.find(task=>task.id===id);if(task&&active(task))return;
 const resource=resources.get(id);if(resource){clearTimeout(resource.expiry);resource.blob=undefined;resource.input.snapshot=undefined}
 resources.delete(id);tasks=tasks.filter(task=>task.id!==id);emit();
}
