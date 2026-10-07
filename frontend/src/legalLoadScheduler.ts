import {
  getIndicatorReconciliationMetadata,
  getLegalAnalyticsDashboard,
  getLegalCase,
  getLegalCaseFilters,
  getLegalDeportationDashboard,
  getLegalDetention,
  getLegalExplorer,
  getLegalExplorerFilters,
  getLegalHotlineDashboard,
  getLegalIndicators,
  getLegalIndicatorsMonthly,
  getLegalIntelligence,
  getLegalReview,
  getRepresentationCaseLoad,
} from "./api";
import {loadIssues} from "./sendIssuesApi";
import {hasLegalCore, isLegalPageAvailable} from './legalAvailability';
import type {LegalMetadata, LegalReview} from "./types";
import {
  subscribeLegalFetchActivity,
  subscribeLegalQueryInvalidation,
  withLegalFetchPriority,
} from "./legalQueryCache";

export type LoadPriority = "foreground" | "main-background" | "secondary-background";
export type LoadStatus = "idle" | "queued" | "loading" | "ready" | "error";
export type PageLoadRequest = <T>(request: () => Promise<T>) => Promise<T>;
export interface PageLoadTask {
  id: string;
  page: string;
  tab?: string;
  phase: "main" | "secondary";
  priority: LoadPriority;
  available: (metadata: LegalMetadata) => boolean;
  run: (signal: AbortSignal, request: PageLoadRequest) => Promise<unknown>;
}

type TaskState = PageLoadTask & {status: LoadStatus; error?: unknown};
type StatusListener = (statuses: Record<string, LoadStatus>) => void;

const reviewRequest = (dataset:string, rule:string, signal:AbortSignal) =>
  getLegalReview(dataset,"",rule,1,{},"",15,dataset==="legalhotlines",Boolean(rule)&&dataset!=="legalhotlines",signal);

function defaultReviewRules(dataset:string, result:LegalReview) {
  const beneficiaryDefaults=["Possible duplicate name","Possible duplicate contact and name","Invalid contact number","Case without assessment","Invalid age"];
  const assessmentDeferred=new Set(["Representation while not detained","Detention/immigration inconsistency","Detained beneficiary below 10 years"]);
  const awarenessDeferred=new Set(["Possible duplicate participant name"]);
  if(dataset==="beneficiaries")return beneficiaryDefaults.filter((rule)=>(result.ruleCounts[rule]||0)>0);
  return Object.entries(result.ruleCounts)
    .filter(([rule,count])=>count>0&&(dataset!=="assessments"||!assessmentDeferred.has(rule))&&(dataset!=="awareness"||!awarenessDeferred.has(rule)))
    .map(([rule])=>rule);
}

