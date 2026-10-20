// Verify mapping review interaction and layout without saving an analysis project.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.KOBO_TEST_URL||'http://127.0.0.1:5191';
const output=path.resolve(__dirname,'../output/kobo-mapping');fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/#/kobo');await page.getByRole('button',{name:'New project',exact:true}).click();
 await page.getByRole('dialog').locator('input[type=file]').nth(0).setInputFiles('C:/Users/youni/Downloads/Form.xlsx');
 await page.getByRole('dialog').locator('input[type=file]').nth(1).setInputFiles('C:/Users/youni/Downloads/Data.xlsx');
 await page.getByRole('button',{name:'Review import',exact:true}).click();await page.getByRole('dialog',{name:'Review column mapping',exact:true}).waitFor({timeout:120000});
 const dialog=page.getByRole('dialog'),pending=await page.locator('.kobo-mapping-card.needs-review').count();assert(pending>0);assert(await page.getByRole('button',{name:'Create analysis project',exact:true}).isDisabled());
 await page.screenshot({path:path.join(output,'desktop-review.png')});
 const suggested=page.locator('.kobo-match-suggestions button').first();await suggested.click();assert.equal(await page.locator('.kobo-mapping-card.needs-review').count(),pending-1);
 await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.locator('.kobo-mapping-card.needs-review').count(),pending);
 await page.getByRole('tab',{name:/Matched/}).click();assert.equal(await page.locator('.kobo-mapping-card').count(),20);
 await page.getByRole('textbox',{name:'Search source columns or questions'}).fill('q12');assert(await page.locator('.kobo-mapping-card').count()>0);assert(await page.getByRole('button',{name:/Answer format for column/}).count()>0);
 await page.getByRole('button',{name:/Question for column/}).first().click();await page.locator('[popover]:popover-open').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('[popover]:popover-open').count(),0);
 await page.getByRole('textbox',{name:'Search source columns or questions'}).fill('');await page.getByRole('tab',{name:/Needs review/}).click();
 for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:path.join(output,theme+'.png')});}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'mobile-review.png')});
 assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1),'Review must fit mobile width');
 const footer=await page.locator('.kobo-mapping-confirm').boundingBox();assert(footer.y+footer.height<=844,'Confirmation footer must remain reachable');
 await page.setViewportSize({width:1440,height:1100});await page.getByRole('button',{name:'Exclude unresolved columns',exact:true}).click();
 const confirmation=page.getByRole('alertdialog');await confirmation.waitFor();await page.screenshot({path:path.join(output,'exclude-confirmation.png')});
 await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('.kobo-mapping-card.needs-review').count(),pending);
 await page.getByRole('button',{name:'Exclude unresolved columns',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await confirmation.count(),0);
 await page.getByRole('button',{name:'Exclude unresolved columns',exact:true}).click();await confirmation.getByRole('button',{name:'Exclude columns',exact:true}).click();
 assert(await page.getByRole('heading',{name:'Your columns are ready'}).isVisible());assert(await page.getByRole('button',{name:'Create analysis project',exact:true}).isEnabled());await page.screenshot({path:path.join(output,'ready.png')});
 await page.getByRole('button',{name:'Undo',exact:true}).click();assert(await page.getByRole('button',{name:'Create analysis project',exact:true}).isDisabled());
 await page.getByRole('tab',{name:/Not used/}).click();assert(await page.locator('.kobo-mapping-card.is-excluded').count()>0);
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,pending,errors,output}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
