// End-to-end Kobo verification against an isolated INTERSOS_KOBO_DB server.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.KOBO_TEST_URL||'http://127.0.0.1:5188';
const output=path.resolve(__dirname,'../output/kobo');fs.mkdirSync(output,{recursive:true});
(async()=>{let browser;let projectId;
 try{
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')console.log('console error',m.text())});
  await page.goto(origin+'/#/');await page.getByRole('link').filter({hasText:'Kobo Analysis'}).click();await page.getByRole('heading',{name:'Your Kobo projects'}).waitFor();
  await page.getByRole('button',{name:'New project',exact:true}).click();
  await page.getByRole('dialog').locator('input[type=file]').nth(0).setInputFiles('C:/Users/youni/Downloads/Form.xlsx');
  await page.getByRole('dialog').locator('input[type=file]').nth(1).setInputFiles('C:/Users/youni/Downloads/Data.xlsx');
  await page.getByPlaceholder('Household assessment').fill('Kobo acceptance example');
  await page.getByRole('button',{name:'Review import',exact:true}).click();await page.getByRole('heading',{name:'Review column mapping'}).waitFor({timeout:120000});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Exclude unresolved columns',exact:true}).click();
  const accept=page.getByRole('checkbox',{name:/Accept unresolved or invalid answers as blank/});if(await accept.isVisible())await accept.check();
  const imported=page.waitForResponse(r=>r.url().endsWith('/imports/confirm')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create analysis project',exact:true}).click();const response=await imported;const p=await response.json();assert.equal(response.status(),200,JSON.stringify(p));projectId=p.id;
  await page.locator('.kobo-question').first().waitFor({timeout:120000});await page.getByText('Updating analysis…',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.locator('.kobo-shell').getAttribute('dir'),'rtl');assert((await page.locator('.kobo-page-heading').textContent()).includes('268 / 268'));
  assert.equal(await page.locator('#question-respondent_name').count(),0);
  await page.screenshot({path:path.join(output,'arabic-desktop.png'),fullPage:false});
  await page.getByRole('button',{name:/Language/}).click();await page.getByRole('option',{name:'English',exact:true}).click();await page.getByText('Updating analysis…',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.locator('.kobo-shell').getAttribute('dir'),'ltr');
  const q12=page.locator('#question-q12');assert((await q12.textContent()).includes('Answered: 268'));const q14=page.locator('#question-q14_1_1');assert((await q14.textContent()).includes('Answered: 105'));
  await page.getByRole('button',{name:'Choose fields',exact:true}).click();await page.getByRole('dialog',{name:'Choose filter fields',exact:true}).getByRole('textbox',{name:'Search filter fields',exact:true}).fill('Sex of the respondent');await page.locator('.kobo-filter-field-manager .kobo-visibility-row input[type=checkbox]').first().check();await page.getByRole('button',{name:'Apply changes',exact:true}).click();
  await page.locator('.kobo-filter-grid .checkbox-multi-trigger, .kobo-filter-grid .app-select-trigger').first().click();
  const menu=page.locator('[popover]:popover-open');console.log('filter menu',await menu.textContent());
  const checks=menu.locator('input[type=checkbox]');if(await checks.count())await checks.first().check();await page.keyboard.press('Escape');
  await page.getByText('Updating analysis…',{exact:true}).waitFor({state:'hidden'});assert(await page.getByRole('button',{name:'Reset',exact:true}).count());
  await page.getByRole('button',{name:'Reset',exact:true}).click();await page.getByText('Updating analysis…',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Configure q12',exact:true}).click();await page.getByRole('dialog',{name:'Customize q12',exact:true}).getByRole('button',{name:'Donut',exact:true}).click();await page.getByRole('button',{name:'Apply changes',exact:true}).click();
  await page.getByText('Updating analysis…',{exact:true}).waitFor({state:'hidden'});await q12.scrollIntoViewIfNeeded();await q12.locator('.js-plotly-plot').waitFor();
  await q12.getByRole('button',{name:'Export question',exact:true}).click();const png=page.waitForEvent('download');await q12.getByRole('button',{name:'Chart PNG',exact:true}).click();await(await png).saveAs(path.join(output,'q12.png'));
  await q12.getByRole('button',{name:'Export question',exact:true}).click();const pdf=page.waitForEvent('download',{timeout:120000});await q12.getByRole('button',{name:'Question PDF',exact:true}).click();await(await pdf).saveAs(path.join(output,'q12-en.pdf'));
  assert.equal(await page.getByRole('button',{name:'View report',exact:true}).count(),0);await page.evaluate(id=>window.location.hash=`#/kobo/${id}/report`,projectId);
  await page.waitForURL(`**/#/kobo/${projectId}`);await page.getByText('Saved locally',{exact:true}).waitFor();await page.reload();await page.locator('#question-q12').waitFor({timeout:120000});
  const saved=await(await page.request.get(`${origin}/api/kobo/projects/${projectId}`)).json();assert.equal(saved.settings.language,'en');assert.equal(saved.settings.questions['assessment/section_a/q12'].chart,'donut');
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:path.join(output,theme+'.png')});}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:/Language/}).click();await page.getByRole('option',{name:'العربية',exact:true}).click();await page.getByText('Updating analysis…',{exact:true}).waitFor({state:'hidden'});await page.locator('#question-q12').scrollIntoViewIfNeeded();
  await page.locator('#question-q12').getByRole('button',{name:'Export question',exact:true}).click();const arPdf=page.waitForEvent('download',{timeout:120000});await page.locator('#question-q12').getByRole('button',{name:'Question PDF',exact:true}).click();await(await arPdf).saveAs(path.join(output,'q12-ar.pdf'));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({projectId,output,errors,passed:true}));
 }finally{if(browser)await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