export function taskManifest(metadata:LegalMetadata):PageLoadTask[] {
  const core=hasLegalCore(metadata);
  const has=(name:string)=>Boolean(metadata.availability[name]);
  const main=(id:string,page:string,available:PageLoadTask["available"],run:PageLoadTask["run"]):PageLoadTask=>({id,page,phase:"main",priority:"main-background",available,run});
  const secondary=(id:string,page:string,tab:string,available:PageLoadTask["available"],run:PageLoadTask["run"]):PageLoadTask=>({id,page,tab,phase:"secondary",priority:"secondary-background",available,run});
  const analytics=(dataset:string,signal:AbortSignal,request:PageLoadRequest)=>request(()=>getLegalAnalyticsDashboard({dataset,filters:{},search:"",page:1,pageSize:100,sortColumn:"",sortDirection:"asc"},signal));
  const tasks:PageLoadTask[]=[
    main("overview:main","overview",()=>core,async()=>metadata.overview),
    main("hotline:main","hotline",()=>has("legalhotlines"),async(signal,request)=>Promise.all([
      request(()=>getLegalHotlineDashboard({},signal)),
      request(()=>getLegalExplorer("legalhotlines","",1,{},"","asc",100,signal)),
    ])),
    main("indicators:main","indicators",()=>core,(signal,request)=>request(()=>getLegalIndicators([],[],[],[],[],[],signal))),
    main("legalhotlines:main","legalhotlines",()=>has("legalhotlines"),(signal,request)=>request(()=>reviewRequest("legalhotlines","",signal))),
    ...["beneficiaries","assessments","legalservices","awareness"].map((dataset)=>main(`${dataset}:main`,dataset,()=>isLegalPageAvailable(metadata,dataset),(signal,request)=>request(()=>reviewRequest(dataset,"",signal)))),
    main("send-issues:main","send-issues",()=>isLegalPageAvailable(metadata,'send-issues'),(signal,request)=>loadIssues(signal,false,request)),
    main("detention:main","detention",()=>core&&Boolean(metadata.features?.detention),(signal,request)=>request(()=>getLegalDetention("",1,{},"","asc",signal))),
    main("deportation:main","deportation",()=>has('deportationrecords'),async(signal,request)=>Promise.all([
      request(()=>getLegalDeportationDashboard({},signal)),
      request(()=>getLegalExplorer("deportationrecords","",1,{},"","asc",100,signal)),
    ])),
    main("lawyer-intelligence:main","lawyer-intelligence",()=>core,(signal,request)=>request(()=>getLegalIntelligence("lawyer-intelligence",{},signal))),
    main("studio:main","studio",()=>core,(signal,request)=>analytics("assessments",signal,request)),
    main("explorer:main","explorer",()=>isLegalPageAvailable(metadata,'explorer'),async(signal,request)=>{
      const dataset=metadata.sheets[0]?.id||"beneficiaries";
      return Promise.all([request(()=>getLegalExplorer(dataset,"",1,{},"","asc",100,signal)),request(()=>getLegalExplorerFilters(dataset,signal))]);
    }),
    main("cases:main","cases",()=>core,async(signal,request)=>Promise.all([
      request(()=>getLegalCase("",{},{viewMode:"cards",page:1,pageSize:100,sortColumn:"",sortDirection:"asc",columns:[]},signal)),
      request(()=>getLegalCaseFilters(signal)),
    ])),
    secondary("indicators:analysis","indicators","analysis",()=>core,async(signal,request)=>{
      const report=await request(()=>getLegalIndicators([],[],[],[],[],[],signal));
      const months=report.filterOptions.months.filter((month)=>month.startsWith("2026-")).sort((a,b)=>b.localeCompare(a));
      if(months.length)await request(()=>getLegalIndicatorsMonthly([],[],[],[],months,[],signal));
    }),
    secondary("indicators:check","indicators","check",()=>core,(signal,request)=>request(()=>getIndicatorReconciliationMetadata(signal))),
    ...["beneficiaries","assessments","legalservices","awareness"].map((dataset)=>secondary(`${dataset}:findings`,dataset,"findings",()=>isLegalPageAvailable(metadata,dataset),async(signal,request)=>{
      const result=await request(()=>reviewRequest(dataset,"",signal));
      for(const rule of defaultReviewRules(dataset,result))await request(()=>reviewRequest(dataset,rule,signal));
    })),
    secondary("detention:records","detention","records",()=>core&&Boolean(metadata.features?.detention),(signal,request)=>request(()=>getLegalDetention("",1,{},"","asc",signal))),
    secondary("lawyer-intelligence:open","lawyer-intelligence","open",()=>core,(signal,request)=>request(()=>getRepresentationCaseLoad("open",{},signal))),
    secondary("lawyer-intelligence:closed","lawyer-intelligence","closed",()=>core,(signal,request)=>request(()=>getRepresentationCaseLoad("closed",{},signal))),
    secondary("studio:legalservices","studio","legalservices",()=>core,(signal,request)=>analytics("legalservices",signal,request)),
    secondary("studio:beneficiaries","studio","beneficiaries",()=>core,(signal,request)=>analytics("beneficiaries",signal,request)),
    secondary("studio:awareness","studio","awareness",()=>core&&has("awareness"),(signal,request)=>analytics("awareness",signal,request)),
    secondary("cases:table","cases","table",()=>core,(signal,request)=>request(()=>getLegalCase("",{},{viewMode:"table",page:1,pageSize:100,sortColumn:"",sortDirection:"asc",columns:[]},signal))),
  ];
  return tasks.filter((task)=>task.available(metadata));
}

