// Source-free fixtures. Run against a local Vite server or production preview.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const base=process.argv[2]||'http://127.0.0.1:5417';
const output='output/analysis-rendering';

async function charts(browser,workspace,width){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 const calls=await mock(page,100,f=>{
  f.settings.filterFields=['q0'];
  f.results.forEach(result=>Object.assign(result,{kind:'category',chart:'bar',rows:result.rows.slice(0,4),breakdowns:[],breakdownFields:[]}));
  f.questions.forEach(question=>Object.assign(question,{kind:'category',type:'select_one'}));
 });
 // Fail a real Plotly render once to exercise the UI retry and queue release.
 await page.route(/\/(?:src\/plotlyEngine\.ts|assets\/plotlyEngine-[^/]+\.js)(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),body=await response.text();
  const engine=body.match(/(\w+) as default/)?.[1]||'Plotly';
  await route.fulfill({response,body:body+`\nconst originalReact=${engine}.react;${engine}.react=function(...args){if(!window.__chartFailureInjected){window.__chartFailureInjected=true;return Promise.reject(new Error('Synthetic render failure'))}return originalReact.apply(this,args)};`});
 });
 await page.route('**/projects/scroll/data',route=>route.fulfill({json:{total:320,matched:320,rows:[]}}));
 await page.route('**/export-recovery',route=>route.fulfill({json:[]}));
 await page.goto(`${base}/#/${workspace}/scroll`);
 await page.getByRole('button',{name:'Retry chart',exact:true}).waitFor();
 assert(await page.locator('.kobo-question').count()<8,'Offscreen questions mounted eagerly');
 const placeholder=page.locator('.kobo-question-placeholder').last();
 assert(await placeholder.locator('.kobo-skeleton-bars').count());
 assert.equal(await placeholder.locator('.kobo-skeleton-bars i').first().evaluate(node=>getComputedStyle(node).animationName),'none');
 const failed=page.locator('.kobo-chart').filter({has:page.getByRole('button',{name:'Retry chart',exact:true})});
 const failedId=await failed.locator('..').evaluate(node=>node.closest('[data-question-id]').dataset.questionId);
 // Another chart must render even while the failed chart waits for user input.
 const nextId=failedId==='q0'?'q1':'q0';
 await page.locator(`[data-question-id="${nextId}"]`).scrollIntoViewIfNeeded();
 await page.locator(`#question-${nextId} .js-plotly-plot .main-svg`).first().waitFor();
 await failed.scrollIntoViewIfNeeded();await failed.getByRole('button',{name:'Retry chart',exact:true}).click();
 await page.locator(`#question-${failedId} .js-plotly-plot .main-svg`).first().waitFor();
 let peak=0;
 for(let i=0;i<100;i++){
  await page.locator(`[data-question-id="q${i}"]`).scrollIntoViewIfNeeded();
  await page.locator(`#question-q${i} .kobo-chart`).scrollIntoViewIfNeeded();
  await page.locator(`#question-q${i} .js-plotly-plot .main-svg`).first().waitFor();
  peak=Math.max(peak,await page.locator('.js-plotly-plot').count());
 }
 assert(peak<=8,`Chart cache grew to ${peak}`);
 assert.equal(calls(),1,'Scrolling should reuse loaded analysis');
 assert.equal(await page.locator('#question-q0 .js-plotly-plot').count(),0);
 const first=page.locator('#question-q0');
 for(const [label,extension] of [['Chart PNG','.png'],['Question PDF','.pdf']]){
  await first.evaluate(node=>[...node.querySelectorAll('button')].find(button=>button.textContent.includes('Export question')).click());
  const download=page.waitForEvent('download');
  await first.evaluate((node,label)=>[...node.querySelectorAll('button')].find(button=>button.textContent.includes(label)).click(),label);
  assert((await download).suggestedFilename().endsWith(extension));
 }
 const height=await page.locator('#question-q0 .kobo-chart').evaluate(node=>node.getBoundingClientRect().height);
 await page.locator('#question-q0 .kobo-chart').scrollIntoViewIfNeeded();
 await page.locator('#question-q0 .js-plotly-plot .main-svg').first().waitFor();
 assert(Math.abs(await page.locator('#question-q0 .kobo-chart').evaluate(node=>node.getBoundingClientRect().height)-height)<3,'Eviction changed chart height');
 assert(await page.locator('#question-q0').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
 await page.screenshot({path:`${output}/${workspace}-${width}.png`});
 const search=page.getByRole('textbox',{name:workspace==='custom'?'Search columns':'Search questions',exact:true});
 await search.fill('Question 100:');await page.locator('#question-q99').waitFor();
 assert.equal(await page.locator('.kobo-deferred-question').count(),1);await search.fill('');
 await page.getByRole('button',{name:'Table view',exact:true}).click();await page.locator('.kobo-data-explorer').waitFor();
 assert.equal(await page.locator('.js-plotly-plot').count(),0);
 await page.getByRole('button',{name:'Charts view',exact:true}).click();await page.locator('#question-q0').waitFor();
 const toggle=page.getByRole('button',{name:'Filter responses',exact:true});
 if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 await page.locator('.kobo-filter-grid .app-select-trigger').click();
 await page.getByRole('checkbox',{name:'Safety',exact:true}).check();await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.kobo-active-filters')?.textContent.includes('Safety'));
 await page.waitForTimeout(400);assert.equal(calls.settings().filters[0].values[0],'Safety');
 assert.deepEqual(errors,[]);await page.close();
 return{workspace,width,chartsVisited:100,peakCharts:peak,retry:true,reducedMotion:true};
}

