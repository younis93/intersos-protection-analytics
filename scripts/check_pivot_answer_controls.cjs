const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixtures=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8')),base='http://127.0.0.1:5397';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const workspace of ['kobo','custom']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),item=fixtures[workspace],qid=item.ids.answer;
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{const blob=await items[0].getType('image/png');window.copiedChart={type:blob.type,size:blob.size,header:[...new Uint8Array(await blob.arrayBuffer()).slice(0,8)]}}}}));
  if(workspace==='custom')await page.addInitScript(()=>localStorage.setItem('app-theme','glass-dark'));
  await page.request.put(`${base}/api/${workspace}/projects/${item.id}/settings`,{data:item.settings});
  await page.goto(`${base}/#/${workspace}/${item.id}`);const card=page.locator('.kobo-question').first();await card.waitFor();
  assert.equal(await card.getByRole('button',{name:'Select cells',exact:true}).count(),0);
  assert.equal(await card.getByText('Drag cells or hold Ctrl and click cells to calculate.',{exact:true}).count(),0);
  const originalCounts=await card.locator('.kobo-question-counts').innerText();
  await card.getByRole('button',{name:'Export',exact:true}).click();assert.equal(await page.locator('.kobo-action-popup button').first().innerText(),'Copy chart image');await page.getByRole('button',{name:'Copy chart image',exact:true}).click();await page.locator('.legal-copy-toast').getByText('Chart image copied',{exact:true}).waitFor();assert.equal(await card.locator('.kobo-chart-export small').count(),0);const copied=await page.evaluate(()=>window.copiedChart);assert(copied.size>1000);assert.deepEqual(copied.header,[137,80,78,71,13,10,26,10]);
  const exportButton=card.locator('.kobo-chart-export button').first(),pivot=card.locator('.kobo-pivot-wrap');await exportButton.waitFor();
  assert((await exportButton.boundingBox()).y<(await card.locator('.kobo-chart').first().boundingBox().catch(()=>pivot.boundingBox())).y);
  const cells=card.locator('tbody td[data-select-row="0"]'),first=cells.first(),last=cells.last();
  const a=await first.boundingBox(),b=await last.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
  await card.locator('.kobo-selection-summary').waitFor();assert(await card.locator('[data-pivot-selected="true"]').count()>1);
  assert.equal(await page.getByRole('dialog').count(),0);
  await first.dispatchEvent('pointerdown',{pointerType:'touch',button:0,buttons:1,clientX:a.x,clientY:a.y});await first.dispatchEvent('pointermove',{pointerType:'touch',buttons:1,clientX:a.x+40,clientY:a.y+40});await first.dispatchEvent('pointerup',{pointerType:'touch',button:0,buttons:0});
  assert.equal(await pivot.evaluate(e=>getComputedStyle(e).touchAction),'auto');
  await first.focus();await page.keyboard.press('Escape');assert.equal(await card.locator('.kobo-selection-summary').count(),0);
  await card.locator('tbody .kobo-pivot-drilldown').first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  const label=card.locator('tbody .kobo-answer-actions').first();await label.click({button:'right'});const menu=page.getByRole('menu',{name:/Answer options/});await menu.waitFor();assert(await menu.getByRole('menuitem',{name:'Unhide all answers'}).isDisabled());
  await menu.getByRole('menuitem',{name:'Hide answer',exact:true}).click();await card.getByRole('group',{name:'Hidden answer percentages'}).waitFor();
  await page.waitForFunction(async({base,workspace,id,qid})=>{const project=await(await fetch(`${base}/api/${workspace}/projects/${id}`)).json();return project.settings.questions[qid].hiddenAnswers?.length===1},{base,workspace,id:item.id,qid});
  await card.getByText('1 answer hidden',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.kobo-question-counts strong[aria-label]')?.textContent.includes('/'));const hiddenCounts=await card.locator('.kobo-question-counts').innerText();assert(hiddenCounts.includes('/'));assert.equal(hiddenCounts.split('Missing')[1],originalCounts.split('Missing')[1]);
  await page.waitForTimeout(500);await page.screenshot({path:`output/analysis-features/answer-hidden-${workspace}.png`,fullPage:true});
  await page.reload();await card.getByRole('group',{name:'Hidden answer percentages'}).waitFor();
  await card.locator('tbody .kobo-answer-actions').first().click({button:'right'});await menu.getByRole('menuitem',{name:'Hide answer',exact:true}).click();await card.getByText('All answers hidden',{exact:true}).waitFor();
  await card.locator('tbody .kobo-answer-menu-trigger').first().click();await menu.getByRole('menuitem',{name:'Unhide all answers',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.kobo-answer-actions').length===2);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.dir='rtl');
  await card.locator('.kobo-answer-menu-trigger').first().focus();await page.keyboard.press('Enter');await menu.waitFor();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Hide answer');await page.keyboard.press('Escape');assert(await card.locator('.kobo-answer-menu-trigger').first().evaluate(e=>e===document.activeElement));
  await page.screenshot({path:`output/analysis-features/answer-controls-mobile-${workspace}.png`,fullPage:true});
  console.log('PASS',workspace,'drag, click drilldown, context menu, hide/reload/all-hidden/restore, keyboard, mobile RTL');
  if(workspace==='kobo'){
   await page.setViewportSize({width:1440,height:1000});
   await page.route(`**/api/${workspace}/projects/${item.id}/analysis`,async route=>{const response=await route.fetch(),value=await response.json();value.questions[0]={...value.questions[0],rows:Array.from({length:130},(_,i)=>({id:'r'+i,label:'Row '+i,count:130-i,percent:1})),breakdowns:[],breakdownFields:[],chartProjection:null};await route.fulfill({json:value})});
   await page.reload();await card.getByRole('button',{name:/Show more answers/}).click();const start=card.locator('[data-select-row="0"][data-select-column="0"]');await start.focus();
   for(let i=0;i<105;i++){await page.keyboard.press('Shift+ArrowDown');await page.waitForFunction(row=>document.activeElement?.dataset.selectRow===String(row),i+1,{timeout:3000})}
   await page.waitForFunction(()=>document.activeElement?.dataset.selectRow==='105');
   assert((await card.locator('.kobo-selection-summary').innerText()).includes('106'));console.log('PASS virtualized keyboard selection across 106 rows');
  }
  await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
