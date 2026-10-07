import {afterEach,describe,expect,it,vi} from "vitest";
import {LegalLoadScheduler,taskManifest,type PageLoadTask,type LoadStatus} from "./legalLoadScheduler";
import {getLegalCase,getLegalIndicatorsMonthly,getLegalReview} from './api';
import {invalidateLegalQueries,legalFetch,setLegalRevision} from './legalQueryCache';

const schedulers:LegalLoadScheduler[]=[];
const flush=async()=>{for(let index=0;index<8;index++)await Promise.resolve()};
const deferred=()=>{let resolve!:(value?:unknown)=>void;const promise=new Promise((done)=>{resolve=done});return {promise,resolve}};
const task=(id:string,page:string,phase:"main"|"secondary",run:PageLoadTask["run"],tab?:string):PageLoadTask=>({id,page,tab,phase,priority:phase==="main"?"main-background":"secondary-background",available:()=>true,run});

afterEach(()=>{schedulers.splice(0).forEach((scheduler)=>scheduler.dispose());vi.unstubAllGlobals();vi.useRealTimers();invalidateLegalQueries()});

describe("legal load scheduler",()=>{
  it("loads the active main view first, then all other mains, then secondary tabs",async()=>{
    vi.useFakeTimers();const order:string[]=[],active=deferred(),other=deferred();
    const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
    scheduler.startTasks([
      task("a:main","a","main",async()=>{order.push("a:main");await active.promise}),
      task("b:main","b","main",async()=>{order.push("b:main");await other.promise}),
      task("a:tab","a","secondary",async()=>{order.push("a:tab")},"tab"),
    ],"a");
    await flush();expect(order).toEqual(["a:main"]);
    active.resolve();await flush();await vi.advanceTimersByTimeAsync(250);expect(order).toEqual(["a:main","b:main"]);
    other.resolve();await flush();await vi.advanceTimersByTimeAsync(250);expect(order).toEqual(["a:main","b:main","a:tab"]);
  });

  it("pauses a background page, promotes immediately, then resumes without accepting late completions",async()=>{
    vi.useFakeTimers();const order:string[]=[],background=deferred(),promoted=deferred();
    const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);let statuses:Record<string,LoadStatus>={};scheduler.subscribe(next=>{statuses=next});
    const signals:AbortSignal[]=[];
    scheduler.startTasks([
      task("a:main","a","main",async()=>{order.push("a")}),
      task("b:main","b","main",async(signal)=>{signals.push(signal);order.push("b");await background.promise}),
      task("c:main","c","main",async()=>{order.push("c");await promoted.promise}),
    ],"a");
    await flush();await vi.advanceTimersByTimeAsync(250);expect(order).toEqual(["a","b"]);
    scheduler.promotePage("c");await flush();expect(order).toEqual(["a","b","c"]);
    expect(signals[0].aborted).toBe(true);expect(statuses.b).toBe('queued');
    background.resolve();await flush();expect(statuses.b).toBe('queued');
    promoted.resolve();await flush();await vi.advanceTimersByTimeAsync(250);expect(order).toEqual(['a','b','c','b']);expect(statuses.b).toBe('ready');
  });

  it("marks failures without blocking the queue and retries them on direct navigation",async()=>{
    vi.useFakeTimers();let attempts=0;let latest:Record<string,string>={};
    const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);scheduler.subscribe((statuses)=>{latest=statuses});
    scheduler.startTasks([task("a:main","a","main",async()=>{attempts++;if(attempts===1)throw new Error("failed")})],"a");
    await flush();expect(latest.a).toBe("error");
    scheduler.promotePage("a");await flush();expect(attempts).toBe(2);expect(latest.a).toBe("ready");
  });
});


it("includes Send Issues after Awareness Review in the main queue and supports hotline-only sources",()=>{
  const metadata={availability:{beneficiaries:true,assessments:true,legalservices:true,awareness:true},features:{detention:true},sheets:[]} as unknown as import('./types').LegalMetadata;
  const pages=taskManifest(metadata).filter(task=>task.phase==='main').map(task=>task.page);
  expect(pages.indexOf('send-issues')).toBe(pages.indexOf('awareness')+1);
  expect(pages.indexOf('detention')).toBe(pages.indexOf('send-issues')+1);
  const hotline={...metadata,availability:{legalhotlines:true}} as unknown as import('./types').LegalMetadata;
  expect(taskManifest(hotline).some(task=>task.page==='send-issues')).toBe(true);
  expect(taskManifest({...metadata,availability:{}}).some(task=>task.page==='send-issues')).toBe(false);
});

it("shows Send Issues queued, loading and ready without opening that page",async()=>{
  vi.useFakeTimers();let statuses:Record<string,string>={};const loading=deferred();
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);scheduler.subscribe(next=>{statuses=next});
  scheduler.startTasks([task('overview:main','overview','main',async()=>{}),task('send-issues:main','send-issues','main',async()=>{await loading.promise})],'overview');
  expect(statuses['send-issues']).toBe('queued');await flush();await vi.advanceTimersByTimeAsync(250);
  expect(statuses['send-issues']).toBe('loading');loading.resolve();await flush();expect(statuses['send-issues']).toBe('ready');
});

