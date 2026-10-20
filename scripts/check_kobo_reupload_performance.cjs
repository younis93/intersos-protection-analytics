const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock,fixture}=require('./benchmark_kobo_scroll.cjs');
const base=process.env.KOBO_TEST_URL||'http://127.0.0.1:5197',baseline=process.argv.includes('--baseline');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],reviews=[],cancelled=[];let checks=0,saves=0,confirmations=0;
 page.on('pageerror',e=>errors.push(String(e)));await mock(page,370);
 const f=fixture(370),form={questions:f.questions,groups:f.groups,settings:{version:'1'},warnings:[]},mappings=f.questions.map((q,column)=>({sheet:0,column,header:q.name,question:q.id,option:'',status:'matched'}));
 const preview=token=>({token,form,sheets:[{name:'responses',rows:300,columns:370}],mappings,policies:{},issues:[],examples:{},warnings:[],expectedVersion:'1',sourceVersions:{'1':300}});
 await page.route('**/projects/scroll/settings',async route=>{saves++;await new Promise(r=>setTimeout(r,500));await route.fulfill({json:{saved:true}})});
 await page.route('**/projects/scroll/review',async route=>{reviews.push(route.request().postData()||'');const token=`review-${reviews.length}`;await new Promise(r=>setTimeout(r,1200));await route.fulfill({json:preview(token)})});
 await page.route('**/imports/*/check',async route=>{checks++;await new Promise(r=>setTimeout(r,300));await route.fulfill({json:{issues:[],examples:{}}})});
 await page.route('**/imports/review-*',async route=>{cancelled.push(route.request().url());await route.fulfill({json:{cancelled:true}})});
 await page.route('**/imports/confirm',async route=>{confirmations++;assert.equal(saves>0,true,'Settings must be saved before applying');await route.fulfill({json:{id:'scroll',name:'Scroll benchmark',form,settings:f.settings,warnings:[],issues:[]}})});
 await page.goto(`${base}/#/kobo/scroll`);await page.locator('#question-q0').waitFor();await page.waitForTimeout(700);
 const dialog=page.getByRole('dialog',{name:'Review and correct import',exact:true});
 const began=Date.now();await page.getByRole('button',{name:'Re-upload data',exact:true}).click();await dialog.getByRole('button',{name:'Choose form file',exact:true}).waitFor();const readyMs=Date.now()-began;
 fs.mkdirSync('output/performance',{recursive:true});
 if(baseline){await page.waitForTimeout(650);fs.writeFileSync('output/performance/kobo-reupload-before.json',JSON.stringify({readyMs,reviews:reviews.length,checks,controlledLatency:{reviewMs:1200,saveMs:500}},null,2));console.log('Baseline',readyMs,reviews.length,checks);return;}
 assert(readyMs<600,`File selection took ${readyMs}ms`);assert.equal(reviews.length,0,'Opening the picker must not parse saved files');assert.equal(saves,0,'Opening must not wait for a settings save');
 await dialog.getByLabel('Replacement XLSForm').setInputFiles({name:'replacement.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture')});
 await dialog.getByLabel('Replacement response data').setInputFiles({name:'replacement.csv',mimeType:'text/csv',buffer:Buffer.from('q0\nyes')});assert.equal(reviews.length,0,'Choose both files before processing');
 await dialog.getByRole('button',{name:'Review files',exact:true}).click();await dialog.getByText('Replacement files ready for review',{exact:true}).waitFor();await page.waitForTimeout(650);assert.equal(reviews.length,1);assert.equal(checks,0,'Reuse validated preview instead of checking again');assert(reviews[0].includes('replacement.xlsx')&&reviews[0].includes('replacement.csv'));
 await dialog.locator('.kobo-mapping-summary .is-matched').click();
 // Scrolled mapping selectors must never paint or intercept clicks over sticky actions.
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:844});
  for(const fraction of [.35,.7,.9]){
   await dialog.evaluate((node,fraction)=>node.scrollTop=(node.scrollHeight-node.clientHeight)*fraction,fraction);
   await page.waitForTimeout(50);
   assert(await dialog.locator('.kobo-mapping-confirm').evaluate(footer=>{
    const rect=footer.getBoundingClientRect();
    return [.25,.5,.75].every(x=>[.2,.5,.8].every(y=>footer.contains(document.elementFromPoint(rect.left+rect.width*x,rect.top+rect.height*y))));
   }),'Mapping controls must stay behind the sticky Apply footer');
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 await dialog.getByRole('button',{name:'Question for column 1',exact:true}).click();await page.getByRole('option',{name:'Exclude this column',exact:true}).click();await page.waitForTimeout(900);assert.equal(checks,1,'Mapping changes must be checked');
 await dialog.getByRole('button',{name:'Apply corrections',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(confirmations,1);
 async function open(){await page.getByRole('button',{name:'Re-upload data',exact:true}).click();await dialog.getByRole('button',{name:'Choose response file',exact:true}).waitFor()}
 await open();await dialog.getByLabel('Replacement response data').setInputFiles({name:'data-only.csv',mimeType:'text/csv',buffer:Buffer.from('q0\nyes')});await dialog.getByRole('button',{name:'Review files',exact:true}).click();await dialog.getByText('Replacement files ready for review',{exact:true}).waitFor();assert(!reviews[1].includes('name="form"'));await dialog.getByRole('button',{name:'Close review',exact:true}).click();
 await open();await dialog.getByLabel('Replacement XLSForm').setInputFiles({name:'form-only.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('fixture')});await dialog.getByRole('button',{name:'Review files',exact:true}).click();await page.waitForTimeout(150);const cancelBegan=Date.now();await dialog.getByRole('button',{name:'Close review',exact:true}).click();await dialog.waitFor({state:'detached'});assert(Date.now()-cancelBegan<600);await page.waitForTimeout(1500);assert(!reviews[2].includes('name="data"'));assert(cancelled.some(url=>url.endsWith('review-3')),'Late preview must be cancelled');
 await page.setViewportSize({width:390,height:844});await open();assert(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));await page.screenshot({path:'output/performance/kobo-reupload-mobile.png'});await dialog.getByRole('button',{name:'Close review',exact:true}).click();assert.deepEqual(errors,[]);
 fs.writeFileSync('output/performance/kobo-reupload-after.json',JSON.stringify({readyMs,reviews:reviews.length,checks,saves,confirmations,cancelled:cancelled.length,controlledLatency:{reviewMs:1200,saveMs:500},errors},null,2));console.log('PASS: instant file pickers, one combined preview, no duplicate checks, mapping validation, form/data/both uploads, save ordering, cancellation, mobile.',readyMs);
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
