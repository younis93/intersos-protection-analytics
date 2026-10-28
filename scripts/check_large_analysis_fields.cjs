const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const base=process.argv[2]||'http://127.0.0.1:5419';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 fs.mkdirSync('output/large-analysis-fields',{recursive:true});const results=[];
 try{for(const workspace of ['custom','kobo'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  const calls=await mock(page,25,f=>{
   f.questions.forEach(question=>Object.assign(question,{kind:'text',type:'text'}));
   f.results.forEach((result,index)=>Object.assign(result,{kind:'text',chart:'bar',breakdowns:[],breakdownFields:[],denominator:index===0?50001:1729,total:index===0?50001:1729,rows:Array.from({length:index===0?50001:1729},(_,i)=>({id:`id${String(i).padStart(6,'0')}`,label:`Answer ${i} `+'long free text response '.repeat(10),count:1,percent:100/(index===0?50001:1729)}))}));
  });
  await page.route('**/export-recovery',route=>route.fulfill({json:[]}));
  const started=Date.now();await page.goto(`${base}/#/${workspace}/scroll`);
  const card=page.locator('#question-q0'),plot=card.locator('.js-plotly-plot');
  await plot.locator('.main-svg').first().waitFor();
  const mounted=Date.now()-started;
  assert.equal(await plot.evaluate(node=>node.data[0].y.length),100);
  assert(await plot.evaluate(node=>node._fullLayout.height<100000),'Created an oversized plot');
  await card.getByRole('button',{name:'Next chart categories',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#question-q0 .js-plotly-plot')?.data[0]?.y[0]==='id000100');
  await card.getByRole('button',{name:'Last chart categories',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#question-q0 .js-plotly-plot')?.data[0]?.y[0]==='id050000');
  assert.equal(await plot.evaluate(node=>node.data[0].y.length),1);
  await card.getByRole('button',{name:'First chart categories',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#question-q0 .js-plotly-plot')?.data[0]?.y[0]==='id000000');
  // The table, full-result copy, and exports still receive the original answer set.
  assert.equal(await card.locator('.kobo-pivot-table tbody tr').count(),30);
  let peak=0;
  for(let i=0;i<25;i++){
   await page.locator(`[data-question-id="q${i}"]`).scrollIntoViewIfNeeded();
   await page.locator(`#question-q${i} .kobo-chart`).scrollIntoViewIfNeeded();
   await page.locator(`#question-q${i} .js-plotly-plot .main-svg`).first().waitFor();
   assert(await page.locator(`#question-q${i} .js-plotly-plot`).evaluate(node=>node.data[0].y.length<=100));
   peak=Math.max(peak,await page.locator('.js-plotly-plot').count());
  }
  assert(peak<=8);assert.equal(calls(),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await card.locator('.kobo-chart').scrollIntoViewIfNeeded();await plot.locator('.main-svg').first().waitFor();
  await card.locator('.kobo-chart').screenshot({path:`output/large-analysis-fields/${workspace}-${width}.png`});
  assert.deepEqual(errors,[]);results.push({workspace,width,largestField:50001,fields:25,chartPageSize:100,peakCharts:peak,firstChartMs:mounted,errors});
  console.log(results.at(-1));await page.close();
 }
 fs.writeFileSync('output/large-analysis-fields/results.json',JSON.stringify(results,null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
