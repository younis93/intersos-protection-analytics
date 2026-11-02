const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture=JSON.parse(fs.readFileSync('output/response-editor/fixture.json','utf8')),base='http://127.0.0.1:5398';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
for(const workspace of ['kobo','custom']){
 const f=fixture[workspace],page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${base}/#/${workspace}/${f.id}`);await page.getByRole('button',{name:'Table view',exact:true}).click();await page.getByRole('button',{name:'Edit data',exact:true}).click();
 const edit=page.getByRole('button',{name:'Edit Answer, source row 2',exact:true});await edit.click();const dialog=page.getByRole('dialog',{name:'Edit response',exact:true});await dialog.waitFor();
 const checkbox=dialog.getByRole('checkbox',{name:'Apply to all responses with this answer'});assert.equal(await checkbox.isChecked(),false);
 await dialog.getByRole('textbox',{name:'Find or create option',exact:true}).fill('C');await dialog.getByRole('button',{name:'Create new option “C”',exact:true}).click();await checkbox.check();
 const bulk=dialog.getByRole('button',{name:'Update 2 responses',exact:true});await bulk.waitFor();await bulk.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.kobo-response-footer button.primary').disabled);
 assert((await dialog.getByRole('region',{name:'Response change preview'}).innerText()).includes('2 matching responses'));
 await dialog.screenshot({path:`output/response-editor/${workspace}-desktop.png`});
 // The footer remains visible even with a short mobile viewport and a scrolled body.
 await page.setViewportSize({width:390,height:680});await dialog.locator('.kobo-response-body').evaluate(n=>n.scrollTop=n.scrollHeight);await dialog.screenshot({path:`output/response-editor/${workspace}-mobile.png`});
 const rect=await dialog.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=390);const footer=await dialog.locator('footer').boundingBox();assert(footer.y+footer.height<=680);
 await page.evaluate(()=>document.documentElement.dataset.theme='glass-dark');await dialog.screenshot({path:`output/response-editor/${workspace}-dark.png`});
 await page.setViewportSize({width:1440,height:1000});await bulk.click();await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.kobo-data-edit-cell')).filter(n=>n.textContent==='C').length===2);
 const history=await(await page.request.get(`${base}/api/${workspace}/projects/${f.id}/edits/history`)).json();assert.equal(history[0].operation.cells.length,2);assert.equal(history[0].operation.allMatches,false);
 // Undo through the shared API and reload to verify the persisted snapshot.
 const undone=await page.request.post(`${base}/api/${workspace}/projects/${f.id}/edits/undo`,{data:{revision:1,operation:{kind:'cells'}}});assert.equal(undone.status(),200);
 await page.reload();await page.getByRole('button',{name:'Table view',exact:true}).click();await page.getByRole('button',{name:'Edit data',exact:true}).click();await edit.click();await dialog.waitFor();assert.equal(await checkbox.isChecked(),false);
 await dialog.getByRole('button',{name:'Clear response',exact:true}).click();await dialog.getByRole('button',{name:'Save change',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await edit.click();await dialog.waitFor();assert((await dialog.getByRole('region',{name:'Current response',exact:true}).innerText()).includes('No response'));// A failed preview must never leave an enabled bulk-save action.
 const previewUrl=`**/api/${workspace}/projects/${f.id}/edits/preview`;
 await page.route(previewUrl,route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({detail:'The data changed. Reload this table and review your edit again.'})}));
 await checkbox.check();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.locator('button.primary').isDisabled(),true);
 await checkbox.uncheck();await page.unroute(previewUrl);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await edit.evaluate(n=>document.activeElement===n),true);
 // Render a long Arabic question and a large list through the same real editor.
 await page.route(`**/api/${workspace}/projects/${f.id}`,async route=>{const response=await route.fetch();const data=await response.json();data.form.questions.find(q=>q.id===f.ids.answer).labels.en='هل فهمت المعلومات المقدمة وهل توافق طوعاً على إجراء المقابلة؟ '.repeat(4);await route.fulfill({response,json:data})});
 await page.route(`**/api/${workspace}/projects/${f.id}/answers/**`,route=>route.fulfill({json:Array.from({length:250},(_,i)=>({id:'option'+i,label:'خيار '+i,count:1}))}));
 await page.reload();await page.getByRole('button',{name:'Table view',exact:true}).click();await page.getByRole('button',{name:'Edit data',exact:true}).click();await page.getByRole('button',{name:/^Edit هل.*source row 2$/}).click();await dialog.waitFor();
 await dialog.getByRole('button',{name:'خيار 0 Code: option0',exact:true}).waitFor();
 assert(await dialog.locator('.kobo-edit-options>button').count()<100);
 await dialog.locator('.kobo-edit-options').evaluate(n=>n.scrollTop=n.scrollHeight);await dialog.getByRole('button',{name:'خيار 249 Code: option249',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:680});await dialog.screenshot({path:`output/response-editor/${workspace}-arabic-long.png`});
 assert(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth));
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);await page.close();console.log('PASS',workspace,'bulk checkbox, preview, persisted snapshot, Undo, single clear, responsive footer, themes');
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