it('yields only 16 ms between completed background pages and keeps them sequential',async()=>{
  vi.useFakeTimers();const order:string[]=[],pending=deferred();
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
  scheduler.startTasks([task('a','a','main',async()=>{order.push('a')}),task('b','b','main',async()=>{order.push('b');await pending.promise}),task('c','c','main',async()=>{order.push('c')})],'a');
  await flush();await vi.advanceTimersByTimeAsync(250);expect(order).toEqual(['a','b']);
  await vi.advanceTimersByTimeAsync(500);expect(order).toEqual(['a','b']);
  pending.resolve();await flush();await vi.advanceTimersByTimeAsync(15);expect(order).toEqual(['a','b']);
  await vi.advanceTimersByTimeAsync(1);expect(order).toEqual(['a','b','c']);
});

it('promotes an existing page request without aborting it or starting it twice',async()=>{
  vi.useFakeTimers();const pending=deferred();let signal!:AbortSignal;
  const run=vi.fn(async(next:AbortSignal)=>{signal=next;await pending.promise});
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
  scheduler.startTasks([task('a','a','main',async()=>{}),task('b','b','main',run)],'a');
  await flush();await vi.advanceTimersByTimeAsync(250);scheduler.promotePage('b');await flush();
  expect(signal.aborted).toBe(false);expect(run).toHaveBeenCalledOnce();pending.resolve();await flush();
});

it('prioritizes a tab and resumes interrupted main pages before secondary work',async()=>{
  vi.useFakeTimers();const order:string[]=[],pending=deferred();let attempts=0;
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
  scheduler.startTasks([task('a','a','main',async()=>{}),task('b','b','main',async()=>{order.push('b');if(++attempts===1)await pending.promise}),task('tab','a','secondary',async()=>{order.push('tab')},'tab'),task('other','b','secondary',async()=>{order.push('other')},'other')],'a');
  await flush();await vi.advanceTimersByTimeAsync(250);scheduler.promotePage('a','tab');await flush();expect(order).toEqual(['b','tab']);
  await vi.advanceTimersByTimeAsync(250);expect(order).toEqual(['b','tab','b']);
  pending.resolve();await flush();await vi.advanceTimersByTimeAsync(16);expect(order).toEqual(['b','tab','b','other']);
});

it('handles rapid page changes and ignores late completion of a paused foreground task',async()=>{
  vi.useFakeTimers();const first=deferred(),second=deferred();let firstSignal!:AbortSignal;let statuses:Record<string,LoadStatus>={};
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);scheduler.subscribe(next=>{statuses=next});
  scheduler.startTasks([task('a','a','main',async(signal)=>{firstSignal=signal;await first.promise}),task('b','b','main',async()=>{await second.promise}),task('c','c','main',async()=>{})],'a');
  await flush();scheduler.promotePage('b');await flush();expect(firstSignal.aborted).toBe(true);
  scheduler.promotePage('c');await flush();first.resolve();second.resolve();await flush();
  expect(statuses).toEqual({a:'queued',b:'queued',c:'ready'});
  scheduler.promotePage('a');await flush();expect(statuses.a).toBe('ready');
});

it('pauses unrelated warming during foreground filter requests and waits for idle afterward',async()=>{
  vi.useFakeTimers();setLegalRevision('queue-activity');const background=deferred();let calls=0;
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
  scheduler.startTasks([task('a','a','main',async()=>{}),task('b','b','main',async()=>{calls++;await background.promise})],'a');
  await flush();await vi.advanceTimersByTimeAsync(250);expect(calls).toBe(1);
  let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(done=>{resolve=done}));
  const request=legalFetch('/api/legal/review',{method:'POST',body:'{"search":"changed"}'});
  resolve(new Response('{}'));await request;await flush();
  await vi.advanceTimersByTimeAsync(249);expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);expect(calls).toBe(2);background.resolve();await flush();
});

it('does not start background tasks in a hidden window and resumes on visibility',async()=>{
  vi.useFakeTimers();const events=new EventTarget();const doc={hidden:true,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};vi.stubGlobal('document',doc);
  const run=vi.fn(async()=>{}),scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
  scheduler.startTasks([task('a','a','main',async()=>{}),task('b','b','main',run)],'a');await flush();await vi.advanceTimersByTimeAsync(1000);expect(run).not.toHaveBeenCalled();
  doc.hidden=false;events.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(16);expect(run).toHaveBeenCalledOnce();
});

