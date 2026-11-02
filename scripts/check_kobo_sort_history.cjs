const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixtures=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8')),base='http://127.0.0.1:5397';
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw new Error('State did not settle')}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const workspace of ['kobo','custom']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),f=fixtures[workspace],id=f.ids.answer,errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const original=structuredClone(f.settings);original.questions[id].breakdowns=[];original.questions[id].ownFilters=[{field:f.ids.amount,kind:'number',values:[],minimum:null,maximum:null}];
  await page.request.put(`${base}/api/${workspace}/projects/${f.id}/settings`,{data:original});
  const get=async()=>await(await page.request.get(`${base}/api/${workspace}/projects/${f.id}`)).json();
  await page.goto(`${base}/#/${workspace}/${f.id}`);
  const card=page.locator(`[data-question-id="${id}"]`),undo=page.getByRole('button',{name:'Undo',exact:true}),redo=page.getByRole('button',{name:'Redo',exact:true});
  const labels=()=>card.locator('tbody .kobo-answer-actions').evaluateAll(nodes=>nodes.map(n=>n.textContent.trim()));
  const chartLabels=()=>card.locator('.js-plotly-plot').evaluate(node=>Array.from(node.data[0].y));
  await card.locator('.js-plotly-plot').waitFor();assert(await undo.isDisabled());assert(await redo.isDisabled());
  assert.deepEqual(await labels(),['A','B']);
  const sortCount=card.getByRole('button',{name:'Sort by Total count',exact:true});await sortCount.scrollIntoViewIfNeeded();const startTop=(await card.boundingBox()).y;await sortCount.click();
  await until(async()=>JSON.stringify(await labels())===JSON.stringify(['B','A']));await until(async()=>JSON.stringify(await chartLabels())===JSON.stringify(['B','A']));
  await until(async()=>(await get()).settings.questions[id].pivotSort?.direction==='asc');assert(Math.abs((await card.boundingBox()).y-startTop)<4,'sorting moved the question');
  await page.keyboard.press('Control+z');await until(async()=>JSON.stringify(await labels())===JSON.stringify(['A','B']));await until(async()=>JSON.stringify(await chartLabels())===JSON.stringify(['A','B']));assert(await redo.isEnabled());
  await page.keyboard.press('Control+r');await until(async()=>JSON.stringify(await labels())===JSON.stringify(['B','A']));await until(async()=>JSON.stringify(await chartLabels())===JSON.stringify(['B','A']));
  await card.getByRole('button',{name:'Sort by Answer',exact:true}).click();await until(async()=>(await get()).settings.questions[id].pivotSort?.metric==='answer');
  await undo.click();await until(async()=>(await get()).settings.questions[id].pivotSort?.metric==='count');
  // Inputs and dialogs retain native shortcuts instead of consuming workspace history.
  const search=page.getByRole('textbox',{name:workspace==='custom'?'Search columns':'Search questions',exact:true});await search.fill('A');await page.keyboard.press('Control+z');assert.equal((await get()).settings.questions[id].pivotSort.metric,'count');await search.fill('');
  await card.getByRole('button',{name:`Configure ${f.answerName}`,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await page.keyboard.press('Control+z');assert.equal((await get()).settings.questions[id].pivotSort.metric,'count');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await redo.click();await until(async()=>(await get()).settings.questions[id].pivotSort?.metric==='answer');
  // A failed save keeps the chosen order and can be retried.
  const settingsUrl=`**/api/${workspace}/projects/${f.id}/settings`;await page.route(settingsUrl,route=>route.request().method()==='PUT'?route.fulfill({status:503,json:{detail:'Test save failure'}}):route.continue());
  await card.getByRole('button',{name:'Sort by Answer',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();assert.deepEqual(await labels(),['A','B']);
  await page.unroute(settingsUrl);await page.getByRole('button',{name:'Retry save',exact:true}).click();await until(async()=>(await get()).settings.questions[id].pivotSort?.direction==='asc');
  await page.reload();await card.locator('.js-plotly-plot').waitFor();assert.deepEqual(await labels(),['A','B']);assert(await undo.isDisabled());assert(await redo.isDisabled());
  // Hide and restore are settings history entries too; a new change clears Redo.
  await card.locator('.kobo-answer-menu-trigger').first().click();await page.getByRole('menuitem',{name:'Hide answer',exact:true}).click();await card.getByText('1 answer hidden',{exact:true}).waitFor();await undo.click();await until(async()=>await card.locator('.kobo-hidden-answer-notice').count()===0);assert(await redo.isEnabled());
  await card.getByRole('button',{name:'Sort by Answer',exact:true}).click();await until(async()=>await redo.isDisabled());
  const minimum=card.getByLabel('From',{exact:true});await minimum.fill('1');await minimum.fill('10');await minimum.fill('20');await undo.click();await until(async()=>(await get()).settings.questions[id].ownFilters[0].minimum==null);await redo.click();await until(async()=>(await get()).settings.questions[id].ownFilters[0].minimum===20);
  await page.setViewportSize({width:390,height:844});await page.addStyleTag({content:':root{scroll-behavior:auto}'});await page.screenshot({path:`output/analysis-features/sort-history-${workspace}-mobile.png`,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS',workspace,'pivot/chart sort, persistence, shortcuts, buttons, input/dialog guard, failed-save retry, hide Undo, branching, mobile');await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
