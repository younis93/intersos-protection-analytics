import {useEffect,useState} from 'react';

export interface LegalImportProgress {
  operationId:string|null;state:'idle'|'preparing'|'processing'|'complete'|'error';
  source?:string;stage:string;dataset:string;completedWork:number;totalWork:number;percent:number|null;error:string;
}
const API=(import.meta.env.DEV?'http://127.0.0.1:8000':'')+'/api/legal/import/status';
export async function getImportProgress(operationId:string|null,signal?:AbortSignal):Promise<LegalImportProgress>{
  const response=await fetch(API+(operationId?'?operationId='+encodeURIComponent(operationId):''),{cache:'no-store',signal});
  if(!response.ok)throw new Error('Unable to read import progress.');
  return response.json();
}

export function pollImportProgress(operationId:string|null,onProgress:(value:LegalImportProgress)=>void,read=getImportProgress){
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{
    let terminal=false;
    try{
      const next=await read(operationId,controller.signal);
      if(!controller.signal.aborted&&(!operationId||next.operationId===operationId)){
        onProgress(next);terminal=next.state==='complete'||next.state==='error';
      }
    }catch{/* The import request reports failures; a missed status update can be retried. */}
    if(!terminal&&!controller.signal.aborted)timer=setTimeout(()=>void poll(),250);
  };
  void poll();
  return()=>{controller.abort();if(timer!==undefined)clearTimeout(timer);};
}

export function useImportProgress(active:boolean,operationId:string|null){
  const [progress,setProgress]=useState<LegalImportProgress|null>(null);
  useEffect(()=>{
    setProgress(null);
    if(!active)return;
    return pollImportProgress(operationId,setProgress);
  },[active,operationId]);
  return progress;
}
