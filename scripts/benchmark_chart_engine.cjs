// Compare the pinned production distributions under the same browser conditions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const runs=[];
 try{
  for(let repetition=0;repetition<5;repetition++)for(const mode of ['before','after']){
   const file=mode==='before'?path.join(root,'tmp/size-loading/package/plotly.min.js'):path.join(root,'frontend/node_modules/plotly.js-cartesian-dist-min/plotly-cartesian.min.js');
   const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
   await page.route('**/engine-check.html',route=>route.fulfill({contentType:'text/html',body:'<div id="chart"></div>'}));
   await page.route('**/engine.js',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(file)}));
   await page.goto('http://127.0.0.1:5180/engine-check.html');
   const result=await page.evaluate(async()=>{
    const tasks=[];new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
    const start=performance.now();await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/engine.js';script.onload=resolve;script.onerror=reject;document.head.append(script)});
    await Plotly.newPlot('chart',[{type:'bar',x:['مرحبا','B'],y:[3,7]}],{width:700,height:400});
    const firstChartMs=performance.now()-start;
    const traces=[{type:'bar',x:['A','B'],y:[3,7]},{type:'scatter',mode:'lines+markers',x:['A','B'],y:[3,7]},{type:'pie',hole:.58,labels:['A','B'],values:[3,7]},{type:'heatmap',x:['A','B'],y:['C','D'],z:[[1,2],[3,4]]}];
    const checks=[];
    for(const trace of traces){
     await Plotly.react('chart',[trace],{width:700,height:400});
     const graph=document.getElementById('chart');if(graph._fullData[0].type!==trace.type)throw Error('Wrong trace type');
     const png=await Plotly.toImage(graph,{format:'png',width:700,height:400});const svg=await Plotly.toImage(graph,{format:'svg',width:700,height:400});
     if(!png.startsWith('data:image/png')||!svg.startsWith('data:image/svg+xml'))throw Error('Export failed');
     checks.push(trace.type);
    }
    const warm=performance.now();await Plotly.react('chart',[traces[0]],{width:700,height:400});
    return {firstChartMs,repeatChartMs:performance.now()-warm,checkedTypes:checks,longTaskCount:tasks.length,longTaskMs:tasks.reduce((sum,value)=>sum+value,0)};
   });
   assert.deepEqual(errors,[]);runs.push({repetition,mode,...result});await context.close();
  }
  fs.writeFileSync(path.join(root,'output/performance/chart-engine.json'),JSON.stringify({repeats:5,fixture:'Pinned distribution fetch, parse, execute and first bar render on local HTTP; separate engine microbenchmark, not full-page readiness.',runs},null,2));
  console.log('Both engines: bar, scatter/line, pie/donut, heatmap, PNG and SVG exports passed.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
