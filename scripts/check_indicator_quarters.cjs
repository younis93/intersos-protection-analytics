// Uses only the memory-only synthetic API fixture on 8018.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/indicatorQuarterCheck.tsx'),html=path.join(root,'frontend/indicator-quarter-check.html');
(async()=>{let browser;assert(!fs.existsSync(entry)&&!fs.existsSync(html));try{
 fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {IndicatorReporting} from './LegalIndicatorsPage';import './styles.css';import './workspace.css';import './indicators.css';createRoot(document.getElementById('root')!).render(<main className="legal-shell" style={{display:'block'}}><IndicatorReporting revision={1}/></main>);`);
 fs.writeFileSync(html,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/src/indicatorQuarterCheck.tsx"></script>');
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage(),errors=[],requests=[];page.setDefaultTimeout(60000);page.on('pageerror',error=>{errors.push(String(error));console.log('PAGE ERROR:',String(error))});
 await page.route('http://127.0.0.1:8000/**',async route=>{try{const request=route.request(),response=await route.fetch({url:request.url().replace(':8000',process.env.INDICATOR_TEST_API_PORT?':'+process.env.INDICATOR_TEST_API_PORT:':8018')});if(request.url().endsWith('/indicators'))requests.push(request.postDataJSON());await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}})}catch{await route.abort().catch(()=>{})}});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5186')+'/indicator-quarter-check.html');
  const field=page.locator('.indicator-filter-bar .checkbox-multi-select').filter({has:page.locator('.app-select-label',{hasText:'Quarters'})});
  await page.getByRole('button',{name:'All quarters',exact:true}).waitFor();await page.getByRole('button',{name:'All quarters',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Quarters filters',exact:true});await menu.getByRole('checkbox').first().waitFor();
  const quarters=await menu.getByRole('checkbox').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
  for(const quarter of quarters){
   console.log('Selecting',width,quarter);const updated=page.waitForResponse(response=>response.url().endsWith('/indicators')&&response.request().postDataJSON()?.quarters?.includes(quarter));await menu.getByRole('checkbox',{name:quarter,exact:true}).check();await updated;await page.waitForTimeout(250);assert.deepEqual(errors,[]);
   assert(requests.some(request=>request.quarters?.includes(quarter)),'Missing quarter request');
   await menu.getByRole('button',{name:'Done',exact:true}).click();
   await page.getByRole('button',{name:'All months',exact:true}).click();
   const monthMenu=page.getByRole('dialog',{name:'Months filters',exact:true});
   const monthValues=await monthMenu.getByRole('checkbox').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
   assert(monthValues.length>0,'Quarter lost all available months');
   assert(monthValues.every(month=>`${month.slice(0,4)}-Q${Math.ceil(Number(month.slice(5))/3)}`===quarter),'Months escaped the selected quarter');
   await monthMenu.getByRole('button',{name:'Done',exact:true}).click();await field.getByRole('button').first().click();

   const cleared=page.waitForResponse(response=>response.url().endsWith('/indicators')&&!response.request().postDataJSON()?.quarters?.length);await menu.getByRole('checkbox',{name:quarter,exact:true}).uncheck();await cleared;await page.waitForTimeout(250);assert.deepEqual(errors,[]);
  }
  await menu.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await field.count(),1);
  await page.getByRole('button',{name:/^Filters(?:\s|$)/}).click();
  const drawer=page.locator('.shared-filter-drawer'),group=drawer.locator('details').filter({has:page.locator('summary span',{hasText:'Quarters'})});
  await group.locator('summary').click();
  const applied=page.waitForResponse(response=>response.url().endsWith('/indicators')&&response.request().postDataJSON()?.quarters?.includes(quarters[0]));
  await group.getByRole('checkbox',{name:quarters[0],exact:true}).check();await applied;await page.waitForTimeout(250);
  assert.equal(await drawer.count(),1);assert.deepEqual(errors,[]);
  await drawer.getByRole('button',{name:'Done',exact:true}).click();
  const monthly=page.waitForResponse(response=>response.url().endsWith('/indicators/monthly'));
  await page.getByRole('button',{name:'Analysis',exact:true}).click();await monthly;
  await page.locator('.analysis-loading-state').waitFor({state:'hidden'});await page.locator('.indicator-analysis-content>div:last-child').first().scrollIntoViewIfNeeded();await page.locator('.indicator-analysis-chart svg').first().waitFor();assert.deepEqual(errors,[]);
  await field.getByRole('button').first().click();
  const changed=page.waitForResponse(response=>response.url().endsWith('/indicators')&&response.request().postDataJSON()?.quarters?.length===2);
  await menu.getByRole('checkbox',{name:quarters[1],exact:true}).check();await changed;await page.waitForTimeout(500);assert.deepEqual(errors,[]);
  console.log('Full drawer and Analysis quarter changes passed',width);
 }
 assert.deepEqual(errors,[]);console.log('Quarter selection/unselection passed on desktop and mobile');
}finally{await browser?.close();fs.rmSync(entry,{force:true});fs.rmSync(html,{force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