export class LegalLoadScheduler {
  private tasks=new Map<string,TaskState>();
  private listeners=new Set<StatusListener>();
  private controllers=new Map<string,AbortController>();
  private running=new Map<string,Promise<unknown>>();
  private priorities=new Map<string,LoadPriority>();
  private interrupted=new Set<string>();
  private revision="";
  private metadata:LegalMetadata|null=null;
  private activePage="overview";
  private activeTab:string|undefined;
  private foregroundRequests=0;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private generation=0;
  private sourceTasks:PageLoadTask[]|null=null;
  private cleanups:Array<()=>void>=[];
  private resumeAt=0;
  private stopping=false;
  private disposed=false;

  constructor(){
    this.cleanups.push(subscribeLegalFetchActivity((active)=>{
      this.foregroundRequests=Math.max(0,this.foregroundRequests+(active?1:-1));
      if(active){this.clearTimer();this.pauseUnrelated();}
      else if(!this.foregroundRequests){this.resumeAt=Date.now()+250;this.schedule();}
    }));
    this.cleanups.push(subscribeLegalQueryInvalidation((reason)=>{if(reason==="revision")this.invalidate();else if(this.metadata||this.sourceTasks)this.restart()}));
    if(typeof document!=="undefined"){
      const visible=()=>{if(document.hidden)this.clearTimer();else this.schedule()};document.addEventListener("visibilitychange",visible);this.cleanups.push(()=>document.removeEventListener("visibilitychange",visible));
    }
  }

  subscribe(listener:StatusListener){this.listeners.add(listener);listener(this.pageStatuses());return()=>{this.listeners.delete(listener)}}

  start(metadata:LegalMetadata,activePage:string){
    this.metadata=metadata;this.sourceTasks=null;this.activePage=activePage;
    const revision=metadata.revision||"ready";
    if(this.revision===revision&&this.tasks.size){this.promotePage(activePage);return}
    this.revision=revision;this.restart();
  }

  startTasks(tasks:PageLoadTask[],activePage:string,revision="test"){
    this.metadata=null;this.sourceTasks=tasks;this.activePage=activePage;
    if(this.revision===revision&&this.tasks.size){this.promotePage(activePage);return}
    this.revision=revision;this.restart();
  }

  dispose(){this.disposed=true;this.stop();this.cleanups.forEach((cleanup)=>cleanup());this.cleanups=[];this.tasks.clear();this.listeners.clear()}

  promotePage(page:string,tab?:string){
    this.activePage=page;this.activeTab=tab;this.clearTimer();
    const candidates=[...this.tasks.values()].filter((task)=>task.page===page&&(tab?task.tab===tab:task.phase==="main"));
    this.pauseUnrelated();
    for(const task of candidates){
      if(this.running.has(task.id))this.priorities.set(task.id,"foreground");
      if(task.status==="error")task.status="queued";
      if(task.status==="queued"||task.status==="idle")void this.execute(task,"foreground");
    }
    this.emit();this.schedule();
  }

  invalidate(){this.stop();this.tasks.clear();this.emit()}

  private restart(){
    this.stop();
    const tasks=this.sourceTasks||(this.metadata?taskManifest(this.metadata):[]);
    this.tasks=new Map(tasks.map((task)=>[task.id,{...task,status:"queued" as LoadStatus}]));
    this.emit();this.promotePage(this.activePage);
  }