it('invalidates all old task ownership on data replacement',async()=>{
  vi.useFakeTimers();const old=deferred();let signal!:AbortSignal;let statuses:Record<string,LoadStatus>={};
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);scheduler.subscribe(next=>{statuses=next});
  scheduler.startTasks([task('a','a','main',async(next)=>{signal=next;await old.promise})],'a','old');await flush();
  setLegalRevision('replacement-queue');expect(signal.aborted).toBe(true);expect(statuses).toEqual({});
  scheduler.startTasks([task('a','a','main',async()=>{})],'a','new');await flush();old.resolve();await flush();expect(statuses.a).toBe('ready');
});

it('warms monthly analysis in one batch and reuses it when the tab opens',async()=>{
  setLegalRevision('monthly-preload');const bodies:Array<{url:string;body:any}>=[];
  const network=vi.fn(async(url:string,init:RequestInit)=>{bodies.push({url,body:JSON.parse(init.body as string)});return new Response(JSON.stringify(url.endsWith('/monthly')?{reports:[{month:'2026-01',report:{groups:['same']}}]}:{filterOptions:{months:['2026-01','2025-12','2026-03']}}));});vi.stubGlobal('fetch',network);
  const metadata={availability:{beneficiaries:true,assessments:true,legalservices:true},features:{},sheets:[]} as unknown as import('./types').LegalMetadata;
  const analysis=taskManifest(metadata).find(task=>task.id==='indicators:analysis')!;
  await analysis.run(new AbortController().signal,factory=>factory());
  expect(bodies).toHaveLength(2);expect(bodies[1].url).toMatch(/\/monthly$/);expect(bodies[1].body.months).toEqual(['2026-01','2026-03']);
  const opened=await getLegalIndicatorsMonthly([],[],[],[],['2026-03','2026-01']);expect(opened.reports[0].report.groups).toEqual(['same']);expect(network).toHaveBeenCalledTimes(2);
});

it('uses the same default request as hotline review, finding tables and case cards',async()=>{
  setLegalRevision('defaults-preload');const network=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/review')?{ruleCounts:{'Invalid age':1}}:{rows:[]})));vi.stubGlobal('fetch',network);
  const metadata={availability:{beneficiaries:true,assessments:true,legalservices:true,legalhotlines:true},features:{},sheets:[]} as unknown as import('./types').LegalMetadata;
  const tasks=taskManifest(metadata),signal=new AbortController().signal;
  await tasks.find(task=>task.id==='legalhotlines:main')!.run(signal,factory=>factory());await getLegalReview('legalhotlines','','',1,{},'',15,true,false);expect(network).toHaveBeenCalledTimes(1);
  await tasks.find(task=>task.id==='beneficiaries:findings')!.run(signal,factory=>factory());await getLegalReview('beneficiaries','','Invalid age',1,{},'',15,false,true);expect(network).toHaveBeenCalledTimes(3);
  await tasks.find(task=>task.id==='cases:main')!.run(signal,factory=>factory());await getLegalCase('',{},{viewMode:'cards',page:1,pageSize:100,sortColumn:'',sortDirection:'asc',columns:[]});expect(network).toHaveBeenCalledTimes(5);
});

it('shares the warmed network request with an opened page subscriber',async()=>{
  vi.useFakeTimers();setLegalRevision('shared-queue');let resolve!:(response:Response)=>void;
  const network=vi.fn(()=>new Promise<Response>(done=>{resolve=done}));vi.stubGlobal('fetch',network);
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
  const query={method:'POST',body:'{"dataset":"beneficiaries"}'};
  scheduler.startTasks([task('a','a','main',async()=>{}),task('b','b','main',async(signal,request)=>{await request(()=>legalFetch('/api/legal/review',{...query,signal}));})],'a');
  await flush();await vi.advanceTimersByTimeAsync(250);scheduler.promotePage('b');
  const opened=legalFetch('/api/legal/review',query);expect(network).toHaveBeenCalledOnce();
  resolve(new Response('{"rows":["same"]}'));expect(await (await opened).json()).toEqual({rows:['same']});await flush();
  expect(await (await legalFetch('/api/legal/review',query)).json()).toEqual({rows:['same']});expect(network).toHaveBeenCalledOnce();
});

it('does not let an old interrupted promise erase ownership of a resumed task',async()=>{
  vi.useFakeTimers();const old=deferred(),resumed=deferred();let attempts=0;let statuses:Record<string,LoadStatus>={};
  const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);scheduler.subscribe(next=>{statuses=next});
  scheduler.startTasks([task('a','a','main',async()=>{}),task('b','b','main',async()=>{await (++attempts===1?old.promise:resumed.promise)}),task('c','c','main',async()=>{})],'a');
  await flush();await vi.advanceTimersByTimeAsync(250);scheduler.promotePage('c');await flush();await vi.advanceTimersByTimeAsync(250);
  expect(attempts).toBe(2);old.resolve();await flush();expect(statuses.b).toBe('loading');
  scheduler.promotePage('b');await flush();expect(attempts).toBe(2);resumed.resolve();await flush();expect(statuses.b).toBe('ready');
});
