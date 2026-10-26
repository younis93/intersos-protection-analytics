// Verify the real case UI without printing beneficiary names or phone numbers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async()=>{
  const browser = await chromium.launch({
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const results = {};
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const base = process.env.APP_TEST_URL || 'http://127.0.0.1:5196';
    // Use the same public entry document as the desktop to establish its local session.
    await page.request.get(base+'/');
    const response = await page.request.post(base+'/api/legal/case',{data:{query:'15974'}});
    assert.equal(response.status(),200);
    const profile = (await response.json()).cases[0].beneficiary;
    const name = profile['Name (Filter Color Red)'];
    const contact = Object.entries(profile).find(([key])=>key.startsWith('Contact Number'))?.[1];
    assert.ok(name && contact, 'Expected source profile fields are missing');
    let caseRequests=0;
    page.on('request',request=>{
      if(request.url().endsWith('/api/legal/case') && request.postDataJSON()?.query==='15974')caseRequests++;
    });
    const start=Date.now();
    await page.goto(base+'/#/legal/cases/15974');
    await page.getByRole('button',{name:'Open case 15974',exact:true}).waitFor({timeout:60000});
    results.first_cases_render_ms=Date.now()-start;
    await page.getByRole('button',{name:'Open case 15974',exact:true}).click();
    const modal=page.getByRole('dialog',{name:'Case 15974',exact:true});
    await modal.locator('.case-card h3').waitFor();
    assert.ok((await modal.locator('.case-card h3').textContent()).trim()===name, 'Case name differs from source');
    assert.ok((await modal.locator('.beneficiary-profile').textContent()).includes(String(contact)), 'Primary contact differs from source');
    results.case_name_and_primary_contact_visible=true;
    await modal.getByRole('button',{name:'Close case review',exact:true}).click();
    const requestsBefore=caseRequests;
    const repeatStart=Date.now();
    await page.getByRole('button',{name:'Open case 15974',exact:true}).click();
    await modal.locator('.case-card h3').waitFor();
    results.repeat_case_open_ms=Date.now()-repeatStart;
    assert.equal(caseRequests,requestsBefore,'Reopening a case bypassed the session cache');
    results.repeated_case_uses_cache=true;
    await modal.getByRole('button',{name:'Close case review',exact:true}).click();
    await page.locator('.data-source-control .app-select-trigger').click();
    const source=page.locator('.data-source-menu footer strong');
    assert.equal(await source.textContent(),'C:\\Legal Platform');
    results.full_source_path_visible=true;
    // Check path wrapping at the narrow width used in the reported source menu.
    await page.setViewportSize({width:428,height:900});
    assert.ok(await source.evaluate(element=>element.scrollWidth<=element.clientWidth));
    results.source_path_fits_mobile_menu=true;
    fs.mkdirSync('output/performance',{recursive:true});
    fs.writeFileSync('output/performance/legal-startup-ui.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
