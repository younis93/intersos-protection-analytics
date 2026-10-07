import {legalFetch,subscribeLegalQueryInvalidation} from './legalQueryCache';
import type {MessageLanguage} from './issueComposerSettings';
import type {LegalFlag} from './types';

export interface IssueFinding extends Pick<LegalFlag,'dataset'|'rule'|'severity'|'row'|'recordId'|'caseId'|'assessmentId'|'serviceId'|'hotlineId'|'awarenessId'|'detail'|'action'|'lawyer'|'project'|'location'> {id:string;ruleArabic:string;reviewPage:string;detailArabic?:string;affectedFields?:string[];affectedFieldValues?:Record<string,string>;duplicateMatches?:{caseId:string;row:number;lawyer:string;matchType:'exact'|'similar'|'contact-and-name'|'history';dataset?:string;assessmentId?:string;serviceId?:string;hotlineId?:string;awarenessId?:string;name?:string;sessionTopic?:string;date?:string;reference?:string;description?:string}[];matchingCases?:string;assessmentStatus?:string;requestForClosedStatus?:string;linkedServiceCount?:number;linkedServiceStatuses?:string}
export interface IssuesSnapshot {revision:string;lawyers:string[];rows:IssueFinding[];total:number;contacts:Record<string,string>;whatsappNumbers?:Record<string,string>}
let loadedSnapshot:IssuesSnapshot|null=null;
let snapshotGeneration=0;
subscribeLegalQueryInvalidation(()=>{snapshotGeneration++;loadedSnapshot=null;});
export const getCachedIssuesSnapshot=()=>loadedSnapshot;

export interface IssueDraft {language?:MessageLanguage;revision:string;lawyer:string;ids:string[];assignments:Record<string,string>;subject:string;introduction:string;introductionArabic:string;deadline:string;signature:string}
export interface IssuePreview {recipient:string;html:string;text:string;subject:string}
const base = (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '') + '/api/legal/send-issues';
async function request(path:string, init?:RequestInit, cached=false) {
  const response=await (cached?legalFetch:fetch)(base+path,init);
  if(!response.ok){const result=await response.json().catch(()=>({detail:'Request failed'}));throw new Error(typeof result.detail==='string'?result.detail:'Check the entered values and try again.');}
  return response;
}
const json = (body:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export async function loadIssues(signal?:AbortSignal,fresh=false,run:<T>(factory:()=>Promise<T>)=>Promise<T>=factory=>factory()):Promise<IssuesSnapshot>{
  const generation=snapshotGeneration;
  const assertCurrent=()=>{if(signal?.aborted||generation!==snapshotGeneration)throw new DOMException('Request superseded','AbortError');};
  const cached=fresh?null:loadedSnapshot;
  let page=1; let snapshot:IssuesSnapshot|undefined=cached||undefined; const rows:IssueFinding[]=cached?[...cached.rows]:[];
  if(!cached){
  do {
    const next:IssuesSnapshot=await (await run(()=>request('/findings',{...json({page,pageSize:5000}),signal},!fresh))).json();
    assertCurrent();
    if(snapshot&&snapshot.revision!==next.revision)throw new Error('Review data changed. Refresh Send Issues.');
    snapshot=next; rows.push(...next.rows);page++;
  }while(rows.length<snapshot.total);
  }
  assertCurrent();
  // Contacts are editable independently of the review revision. Refresh them without caching.
  if(!fresh){const current=await (await run(()=>request('/contacts',{signal}))).json();assertCurrent();const result={...snapshot!,rows,contacts:current.contacts,whatsappNumbers:current.whatsappNumbers||{}};loadedSnapshot=result;return result;}
  return {...snapshot!,rows};
}
export async function saveIssueContacts(contacts:Record<string,string>,whatsappNumbers:Record<string,string>={}):Promise<{contacts:Record<string,string>;whatsappNumbers:Record<string,string>}>{
  const saved=await (await request('/contacts',{...json({contacts,whatsappNumbers}),method:'PUT'})).json();
  if(loadedSnapshot)loadedSnapshot={...loadedSnapshot,contacts:saved.contacts,whatsappNumbers:saved.whatsappNumbers||{}};
  return saved;
}
export async function previewIssueDraft(draft:IssueDraft):Promise<IssuePreview>{return (await request('/preview',json(draft))).json();}
export async function downloadIssueDraft(draft:IssueDraft):Promise<Blob>{return (await request('/draft',json(draft))).blob();}
export const isIssueEmailValid=(email:string)=>email.length<=254&&/^[^\s@<>;,\r\n]+@[^\s@<>;,\r\n]+\.[^\s@<>;,\r\n]+$/.test(email);
