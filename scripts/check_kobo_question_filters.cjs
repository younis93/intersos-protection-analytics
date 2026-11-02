const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8')),base='http://127.0.0.1:5397',out='output/kobo-question-filters';fs.mkdirSync(out,{recursive:true});
async function poll(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('State did not settle')}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const workspace of process.env.QUESTION_FILTER_SMOKE?['kobo']:['kobo','custom'])for(const theme of process.env.QUESTION_FILTER_SMOKE?['glass-light']:['glass-light','glass-dark'])for(const width of [1440,390]){
  const f=fixture[workspace],page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);let optionRequests=0;page.on('request',request=>{if(request.url().includes('/options'))optionRequests++});const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
  const get=async()=>await(await page.request.get(`${base}/api/${workspace}/projects/${f.id}`)).json();
  const settings={...f.settings,filters:[{field:f.ids.region,kind:'category',values:['south']}],questions:{...f.settings.questions,[f.ids.answer]:{...f.settings.questions[f.ids.answer],filterMode:'page',ownFilters:[]}}};
  assert.equal((await page.request.put(`${base}/api/${workspace}/projects/${f.id}/settings`,{data:settings})).status(),200);
  await page.goto(`${base}/#/${workspace}/${f.id}`);
  const card=page.locator(`[data-question-id="${f.ids.answer}"]`),dialog=page.getByRole('dialog',{name:'Question filters',exact:true});
  const search=()=>dialog.getByRole('textbox',{name:'Search question filter fields',exact:true});
  const open=async()=>{await card.getByRole('button',{name:`Question filters ${f.answerName}`,exact:true}).click();await dialog.waitFor()};
  const count=async()=>(await card.locator('.kobo-question-counts').textContent()).replace(/\s+/g,' ');
  await poll(async()=>(await count()).includes('2'));
  await open();assert.equal(await dialog.getByText('Use page filters',{exact:true}).count(),0);assert.equal(await dialog.getByText('Use own filters',{exact:true}).count(),0);assert.equal(await dialog.getByLabel('Filter source',{exact:true}).count(),0);
  await search().fill('Amount');const amount=dialog.locator(`[data-question-filter-field="${f.ids.amount}"]`);
  await amount.getByRole('checkbox').check();assert.equal(await dialog.getByLabel('From',{exact:true}).count(),0);
  await dialog.screenshot({path:`${out}/${workspace}-dialog-${theme}-${width}.png`});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await get()).settings.questions[f.ids.answer].ownFilters.length,0);
  await open();await search().fill('Amount');await amount.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Apply fields',exact:true}).click();
  const bar=card.getByRole('region',{name:'Filters for this question',exact:true});
  const amountControl=card.locator(`[data-question-filter-control="${f.ids.amount}"]`);
  await amountControl.getByLabel('From',{exact:true}).fill('25');
  await poll(async()=>(await get()).settings.questions[f.ids.answer].filterMode==='additional');
  await poll(async()=>(await count()).includes('Answered 1'));
  const heading=card.getByRole('heading',{name:'Answer',exact:true});
  const positions=await Promise.all([bar.boundingBox(),heading.boundingBox()]);assert(positions[0].y<positions[1].y);
  await bar.screenshot({path:`${out}/${workspace}-filters-${theme}-${width}.png`});
  assert.equal((await get()).settings.filters[0].values[0],'south');
  // The selector only chooses fields. Values are adjusted on the question itself.
  await open();assert(await dialog.getByRole('button',{name:/^Selected/}).getAttribute('aria-pressed')==='true');
  await dialog.getByRole('button',{name:/^All fields/}).click();await search().fill('Region');const region=dialog.locator(`[data-question-filter-field="${f.ids.region}"]`);await region.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Apply fields',exact:true}).click();
  const regionControl=card.locator(`[data-question-filter-control="${f.ids.region}"]`);await regionControl.locator('.app-select-trigger').click();const values=page.getByRole('dialog',{name:'Region filters',exact:true});
  const beforeAnswer=(await card.boundingBox()).y,requestsBeforeAnswer=optionRequests;await values.getByRole('checkbox',{name:/^north$/i}).check();await values.getByRole('button',{name:'Done',exact:true}).click();
  await poll(async()=>(await count()).includes('Answered 0'));
  assert(Math.abs((await card.boundingBox()).y-beforeAnswer)<3,'question position changed after selecting an answer');await regionControl.locator('.app-select-trigger').click();await values.waitFor();await values.getByRole('button',{name:'Done',exact:true}).click();assert.equal(optionRequests,requestsBeforeAnswer,'answer options fetched again');assert(await card.isVisible());assert.equal(await card.locator('.kobo-question-filter-control').count(),2);
  await card.getByRole('button',{name:'Remove question filter: Region',exact:true}).click();await poll(async()=>(await count()).includes('Answered 1'));
  await amountControl.getByLabel('From',{exact:true}).fill('20');await poll(async()=>(await count()).includes('Answered 2'));await amountControl.getByLabel('From',{exact:true}).fill('25');await poll(async()=>(await count()).includes('Answered 1'));
  // Matching-response drilldown stays inside the combined cohort.
  await card.getByRole('button',{name:/View 1 matching responses/}).first().click();const records=page.getByRole('dialog',{name:'Matching responses',exact:true});await records.waitFor();await poll(async()=>await records.locator('tbody tr').count()===1);await records.getByRole('button',{name:'Close',exact:true}).click();
  // Removing the last local field returns to page-only filtering and persists after reload.
  await card.getByRole('button',{name:'Remove question filter: Amount',exact:true}).click();await poll(async()=>(await count()).includes('Answered 2'));await poll(async()=>(await get()).settings.questions[f.ids.answer].filterMode==='page');
  assert.equal(await bar.count(),0);await page.reload();await poll(async()=>(await count()).includes('Answered 2'));
  await open();await search().fill('No such field');await dialog.getByText('No matching fields.',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Clear field search',exact:true}).click();
  assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',workspace,theme,width,'search/add/selected fields, Cancel, additive page filtering, controls above heading, removal, zero results, drilldown, persistence, responsive layout');
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
