import {getLegalMetadata} from './api';
import type {LegalMetadata} from './types';

/** Poll startup readiness promptly, with at most one metadata request in flight. */
export function pollLegalMetadata(onMetadata:(metadata:LegalMetadata)=>void) {
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{
    try{
      const metadata=await getLegalMetadata(controller.signal);
      if(controller.signal.aborted)return;
      onMetadata(metadata);
      if(metadata.ready||!metadata.loading)return;
    }catch{
      if(controller.signal.aborted)return;
    }
    if(!controller.signal.aborted)timer=setTimeout(()=>void poll(),250);
  };
  timer=setTimeout(()=>void poll(),250);
  return ()=>{controller.abort();if(timer!==undefined)clearTimeout(timer)};
}
