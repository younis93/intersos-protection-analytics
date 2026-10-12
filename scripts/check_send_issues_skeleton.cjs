// Synthetic loading-to-loaded geometry check. Run against Vite on port 5188.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const results=[];
  for(const width of [1536,1280,900,390]){
   const page=await browser.newPage({viewport:{width,height:900}});
   let release;const gate=new Promise(resolve=>release=resolve);
   const lawyers=['Akram Abdulrahman',...Array.from({length:9},(_,i)=>`Lawyer ${i}`)];
   const contacts=Object.fromEntries(lawyers.map((name,i)=>[name,`lawyer${i}@example.org`]));
   const rows=lawyers.map((lawyer,i)=>({id:`f${i}`,dataset:'beneficiaries',lawyer,rule:'Marital status below 18',ruleArabic:'حالة اجتماعية تستدعي المراجعة لشخص دون سن 18 عاماً',severity:'Warning',row:i+2,caseId:String(78242+i),assessmentId:'73096',serviceId:'122032,122033,122034',reviewPage:'Beneficiaries Review',detail:'Current age is 17 based on the date of birth.'}));
   await page.route('**/api/legal/send-issues/**',async route=>{
    await gate;
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(route.request().url().endsWith('/contacts')?{contacts}:{revision:'fixture',lawyers,rows,total:rows.length,contacts})});
   });
   await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5188')+'/performance-harness.html');
   await page.evaluate(async()=>{
    await import('/src/styles.css');
    const {default:React}=await import('/node_modules/.vite/deps/react.js');
    const client=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default:SendIssues}=await import('/src/SendIssues.tsx');
    document.body.innerHTML='<div class="legal-shell" style="display:block"><main class="legal-content" id="skeleton-test"></main></div>';
    const host=document.getElementById('skeleton-test');
    host.style.cssText=innerWidth>700?'padding:16px 40px;margin-left:260px;min-width:0':'padding:16px;min-width:0';
    (client.createRoot||client.default.createRoot)(host).render(React.createElement(SendIssues,{revision:'fixture'}));
   });
   await page.locator('.si-loading-skeleton').waitFor();
   const selectors=['.send-issues','.si-top-filters','.si-workspace','.si-lawyers','.si-lawyer-heading','.si-selection','.si-group','.si-group header','.si-group thead','.si-group footer','.si-search'];
   const measure=()=>page.evaluate(selectors=>Object.fromEntries(selectors.map(selector=>{
    const rect=document.querySelector(selector).getBoundingClientRect();
    return [selector,{x:rect.x,y:rect.y,width:rect.width,height:rect.height}];
   })),selectors);
   const loading=await measure();
   assert.equal(await page.locator('.si-loading-skeleton').getAttribute('aria-hidden'),'true');
   if(width===1536||width===390)await page.screenshot({path:`output/send-issues-skeleton-aligned-${width}.png`});
   release();await page.locator('.si-loading-skeleton').waitFor({state:'detached'});
   await page.locator('.si-lawyer-identity h2').waitFor();
   const loaded=await measure();
   for(const selector of selectors){
    // Table overflow depends on the incoming text; its viewport stays fixed.
    for(const key of selector==='.si-group thead'?['x']:['x','width'])assert(Math.abs(loading[selector][key]-loaded[selector][key])<1,`${width}: ${selector} ${key} shifted`);
   }
   // Overall page height depends on the unknown number of findings, but the
   // recipients, heading and first table must retain their layout positions.
   for(const selector of ['.si-lawyers','.si-lawyer-heading','.si-selection','.si-group','.si-group header','.si-group thead'])assert(Math.abs(loading[selector].y-loaded[selector].y)<2,`${width}: ${selector} moved vertically: ${loading[selector].y} -> ${loaded[selector].y}`);
   for(const selector of ['.si-lawyers','.si-lawyer-heading','.si-selection','.si-group header','.si-group thead','.si-group footer'])assert(Math.abs(loading[selector].height-loaded[selector].height)<2,`${width}: ${selector} changed height: ${loading[selector].height} -> ${loaded[selector].height}`);
   if(width===1536||width===390)await page.screenshot({path:`output/send-issues-loaded-aligned-${width}.png`});
   results.push({width,loading,loaded});await page.close();
  }
  fs.writeFileSync('output/performance/send-issues-skeleton-layout.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({viewportWidths:results.map(result=>result.width),stableWidths:true,stablePositions:true,matchingHeights:true}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
