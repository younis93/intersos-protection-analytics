import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';

// Isolated scheduler benchmark with deterministic synthetic responses and 5 ms
// simulated transport latency. This measures queue overhead, not backend CPU.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'frontend/package.json'));
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const baseline=process.argv[2]||path.join(root,'tmp/queue-baseline/legalLoadScheduler.ts');
const snapshot=path.join(root,'tmp/queue-baseline/scheduler-benchmark.ts');
await mkdir(path.dirname(snapshot),{recursive:true});
const old=await readFile(baseline,'utf8');
await writeFile(snapshot,old.replace(/from "\.\/([^\"]+)"/g,'from "../../frontend/src/$1"'));
const server=await createServer({root:path.join(root,'frontend'),server:{middlewareMode:true},appType:'custom'});
const nativeFetch=globalThis.fetch;
try{
  const previous=await server.ssrLoadModule(snapshot);
  const current=await server.ssrLoadModule(path.join(root,'frontend/src/legalLoadScheduler.ts'));
  const cache=await server.ssrLoadModule(path.join(root,'frontend/src/legalQueryCache.ts'));
  const rows=Array.from({length:120},(_,i)=>({caseId:`C${i}`,dataset:'beneficiaries',detail:`Issue ${i}`}));
  const months=Array.from({length:12},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`);
  const metadata={revision:'benchmark',overview:{rows},availability:{beneficiaries:true,assessments:true,legalservices:true},features:{},sheets:[{id:'beneficiaries'}]};
  const report=month=>({groups:[{items:rows.filter((_,i)=>!month||i%12===months.indexOf(month))}],filterOptions:{months}});
  function installNetwork(stats){
    globalThis.fetch=async(url,init={})=>{
      stats.requests++;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(resolve,5);
        init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));},{once:true});
      });
      const pathname=new URL(url,'http://localhost').pathname,body=init.body?JSON.parse(init.body):{};
      const payload=pathname.endsWith('/indicators/monthly')?{reports:body.months.map(month=>({month,report:report(month)}))}
        :pathname.endsWith('/indicators')?report(body.months?.[0])
        :pathname.endsWith('/review')?{rows,ruleCounts:{'Invalid contact number':120}}
        :{rows};
      stats.responses.push({path:pathname,body,payload});
      return new Response(JSON.stringify(payload));
    };
  }
  async function measure(module,revision){
    cache.setLegalRevision(revision);const stats={requests:0,responses:[]};installNetwork(stats);
    const scheduler=new module.LegalLoadScheduler();
    const manifest=module.taskManifest(metadata).filter(task=>task.page!=='send-issues');
    let completed=0;const tasks=manifest.map(task=>({...task,run:async(...args)=>{const value=await task.run(...args);completed++;return value;}}));
    const start=performance.now();scheduler.startTasks(tasks,'overview',revision);
    while(completed<tasks.length){await new Promise(resolve=>setTimeout(resolve,10));if(performance.now()-start>20000)throw new Error('Queue benchmark timed out');}
    const elapsed=performance.now()-start;scheduler.dispose();
    const singles=stats.responses.filter(r=>r.path.endsWith('/indicators')&&r.body.months?.length===1).map(r=>({month:r.body.months[0],report:r.payload}));
    const batch=stats.responses.find(r=>r.path.endsWith('/indicators/monthly'))?.payload.reports||singles;
    const monthlyDigest=createHash('sha256').update(JSON.stringify(batch.sort((a,b)=>a.month.localeCompare(b.month)))).digest('hex');
    const pageStats={requests:0,responses:[]};installNetwork(pageStats);
    const second=new module.LegalLoadScheduler();let openedAt,openedReadyAt;let backgroundAborted=false;
    second.startTasks([
      {id:'overview',page:'overview',phase:'main',priority:'main-background',available:()=>true,run:async()=>{}},
      {id:'background',page:'background',phase:'main',priority:'main-background',available:()=>true,run:async(signal)=>{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,100);signal.addEventListener('abort',()=>{backgroundAborted=true;clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));},{once:true});});}},
      {id:'opened',page:'opened',phase:'main',priority:'main-background',available:()=>true,run:async(signal,request)=>{openedAt=performance.now();await request(()=>cache.legalFetch('/api/legal/explorer',{method:'POST',body:'{"dataset":"beneficiaries","search":"opened"}',signal}));openedReadyAt=performance.now();}},
    ],'overview',revision);
    await new Promise(resolve=>setTimeout(resolve,270));const switched=performance.now();second.promotePage('opened');
    while(!openedReadyAt)await new Promise(resolve=>setTimeout(resolve,1));
    const openedDelay=openedAt-switched,readyDelay=openedReadyAt-switched,pausedOnNavigation=backgroundAborted;second.dispose();
    return {queueMs:Math.round(elapsed),requests:stats.requests,openedPageStartMs:Number(openedDelay.toFixed(2)),openedPageReadyMs:Number(readyDelay.toFixed(2)),backgroundPausedOnNavigation:pausedOnNavigation,monthlyDigest,syntheticRows:rows.length,taskCount:tasks.length};
  }
  const before=await measure(previous,'before'),after=await measure(current,'after');
  if(before.monthlyDigest!==after.monthlyDigest)throw new Error('Monthly response parity failed');
  const result={description:'Scheduler overhead benchmark with synthetic data and simulated 5 ms transport. Not a backend or real-user speed estimate.',before,after,queueReductionPercent:Number(((before.queueMs-after.queueMs)/before.queueMs*100).toFixed(1)),monthlyResponseParity:true};
  const output=path.join(root,'output/performance/loading-queue.json');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{globalThis.fetch=nativeFetch;await server.close();}
