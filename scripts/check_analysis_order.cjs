const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  fs.mkdirSync('output/answer-order',{recursive:true});
  for(const workspace of ['kobo','custom']){
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await mock(page,4,f=>{
    f.results.forEach((r,i)=>{
     r.chart='bar';r.breakdownFields=[{id:'region',label:'Region'}];
     r.breakdowns=(i<2?['north','south']:['north']).map(id=>({id,label:id,denominator:10}));
     r.rows=(i%2?[8]:[8,5,2]).map((count,j)=>({id:`a${j}`,label:`Answer ${j}`,count,percent:count*5,series:r.breakdowns.map(b=>({id:b.id,count,percent:count*10}))}));
     f.settings.questions[r.id]={answerSort:'count-desc',breakdownDisplay:'both'};
    });
   });
   await page.goto((process.argv[2]||'http://127.0.0.1:5359')+`/#/${workspace}/scroll`);
   for(let i=0;i<4;i++){
    const card=page.locator(`#question-q${i}`);await card.scrollIntoViewIfNeeded();
    const table=card.locator('.kobo-pivot-table');await table.waitFor();
    assert.equal(await table.locator('tfoot').count(),i%2?0:1);
    assert.equal(await table.locator('thead th').filter({hasText:/^Total$/}).count(),i<2?1:0);
    assert.deepEqual(await table.locator('tbody th').allTextContents(),i%2?['Answer 0']:['Answer 0','Answer 1','Answer 2']);
    await card.locator('.js-plotly-plot').waitFor();
    await page.waitForFunction(id=>{const plot=document.querySelector(`#question-${id} .js-plotly-plot`);return plot&&plot.data&&plot._fullLayout},`q${i}`);
    const plot=await card.locator('.js-plotly-plot').evaluate(el=>({counts:Array.from(el.data[0].x),range:el._fullLayout.yaxis.range}));
    assert.deepEqual(plot.counts,i%2?[8]:[8,5,2]);assert.ok(plot.range[0]>plot.range[1]);
   }
   await page.locator('#question-q0').scrollIntoViewIfNeeded();
   await page.screenshot({path:`output/answer-order/${workspace}.png`});
   assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${workspace}: descending table/chart order and all four conditional-total combinations`);
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
