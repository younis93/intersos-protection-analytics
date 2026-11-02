const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixtures=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8')),base='http://127.0.0.1:5397';
async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw new Error('State did not settle')}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const workspace of ['kobo','custom'])for(const width of [1440,390]){
  const f=fixtures[workspace],page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),workspace==='custom'?'glass-dark':'glass-light');
  const settings=structuredClone(f.settings);settings.filters=[{field:f.ids.region,kind:'category',values:['south']}];
  await page.request.put(`${base}/api/${workspace}/projects/${f.id}/settings`,{data:settings});
  // Add scrollable space without altering real project data.
  await page.goto(`${base}/#/${workspace}/${f.id}`);await page.addStyleTag({content:'.kobo-analysis-card-list{padding-bottom:1600px}'});
  const bar=page.locator('.kobo-sticky-controls'),hide=page.getByRole('button',{name:'Hide analysis controls',exact:true}),show=page.getByRole('button',{name:'Show analysis controls',exact:true});
  await hide.waitFor();assert.equal(await bar.getAttribute('data-controls-collapsed'),'false');assert(await page.getByRole('heading',{name:workspace==='custom'?'Filter records':'Filter responses',exact:true}).isVisible());assert(await page.getByRole('heading',{name:workspace==='custom'?'Columns & charts':'Questions & charts',exact:true}).isVisible());
  await hide.click();await show.waitFor();assert.equal(await bar.getAttribute('data-controls-collapsed'),'true');await page.keyboard.press('Enter');await hide.waitFor();assert.equal(await bar.getAttribute('data-controls-collapsed'),'false');
  const card=page.locator(`[data-question-id="${f.ids.answer}"]`);
  await page.evaluate(()=>{const node=document.querySelector('.kobo-analysis-sections');let root=node.parentElement;while(root&&!(root.scrollHeight>root.clientHeight+1&&/auto|scroll/.test(getComputedStyle(root).overflowY)))root=root.parentElement;(root||document.scrollingElement).scrollTop=1000});
  await until(async()=>await bar.getAttribute('data-controls-pinned')==='true');assert.equal(await bar.getAttribute('data-controls-collapsed'),'false');await hide.click();await show.waitFor();assert(await page.locator('.kobo-controls-compact-row').isVisible());assert.equal(await show.getByLabel('1 active response filters').innerText(),'1');
  const get=async()=>await(await page.request.get(`${base}/api/${workspace}/projects/${f.id}`)).json();assert.deepEqual((await get()).settings.filters.map(({field,kind,values})=>({field,kind,values})),settings.filters);
  await show.click();await hide.waitFor();assert.equal(await bar.getAttribute('data-controls-collapsed'),'false');assert(await hide.evaluate(node=>node===document.activeElement));await hide.click();await show.waitFor();await until(async()=>await show.evaluate(node=>node===document.activeElement));
  await page.screenshot({path:`output/analysis-features/compact-controls-${workspace}-${width}.png`});
  await page.evaluate(()=>{const node=document.querySelector('.kobo-analysis-sections');let root=node.parentElement;while(root&&!(root.scrollHeight>root.clientHeight+1&&/auto|scroll/.test(getComputedStyle(root).overflowY)))root=root.parentElement;(root||document.scrollingElement).scrollTop=0});
  await until(async()=>await bar.getAttribute('data-controls-pinned')==='false');
  if(await show.count())await show.click();await hide.waitFor();
  // Search and filter selections survive hiding and restoring the complete toolbar.
  const search=page.getByRole('textbox',{name:workspace==='custom'?'Search columns':'Search questions',exact:true});await search.fill('Answer');await hide.click();await show.click();assert.equal(await search.inputValue(),'Answer');await search.fill('');assert.deepEqual((await get()).settings.filters.map(({field,kind,values})=>({field,kind,values})),settings.filters);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log('PASS',workspace,width,'open default, manual toggle, stays expanded while scrolling, restore, active badge, focus, return-to-top, retained selections');await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
