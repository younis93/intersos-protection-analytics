const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:5384',out='output/kobo-conditional-review',pid=JSON.parse(fs.readFileSync(`${out}/fixture.json`)).id;
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${base}/#/kobo/${pid}`);await page.getByRole('button',{name:'Review',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Kobo review',exact:true}),review=dialog.locator('.kobo-data-quality-review');
  const panel=review.locator('.kobo-review-editor');
  const check=id=>review.locator(`[data-check="${id}"]`);
  async function open(id){const g=check(id);await g.waitFor();if(await g.locator('.kobo-data-review-group-heading').getAttribute('aria-expanded')!=='true')await g.locator('.kobo-data-review-group-heading').click();await g.locator('tbody tr').first().waitFor();return g}
  async function confirm(name){const d=page.getByRole('alertdialog');await d.getByRole('button',{name,exact:true}).click();await d.waitFor({state:'detached'})}
  let group=await open('conflict:no/other');assert.equal(await group.locator('tbody tr').count(),1);assert.match(await group.innerText(),/Transport costs/);
  await group.getByRole('button',{name:'Edit source row 2',exact:true}).click();await panel.getByRole('button',{name:'View full source row',exact:true}).click();const source=page.getByRole('dialog',{name:'Warning source row',exact:true});await source.locator('[data-warning-cell=true] .kobo-data-edit-cell').click();
  const editor=page.getByRole('dialog',{name:'Edit response',exact:true});await editor.getByRole('textbox',{name:'Response value',exact:true}).fill('Reviewed leftover answer');await editor.getByRole('button',{name:'Save change',exact:true}).click();await editor.waitFor({state:'detached'});
  await source.locator('[data-warning-cell=true]').getByText('Reviewed leftover answer',{exact:true}).waitFor();await source.getByRole('button',{name:'Back to review',exact:true}).click();await source.waitFor({state:'detached'});
  await panel.getByRole('button',{name:'Ignore warning',exact:true}).click();await confirm('Ignore warning (1)');await check('conflict:no/other').waitFor({state:'detached'});
  await review.getByRole('group',{name:'Review status',exact:true}).getByRole('button',{name:'Ignored',exact:true}).click();group=await open('conflict:no/other');await group.getByRole('button',{name:'Edit source row 2',exact:true}).click();await panel.getByRole('button',{name:'Reopen',exact:true}).click();await confirm('Reopen (1)');await check('conflict:no/other').waitFor({state:'detached'});
  await review.getByRole('group',{name:'Review status',exact:true}).getByRole('button',{name:'Open',exact:true}).click();
  await review.getByRole('button',{name:'Condition checks',exact:true}).click();const unchecked=review.locator('[data-check^="condition:"]');await unchecked.first().waitFor();await unchecked.first().locator('.kobo-data-review-group-heading').click();await unchecked.first().locator('tbody tr').first().waitFor();
  await unchecked.first().getByRole('button',{name:'View source row 2',exact:true}).click();assert.match(await panel.innerText(),/No answer error has been confirmed/);assert.equal(await panel.locator('form').count(),0);
  await unchecked.first().getByRole('button',{name:'Review condition',exact:true}).click();const setup=page.getByRole('dialog',{name:'Customize unchecked0',exact:true});await setup.waitFor();await setup.getByRole('button',{name:'Close customization',exact:true}).click();await setup.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Review',exact:true}).click();await review.locator('[data-check]').first().waitFor();await page.setViewportSize({width:390,height:844});assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+2));await page.screenshot({path:`${out}/mobile.png`});assert.deepEqual(errors,[]);
  console.log('Passed grouped conflicts, source-row correction, ignore/reopen, condition checks, setup navigation and mobile.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
