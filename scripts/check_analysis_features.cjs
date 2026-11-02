const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:5397',fixture=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8'));
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const workspace of ['kobo','custom']){
  const f=fixture[workspace],page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${base}/#/${workspace}/${f.id}`);const card=page.locator(`[id="question-${f.answerName}"]`);await card.waitFor();
  await card.getByRole('button',{name:`Configure ${f.answerName}`,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:`Customize ${f.answerName}`,exact:true});await dialog.waitFor();
  await dialog.getByRole('button',{name:'Values & calculations',exact:true}).click();
  const select=async(label,option)=>{await dialog.getByRole('button',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click()};
  await select('Calculation','Sum');await select('Value column','Amount');
  await page.waitForFunction(()=>{const button=[...document.querySelectorAll('.kobo-customize button')].find(el=>el.textContent==='Apply changes');return button&&!button.disabled});
  await page.screenshot({path:`output/analysis-features/${workspace}-customize.png`});
  await dialog.getByRole('button',{name:'Apply changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await card.getByText('Sum of Amount',{exact:false}).first().waitFor();
  assert.equal(await card.getByRole('button',{name:'Values',exact:true}).count(),0);
  assert((await card.locator('tfoot').innerText()).includes('60.00'));
  const download=page.waitForEvent('download');await card.getByRole('button',{name:'Export question',exact:true}).click();await card.getByRole('button',{name:'Question PDF',exact:true}).click();await(await download).saveAs(`output/analysis-features/${workspace}-measured.pdf`);
  if(workspace==='custom'){
   await page.getByRole('button',{name:'Manage data',exact:true}).click();await page.getByRole('button',{name:'Replace source file',exact:true}).click();
   await page.getByLabel('Choose analysis data',{exact:true}).setInputFiles({name:'replacement.csv',mimeType:'text/csv',buffer:Buffer.from('code,answer,amount,region\n001,A,15,north\n004,B,40,south\n')});
   await page.getByRole('button',{name:'Update data',exact:true}).click();
   const review=page.getByRole('region',{name:'Review source update'});await page.getByRole('heading',{name:'Review source update',exact:true}).waitFor();
   await page.locator('.kobo-update-review').getByRole('checkbox',{name:/Code/}).check();
   await page.waitForFunction(()=>{const button=[...document.querySelectorAll('.custom-setup-footer button')].find(el=>el.textContent==='Apply update');return button&&!button.disabled});
   await page.screenshot({path:'output/analysis-features/custom-update-review.png'});
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/analysis-features/custom-update-mobile.png'});
   assert(await page.locator('.custom-setup').evaluate(el=>el.scrollWidth<=el.clientWidth+2));
   await page.getByRole('button',{name:'Apply update',exact:true}).click();await page.locator('.custom-setup').waitFor({state:'hidden'});
   await page.setViewportSize({width:1440,height:1000});
  }
  if(workspace==='kobo'){
   await page.getByRole('button',{name:'Data source',exact:true}).click();await page.getByRole('button',{name:'Re-upload data',exact:true}).click();
   await page.getByLabel('Replacement response data',{exact:true}).setInputFiles({name:'replacement.csv',mimeType:'text/csv',buffer:Buffer.from('code,answer,amount,region\n001,A,15,north\n004,B,40,south\n')});
   await page.getByRole('button',{name:'Update data',exact:true}).click();await page.getByRole('heading',{name:'Review source update',exact:true}).waitFor();
   const apply=page.getByRole('button',{name:'Apply update',exact:true});assert(await apply.isDisabled());
   await page.locator('.kobo-update-review').getByRole('checkbox',{name:/code/i}).check();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('.kobo-mapping-confirm button')].find(el=>el.textContent.includes('Apply update'));return b&&!b.disabled});
   await apply.click();await page.getByRole('dialog',{name:'Review and correct import',exact:true}).waitFor({state:'hidden'});
  }
  const history=await page.request.get(`${base}/api/${workspace}/projects/${f.id}/updates`);assert(history.ok());
  {
   const entries=await history.json();assert.equal(entries.length,1);assert.equal(entries[0].scopes[0].added,1);assert.equal(entries[0].scopes[0].removed,2);assert.equal(entries[0].scopes[0].changed,1);
   await page.getByRole('button',{name:workspace==='custom'?'Manage data':'Data source',exact:true}).click();await page.getByRole('button',{name:'Update history',exact:true}).click();await page.getByRole('dialog',{name:'Update history',exact:true}).waitFor();await page.getByText('replacement.csv',{exact:true}).waitFor();await page.screenshot({path:'output/analysis-features/history.png'});
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${workspace}: calculation controls, live preview, measured totals and PDF${workspace==='custom'?', ID matching, source update review, mobile fit and persisted history':''}`);
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