async function columns(browser,width){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await mock(page,1);
 const config={worksheet:'CSV',headerRow:1,dateFormat:'auto',filterFields:[],columns:Array.from({length:1000},(_,index)=>({id:`col_${index}`,index,header:`Column ${index}`,label:`Column ${index}`+(index%3?'':' with a long label that wraps over multiple lines'),kind:'text',included:index!==500,group:'',dateFormat:'auto',separator:'',categories:{},invalidAsMissing:false,includeTime:false,timeLabel:''}))};
 const preview={token:'rendering',config,worksheets:['CSV'],sourcePreview:[],rows:1,profiles:[],issues:[{question:'col_999',message:'Synthetic issue',count:2}],changes:[]};
 await page.route('**/projects/scroll/columns',route=>route.fulfill({json:preview}));
 await page.route('**/columns/rendering/configure',route=>route.fulfill({json:{...preview,config:route.request().postDataJSON()}}));
 await page.route('**/columns/rendering',route=>route.fulfill({json:{}}));
 await page.goto(`${base}/#/custom/scroll`);await page.getByRole('button',{name:'Manage data',exact:true}).click();
 await page.getByRole('button',{name:'Prepare data',exact:true}).click();
 const list=page.locator('.custom-column-list'),buttons=list.locator('button');await buttons.first().waitFor();
 assert(await buttons.count()<60,'Rendered all 1,000 columns');
 await buttons.first().focus();await page.keyboard.press('End');
 await page.waitForFunction(()=>document.activeElement?.textContent.includes('Column 999'));
 await page.keyboard.press('Enter');assert.equal(await page.getByLabel('Column display label',{exact:true}).inputValue(),config.columns[999].label);
 assert.equal(await list.getByLabel('2 issues',{exact:true}).count(),1);
 await page.keyboard.press('Home');await page.waitForFunction(()=>document.activeElement?.textContent.includes('Column 0'));
 for(let i=0;i<25;i++)await page.keyboard.press('Tab');
 await page.waitForFunction(()=>document.activeElement?.textContent.includes('Column 25'));
 await page.keyboard.press('Shift+Tab');await page.waitForFunction(()=>document.activeElement?.textContent.includes('Column 24'));
 await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.activeElement?.textContent.includes('Column 25'));
 await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>document.activeElement?.textContent.includes('Column 24'));
 const search=page.getByRole('textbox',{name:'Search preparation columns',exact:true});
 await search.fill('Column 500');assert.equal(await buttons.count(),1);await buttons.first().click();
 assert.equal(await page.getByLabel('Column display label',{exact:true}).inputValue(),config.columns[500].label);
 assert.equal(await page.getByRole('checkbox',{name:'Include in analysis',exact:true}).isChecked(),false);
 await search.fill('');await page.waitForFunction(()=>document.querySelector('.custom-column-list button.selected'));
 await page.getByLabel('Column display label',{exact:true}).fill('Renamed column');
 await page.waitForFunction(()=>document.querySelector('.custom-column-list button.selected')?.textContent.includes('Renamed column'));
 await list.evaluate(node=>{node.scrollTop=node.scrollHeight});await list.getByRole('button',{name:/Column 999/}).waitFor();
 assert(await buttons.count()<60);assert(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
 await page.screenshot({path:`${output}/columns-${width}.png`});assert.deepEqual(errors,[]);await page.close();
 return{width,columns:1000,keyboard:true,search:true};
}

(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const results=[];
  for(const width of [1440,390]){
   results.push(await columns(browser,width));console.log('Passed 1,000 columns',width);
   for(const workspace of ['kobo','custom']){const result=await charts(browser,workspace,width);results.push(result);console.log(result)}
  }
  fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
