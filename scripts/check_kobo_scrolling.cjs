const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const base=process.argv[2]||'http://127.0.0.1:5197';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const calls=await mock(page,60,f=>{
   f.settings.filterFields=['q0'];
   f.groups.push({id:'other',name:'other',label:'Other questions',labels:{en:'Other questions'},parent:'',repeat:false});
   f.results.slice(-5).forEach(q=>q.group='other');f.questions.slice(-5).forEach(q=>q.group='other');
  });
  await page.goto(`${base}/#/kobo/scroll`,{waitUntil:'domcontentloaded'});
  const first=page.locator('#question-q0');await first.waitFor();
  assert.equal(await page.getByRole('button',{name:'Other questions',exact:true}).getAttribute('aria-expanded'),'false');
  assert(await page.locator('.kobo-question').count()<8,'Only nearby questions should mount initially');
  await first.getByRole('button',{name:/Show more answers/}).click();
  await first.getByRole('button',{name:'Sort by Answer',exact:true}).click();
  assert.equal(await first.locator('tbody tr').count(),32);
  assert.equal(await first.locator('tbody tr th').first().textContent(),'Priority 1');
  await first.locator('.kobo-chart').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#question-q0 .js-plotly-plot .main-svg'));
  await first.locator('.kobo-pivot-wrap').evaluate(node=>{node.scrollLeft=100;node.scrollTop=80});
  const before=await first.locator('.kobo-pivot-wrap').evaluate(node=>({left:node.scrollLeft,top:node.scrollTop}));
  await page.evaluate(()=>{let root=document.querySelector('.kobo-question').parentElement;while(root&&!(root.scrollHeight>root.clientHeight+1&&/auto|scroll/.test(getComputedStyle(root).overflowY)))root=root.parentElement;window.__root=root||document.scrollingElement});
  let peak=0;
  for(let i=0;i<48;i++){await page.evaluate(()=>window.__root.scrollBy(0,650));await page.waitForTimeout(60);peak=Math.max(peak,await page.locator('.js-plotly-plot').count())}
  assert(peak<=8,`Chart cache grew to ${peak}`);
  assert.equal(await first.locator('.js-plotly-plot').count(),0,'Old chart should be released');
  assert.equal(calls(),1,'Scrolling should not request analysis');
  // Export the original question while its chart is still evicted and offscreen.
  await first.evaluate(node=>[...node.querySelectorAll('button')].find(button=>button.textContent.includes('Export question')).click());
  const pngEvent=page.waitForEvent('download');
  await first.evaluate(node=>[...node.querySelectorAll('button')].find(button=>button.textContent.includes('Chart PNG')).click());
  const png=await pngEvent;assert(png.suggestedFilename().endsWith('.png'));
  await first.evaluate(node=>[...node.querySelectorAll('button')].find(button=>button.textContent.includes('Export question')).click());
  const pdfEvent=page.waitForEvent('download');
  await first.evaluate(node=>[...node.querySelectorAll('button')].find(button=>button.textContent.includes('Question PDF')).click());
  const pdf=await pdfEvent;assert(pdf.suggestedFilename().endsWith('.pdf'));
  await first.locator('.kobo-chart').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#question-q0 .js-plotly-plot .main-svg'));
  assert.equal(await first.locator('tbody tr').count(),32,'Expanded rows must survive scrolling');
  assert.equal(await first.locator('th[aria-sort=ascending]').count(),1,'Sort must survive scrolling');
  const after=await first.locator('.kobo-pivot-wrap').evaluate(node=>({left:node.scrollLeft,top:node.scrollTop}));assert.deepEqual(after,before);
  const position=await page.evaluate(()=>window.__root.scrollTop);await page.waitForTimeout(600);
  assert(Math.abs(await page.evaluate(()=>window.__root.scrollTop)-position)<3,'Returning chart should not move the scroll position');
  await page.evaluate(()=>document.documentElement.dataset.theme='glass-dark');
  await page.waitForFunction(()=>document.querySelector('#question-q0 .js-plotly-plot')?._fullLayout?.font.color==='#edf7ff');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.setViewportSize({width:1100,height:900});
  await page.getByRole('button',{name:'Other questions',exact:true}).click();
  const other=page.locator('[data-question-id="q55"]');await other.scrollIntoViewIfNeeded();await page.locator('#question-q55').waitFor();
  await page.getByRole('button',{name:'Other questions',exact:true}).click();assert.equal(await page.locator('#question-q55').count(),0);
  await page.getByRole('button',{name:'Survey questions',exact:true}).click();await page.waitForTimeout(200);assert.equal(await page.locator('.js-plotly-plot').count(),0,'Closing groups should purge all charts');
  // A keyboard user can activate an unloaded question without waiting for scrolling.
  await page.getByRole('button',{name:'Survey questions',exact:true}).click();
  await page.locator('[data-question-id="q40"]').focus();await page.locator('#question-q40').waitFor();
  assert(await page.locator('#question-q40').evaluate(node=>node.contains(document.activeElement)),'Focus should enter the loaded question');
  // Existing filters survive a display-setting change through a stable card callback.
  await page.locator('.kobo-filter-grid .app-select-trigger').click();
  await page.getByRole('checkbox',{name:'Safety',exact:true}).check();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.kobo-active-filters')?.textContent.includes('Safety'));
  await page.locator('#question-q0').getByRole('button',{name:'% only',exact:true}).click();
  await page.waitForTimeout(700);assert.equal(calls.settings().filters[0].values[0],'Safety');assert.equal(calls.settings().questions.q0.breakdownDisplay,'percent');
  assert.equal(await page.getByRole('button',{name:'View report',exact:true}).count(),0);
  await page.evaluate(()=>window.location.hash='#/kobo/scroll/report');await page.waitForURL('**/#/kobo/scroll');
  await page.getByRole('button',{name:'Manage questions',exact:true}).waitFor();
  await page.evaluate(()=>window.location.hash='#/kobo');await page.getByRole('heading',{name:'Your Kobo projects'}).waitFor();
  assert.equal(await page.locator('.js-plotly-plot').count(),0);assert.deepEqual(errors,[]);
  const typesPage=await browser.newPage({viewport:{width:1100,height:900}});typesPage.on('pageerror',e=>errors.push(String(e)));
  await mock(typesPage,6,f=>{f.results[0].denominator=0;f.results[0].rows=[];for(const [index,chart] of [[1,'pie'],[2,'donut'],[3,'line'],[4,'column']]){f.results[index].chart=chart;f.results[index].breakdowns=[];f.results[index].breakdownFields=[];}});
  await typesPage.goto(`${base}/#/kobo/scroll`,{waitUntil:'domcontentloaded'});await typesPage.locator('#question-q0').waitFor();
  assert.equal(await typesPage.locator('#question-q0 .js-plotly-plot').count(),0);assert(await typesPage.locator('#question-q0 .kobo-chart').evaluate(node=>node.getBoundingClientRect().height<=331));
  for(const [index,type] of [[1,'pie'],[2,'pie'],[3,'scatter'],[4,'bar']]){
   await typesPage.locator(`[data-question-id="q${index}"]`).scrollIntoViewIfNeeded();await typesPage.locator(`#question-q${index} .kobo-chart`).scrollIntoViewIfNeeded();
   await typesPage.waitForFunction(({index,type})=>document.querySelector(`#question-q${index} .js-plotly-plot`)?._fullData?.[0]?.type===type,{index,type});
  }
  assert.deepEqual(errors,[]);await typesPage.close();
  fs.mkdirSync('output/performance',{recursive:true});fs.writeFileSync('output/performance/kobo-scroll-functional.json',JSON.stringify({passed:true,peakCharts:peak,tableStatePreserved:true,png:true,pdf:true,theme:true,keyboard:true,cleanup:true,emptyData:true,chartTypes:true,errors},null,2));
  console.log('PASS: deferred questions, eight-chart cache, restored charts, table state, stable scroll, exports while evicted, theme, mobile, groups, keyboard and cleanup.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
