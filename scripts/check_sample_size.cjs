const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 let server;
 let base=process.env.APP_TEST_URL;
 if(!base){
  const root=path.resolve(__dirname,'../frontend/dist');
  server=require('node:http').createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 }
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/kobo/projects',route=>route.fulfill({json:[]}));
  await page.goto(base+'/#/kobo',{waitUntil:'domcontentloaded'});
  const opener=page.getByRole('button',{name:'Sample size calculator',exact:true});await opener.waitFor();
  const newProject=page.getByRole('button',{name:'New project',exact:true});
  assert((await opener.boundingBox()).x<(await newProject.boundingBox()).x);
  await opener.hover();assert(await opener.locator('svg').evaluate(e=>e.getAnimations().length>0));
  await opener.click();const dialog=page.getByRole('dialog',{name:'Sample size calculator'});await dialog.waitFor();
  assert(await dialog.getByRole('heading',{name:'Sample size calculator'}).evaluate(e=>e===document.activeElement));
  assert.equal(await dialog.getByLabel('Margin of error (%)',{exact:true}).inputValue(),'7');
  const population=dialog.getByLabel('Population size',{exact:true});
  const unknown=dialog.getByRole('checkbox',{name:/^Unknown population/});
  for(let i=0;i<3;i++){
   await unknown.check();assert(await population.isDisabled());
   await unknown.uncheck();assert(await population.isEnabled());
  }
  await unknown.check();
  await dialog.getByText('Advanced settings',{exact:true}).click();
  const populationBreakdown=dialog.getByLabel('Breakdown by location and gender',{exact:true});
  await populationBreakdown.check();assert(await population.isDisabled());assert.equal(await unknown.isChecked(),false);
  await populationBreakdown.uncheck();assert(await population.isEnabled(),'Population must be editable after leaving the breakdown');assert.equal(await unknown.isChecked(),false);
  await dialog.getByText('Advanced settings',{exact:true}).click();
  await dialog.getByLabel('Unknown population',{exact:true}).check();
  assert.equal(await dialog.locator('.sample-metrics strong').first().textContent(),'196');
  await dialog.getByLabel('Margin of error (%)',{exact:true}).fill('10');
  assert.equal(await dialog.locator('.sample-metrics strong').first().textContent(),'97');
  await dialog.getByLabel('Unknown population',{exact:true}).uncheck();await dialog.getByLabel('Population size',{exact:true}).fill('1000');
  await unknown.check();assert(await population.isDisabled());
  await unknown.uncheck();assert(await population.isEnabled());assert.equal(await population.inputValue(),'1000');
  assert.equal(await dialog.locator('.sample-metrics strong').first().textContent(),'88');
  assert.equal(await dialog.getByText('Required completed interviews',{exact:true}).count(),0);
  const breakdown=dialog.getByLabel('Breakdown by location and gender',{exact:true});
  assert.equal(await breakdown.isVisible(),false);
  await dialog.getByText('Advanced settings',{exact:true}).click();
  assert.equal(await breakdown.isVisible(),true);
  await dialog.getByLabel('Non-response allowance (%)',{exact:true}).fill('10');
  assert.equal(await dialog.locator('.sample-metrics strong').first().textContent(),'98');
  await dialog.getByLabel('Non-response allowance (%)',{exact:true}).fill('0');
  await dialog.getByRole('button',{name:'Copy results',exact:true}).click();assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('88 completed interviews'));
  const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Export CSV',exact:true}).click();const download=await downloadPromise;const csv=fs.readFileSync(await download.path(),'utf8');assert(csv.includes('"Grand total","","1000","88","88"'));
  await page.keyboard.press('Escape');assert(await opener.evaluate(e=>e===document.activeElement));await page.reload({waitUntil:'domcontentloaded'});await opener.click();assert.equal(await dialog.getByLabel('Population size',{exact:true}).inputValue(),'1000');
  await dialog.getByLabel('Margin of error (%)',{exact:true}).fill('0');assert.equal(await dialog.locator('.sample-metrics').count(),0);assert(await dialog.getByRole('button',{name:'Export CSV',exact:true}).isDisabled());
  await dialog.getByLabel('Margin of error (%)',{exact:true}).fill('10');
  await dialog.getByText('Advanced settings',{exact:true}).click();
  await dialog.getByLabel('Breakdown by location and gender',{exact:true}).check();
  await dialog.getByLabel('Location name',{exact:true}).fill('Baghdad');await dialog.getByLabel('Location population',{exact:true}).fill('1000');
  await dialog.getByLabel('Add gender categories',{exact:true}).check();const countInputs=dialog.getByLabel('Population count',{exact:true});await countInputs.nth(0).fill('600');await countInputs.nth(1).fill('400');
  assert.equal(await dialog.locator('tfoot td').nth(1).textContent(),'88');
  await dialog.getByLabel('Allocation mode',{exact:true}).selectOption('groups');assert.equal(await dialog.locator('.sample-metrics strong').first().textContent(),'161');
  await dialog.getByLabel('Gender population entry',{exact:true}).selectOption('percent');assert.equal(await dialog.locator('.sample-metrics').count(),0);
  await dialog.getByLabel('Allocation mode',{exact:true}).selectOption('overall');const shares=dialog.getByLabel('Planning share (%)',{exact:true});await shares.nth(0).fill('60');await shares.nth(1).fill('40');assert.equal(await dialog.locator('.sample-metrics strong').first().textContent(),'88');
  const output=path.resolve(__dirname,'../output/sample-size-calculator');fs.mkdirSync(output,{recursive:true});
  for(const width of [390,1440])for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
   await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Dialog overflow');
   assert(await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.height<=innerHeight;}),'Dialog out of viewport');
   await dialog.evaluate(e=>e.scrollTop=0);
   await page.screenshot({path:path.join(output,`${width}-${theme}.png`)});
   if(theme==='glass-light'){await dialog.locator('.sample-results').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${width}-results.png`)});}
  }
  await dialog.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await dialog.getByLabel('Population size',{exact:true}).inputValue(),'');assert.equal(await dialog.getByLabel('Margin of error (%)',{exact:true}).inputValue(),'7');
  await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});await opener.focus();await page.waitForFunction(()=>document.querySelector('.sample-calculator-button svg').getAnimations().length===0);assert.equal(await opener.locator('svg').evaluate(e=>e.getAnimations().length),0);
  await page.reload({waitUntil:'domcontentloaded'});await opener.click();assert.equal(await dialog.getByLabel('Population size',{exact:true}).inputValue(),'');
  // Verify blocked storage remains usable without changing the application's other storage consumers.
  await page.evaluate(()=>{const proto=Storage.prototype;const get=proto.getItem,set=proto.setItem;proto.getItem=function(key){if(key==='kobo-sample-size-v1')throw Error('blocked');return get.call(this,key);};proto.setItem=function(key,value){if(key==='kobo-sample-size-v1')throw Error('blocked');return set.call(this,key,value);};});
  await page.keyboard.press('Escape');await opener.click();await dialog.getByLabel('Unknown population',{exact:true}).check();assert.equal(await dialog.locator('.sample-metrics strong').first().textContent(),'196');assert(await dialog.getByText('Local storage is unavailable.',{exact:false}).isVisible());
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,referenceValues:true,breakdown:true,clipboard:true,csv:true,reset:true,restore:true,storageFailure:true,focus:true,reducedMotion:true,themes:5,viewports:2,errors}));
 }finally{await browser.close();server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
