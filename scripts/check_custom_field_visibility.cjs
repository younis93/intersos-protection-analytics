const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:5397',fixture=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8'));
async function waitSettings(page,id,predicate){for(let i=0;i<60;i++){const settings=(await(await page.request.get(`${base}/api/custom/projects/${id}`)).json()).settings;if(predicate(settings))return settings;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Settings did not persist');}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 fs.mkdirSync('output/field-visibility',{recursive:true});
 for(const reduced of [false,true]){
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.__eyeAnimations=[];const original=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.matches('[data-eye-slash]'))window.__eyeAnimations.push({dialog:!!this.closest('[role=alertdialog]')});return original.apply(this,args)}});
  const f=fixture.custom,settings={...f.settings,hidden:[f.ids.code,f.ids.region]};
  await page.request.put(`${base}/api/custom/projects/${f.id}/settings`,{data:settings});
  await page.goto(`${base}/#/custom/${f.id}`);await page.locator('[data-hide-field]').first().waitFor();
  const manager=page.locator('[data-field-visibility-manager]'),hide=page.getByRole('button',{name:'Hide field Answer',exact:true});
  await hide.click();const dialog=page.getByRole('alertdialog',{name:'Hide this field?',exact:true});await dialog.waitFor();
  assert(await dialog.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>el===document.activeElement));
  assert(await dialog.getByText('Answer',{exact:true}).isVisible());
  const animations=await page.evaluate(()=>window.__eyeAnimations.filter(item=>item.dialog).length);
  if(reduced)assert.equal(animations,0);else assert(animations>0);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert(await hide.isVisible());assert(await hide.evaluate(el=>el===document.activeElement));
  await hide.click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert(await hide.isVisible());
  await hide.click();await dialog.waitFor();if(!reduced)await page.screenshot({path:'output/field-visibility/confirmation-desktop.png'});
  await dialog.getByRole('button',{name:'Hide field',exact:true}).click();await hide.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-hide-field')!==null&&document.activeElement?.getAttribute('data-hide-field')!==undefined);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.hideField),f.ids.amount);
  const saved=await waitSettings(page,f.id,s=>s.hidden.includes(f.ids.answer));
  const response=await page.request.post(`${base}/api/custom/projects/${f.id}/analysis`,{data:{settings:saved}});assert(!(await response.json()).questions.some(q=>q.id===f.ids.answer));
  await page.getByRole('button',{name:'Undo',exact:true}).click();await hide.waitFor();
  await waitSettings(page,f.id,s=>!s.hidden.includes(f.ids.answer));
  await hide.click();await dialog.waitFor();await dialog.getByRole('button',{name:'Hide field',exact:true}).click();await hide.waitFor({state:'hidden'});
  await manager.click();const fields=page.getByRole('dialog',{name:'Show/hide fields',exact:true});await fields.waitFor();
  await fields.getByRole('switch',{name:'Show field Answer',exact:true}).click();await fields.getByRole('button',{name:'Apply changes',exact:true}).click();await fields.waitFor({state:'hidden'});await hide.waitFor();
  await page.getByRole('button',{name:'Hide field Amount',exact:true}).click();await dialog.waitFor();await dialog.getByRole('button',{name:'Hide field',exact:true}).click();await page.getByRole('button',{name:'Hide field Amount',exact:true}).waitFor({state:'hidden'});
  await hide.click();await dialog.waitFor();await dialog.getByRole('button',{name:'Hide field',exact:true}).click();await hide.waitFor({state:'hidden'});
  assert(await manager.isVisible());await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-field-visibility-manager'));
  await waitSettings(page,f.id,s=>s.hidden.length===4);
  await page.reload();await manager.waitFor();assert.equal(await page.locator('[data-hide-field]').count(),0);
  await manager.click();await fields.waitFor();await fields.getByRole('button',{name:'Show all matching',exact:true}).click();
  const identifying=page.getByRole('alertdialog',{name:'Show identifying answers?',exact:true});
  if(await identifying.isVisible())await identifying.getByRole('button',{name:'Show matching questions',exact:true}).click();
  await fields.getByRole('button',{name:'Apply changes',exact:true}).click();await fields.waitFor({state:'hidden'});
  await waitSettings(page,f.id,s=>s.hidden.length===0);await page.locator(`[data-question-id="${f.ids.answer}"]`).scrollIntoViewIfNeeded();await hide.waitFor();
  await page.getByRole('button',{name:'Slide menu left',exact:true}).click();await page.setViewportSize({width:390,height:844});await hide.focus();await page.keyboard.press('Enter');await dialog.waitFor();
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await dialog.getByRole('button',{name:'Cancel',exact:true}).isVisible());assert(await dialog.getByRole('button',{name:'Hide field',exact:true}).isVisible());
  if(!reduced)await page.screenshot({path:'output/field-visibility/confirmation-mobile.png'});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);await page.close();console.log('PASS Custom Analysis field visibility:',reduced?'reduced motion':'animated icons','Cancel/Escape, confirmation, Undo, restore, all hidden, persistence, focus and mobile fit');
 }
 const page=await browser.newPage();await page.goto(`${base}/#/kobo/${fixture.kobo.id}`);await page.locator('.kobo-question').first().waitFor();assert.equal(await page.locator('[data-hide-field]').count(),0);assert.equal(await page.locator('[data-field-visibility-manager]').count(),0);await page.close();console.log('PASS Kobo controls remain unchanged');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
