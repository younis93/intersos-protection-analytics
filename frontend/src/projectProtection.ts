export const projectUploadLimit=200*1024*1024+53;
export const projectFileAccept='.zip,.intersos,application/zip,application/octet-stream';
export const passwordLength=(value:string)=>Array.from(value).length;
export function exportPasswordError(password:string,confirmation:string){
 if(passwordLength(password)<8||passwordLength(password)>1024)return 'Use a password between 8 and 1024 characters.';
 return password===confirmation?'':'The passwords do not match.';
}
export async function isProtectedProject(file:File){
 return new TextDecoder().decode(await file.slice(0,8).arrayBuffer())==='INTERSOS';
}
export class ProjectTransferError extends Error{
 constructor(public code:string,message:string){super(message)}
}
export function projectResponseError(detail:unknown,fallback:string){
 if(typeof detail==='object'&&detail!==null&&'message' in detail){const issue=detail as {code?:string;message:string};return new ProjectTransferError(issue.code||'invalid_backup',issue.message)}
 return new ProjectTransferError('invalid_backup',typeof detail==='string'?detail:fallback);
}
