import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {KoboRenderScheduler} from './koboRenderScheduler';

class FakeNode extends EventTarget{
 parentElement=null;
 top=0;
 constructor(top=0){super();this.top=top}
 getBoundingClientRect(){return {top:this.top,bottom:this.top+300}}
 contains(node:unknown){return node===this}
}
let intersection:(entries:any[])=>void,tasks:Map<number,()=>void>,taskId:number,observer:{disconnect:ReturnType<typeof vi.fn>;unobserve:ReturnType<typeof vi.fn>};
let documentMock:EventTarget&{activeElement:unknown};
function near(nodes:FakeNode[],intersects=true){intersection(nodes.map(node=>({target:node,isIntersecting:intersects})))}
function tick(){const first=tasks.entries().next().value;if(first){tasks.delete(first[0]);first[1]()}}
const node=(top=0)=>new FakeNode(top);
const element=(node:FakeNode)=>node as unknown as HTMLElement;

beforeEach(()=>{
 tasks=new Map();taskId=0;
 documentMock=Object.assign(new EventTarget(),{activeElement:null});
 vi.stubGlobal('document',documentMock);
 vi.stubGlobal('window',Object.assign(new EventTarget(),{innerHeight:1000,requestIdleCallback:(callback:()=>void)=>{tasks.set(++taskId,callback);return taskId},cancelIdleCallback:(id:number)=>tasks.delete(id)}));
 vi.stubGlobal('IntersectionObserver',class{constructor(callback:typeof intersection){intersection=callback;observer=this}observe=vi.fn();unobserve=vi.fn();disconnect=vi.fn()});
 vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{tasks.set(++taskId,callback);return taskId});vi.stubGlobal('cancelAnimationFrame',(id:number)=>tasks.delete(id));
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});

describe('Kobo rendering scheduler',()=>{
 it('defers questions until nearby, then activates them once',()=>{
  const scheduler=new KoboRenderScheduler(),target=node(4000),activate=vi.fn();
  scheduler.register(element(target),'question',activate);expect(activate).not.toHaveBeenCalled();
  near([target]);near([target]);expect(activate).toHaveBeenCalledExactlyOnceWith(true);scheduler.dispose();
 });
 it('prioritizes visible charts and waits for Plotly completion before starting another',()=>{
  const scheduler=new KoboRenderScheduler(),far=node(1200),visible=node(100),a=vi.fn(),b=vi.fn();
  scheduler.register(element(far),'chart',a);scheduler.register(element(visible),'chart',b);
  near([far,visible]);tick();expect(b).toHaveBeenCalledWith(true);expect(a).not.toHaveBeenCalled();
  tick();expect(a).not.toHaveBeenCalled();scheduler.complete(element(visible));tick();expect(a).toHaveBeenCalledWith(true);scheduler.dispose();
 });
 it('evicts the oldest offscreen chart and never the focused chart',()=>{
  const scheduler=new KoboRenderScheduler(2),first=node(0),second=node(1200),third=node(200),a=vi.fn(),b=vi.fn(),c=vi.fn();
  scheduler.register(element(first),'chart',a);scheduler.register(element(second),'chart',b);scheduler.register(element(third),'chart',c);
  near([first,second]);tick();scheduler.complete(element(first));tick();scheduler.complete(element(second));
  first.top=5000;second.top=6000;documentMock.activeElement=first;
  near([first,second],false);near([third]);tick();expect(a).not.toHaveBeenCalledWith(false);expect(b).toHaveBeenCalledWith(false);expect(c).toHaveBeenCalledWith(true);scheduler.dispose();
 });
 it('cancels queued work and observers when questions unmount or the project changes',()=>{
  const scheduler=new KoboRenderScheduler(),target=node(),activate=vi.fn();
  const unregister=scheduler.register(element(target),'chart',activate);near([target]);expect(tasks.size).toBe(1);
  unregister();tick();expect(activate).not.toHaveBeenCalled();expect(observer.disconnect).toHaveBeenCalled();expect(tasks.size).toBe(0);
 });
 it('does not churn the cache for offscreen candidates when retained charts are still near',()=>{
  const scheduler=new KoboRenderScheduler(1),first=node(0),second=node(1200),a=vi.fn(),b=vi.fn();
  scheduler.register(element(first),'chart',a);scheduler.register(element(second),'chart',b);near([first,second]);tick();scheduler.complete(element(first));tick();
  expect(a).toHaveBeenCalledTimes(1);expect(b).not.toHaveBeenCalled();expect(tasks.size).toBe(0);scheduler.dispose();
 });
 it('keeps a bounded cache while visiting 100 charts and reactivates an evicted chart',()=>{
  const scheduler=new KoboRenderScheduler(),nodes=Array.from({length:100},()=>node(5000));
  const mounted=new Set<number>();let peak=0;
  nodes.forEach((target,index)=>scheduler.register(element(target),'chart',active=>{if(active)mounted.add(index);else mounted.delete(index);peak=Math.max(peak,mounted.size)}));
  nodes.forEach((target,index)=>{
   if(index){nodes[index-1].top=5000;near([nodes[index-1]],false)}
   target.top=100;near([target]);tick();scheduler.complete(element(target));
   expect(mounted.has(index)).toBe(true);
  });
  expect(peak).toBe(8);expect(mounted.has(0)).toBe(false);
  nodes[99].top=5000;near([nodes[99]],false);nodes[0].top=100;near([nodes[0]]);tick();
  expect(mounted.has(0)).toBe(true);expect(mounted.size).toBe(8);scheduler.dispose();
 });
 it('releases a failed chart immediately and allows it to re-register for retry',()=>{
  const scheduler=new KoboRenderScheduler(),first=node(100),second=node(1200),a=vi.fn(),b=vi.fn();
  const unregister=scheduler.register(element(first),'chart',a);scheduler.register(element(second),'chart',b);
  near([first,second]);tick();scheduler.complete(element(first));tick();
  expect(b).toHaveBeenCalledExactlyOnceWith(true);scheduler.complete(element(second));
  unregister();scheduler.register(element(first),'chart',a);near([first]);tick();
  expect(a).toHaveBeenCalledTimes(2);scheduler.dispose();
 });
 it('recovers the queue if a chart never calls its completion handler',()=>{
  vi.useFakeTimers();
  try{
   const scheduler=new KoboRenderScheduler(),first=node(100),second=node(1200),b=vi.fn();
   scheduler.register(element(first),'chart',vi.fn());scheduler.register(element(second),'chart',b);
   near([first,second]);tick();expect(b).not.toHaveBeenCalled();vi.advanceTimersByTime(5000);tick();
   expect(b).toHaveBeenCalledExactlyOnceWith(true);scheduler.dispose();
  }finally{vi.useRealTimers()}
 });
});
