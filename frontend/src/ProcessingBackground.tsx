import {useEffect,useRef} from 'react';

type Renderer=(canvas:HTMLCanvasElement,options:{active:boolean;speed:number})=>()=>void;
declare global {interface Window {createProcessingRingField?:Renderer}}
let ready:Promise<Renderer>|undefined;
function loadRenderer(){
  if(window.createProcessingRingField)return Promise.resolve(window.createProcessingRingField);
  return ready??=new Promise<Renderer>((resolve,reject)=>{
    const script=document.createElement('script');
    script.type='module';script.src=`${import.meta.env.BASE_URL}processing-ring-field.js`;
    script.onload=()=>{if(window.createProcessingRingField)resolve(window.createProcessingRingField);else{ready=undefined;reject(new Error('Background unavailable'))}};
    script.onerror=()=>{script.remove();ready=undefined;reject(new Error('Background unavailable'))};
    document.head.append(script);
  });
}
export default function ProcessingBackground({active=true,speed=1}:{active?:boolean;speed?:number}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(host.current)return mountProcessingBackground(host.current,active,speed);
  },[active,speed]);
  return <div ref={host} className="legal-processing-background" aria-hidden="true"/>;
}

const owners:{host:HTMLElement;active:boolean;speed:number}[]=[];
let sharedCanvas:HTMLCanvasElement|null=null;
let sharedStop:(()=>void)|undefined;
let runningActive:boolean|undefined;
let runningSpeed:number|undefined;
let renderer:Renderer|undefined;
function syncBackground(){
  const owner=owners.at(-1);
  if(!owner){sharedStop?.();sharedStop=undefined;sharedCanvas?.remove();sharedCanvas=null;runningActive=undefined;return;}
  if(sharedCanvas&&runningActive!==undefined&&(runningActive!==owner.active||runningSpeed!==owner.speed)){sharedStop?.();sharedStop=undefined;sharedCanvas.remove();sharedCanvas=null;runningActive=undefined;}
  if(!sharedCanvas){sharedCanvas=document.createElement('canvas');sharedCanvas.className='processing-ring-field';}
  if(sharedCanvas.parentElement!==owner.host)owner.host.append(sharedCanvas);
  if(renderer&&!sharedStop){sharedStop=renderer(sharedCanvas,{active:owner.active,speed:owner.speed});runningActive=owner.active;runningSpeed=owner.speed;}
}
export function mountProcessingBackground(host:HTMLElement,active:boolean,speed=1){
  const owner={host,active,speed};owners.push(owner);syncBackground();
  if(!renderer)void loadRenderer().then(value=>{renderer=value;syncBackground();}).catch(()=>{/* CSS fallback stays visible. */});
  return()=>{
    const index=owners.indexOf(owner);if(index>=0)owners.splice(index,1);
    // A deferred workspace replaces its fallback within one React commit.
    // Let the next owner adopt the same canvas and running fluid field before
    // disposing it, avoiding a background reset between those surfaces.
    if(owners.length)syncBackground();
    else queueMicrotask(()=>{if(!owners.length)syncBackground()});
  };
}
