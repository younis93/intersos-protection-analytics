// Use profile_local_server.py on 5181. No record contents, values or URLs are saved.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:5181';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const runs=[];
 try{
  for(let repetition=0;repetition<5;repetition++){
   const context=await browser.newContext(),page=await context.newPage(),errors=[],responses=[],pending=[];
   await page.addInitScript(()=>{window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true})});
   page.on('pageerror',e=>errors.push(e.name));
   page.on('response',response=>{if(!response.url().includes('/api/'))return;pending.push((async()=>{const headers=await response.allHeaders();const bytes=(await response.body().catch(()=>Buffer.alloc(0))).length;responses.push({bytes,serverMs:Number(/dur=([\d.]+)/.exec(headers['server-timing']||'')?.[1]||0),status:response.status()})})())});
   const measure=async(label,action,ready)=>{
    await Promise.all(pending);const count=responses.length;await page.evaluate(()=>window.__longTasks=[]);
    const start=performance.now();await action();await ready();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const elapsed=performance.now()-start;await Promise.all(pending);
    const task=await page.evaluate(()=>window.__longTasks),received=responses.slice(count);
    runs.push({repetition,label,interactionToReadyMs:elapsed,requestCount:received.length,responseBytes:received.reduce((sum,r)=>sum+r.bytes,0),serverRequestMs:received.reduce((sum,r)=>sum+r.serverMs,0),longTaskCount:task.length,longTaskMs:task.reduce((sum,t)=>sum+t.duration,0)});
    fs.writeFileSync(path.join(root,'output/performance/browser-filters-after.json'),JSON.stringify({isolatedLocalData:true,repeats:5,runs},null,2));
   };
   const overviewReady=()=>page.locator('.overview-results[aria-busy=false]').waitFor({timeout:120000});
   await measure('overview_initial_with_chart',()=>page.goto(base+'/?startupEpoch=123456#/legal/overview'),async()=>{await overviewReady();await page.locator('.js-plotly-plot .main-svg').first().waitFor({timeout:120000})});
   const toolbar=page.locator('.overview-filter-bar');
   const reset=async()=>{const button=toolbar.getByRole('button',{name:/^Reset(?: all)?$/});if(await button.isEnabled())await button.click()};
   await measure('overview_single',async()=>{await toolbar.locator('.app-select-trigger').first().click();await page.locator('.checkbox-multi-menu input[type=checkbox]').first().check();await page.keyboard.press('Escape');},async()=>{await page.waitForTimeout(400);await overviewReady()});
   await measure('overview_reset',reset,overviewReady);
   await measure('overview_drawer_apply',async()=>{await toolbar.getByRole('button',{name:/^Filters/}).click();await page.getByRole('button',{name:'Apply filters',exact:true}).click()},overviewReady);
   await measure('overview_repeat',async()=>{await page.evaluate(()=>location.hash='/legal/explorer');await page.getByPlaceholder('Search data',{exact:true}).waitFor();await page.evaluate(()=>location.hash='/legal/overview')},overviewReady);
   await measure('explorer_first',()=>page.evaluate(()=>location.hash='/legal/explorer'),()=>page.getByPlaceholder('Search data',{exact:true}).waitFor());
   for(const [label,value] of [['explorer_empty','__benchmark_missing__'],['explorer_reset','']])await measure(label,()=>page.getByPlaceholder('Search data',{exact:true}).fill(value),async()=>{await page.waitForTimeout(600);await page.locator('.legal-content .skeleton').waitFor({state:'detached',timeout:120000})});
   await measure('explorer_rapid',async()=>{const input=page.getByPlaceholder('Search data',{exact:true});await input.fill('__benchmark_a__');await input.fill('__benchmark_b__');await input.fill('__benchmark_missing__')},async()=>{await page.waitForTimeout(600);await page.locator('.legal-content .skeleton').waitFor({state:'detached',timeout:120000})});
   await measure('studio_first',()=>page.evaluate(()=>location.hash='/legal/studio'),()=>page.locator('.studio-records-table').waitFor({timeout:120000}));
   const studioSearch=page.locator('.studio-table-search input');
   await measure('studio_empty',()=>studioSearch.fill('__benchmark_missing__'),async()=>{await page.waitForTimeout(600);await page.locator('.studio-section-refreshing').waitFor({state:'detached',timeout:120000})});
   await measure('review_first',()=>page.evaluate(()=>location.hash='/legal/beneficiaries'),()=>page.locator('.review-finding-selector').waitFor({timeout:120000}));
   const reviewSearch=page.locator('input[placeholder="Search records"]:visible').first();
   await measure('review_empty',()=>reviewSearch.fill('__benchmark_missing__'),async()=>{await page.waitForTimeout(600);await page.locator('.legal-content .skeleton').waitFor({state:'detached',timeout:120000})});
   await measure('review_reset',()=>reviewSearch.fill(''),async()=>{await page.waitForTimeout(600);await page.locator('.legal-content .skeleton').waitFor({state:'detached',timeout:120000})});
   await measure('revision_reload',async()=>{await page.request.post(base+'/__benchmark/revision');await page.reload()},()=>page.locator('.review-finding-selector').waitFor({timeout:120000}));
   assert.deepEqual(errors,[]);await context.close();console.log('Completed browser repetition '+(repetition+1));
  }
  const result={isolatedLocalData:true,repeats:5,notes:'Server request duration includes middleware/thread scheduling, not CPU alone. Search interaction timings are upper bounds sampled after a deliberate 600ms settle interval, rather than precise render completion. Backend cold/warm queries are measured separately.',runs};
  fs.writeFileSync(path.join(root,'output/performance/browser-filters-after.json'),JSON.stringify(result,null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
