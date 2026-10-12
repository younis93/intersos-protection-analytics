// Read-only visual/cascade checks against the isolated local profiling server.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
  await page.goto('http://127.0.0.1:5181/?startupEpoch=123456#/legal/overview');
  for(const route of (process.env.LAYOUT_ROUTES?.split(',')||['overview','studio','detention','lawyer-intelligence','indicators','deportation'])){
   await page.evaluate(route=>location.hash='/legal/'+route,route);
   await page.waitForLoadState('networkidle',{timeout:120000});
   await page.waitForFunction(()=>document.querySelector('.legal-content')&&!document.querySelector('.legal-content .skeleton, .legal-content .legal-skeleton, .legal-content .loading, .legal-content [aria-busy=true]'),{},{timeout:120000});
   assert(await require('./verify_deferred_styles.cjs')(page),'Capture the original stylesheet before extraction');console.log('Layout matched original: '+route);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
