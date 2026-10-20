type Kind='question'|'chart';
type Entry={node:HTMLElement;kind:Kind;activate:(active:boolean)=>void;near:boolean;visible:boolean;active:boolean;used:number;distance:number};

/** One observer and one chart initialization queue per Analysis page. */
export class KoboRenderScheduler{
 private entries=new Map<HTMLElement,Entry>();
 private observer:IntersectionObserver|null=null;
 private root:HTMLElement|null=null;
 private listening=false;
 private clock=0;
 private frame=0;
 private task:number|null=null;
 private idle=false;
 private initializing:HTMLElement|null=null;
 private timeout:ReturnType<typeof setTimeout>|null=null;
 constructor(private capacity=8){}

 register(node:HTMLElement,kind:Kind,activate:(active:boolean)=>void){
  if(!this.observer){
   let root=node.parentElement;
   while(root&&!(root.scrollHeight>root.clientHeight+1&&/auto|scroll/.test(getComputedStyle(root).overflowY)))root=root.parentElement;
   this.root=root;
   this.observer=new IntersectionObserver(entries=>{
    for(const event of entries){const entry=this.entries.get(event.target as HTMLElement);if(!entry)continue;entry.near=event.isIntersecting;
     if(entry.kind==='question'&&entry.near){entry.activate(true);this.observer?.unobserve(entry.node);this.entries.delete(entry.node)}
    }
    this.refresh();
   },{root,rootMargin:'800px 0px'});
   this.startListeners();
  }
  this.entries.set(node,{node,kind,activate,near:false,visible:false,active:false,used:++this.clock,distance:Infinity});
  this.observer.observe(node);
  return()=>{
   this.observer?.unobserve(node);this.entries.delete(node);
   if(this.initializing===node)this.complete(node);
   if(!this.entries.size)this.dispose();
  };
 }

 complete=(node:HTMLElement)=>{
  if(this.initializing!==node)return;
  if(this.timeout)clearTimeout(this.timeout);this.timeout=null;this.initializing=null;this.schedule();
 };

 private startListeners(){
  if(this.listening)return;this.listening=true;
  (this.root||window).addEventListener('scroll',this.onScroll,{passive:true});
  window.addEventListener('resize',this.onScroll,{passive:true});
  document.addEventListener('focusin',this.onScroll);document.addEventListener('focusout',this.onScroll);
 }
 private onScroll=()=>{if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.refresh()})};
 private focused(entry:Entry){return entry.node.contains(document.activeElement)}
 private refresh(){
  const bounds=this.root?.getBoundingClientRect();const top=bounds?.top||0,bottom=bounds?.bottom||window.innerHeight;
  for(const entry of this.entries.values())if(entry.kind==='chart'&&(entry.near||entry.active)){
   const rect=entry.node.getBoundingClientRect();entry.visible=rect.bottom>top&&rect.top<bottom;
   entry.distance=Math.max(top-rect.bottom,rect.top-bottom,0);
   if(entry.visible||this.focused(entry))entry.used=++this.clock;
  }
  this.schedule();
 }
 private schedule(){
  if(this.task!==null||this.initializing)return;
  if(![...this.entries.values()].some(entry=>entry.kind==='chart'&&!entry.active&&entry.near))return;
  const run=()=>{this.task=null;this.flush()};
  if(typeof window.requestIdleCallback==='function'){this.idle=true;this.task=window.requestIdleCallback(run,{timeout:120})}
  else{this.idle=false;this.task=window.setTimeout(run,16)}
 }
 private flush(){
  const charts=[...this.entries.values()].filter(entry=>entry.kind==='chart');
  const next=charts.filter(entry=>!entry.active&&entry.near).sort((a,b)=>Number(b.visible)-Number(a.visible)||a.distance-b.distance||b.used-a.used)[0];
  if(!next)return;
  const active=charts.filter(entry=>entry.active);
  if(active.length>=this.capacity){
   const victim=active.filter(entry=>!entry.visible&&!this.focused(entry)&&(!entry.near||next.visible)).sort((a,b)=>Number(a.near)-Number(b.near)||a.used-b.used)[0];
   if(victim){victim.active=false;victim.activate(false)}
   else if(!next.visible)return;
  }
  next.active=true;next.used=++this.clock;this.initializing=next.node;
  // Plotly's completion callback releases the next chart, rather than mounting a burst.
  this.timeout=setTimeout(()=>this.complete(next.node),5000);
  next.activate(true);
 }

 dispose(){
  this.observer?.disconnect();this.observer=null;
  if(this.listening){(this.root||window).removeEventListener('scroll',this.onScroll);window.removeEventListener('resize',this.onScroll);document.removeEventListener('focusin',this.onScroll);document.removeEventListener('focusout',this.onScroll)}
  if(this.frame)cancelAnimationFrame(this.frame);
  if(this.task!==null){if(this.idle)window.cancelIdleCallback(this.task);else clearTimeout(this.task)}
  if(this.timeout)clearTimeout(this.timeout);
  this.entries.clear();this.frame=0;this.task=null;this.timeout=null;this.initializing=null;this.listening=false;this.root=null;
 }
}
