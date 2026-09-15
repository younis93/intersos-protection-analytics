import {afterEach,describe,expect,it,vi} from "vitest";
import {LegalLoadScheduler,type PageLoadTask} from "./legalLoadScheduler";

const schedulers:LegalLoadScheduler[]=[];
const flush=async()=>{for(let index=0;index<8;index++)await Promise.resolve()};
const deferred=()=>{let resolve!:(value?:unknown)=>void;const promise=new Promise((done)=>{resolve=done});return {promise,resolve}};
const task=(id:string,page:string,phase:"main"|"secondary",run:PageLoadTask["run"],tab?:string):PageLoadTask=>({id,page,tab,phase,priority:phase==="main"?"main-background":"secondary-background",available:()=>true,run});

afterEach(()=>{schedulers.splice(0).forEach((scheduler)=>scheduler.dispose());vi.useRealTimers()});

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

  it("promotes a queued page immediately while allowing the running background job to finish",async()=>{
    vi.useFakeTimers();const order:string[]=[],background=deferred(),promoted=deferred();
    const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);
    scheduler.startTasks([
      task("a:main","a","main",async()=>{order.push("a")}),
      task("b:main","b","main",async()=>{order.push("b");await background.promise}),
      task("c:main","c","main",async()=>{order.push("c");await promoted.promise}),
    ],"a");
    await flush();await vi.advanceTimersByTimeAsync(250);expect(order).toEqual(["a","b"]);
    scheduler.promotePage("c");await flush();expect(order).toEqual(["a","b","c"]);
    background.resolve();promoted.resolve();await flush();
  });

  it("marks failures without blocking the queue and retries them on direct navigation",async()=>{
    vi.useFakeTimers();let attempts=0;let latest:Record<string,string>={};
    const scheduler=new LegalLoadScheduler();schedulers.push(scheduler);scheduler.subscribe((statuses)=>{latest=statuses});
    scheduler.startTasks([task("a:main","a","main",async()=>{attempts++;if(attempts===1)throw new Error("failed")})],"a");
    await flush();expect(latest.a).toBe("error");
    scheduler.promotePage("a");await flush();expect(attempts).toBe(2);expect(latest.a).toBe("ready");
  });
});
