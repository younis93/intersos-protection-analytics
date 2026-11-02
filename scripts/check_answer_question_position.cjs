const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixtures=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8')),base='http://127.0.0.1:5397';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const workspace of ['kobo','custom']){
  const page=await browser.newPage({viewport:{width:1440,height:1200}}),item=fixtures[workspace],settings=structuredClone(item.settings);
  settings.hidden=settings.hidden.filter(id=>id!==item.ids.region);settings.questionSort='answered-desc';
  await page.request.put(`${base}/api/${workspace}/projects/${item.id}/settings`,{data:settings});
  await page.goto(`${base}/#/${workspace}/${item.id}`);
  const card=page.locator(`[data-question-id="${item.ids.region}"] .kobo-question`);await card.locator('.kobo-answer-actions').first().waitFor();
  const order=()=>page.locator('.kobo-question').evaluateAll(nodes=>nodes.map(n=>n.id));
  const before=await order();assert.equal(before.length,2);
  const hide=async()=>{await card.locator('.kobo-answer-actions').first().click({button:'right'});const response=page.waitForResponse(r=>r.url().endsWith('/analysis')&&r.request().method()==='POST');await page.getByRole('menuitem',{name:'Hide answer',exact:true}).click();await response;};
  await hide();await page.waitForFunction(id=>document.querySelector(`[data-question-id="${id}"] tbody`)?.children.length===1,item.ids.region);
  assert.deepEqual(await order(),before);assert(await card.isVisible());
  await hide();await card.getByText('No answered responses under the current filters. Try changing or resetting filters.',{exact:true}).waitFor();
  assert.deepEqual(await order(),before);assert(await card.isVisible());
  const response=page.waitForResponse(r=>r.url().endsWith('/analysis')&&r.request().method()==='POST');await card.getByRole('button',{name:'Unhide all',exact:true}).click();await response;
  await page.waitForFunction(id=>document.querySelector(`[data-question-id="${id}"] tbody`)?.children.length===2,item.ids.region);
  assert.deepEqual(await order(),before);
  const saved=await(await page.request.get(`${base}/api/${workspace}/projects/${item.id}`)).json();assert(!saved.settings.hidden.includes(item.ids.region));
  console.log('PASS',workspace,'answer hiding and restore retain the question and position with answered-desc sorting');await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
