const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),base='http://127.0.0.1:5181';
  await page.goto(base+'/');await page.locator('.welcome-page').waitFor();
  const js=await page.locator('script[type=module][src]').first().getAttribute('src');
  const asset=await page.request.get(base+js);assert.equal(asset.headers()['cache-control'],'public, max-age=31536000, immutable');
  assert.equal(asset.headers()['set-cookie'],undefined);
  const conditional=await page.request.get(base+js,{headers:{'If-None-Match':asset.headers().etag}});assert.equal(conditional.status(),304);assert(conditional.headers()['cache-control'].includes('immutable'));
  const missing=await page.request.get(base+'/assets/missing-AbCd1234.js');assert.equal(missing.status(),404);assert(missing.headers()['cache-control'].includes('no-store'));
  const logo=await page.request.get(base+'/intersos-symbol-clear.png');assert.equal(logo.headers()['cache-control'],'no-cache, must-revalidate');
  for(const url of ['/','/api/legal/metadata'])assert((await page.request.get(base+url)).headers()['cache-control'].includes('no-store'));
  await page.reload();await page.locator('.welcome-page').waitFor();
  const cached=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/')&&r.name.endsWith('.js')).map(r=>({transfer:r.transferSize,decoded:r.decodedBodySize})));
  assert(cached.some(r=>r.decoded>0&&r.transfer===0),'Reload did not reuse cached JavaScript');
  console.log(JSON.stringify({immutableAssets:true,conditional304:true,htmlAndApiNoStore:true,unhashedRevalidation:true,failuresNotCached:true,reloadReusesAssets:true}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