  private stop(){
    this.stopping=true;
    this.generation++;
    this.clearTimer();
    for(const controller of this.controllers.values())controller.abort();
    this.controllers.clear();this.running.clear();this.priorities.clear();this.interrupted.clear();
    this.resumeAt=0;this.stopping=false;
  }

  private clearTimer(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;}

  private pauseUnrelated(){
    if(this.stopping||this.disposed)return;
    for(const [id,controller] of this.controllers){
      const task=this.tasks.get(id)!;
      if(task.page===this.activePage&&(task.phase==="main"||task.tab===this.activeTab))continue;
      // Remove ownership before aborting: a late completion must not clear a resumed run.
      this.controllers.delete(id);this.running.delete(id);this.priorities.delete(id);
      task.status="queued";task.error=undefined;this.interrupted.add(id);controller.abort();
    }
    this.emit();
  }

  private schedule(){
    if(this.stopping||this.disposed||this.timer!==undefined||this.foregroundRequests>0||this.running.size||!this.tasks.size||typeof document!=="undefined"&&document.hidden)return;
    if(![...this.tasks.values()].some(task=>task.status==="queued"))return;
    this.timer=setTimeout(()=>{this.timer=undefined;this.runNext()},Math.max(16,this.resumeAt-Date.now()));
  }

  private runNext(){
    if(this.foregroundRequests>0||this.running.size||typeof document!=="undefined"&&document.hidden)return;
    const all=[...this.tasks.values()];
    const mainsSettled=all.filter((task)=>task.phase==="main").every((task)=>task.status==="ready"||task.status==="error");
    const phase=mainsSettled?"secondary":"main";
    const eligible=(task:TaskState)=>task.status==="queued"&&task.phase===phase;
    const next=all.find(task=>eligible(task)&&this.interrupted.has(task.id))||all.find(eligible);
    if(!next)return;
    void this.execute(next,next.priority);
  }

  private execute(task:TaskState,priority:LoadPriority){
    const existing=this.running.get(task.id);if(existing)return existing;
    const generation=this.generation,controller=new AbortController();
    task.status="loading";task.error=undefined;this.controllers.set(task.id,controller);this.priorities.set(task.id,priority);this.interrupted.delete(task.id);this.emit();
    const ownsRun=()=>generation===this.generation&&this.controllers.get(task.id)===controller;
    const request:PageLoadRequest=(factory)=>{
      if(controller.signal.aborted)return Promise.reject(new DOMException("Cancelled","AbortError"));
      return this.priorities.get(task.id)==="foreground"?factory():withLegalFetchPriority("background",factory);
    };
    const promise=Promise.resolve().then(()=>controller.signal.aborted?undefined:task.run(controller.signal,request)).then((result)=>{
      if(ownsRun()&&!controller.signal.aborted)task.status="ready";
      return result;
    }).catch((error)=>{
      if(ownsRun()&&!controller.signal.aborted){task.status="error";task.error=error}
    }).finally(()=>{
      if(!ownsRun())return;
      if(this.priorities.get(task.id)==="foreground")this.resumeAt=Date.now()+250;
      this.controllers.delete(task.id);this.running.delete(task.id);this.priorities.delete(task.id);this.emit();this.schedule();
    });
    this.running.set(task.id,promise);return promise;
  }

  private pageStatuses():Record<string,LoadStatus>{
    const pages=new Map<string,LoadStatus[]>();
    for(const task of this.tasks.values())if(task.phase==="main")pages.set(task.page,[...(pages.get(task.page)||[]),task.status]);
    return Object.fromEntries([...pages].map(([page,statuses])=>[page,(statuses.includes("loading")?"loading":statuses.includes("queued")?"queued":statuses.includes("error")?"error":statuses.every((status)=>status==="ready")?"ready":"idle") as LoadStatus]));
  }

  private emit(){const statuses=this.pageStatuses();this.listeners.forEach((listener)=>listener(statuses))}
}

export const legalLoadScheduler=new LegalLoadScheduler();
