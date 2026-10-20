import type {KoboAnalysis,KoboJob,KoboPreview,KoboProject,KoboSettings,KoboMapping,KoboResult,KoboSettingsReview} from './koboTypes';
const base = (import.meta.env.DEV?'http://127.0.0.1:8000':'')+'/api/kobo';
export async function koboRequest<T>(path:string,body?:unknown,method=body===undefined?'GET':'POST',signal?:AbortSignal):Promise<T>{
 const response=await fetch(base+path,{method,credentials:'include',keepalive:method==='PUT',headers:body instanceof FormData?undefined:body===undefined?undefined:{'Content-Type':'application/json'},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal});
 if(!response.ok){const issue=await response.json().catch(()=>({detail:response.statusText}));const detail=issue.detail;throw new Error(typeof detail==='string'?detail:Array.isArray(detail)?detail.map((i:{msg?:string})=>i.msg||'Invalid input').join('; '):detail?.message?`${detail.message}\n${(detail.issues||[]).map((i:{question:string;message:string;count:number})=>`${i.question}: ${i.message} (${i.count})`).join('\n')}`:JSON.stringify(detail))}
 return response.json();
}
export const koboApi={
 exportSettings:async(id:string,name:string,settings:KoboSettings)=>{const file=await koboRequest<unknown>(`/projects/${id}/settings/export`,settings);downloadBlob(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}),`${name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'Kobo'}.kobo-settings.json`)},
 previewSettings:(id:string,settings:KoboSettings,pack:unknown)=>koboRequest<KoboSettingsReview>(`/projects/${id}/settings/import-preview`,{settings,package:pack}),
 rename:(id:string,name:string)=>koboRequest<{id:string;name:string;updated:string}>(`/projects/${encodeURIComponent(id)}`,{name},'PATCH'),
 exportData:async(id:string,body:{settings:KoboSettings;scope:string;columns:string[];search:string;sortColumn:string;sortDirection:'asc'|'desc';selectedIds?:string[];drilldown?:import('./koboTypes').KoboPivotDrilldown})=>{
  const response=await fetch(`${base}/projects/${encodeURIComponent(id)}/data/export`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){const issue=await response.json().catch(()=>({detail:'Unable to download response data.'}));throw new Error(typeof issue.detail==='string'?issue.detail:'Unable to download response data.')}
  downloadBlob(await response.blob(),'kobo-response-data.xlsx');
 },
 list:()=>koboRequest<{id:string;name:string;updated:string}[]>('/projects'),
 review:(id:string,form?:File,data?:File)=>{const body=new FormData();if(form)body.append('form',form);if(data)body.append('data',data);return koboRequest<KoboPreview>(`/projects/${id}/review`,body)},
 check:(token:string,mappings:KoboMapping[],policies:Record<string,string>,signal?:AbortSignal)=>koboRequest<{issues:KoboPreview['issues'];examples:KoboPreview['examples'];linkReview:KoboPreview['linkReview']}>(`/imports/${token}/check`,{mappings,policies},'POST',signal),
 get:(id:string)=>koboRequest<KoboProject>(`/projects/${id}`),
 remove:(id:string)=>koboRequest(`/projects/${id}`,undefined,'DELETE'),
 save:(id:string,settings:KoboSettings)=>koboRequest(`/projects/${id}/settings`,settings,'PUT'),
 preview:(form:File,data:File)=>{const body=new FormData();body.append('form',form);body.append('data',data);return koboRequest<KoboPreview>('/imports/preview',body)},
 confirm:(token:string,name:string,mappings:KoboMapping[],policies:Record<string,string>,acceptInvalid:boolean,settingsPackage?:unknown)=>koboRequest<KoboProject>('/imports/confirm',{token,name,mappings,policies,acceptInvalid,settingsPackage}),
 previewImportSettings:(token:string,mappings:KoboMapping[],policies:Record<string,string>,pack:unknown)=>koboRequest<KoboSettingsReview>(`/imports/${token}/settings-preview`,{mappings,policies,package:pack}),
 cancelImport:(token:string)=>koboRequest(`/imports/${token}`,undefined,'DELETE'),
 analyze:(id:string,settings:KoboSettings,signal?:AbortSignal,question='')=>koboRequest<KoboAnalysis>(`/projects/${id}/analysis`,{settings,question},'POST',signal),
 previewQuestion:(id:string,settings:KoboSettings,question:string,signal?:AbortSignal)=>koboRequest<KoboResult>(`/projects/${id}/analysis/preview`,{settings,question},'POST',signal),
 options:(id:string,q:string)=>koboRequest<string[]>(`/projects/${id}/filter-options/${q.split('/').map(encodeURIComponent).join('/')}`),
 responses:(id:string,settings:KoboSettings,question:string,search:string,page:number,signal?:AbortSignal)=>koboRequest<{total:number;rows:{id:string;row:number;value:unknown}[]}>(`/projects/${id}/responses`,{settings,question,search,page,pageSize:50},'POST',signal),
 export:(id:string,settings:KoboSettings,question='',signal?:AbortSignal,separateGroups?:string[],chartMetric:'count'|'percent'|'both'='count')=>koboRequest<KoboJob>(`/projects/${id}/exports`,{settings,question,separateGroups,chartMetric},'POST',signal),
 job:(id:string)=>koboRequest<KoboJob>(`/exports/${id}`),
 cancel:(id:string)=>koboRequest(`/exports/${id}`,undefined,'DELETE'),
 exportBlob:async(id:string,signal?:AbortSignal)=>{const r=await fetch(`${base}/exports/${id}/download`,{credentials:'include',signal});if(!r.ok)throw new Error('Excel download failed. Please retry.');return r.blob()},
 download:async(id:string)=>downloadBlob(await koboApi.exportBlob(id),'kobo-analysis.xlsx'),
};
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
