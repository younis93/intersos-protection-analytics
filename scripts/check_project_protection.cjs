// Synthetic shared-dialog checks. No application data or external accounts are used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const harness=path.resolve('frontend/project-protection-check.html'),out=path.resolve('output/project-protection');
if(fs.existsSync(harness))throw Error('Temporary harness already exists.');
fs.writeFileSync(harness,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {useProjectTransfer} from '/src/useProjectTransfer.tsx';import '/src/styles.css';
window.calls=[];
function Harness(){const transfer=useProjectTransfer();return React.createElement(React.Fragment,null,
 React.createElement('button',{onClick:()=>transfer.exportProject(async password=>{window.calls.push({type:'export',password});await new Promise(r=>setTimeout(r,100));})},'Test export'),
 React.createElement('input',{type:'file','aria-label':'Test import',onChange:e=>{const file=e.target.files[0];e.target.value='';if(file)transfer.importProject(file,async password=>{window.calls.push({type:'import',password,filename:file.name});if(file.name!=='plain.zip'&&password!=='a long unique password')throw Error('Unable to unlock this project. Check the password or choose an intact file.');});}}),transfer.view);}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const {pathToFileURL}=require('node:url'),http=require('node:http');
 const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.resolve('frontend')]})).href);
 const site=path.join(out,'site');
 await build({root:path.resolve('frontend'),configFile:false,logLevel:'error',build:{outDir:site,emptyOutDir:false,rollupOptions:{input:harness}}});
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(site,'.'+pathname);
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
  const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
  res.writeHead(200,{'Content-Type':type});fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  for(const theme of ['glass-light','glass-dark'])for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base+'/project-protection-check.html',{waitUntil:'domcontentloaded'});
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.getByRole('button',{name:'Test export',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   assert.equal(await dialog.getByRole('switch').isChecked(),false);
   await dialog.getByRole('button',{name:'Export ZIP',exact:true}).click();await dialog.waitFor({state:'detached'});
   assert.deepEqual(await page.evaluate(()=>window.calls),[{type:'export',password:undefined}]);
   await page.getByRole('button',{name:'Test export',exact:true}).click();await dialog.getByRole('switch').check();
   await dialog.getByLabel('Password',{exact:true}).fill('short');await dialog.getByLabel('Confirm password',{exact:true}).fill('short');
   await dialog.getByRole('button',{name:'Export protected project',exact:true}).click();assert.match(await dialog.getByRole('alert').innerText(),/8/);
   await dialog.getByLabel('Password',{exact:true}).fill('12345678');await dialog.getByLabel('Confirm password',{exact:true}).fill('mismatch');
   await dialog.getByRole('button',{name:'Export protected project',exact:true}).click();assert.match(await dialog.getByRole('alert').innerText(),/match/);
   await dialog.getByLabel('Confirm password',{exact:true}).fill('12345678');
   await dialog.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await dialog.getByLabel('Password',{exact:true}).getAttribute('type'),'text');
   await page.screenshot({path:path.join(out,`${theme}-${width}-export.png`)});
   assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await dialog.getByRole('button',{name:'Export protected project',exact:true}).click();await dialog.waitFor({state:'detached'});
   assert.equal((await page.evaluate(()=>window.calls)).at(-1).password,'12345678');
   await page.getByLabel('Test import').setInputFiles({name:'renamed.zip',mimeType:'application/octet-stream',buffer:Buffer.from('INTERSOS\x01synthetic protected file')});
   await page.getByRole('heading',{name:'Unlock project',exact:true}).waitFor();
   assert.equal(await dialog.getByLabel('Password',{exact:true}).inputValue(),'');
   await dialog.getByLabel('Password',{exact:true}).fill('wrong');await dialog.getByRole('button',{name:'Unlock and import',exact:true}).click();
   await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('Password',{exact:true}).inputValue(),'');
   await page.screenshot({path:path.join(out,`${theme}-${width}-retry.png`)});
   await dialog.getByLabel('Password',{exact:true}).fill('a long unique password');await dialog.getByLabel('Password',{exact:true}).press('Enter');await dialog.waitFor({state:'detached'});
   const imports=await page.evaluate(()=>window.calls.filter(c=>c.type==='import'));assert.equal(imports.length,2);assert.equal(imports[0].filename,imports[1].filename);
   await page.getByLabel('Test import').setInputFiles({name:'protected.intersos',mimeType:'application/octet-stream',buffer:Buffer.from('INTERSOS\x01payload')});
   await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal((await page.evaluate(()=>window.calls.filter(c=>c.type==='import'))).length,2);
   await page.getByRole('button',{name:'Test export',exact:true}).click();assert.equal(await dialog.getByRole('switch').isChecked(),false);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
   await page.getByLabel('Test import').setInputFiles({name:'plain.zip',mimeType:'application/zip',buffer:Buffer.from('PK synthetic plain ZIP')});
   await page.waitForFunction(()=>window.calls.at(-1)?.filename==='plain.zip');
   assert.equal(errors.length,0,errors.join('\n'));await page.close();
  }
  console.log('Project dialogs passed: standard/protected exports, validation, show/hide, retries, retained files, cancellation, cleared passwords, both themes, desktop/mobile.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.unlinkSync(harness));
