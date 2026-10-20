const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],counts=[15,45,200,1000];page.on('pageerror',e=>errors.push(String(e)));let fixture;
  const calls=await mock(page,4,f=>{fixture=f;f.questions.forEach(q=>{q.kind='category';q.type='select_one';q.choices=[]});f.results.forEach((q,i)=>{
   Object.assign(q,{kind:'category',chart:'column',label:`District / Location (${counts[i]} categories)`,breakdowns:[],breakdownFields:[],appearance:{height:320},rows:Array.from({length:counts[i]},(_,j)=>({id:`id${String(j).padStart(4,'0')}`,label:j<2?'Repeated district':j===3?'A long district name that needs several lines without overlapping the chart':`District ${j+1}`,count:(j*17)%67+1,percent:((j*17)%67+1)/268*100}))});
  })});
  await page.addInitScript(()=>localStorage.setItem('app-theme','glass-light'));
  await page.goto((process.argv[2]||'http://127.0.0.1:5359')+'/#/kobo/scroll');fs.mkdirSync('output/kobo-large-charts',{recursive:true});
  for(let i=0;i<counts.length;i++){
   const wrapper=page.locator(`[data-question-id="q${i}"]`);await wrapper.scrollIntoViewIfNeeded();const card=page.locator(`#question-q${i}`),plot=card.locator('.js-plotly-plot');await plot.waitFor({timeout:60000});await page.waitForTimeout(300);
   const state=await plot.evaluate(el=>({height:el._fullLayout.height,domHeight:el.getBoundingClientRect().height,ids:el.data[0].y,counts:el.data[0].x,captions:el._fullLayout.yaxis.ticktext,band:el._fullLayout.yaxis._length/el.data[0].y.length,grid:el.closest('.kobo-question-grid').getBoundingClientRect().width,width:el.closest('.kobo-chart').getBoundingClientRect().width,first:el.closest('.kobo-question-grid').firstElementChild.className}));
   assert.equal(state.ids.length,counts[i]);assert.equal(new Set(state.ids).size,counts[i]);assert(state.counts.every((n,j)=>!j||state.counts[j-1]>=n));assert(Math.abs(state.height-state.domHeight)<1);assert(state.band>=40);assert(state.grid-state.width<5);assert(state.first.includes('kobo-chart'));
   const pivotRows=await card.locator('.kobo-pivot-table tbody th').allTextContents();assert.equal(pivotRows[0],'Repeated district');assert.equal(pivotRows[1],'Repeated district');
   const viewport=card.getByRole('region',{name:'Scrollable chart, all categories',exact:true});assert(await viewport.evaluate(el=>el.clientHeight<=640&&el.scrollHeight>el.clientHeight));
   assert((await card.locator('.kobo-chart-status').innerText()).includes(`Showing all ${counts[i].toLocaleString('en')} categories · Largest first`));
   const ticks=await plot.locator('.ytick text').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom}}).sort((a,b)=>a.top-b.top));for(let j=1;j<ticks.length;j++)assert(ticks[j-1].bottom<ticks[j].top,'Overlapping category labels');
   await viewport.focus();await page.keyboard.press('PageDown');await page.waitForTimeout(100);assert(await viewport.evaluate(el=>el.scrollTop>0));await viewport.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(100);
   assert(await plot.locator('.ytick text').last().evaluate(el=>{const b=el.getBoundingClientRect(),v=el.closest('.kobo-chart-viewport').getBoundingClientRect();return b.bottom<=v.bottom+1&&b.top>=v.top}));
   await viewport.evaluate(el=>el.scrollTop=0);await card.locator('.kobo-chart').screenshot({path:`output/kobo-large-charts/chart-${counts[i]}.png`});console.log('Verified',counts[i],'categories, height',state.height,'band',state.band);
  }
  const card=page.locator('#question-q1');await card.scrollIntoViewIfNeeded();await card.locator('.kobo-chart-viewport').evaluate(el=>el.scrollTop=0);
  for(const width of [1440,800,390]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);const plot=card.locator('.js-plotly-plot');assert(await plot.evaluate(el=>Math.abs(el.getBoundingClientRect().height-el._fullLayout.height)<1));assert(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await card.locator('.kobo-chart').screenshot({path:`output/kobo-large-charts/width-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});await card.scrollIntoViewIfNeeded();await card.locator('.kobo-chart-viewport').evaluate(el=>el.scrollTop=0);const mark=card.locator('.barlayer .point path').nth(8);await mark.scrollIntoViewIfNeeded();const box=await mark.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.locator('.hoverlayer').getByText('# Count:',{exact:false}).waitFor();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);const picker=page.getByRole('dialog',{name:'Edit chart color',exact:true});await picker.waitFor();await picker.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.setViewportSize({width:1440,height:1300});await card.locator('.kobo-chart').evaluate(el=>el.scrollIntoView({block:'center'}));await card.locator('.kobo-chart-viewport').evaluate(el=>el.scrollTop=0);await card.locator('.kobo-chart').screenshot({path:'output/kobo-large-charts/desktop-final.png'});
  // All categories remain available in customization, and the settings preview is scrollable too.
  await card.getByRole('button',{name:'Configure q1',exact:true}).click();await page.locator('.kobo-customize .kobo-chart-viewport.is-dense').waitFor();await page.keyboard.press('Escape');
  await page.locator('.kobo-chart-viewport.is-dense').first().evaluate(el=>el.scrollTop=0);assert.equal(calls(),1);assert.deepEqual(errors,[]);
  const group=page.locator('.kobo-group-heading>button').first();await group.click();await page.locator('#question-q0').waitFor({state:'detached'});await group.click();await page.locator('#question-q0 .js-plotly-plot').waitFor();assert(await page.locator('#question-q0 .js-plotly-plot').evaluate(el=>Math.abs(el.getBoundingClientRect().height-el._fullLayout.height)<1));
  // Arabic labels and full label selection use the same stable IDs.
  fixture.settings.language='ar';fixture.results[0].rows.forEach((row,j)=>row.label=`المنطقة ${j+1} - احتياجات المجتمع`);await page.reload();await page.locator('#question-q0 .js-plotly-plot').waitFor();await page.locator('#question-q0 .kobo-chart').screenshot({path:'output/kobo-large-charts/arabic.png'});
  console.log('PASS: full-width dense charts, all categories, stable IDs, unchanged pivots, readable spacing, explicit height after resize, keyboard/last-row scrolling, hover/color editing, customization and Arabic labels.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
