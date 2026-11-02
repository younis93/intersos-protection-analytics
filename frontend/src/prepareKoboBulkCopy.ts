import type {KoboAnalysis} from './koboTypes';
import type {buildKoboBulkCopy} from './koboBulkCopy';
export function prepareKoboBulkCopy(analysis:KoboAnalysis,stores:Map<string,Map<string,unknown>>|undefined,progress:(message:string)=>void,signal:AbortSignal){
 return new Promise<Awaited<ReturnType<typeof buildKoboBulkCopy>>>((resolve,reject)=>{
  const worker=new Worker(new URL('./koboBulkCopy.worker.ts',import.meta.url),{type:'module'});
  const stop=()=>{worker.terminate();signal.removeEventListener('abort',cancel)};
  const cancel=()=>{stop();reject(new DOMException('Copy preparation cancelled','AbortError'))};
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return}
  worker.onerror=()=>{stop();reject(new Error('Unable to prepare formatted tables. Please retry.'))};
  worker.onmessage=event=>{if(event.data.progress)progress(event.data.progress);else if(event.data.error){stop();reject(new Error(event.data.error))}else if(event.data.result){stop();resolve(event.data.result)}};
  const sorts=new Map([...stores||[]].map(([id,state])=>[id,new Map([['pivotSort',state.get('pivotSort')]])]));
  worker.postMessage({analysis,sorts});
 });
}
