const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const dist=path.resolve('frontend/dist');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
 if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data)});
});
const xlsx=name=>({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('browser fixture')});
const csv={name:'responses.csv',mimeType:'text/csv',buffer:Buffer.from('answer\nhello')};
(async()=>{
 await new Promise(resolve=>server.listen(5384,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  fs.mkdirSync('output/kobo-worksheets',{recursive:true});
  for(const theme of ['glass-light','glass-dark'])for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:960}}),errors=[];
   await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
   page.on('pageerror',error=>errors.push(String(error)));
   await mock(page,3);
   let failure=false,pending=null,calls=0,previewBody='';
   await page.route('**/imports/worksheets',async route=>{
    calls++;
    const body=route.request().postDataBuffer().toString();
    if(body.includes('slow.xlsx')){pending=route;return}
    await route.fulfill(failure?{status:400,json:{detail:'Workbook could not be read'}}:{json:{worksheets:body.includes('single.xlsx')?['Only sheet']:['First','Second']}});
   });
   await page.route('**/imports/preview',async route=>{previewBody=route.request().postDataBuffer().toString();await route.fulfill({status:400,json:{detail:'Preview request inspected'}})});
   await page.goto('http://127.0.0.1:5384/#/kobo');
   await page.getByRole('button',{name:'New project',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Create Kobo analysis project',exact:true});
   const data=dialog.locator('input[aria-label="Exported responses"]'),review=dialog.getByRole('button',{name:'Review import',exact:true});
   const select=dialog.getByRole('button',{name:'Response worksheet',exact:true});
   await dialog.locator('input[aria-label="Kobo XLSForm"]').setInputFiles(xlsx('form.xlsx'));
   await data.setInputFiles(xlsx('responses.xlsx'));
   await select.waitFor();assert.equal(await select.innerText(),'First');assert(await review.isEnabled());
   await select.focus();await select.press('ArrowDown');
   const list=page.getByRole('listbox',{name:'Worksheet options'});await list.waitFor();
   await page.keyboard.press('End');await page.keyboard.press('Enter');
   assert.equal(await select.innerText(),'Second');assert.equal(await select.getAttribute('aria-expanded'),'false');assert(await select.evaluate(el=>el===document.activeElement));
   await select.click();await list.waitFor();
   const bounds=await list.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert(bounds.y>=0&&bounds.y+bounds.height<=961);
   assert(await list.evaluate(el=>el.matches(':popover-open')));
   await page.screenshot({path:`output/kobo-worksheets/${theme}-${width}-dropdown.png`});
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
   await page.keyboard.press('Escape');assert(await dialog.isVisible());assert(await select.evaluate(el=>el===document.activeElement));
   await review.click();await dialog.getByRole('alert').filter({hasText:'Preview request inspected'}).waitFor();
   assert(previewBody.includes('name="worksheet"\r\n\r\nSecond\r\n'));
   await data.setInputFiles(xlsx('single.xlsx'));await select.waitFor();await page.waitForFunction(()=>document.querySelector('.kobo-response-worksheet .app-select-trigger')?.textContent==='Only sheet');
   failure=true;await data.setInputFiles(xlsx('failure.xlsx'));
   await dialog.getByRole('alert').filter({hasText:'Workbook could not be read'}).waitFor();assert(await review.isDisabled());
   failure=false;await dialog.getByRole('button',{name:'Retry worksheets'}).click();await select.waitFor();assert.equal(await select.innerText(),'First');assert(await review.isEnabled());
   await data.setInputFiles(xlsx('slow.xlsx'));await dialog.getByRole('status').filter({hasText:'Loading worksheets...'}).waitFor();assert(await review.isDisabled());
   assert(pending,'Worksheet request started');
   await data.setInputFiles(csv);assert.equal(await select.count(),0);assert(await review.isEnabled());
   await pending.fulfill({json:{worksheets:['Stale sheet']}}).catch(()=>{});
   await page.waitForTimeout(100);assert.equal(await select.count(),0);
   const before=calls;await data.setInputFiles(csv);assert.equal(calls,before);
   await dialog.getByRole('button',{name:'Remove Exported responses file'}).click();assert(await review.isDisabled());assert.equal(await select.count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: worksheet selection, preview payload, single-sheet, CSV, replacement, stale requests, removal, errors/retry, keyboard, modal positioning and desktop/mobile light/dark layouts.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
