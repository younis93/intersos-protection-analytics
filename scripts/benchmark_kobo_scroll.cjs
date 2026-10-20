// Synthetic, source-free production benchmark. Usage: node ... URL output.json [repeats]
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.argv[2]||'http://127.0.0.1:5197',output=process.argv[3]||'output/performance/kobo-scroll.json';
function fixture(size){
 const settings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:false,hideEmpty:false,questionSort:'form',questions:{}};
 const groups=[{id:'g',name:'g',label:'Survey questions',labels:{en:'Survey questions'},parent:'',repeat:false}];
 const columns=Array.from({length:8},(_,i)=>({id:`b${i}`,label:`${i<4?'Female':'Male'} / District ${i%4<2?1:2} / ${i%2?'Host':'IDP'}`,values:[i<4?'f':'m',String(i%4<2?1:2),i%2?'host':'idp'],labels:[i<4?'Female':'Male',`District ${i%4<2?1:2}`,i%2?'Host':'IDP'],denominator:40}));
 const questions=Array.from({length:size},(_,i)=>({id:`q${i}`,name:`q${i}`,labels:{en:`Question ${i+1}: Community priorities`},type:'select_multiple',kind:'multiple',group:'g',repeat:'',metadata:false,identifying:false,choices:[]}));
 const results=questions.map((q,i)=>({id:q.id,name:q.name,label:q.labels.en,group:'g',kind:'multiple',repeat:'',denominator:320,missing:0,total:320,rows:Array.from({length:32},(_,j)=>({id:`a${j}`,label:`Priority ${j+1}`,count:(32-j)*8,percent:(32-j)*2.5,series:columns.map(b=>({id:b.id,count:32-j,percent:(32-j)/40*100}))})),statistics:{},bins:[],breakdowns:columns,breakdownFields:[{id:'gender',label:'Gender'},{id:'district',label:'District'},{id:'population',label:'Population'}],percentageBasis:'Answered respondents within each breakdown category',chart:i%3===0?'column':'bar',colors:{}}));
 return {settings,groups,questions,results};
}
async function mock(page,size,configure=()=>{}){
 const f=fixture(size);configure(f);let analysisCalls=0,lastSettings=f.settings;
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;let body={};
  if(p.endsWith('/api/kobo/projects'))body=[{id:'scroll',name:'Scroll benchmark',updated:'2026-10-18T00:00:00'}];
  else if(p.endsWith('/projects/scroll'))body={id:'scroll',name:'Scroll benchmark',form:{questions:f.questions,groups:f.groups,language:'en',warnings:[]},settings:f.settings,warnings:[],issues:[]};
  else if(p.endsWith('/analysis')){analysisCalls++;lastSettings=route.request().postDataJSON().settings;body={total:320,filtered:320,questions:f.results,filterSummary:[],groups:f.groups,settings:f.settings};}
  else if(p.includes('/filter-options/'))body=['Safety','Documentation'];
  else if(p.endsWith('/settings')){Object.assign(f.settings,route.request().postDataJSON());body={saved:true};}
  await route.fulfill({json:body});
 });
 return Object.assign(()=>analysisCalls,{settings:()=>lastSettings});
}
async function run(browser,size,repetition){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));const calls=await mock(page,size);
 await page.addInitScript(()=>{
  localStorage.setItem('app-theme','glass-light');localStorage.setItem('kobo-sidebar-collapsed','true');
  window.__scrollMetrics={tasks:[],frames:[],record:false,last:0};
  new PerformanceObserver(list=>{if(window.__scrollMetrics.record)window.__scrollMetrics.tasks.push(...list.getEntries().map(e=>e.duration))}).observe({type:'longtask'});
  const frame=t=>{const m=window.__scrollMetrics;if(m.record&&m.last)m.frames.push(t-m.last);m.last=t;requestAnimationFrame(frame)};requestAnimationFrame(frame);
 });
 const start=Date.now();await page.goto(`${url}/#/kobo/scroll`,{waitUntil:'domcontentloaded'});
 await page.locator('.kobo-pivot-table').first().waitFor({timeout:60000});const tableReadyMs=Date.now()-start;
 await page.locator('.kobo-chart').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.kobo-chart .js-plotly-plot .main-svg'),{},{timeout:60000});
 const firstChartMs=Date.now()-start,initialCharts=await page.locator('.js-plotly-plot').count();
 await page.evaluate(()=>{
  const first=document.querySelector('.kobo-question');let root=first.parentElement;
  while(root&&!(root.scrollHeight>root.clientHeight+1&&/auto|scroll/.test(getComputedStyle(root).overflowY)))root=root.parentElement;
  window.__scrollRoot=root||document.scrollingElement;
  window.__scrollMetrics.record=true;window.__scrollMetrics.last=0;
 });
 let peakCharts=initialCharts;
 for(const direction of [1,-1])for(let step=0;step<45;step++){
  await page.evaluate(d=>window.__scrollRoot.scrollBy(0,d*650),direction);
  await page.waitForTimeout(65);
  peakCharts=Math.max(peakCharts,await page.locator('.js-plotly-plot').count());
 }
 await page.waitForTimeout(400);
 const metrics=await page.evaluate(()=>{const m=window.__scrollMetrics;m.record=false;const sorted=[...m.frames].sort((a,b)=>a-b);return {longTaskMs:m.tasks.reduce((a,b)=>a+b,0),longTasks:m.tasks.length,frameP95:sorted[Math.floor(sorted.length*.95)]||0,delayedFrames:m.frames.filter(t=>t>50).length,frames:m.frames.length,domNodes:document.querySelectorAll('*').length}});
 assert.deepEqual(errors,[]);assert.equal(calls(),1,'Scrolling must not request analysis');
 await context.close();return {size,repetition,tableReadyMs,firstChartMs,initialCharts,peakCharts,...metrics};
}
module.exports={fixture,mock};
if(require.main===module)(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const runs=[];try{for(const size of [50,150])for(let i=0;i<Number(process.argv[4]||3);i++){const result=await run(browser,size,i);runs.push(result);console.log(JSON.stringify(result))}fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({url,runs},null,2))}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
