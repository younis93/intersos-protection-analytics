// Production-only smoke test for deferred pages, direct links and network recovery.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[],assets=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.url().includes('/assets/'))assets.push(r.url())});
  let source='awareness',revision=1,failSendIssues=true,failWorkspaceCss=true;
  let holdMetadata=true,releaseMetadata;
  const metadataGate=new Promise(resolve=>{releaseMetadata=resolve});
  await page.route('**/assets/LegalPlatform-*.css',async route=>{if(failWorkspaceCss){failWorkspaceCss=false;return route.abort('failed')}return route.continue()});
  await page.route('**/assets/SendIssues-*.js',async route=>{if(failSendIssues){failSendIssues=false;return route.abort('failed')}return route.continue()});
  await page.route('**/api/**',async route=>{
   const url=route.request().url();let body={};
   if(url.includes('/legal/metadata')&&holdMetadata)await metadataGate;
   if(url.includes('/legal/metadata'))body={ready:true,revision:'smoke-'+revision,loading:false,source:'Synthetic '+source,warnings:[],availability:{[source]:true},features:{awareness:source==='awareness',detention:false,deportation:source==='deportationrecords'},sheets:[{id:source,name:source,rows:1,columns:['Value']}],months:[],reviewCounts:{}};
   else if(url.includes('/legal/review'))body={dataset:source,total:0,page:1,pageSize:100,rules:[],ruleCounts:{},filterOptions:{},availableMonths:[],rows:[]};
   else if(url.includes('/legal/send-issues'))body={revision:'smoke-'+revision,lawyers:[],rows:[],total:0,contacts:{}};
   else if(url.includes('/legal/explorer'))body={dataset:source,total:1,page:1,pageSize:100,columns:['Value'],rows:[{__rowKey:'1','Value':'ROW-'+revision}]};
   else if(url.includes('/legal/deportation-dashboard')||url.includes('/legal/hotline-dashboard'))body={page:source==='legalhotlines'?'hotline':'deportation',measure:'records',total:1,filteredRows:1,kpis:[],trend:[],charts:[],filterOptions:{}};
   else if(url.includes('duplicate-exclusions'))body={rows:[]};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const base=process.env.APP_PRODUCTION_URL||'http://127.0.0.1:5180';
  // Hold the workspace chunk to ensure desktop never repeats preparation.
  let releaseWorkspace;
  const workspaceGate=new Promise(resolve=>{releaseWorkspace=resolve});
  await page.route('**/assets/LegalPlatform-*.js',async route=>{await workspaceGate;await route.continue()});
  failWorkspaceCss=false;
  await page.goto(base+'/?startupEpoch=123456#/legal/awareness');
  await page.getByRole('heading',{name:'Processing records'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Preparing your workspace'}).count(),0);
  await page.evaluate(()=>{
   window.__preparationReplacements=0;
   window.__preparationObserver=new MutationObserver(()=>{
    const current=document.querySelector('.app-startup-loading');
    if(current)window.__preparationReplacements++;
   });
   window.__preparationObserver.observe(document.body,{childList:true,subtree:true});
   window.__processingGapFrames=0;
   window.__watchProcessing=true;
   const watch=()=>{
    if(!window.__watchProcessing)return;
    if(!document.querySelector('.legal-upload-overlay'))window.__processingGapFrames++;
    requestAnimationFrame(watch);
   };
   requestAnimationFrame(watch);
  });
  releaseWorkspace();
  await page.locator('.legal-shell').waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.legal-upload-progress').evaluate(card=>card.getAnimations().length),0,'Processing card restarted an entrance or resize animation');
  assert.equal(await page.getByRole('heading',{name:'Processing records'}).count(),1,'Processing missing while metadata is pending');
  assert.equal(await page.evaluate(()=>{window.__watchProcessing=false;return window.__processingGapFrames}),0,'Blank frame between module loading and processing');
  holdMetadata=false;releaseMetadata();
  await page.locator('.review-finding-selector').waitFor();
  await page.locator('.app-startup-loading').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>window.__preparationReplacements),0,'Preparation surface restarted during module handoff');
  await page.unroute('**/assets/LegalPlatform-*.js');
  failWorkspaceCss=true;
  assets.length=0;
  await page.goto(base+'/');await page.locator('.welcome-page').waitFor();
  await page.getByRole('button',{name:'Animate INTERSOS home logo'}).click();
  assert.equal(await page.locator('.home-logo-orbit,.home-logo-halo').count(),0,'Home logo still renders an animated circle');
  assert(!assets.some(url=>/LegalPlatform-|plotlyEngine-|jspdf.es.min-|LegalIndicatorsPage-.*\.css/.test(url)),'Welcome loaded a deferred workspace, page stylesheet or export engine');
  await page.evaluate(()=>{location.hash='/legal/awareness'});
  await page.getByRole('button',{name:'Reload page'}).click();
  await page.locator('.review-finding-selector').waitFor();
  assert(!assets.some(url=>/plotlyEngine-|jspdf.es.min-/.test(url)),'Review loaded chart/export engines');
  await page.evaluate(()=>{location.hash='/legal/send-issues'});await page.getByRole('button',{name:'Reload page'}).click();await page.locator('.send-issues[aria-busy=false]').waitFor({timeout:10000}).catch(async error=>{console.error(JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),errors,assets}));throw error});
  const loadedCount=assets.filter(url=>/\/SendIssues-[^/]+\.js/.test(url)).length;
  await page.evaluate(()=>{location.hash='/legal/awareness'});await page.locator('.review-finding-selector').waitFor();await page.evaluate(()=>{location.hash='/legal/send-issues'});await page.locator('.send-issues[aria-busy=false]').waitFor({timeout:10000}).catch(async error=>{console.error(JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),errors,assets}));throw error});
  assert.equal(assets.filter(url=>/\/SendIssues-[^/]+\.js/.test(url)).length,loadedCount,'Repeat visit fetched page module again');
  for(const [dataset,route] of [['deportationrecords','deportation'],['legalhotlines','hotline']]){
   source=dataset;revision++;
   await page.goto(base+'/?startupEpoch=123456&fixtureRevision='+revision+'#/legal/'+route);
   await page.getByText('ROW-'+revision,{exact:true}).waitFor({timeout:10000}).catch(async error=>{console.error(JSON.stringify({source,url:page.url(),text:await page.locator('body').innerText(),errors}));throw error});
   assert.equal(await page.locator('.app-startup-loading').count(),0,'Desktop handoff repeated the splash');
   assert.equal(await page.locator('.legal-sidebar nav button').filter({hasText:'Beneficiaries Review'}).count(),0,'Partial import exposed unavailable core page');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({welcomeDeferred:true,chartAndPdfDeferred:true,networkRetry:true,cssNetworkRetry:true,repeatModuleReuse:true,partialImports:['awareness','deportationrecords','legalhotlines'],directLinks:true,desktopHandoff:true,processingHandoffWithoutBlankFrames:true,pageErrors:errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
