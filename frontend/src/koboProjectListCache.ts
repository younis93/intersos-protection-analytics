import {createKoboApi,type AnalysisWorkspace} from './koboApi';
import type {KoboProjectListItem} from './koboProjectList';

type Snapshot={projects:KoboProjectListItem[]|null;error:string;loading:boolean};

function createProjectListCache(workspace:AnalysisWorkspace){
 const api=createKoboApi(workspace);
 const listeners=new Set<()=>void>();
 let snapshot:Snapshot={projects:null,error:'',loading:false};
 let pending:Promise<void>|undefined;

 const publish=(next:Snapshot)=>{
  snapshot=next;
  listeners.forEach(listener=>listener());
 };
 const refresh=()=>{
  if(pending)return pending;
  const read=api.list().then(projects=>{
   if(pending!==read)return;
   pending=undefined;
   publish({projects,error:'',loading:false});
  },issue=>{
   if(pending!==read)return;
   pending=undefined;
   publish({...snapshot,error:issue instanceof Error?issue.message:String(issue),loading:false});
  });
  pending=read;
  publish({...snapshot,error:'',loading:true});
  return read;
 };
 return {
  getSnapshot:()=>snapshot,
  subscribe:(listener:()=>void)=>{
   listeners.add(listener);
   return ()=>{listeners.delete(listener)};
  },
  refresh,
  changed:(update?:(projects:KoboProjectListItem[])=>KoboProjectListItem[])=>{
   pending=undefined;
   if(update&&snapshot.projects)publish({...snapshot,projects:update(snapshot.projects)});
   return refresh();
  },
 };
}

export const koboProjectLists={
 kobo:createProjectListCache('kobo'),
 custom:createProjectListCache('custom'),
};
