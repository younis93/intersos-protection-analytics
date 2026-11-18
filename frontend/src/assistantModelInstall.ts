import {assistantRequest,assistantStream,type AssistantStatus} from './localAssistantApi';

type Phase='preparing'|'setup'|'download'|'paused'|'cancelled'|'complete'|'failed';
type State={name:string;phase:Phase;message:string;percent:number|null;paused:string[]};
let state:State={name:'',phase:'preparing',message:'',percent:null,paused:[]};
let operation:{id:string;controller:AbortController;stop?:'paused'|'cancelled'}|null=null;
const listeners=new Set<()=>void>();

export function subscribeModelInstall(listener:()=>void){
 listeners.add(listener);
 return ()=>{listeners.delete(listener);};
}
export const modelInstallState=()=>state;
export const modelInstallBusy=(value:State)=>Boolean(value.name)&&['preparing','setup','download'].includes(value.phase);

function update(changes:Partial<State>){
 state={...state,...changes};
 listeners.forEach(listener=>listener());
}

export async function installAssistantModel(name:string){
 if(operation)return;
 const job={id:crypto.randomUUID(),controller:new AbortController(),stop:undefined as 'paused'|'cancelled'|undefined};
 operation=job;
 const {signal}=job.controller;
 const resume=state.paused.includes(name);
 const readStatus=async():Promise<AssistantStatus>=>(await assistantRequest('/status',undefined,'GET',signal)).json();
 update({name,phase:'preparing',message:'Checking setup…',percent:null});
 try{
  let current=await readStatus();
  if(!current.installed&&!current.installing){
   if(!current.canInstall)throw new Error('Windows Package Manager is unavailable. Install Ollama on Windows, then try again.');
   update({phase:'setup',message:'Setting up Ollama…'});
   await assistantRequest('/install',{},'POST',signal);
   current=await readStatus();
  }
  while(current.installing){
   update({phase:'setup',message:'Ollama is installing. The model download will start when it is ready.'});
   await new Promise(resolve=>window.setTimeout(resolve,2000));
   signal.throwIfAborted();
   current=await readStatus();
  }
  if(!current.connected)throw new Error(current.installFailed?'Ollama installation did not finish. Try Install again.':'Ollama could not connect. Try Install again.');
  if(!current.models.some(item=>item.name===name)){
   const layers=new Map<string,{completed:number;total:number}>();
   const catalogBytes=(current.catalog.find(item=>item.name===name)?.size||0)*1e9;
   update({phase:'download',message:'Starting download…'});
   await assistantStream('/download',{model:name,operation:job.id,resume},signal,item=>{
    if(item.digest&&item.total){
     const previous=layers.get(item.digest);
     const completed=Math.min(item.total,Math.max(previous?.completed||0,item.completed||0));
     layers.set(item.digest,{completed,total:item.total});
    }
    const report=[...layers.values()];
    const bytes=report.reduce((sum,layer)=>sum+layer.completed,0);
    const expected=Math.max(catalogBytes,report.reduce((sum,layer)=>sum+layer.total,0));
    const percent=report.length&&expected?Math.min(99,Math.floor(100*bytes/expected)):null;
    const status=item.status||'';
    const message=status.includes('verif')||status.includes('manifest')&&bytes>0?'Verifying model files…':
     percent!==null?`${(bytes/1e9).toFixed(2)} GB downloaded`:'Preparing model files…';
    update({percent,message});
   });
  }
  signal.throwIfAborted();
  operation=null;
 update({phase:'complete',message:'Model installed.',percent:100,paused:state.paused.filter(item=>item!==name)});
 }catch(issue){
  operation=null;
  if(job.stop){
   update({phase:job.stop,message:job.stop==='paused'?'Model download paused.':'Model download cancelled.',
    paused:job.stop==='paused'?[...new Set([...state.paused,name])]:state.paused.filter(item=>item!==name)});
  }else update({phase:'failed',message:issue instanceof Error?issue.message:String(issue)});
 }
}

export function stopAssistantModelInstall(action:'paused'|'cancelled'){
 if(!operation||operation.stop)return;
 operation.stop=action;
 if(state.phase==='download')void assistantRequest('/stop',{operation:operation.id}).catch(()=>{});
 operation.controller.abort();
}

export function cancelPausedModel(name:string){
 update({name,phase:'cancelled',message:'Model download cancelled.',paused:state.paused.filter(item=>item!==name)});
}

export function clearModelInstallStatus(){
 if(!operation)update({name:'',phase:'preparing',message:'',percent:null,paused:[]});
}

export function dismissModelInstallMessage(name:string){
 if(!operation&&state.name===name)update({name:'',phase:'preparing',message:'',percent:null});
}
