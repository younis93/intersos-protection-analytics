const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{fs.mkdirSync('output/kobo-restore-header',{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:5207/#/kobo');const restore=page.getByRole('button',{name:'Import project',exact:true});await restore.waitFor();
 assert.equal(await page.locator('.kobo-page-heading .kobo-backup-restore').count(),1);
 assert.deepEqual(await page.locator('.kobo-project-header-actions button').allTextContents(),['Sample size calculator','Import project',' New project']);
 await restore.focus();const tooltip=page.getByRole('tooltip');await tooltip.waitFor();assert.equal(await restore.getAttribute('aria-describedby'),await tooltip.getAttribute('id'));await page.keyboard.press('Escape');assert(await tooltip.isHidden());
 await page.keyboard.press('Tab');assert(await page.getByRole('button',{name:'New project',exact:true}).evaluate(n=>n===document.activeElement));
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});await restore.scrollIntoViewIfNeeded();const [calculator,r,n]=await Promise.all([page.getByRole('button',{name:'Sample size calculator',exact:true}).boundingBox(),restore.boundingBox(),page.getByRole('button',{name:'New project',exact:true}).boundingBox()]);assert(Math.abs(r.height-n.height)<1);if(width<=700){assert(calculator.y+calculator.height<=r.y);assert(Math.abs(r.y-n.y)<1);assert(Math.abs(r.width-n.width)<1)}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`output/kobo-restore-header/header-${width}.png`});}
 await page.setViewportSize({width:1440,height:1000});
 let finish;await page.route('**/backups/restore',async route=>{await new Promise(resolve=>finish=resolve);await route.fulfill({status:400,json:{detail:'This file is not a valid Kobo project backup.'}})});
 const before=await restore.boundingBox();await page.locator('input[aria-label="Import saved project ZIP"]').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('invalid')});
 const busy=page.getByRole('button',{name:'Importing...',exact:true});await busy.waitFor();assert(await busy.isDisabled());assert.equal(await busy.getAttribute('aria-busy'),'true');assert.equal(await busy.locator('.kobo-restore-spinner').count(),1);finish();
 await page.getByRole('alert').filter({hasText:'not a valid Kobo'}).waitFor();await restore.waitFor();const after=await restore.boundingBox();assert(Math.abs(before.y-after.y)<1);assert.equal(await page.locator('.kobo-project-header-actions [role=alert]').count(),0);await page.screenshot({path:'output/kobo-restore-header/error-desktop.png'});
 assert.equal(errors.length,0,errors.join('\n'));console.log('Header layout, mobile alignment, keyboard tooltip, busy and error states passed.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
