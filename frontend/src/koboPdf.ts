import type {KoboAnalysis} from './koboTypes';
import {downloadBlob} from './koboApi';
import {koboPdfChartKey,koboPdfChartPanels} from './koboChartDensity';

export function buildKoboPdf(name:string,snapshot:KoboAnalysis,signal:AbortSignal,onProgress:(progress:number,message:string)=>void):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Export cancelled','AbortError'));return}
  const worker=new Worker(new URL('./koboPdf.worker.ts',import.meta.url),{type:'module'});
  const charts=snapshot.questions.filter(result=>result.denominator>0).flatMap(koboPdfChartPanels);
  const chartIndex=new Map(charts.map((result,index)=>[koboPdfChartKey(result),index]));
  const images=new Map<string,Promise<string>>(),rendering=new AbortController();
  const render=(id:string)=>{
   const existing=images.get(id);if(existing)return existing;
   const image=(async()=>{
    // Yield between sequential Plotly renders while the worker lays out the previous question.
    await new Promise(resolve=>setTimeout(resolve,0));rendering.signal.throwIfAborted();
    const {koboChartImage}=await import('./KoboChart');rendering.signal.throwIfAborted();
    const index=chartIndex.get(id),result=index===undefined?undefined:charts[index];if(!result)throw new Error('Question missing from export snapshot.');
    return koboChartImage(result,snapshot.settings.language,'png',rendering.signal);
   })();images.set(id,image);return image;
  };
  const cleanup=()=>{signal.removeEventListener('abort',abort);rendering.abort();images.clear();worker.terminate()};
  const fail=(error:unknown)=>{cleanup();reject(error)};
  const abort=()=>fail(new DOMException('Export cancelled','AbortError'));
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=event=>fail(new Error(event.message||'PDF processing failed. Please retry.'));
  worker.onmessage=async event=>{
   if(signal.aborted)return;
   const message=event.data;
   if(message.type==='progress')onProgress(message.progress,message.message);
   else if(message.type==='complete'){cleanup();resolve(new Blob([message.data],{type:'application/pdf'}))}
   else if(message.type==='error')fail(new Error(message.message));
   else if(message.type==='chart'){
    try{
     const image=await render(message.key);
     if(signal.aborted||rendering.signal.aborted)return;
     worker.postMessage({type:'image',image});images.delete(message.key);
     // Keep at most one upcoming image, never the complete report's images.
     const next=charts[(chartIndex.get(message.key)??-1)+1];
     if(next)void render(koboPdfChartKey(next)).catch(()=>{});
    }catch(error){if(!signal.aborted)fail(error)}
   }
  };
  worker.postMessage({type:'start',name,snapshot});
 });
}
export async function exportKoboPdf(name:string,snapshot:KoboAnalysis){
 const blob=await buildKoboPdf(name,snapshot,new AbortController().signal,()=>{});
 downloadBlob(blob,name.replace(/[<>:"/\\|?*]/g,'_')+'.pdf');
}
