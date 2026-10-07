/* Real page checks using the synthetic backend on port 8018, never case files. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.route('http://127.0.0.1:8000/**',async route=>{
      const request=route.request();
      if(request.url().includes('/explorer-filters/')&&request.postDataJSON()?.search==='AMAL')await new Promise(resolve=>setTimeout(resolve,1000));
      if(request.url().includes("/api/update/")){await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify({available:false,enabled:false,currentVersion:"test",phase:"idle"})});return;}
      try{const response=await route.fetch({url:request.url().replace(':8000',':8018')});await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}})}catch{await route.abort().catch(()=>{})}
    });
    for(const width of [390,1280])for(const route of ['cases','explorer']){
      await page.setViewportSize({width,height:900});
      await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5178')+'/#/legal/'+route);
      await page.locator('.app-startup-loading').waitFor({state:'hidden'});
      await page.getByRole('button',{name:/^Filters(?:\s|$)/}).first().click();
      const drawer=page.locator('.case-filter-drawer');await drawer.waitFor();
      const field=label=>drawer.locator('details').filter({has:page.locator('summary span').filter({hasText:new RegExp('^'+label+'$')})});
      const prefix=route==='cases'?'Beneficiary · ':'';
      const project=field(prefix+'Project'),location=field(prefix+'Project Location');
      await project.locator('summary').click();
      const row=project.locator('.filter-option-row').filter({has:page.getByText('UNHCR 2026 - AMAL CAMP',{exact:true})});
      if(width===390)await row.getByRole('button',{name:'Actions for UNHCR 2026 - AMAL CAMP',exact:true}).click();else await row.hover();
      await row.getByRole('button',{name:'Only UNHCR 2026 - AMAL CAMP',exact:true}).click();
      await location.locator('summary').click();
      await page.waitForFunction(prefix=>{const summary=[...document.querySelectorAll('.case-filter-drawer summary')].find(node=>node.querySelector('span')?.textContent===prefix+'Project Location');return summary?.parentElement.querySelectorAll('input[type=checkbox]').length===1},prefix);
      assert.equal(await location.getByRole('checkbox').getAttribute('aria-label'),'AMAL Camp');
      assert.equal(await project.getByRole('checkbox').count(),3,'Own field must still allow another selection');
      await location.getByRole('checkbox',{name:'AMAL Camp'}).check();
      await project.getByRole('button',{name:'Reset',exact:true}).click();
      await page.waitForFunction(prefix=>{const summary=[...document.querySelectorAll('.case-filter-drawer summary')].find(node=>node.querySelector('span')?.textContent===prefix+'Project');return summary?.parentElement.querySelectorAll('input[type=checkbox]').length===1},prefix);
      if(!(await project.getAttribute('open')!==null))await project.locator('summary').click();
      assert.equal(await project.getByRole('checkbox').getAttribute('aria-label'),'UNHCR 2026 - AMAL CAMP');
      const onlyRow=project.locator('.filter-option-row');if(width===390)await onlyRow.getByRole('button',{name:'Actions for UNHCR 2026 - AMAL CAMP',exact:true}).click();else await onlyRow.hover();
      await onlyRow.getByRole('button',{name:'Exclude UNHCR 2026 - AMAL CAMP',exact:true}).click();
      await location.getByRole('button',{name:'Remove unavailable AMAL Camp',exact:true}).waitFor();
      assert.equal(await location.getByRole('checkbox').count(),2);
      const nationality=field(prefix+'Nationality');await nationality.locator('summary').click();await nationality.getByText('No available options',{exact:true}).waitFor();assert.equal(await nationality.getByRole('checkbox').count(),0);
      await location.getByRole('button',{name:'Remove unavailable AMAL Camp',exact:true}).click();
      await page.waitForFunction(prefix=>{const summary=[...document.querySelectorAll('.case-filter-drawer summary')].find(node=>node.querySelector('span')?.textContent===prefix+'Project Location');return summary?.parentElement.querySelectorAll('input[type=checkbox]').length===2},prefix);
      await project.getByRole('button',{name:'Reset',exact:true}).click();
      await drawer.getByRole('button',{name:/^Apply filters/}).click();
    }
    await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5178')+'/#/legal/explorer');
    const search=page.getByPlaceholder('Search data');
    await search.waitFor();
    const oldRequest=page.waitForRequest(request=>request.url().includes('/explorer-filters/')&&request.postDataJSON()?.search==='AMAL');
    await search.fill('AMAL');await oldRequest;
    await search.fill('Anbar');
    await page.getByRole('button',{name:/^Filters(?:\s|$)/}).first().click();
    const project=page.locator('.case-filter-drawer details').filter({has:page.locator('summary span').filter({hasText:/^Project$/})});
    await project.locator('summary').click();
    await project.getByRole('checkbox',{name:'UNHCR 2026 - Gov',exact:true}).waitFor();
    await page.waitForTimeout(1200);
    assert.equal(await project.getByRole('checkbox').count(),1);
    assert.equal(await project.getByRole('checkbox').getAttribute('aria-label'),'UNHCR 2026 - Gov','An obsolete option response replaced the latest search');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({realPages:['cases','explorer'],viewports:2,bidirectional:true,selfSelection:true,unavailableRetained:true,emptyState:true,exclusions:true,rapidSearch:true,errors}));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
