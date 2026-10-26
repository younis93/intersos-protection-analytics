import {useSyncExternalStore} from 'react';
import {downloadBlob,createKoboApi,analysisWorkspace,type AnalysisWorkspace} from './koboApi';
import type {KoboAnalysis,KoboSettings} from './koboTypes';

type ExportInput={workspace?:AnalysisWorkspace;projectId:string;projectName:string;settings:KoboSettings;format:'excel'|'pdf';excelMode?:'native'|'binary';question?:string;separateGroups?:string[];chartMetric?:'count'|'percent'|'both';snapshot?:KoboAnalysis};
export type ExportRecovery={id:string;filename:string;input:Omit<ExportInput,'snapshot'>;job?:string};
export type ExportTask={id:string;filename:string;project:string;format:'excel'|'pdf';state:'queued'|'running'|'complete'|'cancelled'|'error'|'expired'|'interrupted';progress:number;message:string;downloadError?:string;downloading?:boolean;retrying?:boolean;cancelPending?:boolean;cancelError?:boolean;stage?:string;elapsedSeconds?:number;lastProgressSecondsAgo?:number;completedQuestions?:number;totalQuestions?:number};
type Resource={input:ExportInput;controller:AbortController;job?:string;blob?:Blob;cancelled:boolean;completed?:number;expiry?:number;ready?:boolean;persistence?:Promise<unknown>};
const resources=new Map<string,Resource>(),listeners=new Set<()=>void>();
let tasks:ExportTask[]=[],pdfRunning=false,closingExports=false;
const lifetime=60*60*1000;
function emit(){for(const listener of listeners)listener()}
function patch(id:string,change:Partial<ExportTask>){tasks=tasks.map(task=>task.id===id?{...task,...change}:task);emit()}
const active=(task:ExportTask)=>task.state==='queued'||task.state==='running';
let initialization:Promise<void>|undefined;
export function initializeKoboExports(){
 return initialization??=Promise.all(['kobo','custom'].map(workspace=>createKoboApi(workspace as AnalysisWorkspace).exportRecovery())).then(groups=>{
  const records=groups.flat();
  for(const record of records){
   if(resources.has(record.id))continue;
   resources.set(record.id,{input:record.input,job:record.job,controller:new AbortController(),cancelled:false});
   tasks.push({id:record.id,filename:record.filename,project:record.input.projectName,format:record.input.format,state:'interrupted',progress:0,message:'This export was interrupted. Retry starts it again from the beginning.'});
  }
  tasks=[...tasks];emit();
 });
}
function persistRecovery(id:string,remove=false){
 const resource=resources.get(id),task=tasks.find(task=>task.id===id);
 if(!resource||!task)return Promise.resolve();
 const {snapshot:_,...input}=resource.input;
 const value={filename:task.filename,input,job:resource.job};
 const pending=(resource.persistence??Promise.resolve()).catch(()=>{}).then(()=>remove?createKoboApi(resource.input.workspace).removeExportRecovery(id):createKoboApi(resource.input.workspace).saveExportRecovery(id,value));
 resource.persistence=pending;
 return pending;
}
export const ongoingKoboExports=()=>tasks.filter(task=>active(task)||task.retrying||task.cancelPending||task.cancelError).length;
export async function cancelAllKoboExports(){
 closingExports=true;
 try{
 await Promise.all(tasks.filter(task=>active(task)||task.cancelError).map(task=>cancelKoboExport(task.id)));
 await new Promise<void>((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>;
  const check=()=>{
   if(tasks.some(task=>task.cancelError)){cleanup();reject(new Error('An export could not be cancelled. Retry cancellation or keep the app open.'));return}
   if(!ongoingKoboExports()){cleanup();resolve()}
  };
  const cleanup=()=>{clearTimeout(timer);listeners.delete(check)};
  timer=setTimeout(()=>{cleanup();reject(new Error('Still waiting for an export to cancel. Keep the app open and try again.'))},30000);
  listeners.add(check);check();
 });
 await Promise.all([...resources.values()].map(resource=>resource.persistence));
 }finally{closingExports=false}
}
const emptyTasks:ExportTask[]=[];
export const getKoboExports=()=>tasks;
export function useKoboExports(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener)}},getKoboExports,()=>emptyTasks)}
function finish(id:string,state:'complete'|'cancelled'|'error',message:string){
 const resource=resources.get(id);if(!resource)return;
 clearTimeout(resource.expiry);resource.completed=Date.now();patch(id,{state,message,progress:state==='complete'?100:tasks.find(task=>task.id===id)?.progress||0});
 if(!tasks.find(task=>task.id===id)?.cancelError)void persistRecovery(id,true).catch(()=>{});
 resource.expiry=window.setTimeout(()=>{
  if(resources.get(id)!==resource)return;
  resource.blob=undefined;resource.input.snapshot=undefined;resources.delete(id);
  patch(id,{state:'expired',message:'This file has expired. Start a new export.',downloading:false,downloadError:undefined});
 },lifetime);
}
export function startKoboExport(input:ExportInput){
 if(closingExports)throw new Error('Exports are being cancelled before closing. Keep the app open to start another export.');
 const settings=structuredClone(input.settings);
 const snapshot=input.snapshot&&JSON.stringify(input.snapshot.settings)===JSON.stringify(settings)?{...input.snapshot,settings,questions:input.question?input.snapshot.questions.filter(question=>question.id===input.question):input.snapshot.questions}:undefined;
 const captured={...input,workspace:input.workspace||analysisWorkspace(),settings,snapshot,separateGroups:input.separateGroups?[...input.separateGroups]:undefined};
 const id=crypto.randomUUID(),suffix=input.question?`-${input.question.split('/').pop()}`:'';
 const filename=(input.projectName+suffix).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+(input.format==='pdf'?'.pdf':input.excelMode==='binary'?'-01-pivots.xlsx':'.xlsx');
 resources.set(id,{input:captured,controller:new AbortController(),cancelled:false});
 tasks=[...tasks,{id,filename,project:input.projectName,format:input.format,state:'queued',progress:0,message:input.format==='pdf'?'Waiting for PDF processing':'Preparing Excel export'}];emit();
 void persistRecovery(id).then(()=>{
  if(resources.get(id)?.cancelled)return;
  const resource=resources.get(id);if(!resource)return;resource.ready=true;
  if(input.format==='pdf')pumpPdf();else void runExcel(id);
 }).catch(error=>finish(id,'error',`Could not save the export recovery record: ${error instanceof Error?error.message:String(error)}`));
 return id;
}
async function runExcel(id:string){
 const resource=resources.get(id);if(!resource)return;
 const {input,controller}=resource;
 const koboApi=createKoboApi(input.workspace);
 try{
  // Do not abort submission: retain the returned job ID so cancellation can stop it.
  let job=await koboApi.export(input.projectId,input.settings,input.question,undefined,input.separateGroups,input.chartMetric,input.excelMode);
  resource.job=job.id;
  await persistRecovery(id);
  if(resource.cancelled){await stopExcel(id,resource);return}
  for(;;){
   controller.signal.throwIfAborted();
   if(job.state==='error')throw new Error(job.message);
   if(job.state==='cancelled'){finish(id,'cancelled','Export cancelled');return}
   if(job.state==='complete')break;
   patch(id,{state:job.state,progress:job.progress,message:job.message,stage:job.stage,elapsedSeconds:job.elapsedSeconds,lastProgressSecondsAgo:job.lastProgressSecondsAgo,completedQuestions:job.completedQuestions,totalQuestions:job.totalQuestions});
   await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve()};const timer=window.setTimeout(done,1000);controller.signal.addEventListener('abort',done,{once:true})});
   controller.signal.throwIfAborted();job=await koboApi.job(job.id);
  }
  patch(id,{state:'running',progress:99,message:'Receiving Excel file',stage:job.stage,elapsedSeconds:job.elapsedSeconds,completedQuestions:job.completedQuestions,totalQuestions:job.totalQuestions,lastProgressSecondsAgo:job.lastProgressSecondsAgo});
  resource.blob=await koboApi.exportBlob(job.id,controller.signal);
  controller.signal.throwIfAborted();finish(id,'complete','Excel file ready');void downloadKoboExport(id);
 }catch(error){if(!resource.job||!resource.cancelled){
  let cancelError=false;
  if(resource.job){try{await koboApi.cancel(resource.job)}catch{cancelError=true}}
  patch(id,{cancelPending:false,cancelError});finish(id,'error',error instanceof Error?error.message:String(error));
 }}
}
function pumpPdf(){
 if(pdfRunning)return;
 const next=tasks.find(task=>task.format==='pdf'&&task.state==='queued'&&resources.get(task.id)?.ready);if(!next)return;
 pdfRunning=true;void runPdf(next.id).finally(()=>{pdfRunning=false;pumpPdf()});
}
async function runPdf(id:string){
 const resource=resources.get(id);if(!resource||resource.cancelled)return;
 const {input,controller}=resource;
 const koboApi=createKoboApi(input.workspace);
 patch(id,{state:'running',message:'Preparing PDF results'});
 try{
  const snapshot=input.snapshot||await koboApi.analyze(input.projectId,input.settings,controller.signal,input.question);
  controller.signal.throwIfAborted();
  const {buildKoboPdf}=await import('./koboPdf');controller.signal.throwIfAborted();
  resource.blob=await buildKoboPdf(input.projectName,snapshot,controller.signal,(progress,message)=>patch(id,{progress,message}),!input.question);
  controller.signal.throwIfAborted();finish(id,'complete','PDF file ready');void downloadKoboExport(id);
 }catch(error){if(!resource.cancelled)finish(id,'error',error instanceof Error?error.message:String(error))}
}
async function stopExcel(id:string,resource:Resource){
 try{await createKoboApi(resource.input.workspace).cancel(resource.job!);patch(id,{cancelPending:false,cancelError:false});finish(id,'cancelled','Export cancelled')}
 catch(error){patch(id,{cancelPending:false,cancelError:true});finish(id,'error',`Could not cancel: ${error instanceof Error?error.message:String(error)}`)}
}
export async function cancelKoboExport(id:string){
 const resource=resources.get(id),task=tasks.find(task=>task.id===id);if(!resource||!task||task.cancelPending)return;
 if(!active(task)&&!task.cancelError)return;
 resource.cancelled=true;resource.controller.abort();patch(id,{cancelPending:true,cancelError:false,message:'Cancelling export…'});
 if(resource.input.format==='excel'){
  // An in-flight submission must return its ID before cancellation is confirmed.
  if(resource.job)await stopExcel(id,resource);
  else if(!resource.ready){patch(id,{cancelPending:false});finish(id,'cancelled','Export cancelled')}
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
export async function retryKoboExport(id:string){
 const resource=resources.get(id),task=tasks.find(task=>task.id===id);if(!resource||!task||task.retrying||task.cancelError||task.cancelPending||active(task))return;
 patch(id,{retrying:true});
 if(tasks.find(task=>task.id===id)?.state==='interrupted'&&resource.job){
  try{await createKoboApi(resource.input.workspace).cancel(resource.job)}catch(error){patch(id,{retrying:false,message:`Could not stop the previous export: ${error instanceof Error?error.message:String(error)}`});return}
 }
 if(closingExports){patch(id,{retrying:false});finish(id,'cancelled','Export cancelled');return}
 const input={...resource.input};patch(id,{retrying:false});dismissKoboExport(id);startKoboExport(input);
}
export function dismissKoboExport(id:string){
 const task=tasks.find(task=>task.id===id);if(task&&(active(task)||task.retrying||task.cancelPending||task.cancelError))return;
 void persistRecovery(id,true).catch(()=>{});
 const resource=resources.get(id);if(resource){clearTimeout(resource.expiry);resource.blob=undefined;resource.input.snapshot=undefined}
 resources.delete(id);tasks=tasks.filter(task=>task.id!==id);emit();
}
