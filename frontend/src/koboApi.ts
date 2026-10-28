import {projectResponseError} from './projectProtection';
import type {KoboAnalysis,KoboJob,KoboPreview,KoboProject,KoboSettings,KoboMapping,KoboResult,KoboSettingsReview,KoboReviewConfig,KoboChoiceComparison,KoboChoiceImpact} from './koboTypes';
export type AnalysisWorkspace='kobo'|'custom';
export const analysisWorkspace=():AnalysisWorkspace=>typeof window!=='undefined'&&/^#\/custom(?:\/|$)/.test(window.location?.hash||'')?'custom':'kobo';
export const analysisBase=(workspace=analysisWorkspace())=>(import.meta.env.DEV?'http://127.0.0.1:8000':'')+'/api/'+workspace;
export const analysisRoute=()=>`#/${analysisWorkspace()}`;
export const analysisLabel=(kobo:string,custom:string)=>analysisWorkspace()==='custom'?custom:kobo;
export const keepaliveLimit=64*1024;
export const keepaliveBodyAllowed=(body:string)=>new TextEncoder().encode(body).byteLength<=keepaliveLimit;
let pageHideSavePending=false;
export async function koboRequest<T>(path:string,body?:unknown,method=body===undefined?'GET':'POST',signal?:AbortSignal,transport?:{keepalive:boolean},workspace?:AnalysisWorkspace):Promise<T>{
 const encoded=body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body);
 let response:Response;
 try{response=await fetch(analysisBase(workspace)+path,{method,credentials:'include',keepalive:transport?.keepalive===true&&typeof encoded==='string'&&keepaliveBodyAllowed(encoded),headers:body instanceof FormData?undefined:body===undefined?undefined:{'Content-Type':'application/json'},body:encoded,signal})}
 catch(reason){if(method==='PUT'&&reason instanceof TypeError)throw new Error('Could not confirm the settings save. Your changes are still open. Check the connection to the application backend and retry.');throw reason}
 if(!response.ok){const issue=await response.json().catch(()=>({detail:response.statusText}));const detail=issue.detail;if(detail?.code)throw projectResponseError(detail,'Unable to complete project transfer.');throw new Error(typeof detail==='string'?detail:Array.isArray(detail)?detail.map((i:{msg?:string})=>i.msg||'Invalid input').join('; '):detail?.message?`${detail.message}\n${(detail.issues||[]).map((i:{question:string;message:string;count:number})=>`${i.question}: ${i.message} (${i.count})`).join('\n')}`:JSON.stringify(detail))}
 return response.json();
}
export function createKoboApi(workspace?:AnalysisWorkspace){
 const exportBlob=async(id:string,signal?:AbortSignal)=>{const r=await fetch(`${analysisBase(workspace)}/exports/${id}/download`,{credentials:'include',signal});if(!r.ok)throw new Error('Excel download failed. Please retry.');return r.blob()};
 const request=<T,>(path:string,body?:unknown,method=body===undefined?'GET':'POST',signal?:AbortSignal,transport?:{keepalive:boolean})=>koboRequest<T>(path,body,method,signal,transport,workspace);
 return {
 exportSettings:async(id:string,name:string,settings:KoboSettings)=>{const file=await request<unknown>(`/projects/${id}/settings/export`,settings);downloadBlob(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}),`${name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'Kobo'}.kobo-settings.json`)},
 previewSettings:(id:string,settings:KoboSettings,pack:unknown)=>request<KoboSettingsReview>(`/projects/${id}/settings/import-preview`,{settings,package:pack}),
 rename:(id:string,name:string)=>request<{id:string;name:string;updated:string}>(`/projects/${encodeURIComponent(id)}`,{name},'PATCH'),
 exportData:async(id:string,body:{settings:KoboSettings;scope:string;columns:string[];search:string;sortColumn:string;sortDirection:'asc'|'desc';columnFilters?:import('./columnFilters').ColumnFilter[];selectedIds?:string[];drilldown?:import('./koboTypes').KoboPivotDrilldown})=>{
  const response=await fetch(`${analysisBase(workspace)}/projects/${encodeURIComponent(id)}/data/export`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){const issue=await response.json().catch(()=>({detail:'Unable to download response data.'}));throw new Error(typeof issue.detail==='string'?issue.detail:'Unable to download response data.')}
  downloadBlob(await response.blob(),'kobo-response-data.xlsx');
 },
 list:()=>request<{id:string;name:string;updated:string}[]>('/projects'),
 review:(id:string,form?:File,data?:File)=>{const body=new FormData();if(form)body.append('form',form);if(data)body.append('data',data);return request<KoboPreview>(`/projects/${id}/review`,body)},
 check:(token:string,mappings:KoboMapping[],policies:Record<string,string>,signal?:AbortSignal,reviewConfig?:KoboReviewConfig)=>request<{questionImpacts?:{name:string;issues:string[]}[];choiceImpacts?:KoboChoiceImpact[];issues:KoboPreview['issues'];examples:KoboPreview['examples'];linkReview:KoboPreview['linkReview']}>(`/imports/${token}/check`,{mappings,policies,reviewConfig},'POST',signal),
 get:(id:string)=>request<KoboProject>(`/projects/${id}`),
 remove:(id:string)=>request(`/projects/${id}`,undefined,'DELETE'),
 save:(id:string,settings:KoboSettings)=>request(`/projects/${id}/settings`,settings,'PUT'),
 saveOnPageHide:(id:string,settings:KoboSettings)=>{
  if(pageHideSavePending||!keepaliveBodyAllowed(JSON.stringify(settings)))return false;
  pageHideSavePending=true;
  void request(`/projects/${id}/settings`,settings,'PUT',undefined,{keepalive:true}).catch(()=>{}).finally(()=>{pageHideSavePending=false});
  return true;
 },
 worksheets:(data:File,signal?:AbortSignal)=>{const body=new FormData();body.append('data',data);return request<{worksheets:string[]}>('/imports/worksheets',body,'POST',signal)},
 preview:(form:File,data:File,worksheet='')=>{const body=new FormData();body.append('form',form);body.append('data',data);if(worksheet)body.append('worksheet',worksheet);return request<KoboPreview>('/imports/preview',body)},
 confirm:(token:string,name:string,mappings:KoboMapping[],policies:Record<string,string>,acceptInvalid:boolean,settingsPackage?:unknown,reviewConfig?:KoboReviewConfig,reuseOnly=false)=>request<KoboProject>('/imports/confirm',{token,name,mappings,policies,acceptInvalid,settingsPackage,reviewConfig,reuseOnly}),
 previewImportSettings:(token:string,mappings:KoboMapping[],policies:Record<string,string>,pack:unknown,reviewConfig?:KoboReviewConfig)=>request<KoboSettingsReview>(`/imports/${token}/settings-preview`,{mappings,policies,package:pack,reviewConfig}),
 reviewChoices:(token:string,mappings:KoboMapping[],reviewConfig:KoboReviewConfig,question:string,separator:string,signal?:AbortSignal)=>request<KoboChoiceComparison>(`/imports/${token}/choices`,{mappings,reviewConfig,question,separator},'POST',signal),
 cancelImport:(token:string)=>request(`/imports/${token}`,undefined,'DELETE'),
 analyze:(id:string,settings:KoboSettings,signal?:AbortSignal,question='')=>request<KoboAnalysis>(`/projects/${id}/analysis`,{settings,question},'POST',signal),
 previewQuestion:(id:string,settings:KoboSettings,question:string,signal?:AbortSignal)=>request<KoboResult>(`/projects/${id}/analysis/preview`,{settings,question},'POST',signal),
 options:(id:string,q:string)=>request<string[]>(`/projects/${id}/filter-options/${q.split('/').map(encodeURIComponent).join('/')}`),
 responses:(id:string,settings:KoboSettings,question:string,search:string,page:number,signal?:AbortSignal,columnFilters:import("./columnFilters").ColumnFilter[]=[])=>request<{total:number;rows:{id:string;row:number;value:unknown}[]}>(`/projects/${id}/responses`,{settings,question,search,page,pageSize:50,columnFilters},'POST',signal),
 export:(id:string,settings:KoboSettings,question='',signal?:AbortSignal,separateGroups?:string[],chartMetric:'count'|'percent'|'both'='count',excelMode:'native'|'binary'='native')=>request<KoboJob>(`/projects/${id}/exports`,{settings,question,separateGroups,chartMetric,excelMode},'POST',signal),
 job:(id:string)=>request<KoboJob>(`/exports/${id}`),
 exportRecovery:()=>request<import('./koboExportManager').ExportRecovery[]>('/export-recovery'),
 saveExportRecovery:(id:string,task:Omit<import('./koboExportManager').ExportRecovery,'id'>)=>request(`/export-recovery/${id}`,task,'PUT'),
 removeExportRecovery:(id:string)=>request(`/export-recovery/${id}`,undefined,'DELETE'),
 cancel:(id:string)=>request(`/exports/${id}`,undefined,'DELETE'),
 exportBlob,
 download:async(id:string)=>downloadBlob(await exportBlob(id),`${workspace||analysisWorkspace()}-analysis.xlsx`),
};
}
export const koboApi=createKoboApi();
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
