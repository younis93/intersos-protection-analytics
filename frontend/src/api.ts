import type {Dashboard,Filters,Metadata,QualityRow,StudioResult,UpdateCheck,UpdateStatus} from './types';
const API=import.meta.env.DEV?'http://127.0.0.1:8000/api':'/api';
async function parse<T>(r:Response):Promise<T>{if(!r.ok){const x=await r.json().catch(()=>({detail:r.statusText}));throw new Error(x.detail||'Request failed')}return r.json()}
export const getMetadata=()=>fetch(`${API}/metadata`,{cache:'no-store'}).then(parse<Metadata>);
export const getQuality=()=>fetch(`${API}/quality`,{cache:'no-store'}).then(parse<{rows:QualityRow[];source:string;loadedAt:string}>);
export const getDashboard=(page:string,filters:Filters,measure:string)=>fetch(`${API}/dashboard/${page}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters,measure,defaultYtd:false})}).then(parse<Dashboard>);
export const uploadWorkbook=async(file:File,onProgress?:(percent:number)=>void)=>{const body=new FormData();body.append('file',file);let progress=4;onProgress?.(progress);const timer=window.setInterval(()=>{progress=Math.min(progress+(progress<70?7:progress<90?3:1),95);onProgress?.(progress)},450);try{const result=await fetch(`${API}/upload`,{method:'POST',body}).then(parse<Metadata>);onProgress?.(100);return result}finally{window.clearInterval(timer)}};
export const exportUrl=(page:string,filters:Filters)=>`${API}/export/${page}?filters=${encodeURIComponent(JSON.stringify(filters))}&default_ytd=false`;
export const getStudio=(page:string,rowDimension:string,columnDimension:string,filters:Filters,measure:string,signal?:AbortSignal)=>fetch(`${API}/studio`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page,rowDimension,columnDimension:columnDimension||null,filters,measure,defaultYtd:false}),signal}).then(parse<StudioResult>);
export const checkForUpdates=()=>fetch(`${API}/update/check`,{cache:'no-store'}).then(parse<UpdateCheck>);
export const getUpdateStatus=()=>fetch(`${API}/update/status`,{cache:'no-store'}).then(parse<UpdateStatus>);
export const installUpdate=()=>fetch(`${API}/update/install`,{method:'POST'}).then(parse<UpdateStatus>);
