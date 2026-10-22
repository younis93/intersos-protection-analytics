const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/homeGlobeCheck.tsx'),html=path.join(root,'frontend/home-globe-check.html');
(async()=>{let browser,server;assert(!fs.existsSync(entry)&&!fs.existsSync(html));try{
 fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {HomeLogo} from './HomeLogo';import './styles.css';const root=createRoot(document.getElementById('root')!);let visit=0;const home=()=>root.render(<React.StrictMode><HomeLogo key={++visit}/></React.StrictMode>);(window as any).unmount=()=>root.unmount();(window as any).leaveHome=()=>root.render(<div>Workspace</div>);(window as any).enterHome=home;home();`);
 fs.writeFileSync(html,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root" style="display:grid;place-items:center;min-height:90vh"></div><script type="module" src="/src/homeGlobeCheck.tsx"></script>');
 let origin=process.env.APP_TEST_URL;
 if(!origin){
  const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'frontend')]})).href);
  const bundle=path.join(root,'output/home-globe/check-bundle');
  await build({root:path.join(root,'frontend'),configFile:false,logLevel:'error',build:{outDir:bundle,emptyOutDir:false,copyPublicDir:false,rollupOptions:{input:html}}});
  server=http.createServer((request,response)=>{
   const relative=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(bundle,relative),publicFile=path.resolve(root,'frontend/public',relative);
   const publicRoot=path.join(root,'frontend/public');
   const target=file.startsWith(bundle+path.sep)&&fs.existsSync(file)?file:publicFile.startsWith(publicRoot+path.sep)&&fs.existsSync(publicFile)?publicFile:null;
   if(!target||!fs.statSync(target).isFile()){response.writeHead(404);response.end();return}
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
   response.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 }
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.routeWebSocket('**',()=>{});await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const url=origin+'/home-globe-check.html';
 const pixels=async()=>createHash('sha256').update(await page.locator('canvas').evaluate(c=>c.toDataURL())).digest('hex');
 const visible=async()=>{assert.equal(await page.locator('canvas').evaluate(c=>getComputedStyle(c).opacity),'1');assert.notEqual(await page.locator('.home-logo-frame').evaluate(c=>getComputedStyle(c).maskImage),'none');};
 for(const width of [1440,390])for(const theme of ['glass-light','glass-dark']){
  await page.setViewportSize({width,height:900});await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.locator('.is-globe-ready.is-spinning').waitFor();await visible();await page.waitForTimeout(700);const automatic=await pixels();await page.waitForFunction(()=>document.querySelector('button').getAttribute('aria-busy')==='false');const resting=await pixels();assert.notEqual(automatic,resting);await page.waitForTimeout(350);assert.equal(await page.locator('.is-spinning').count(),0);assert.equal(await pixels(),resting);
  await page.getByRole('button').click();await page.waitForTimeout(700);await visible();assert.notEqual(await pixels(),resting);await page.getByRole('button').click();await page.waitForFunction(()=>document.querySelector('button').getAttribute('aria-busy')==='false');await visible();assert.equal(await pixels(),resting);
  fs.mkdirSync(path.join(root,'output/home-globe'),{recursive:true});await page.screenshot({path:path.join(root,`output/home-globe/permanent-${theme}-${width}.png`)});
 }
 // Returning from another workspace remounts the logo and plays one new turn.
 const resting=await pixels();await page.evaluate(()=>window.leaveHome());await page.getByText('Workspace',{exact:true}).waitFor();await page.evaluate(()=>window.enterHome());await page.locator('.is-globe-ready.is-spinning').waitFor();await page.waitForTimeout(500);assert.notEqual(await pixels(),resting);
 // Leaving while a turn is running cancels it; another visit remains functional.
 await page.evaluate(()=>window.leaveHome());await page.getByText('Workspace',{exact:true}).waitFor();await page.waitForTimeout(100);assert.equal(await page.locator('canvas').count(),0);await page.evaluate(()=>window.enterHome());await page.locator('.is-globe-ready.is-spinning').waitFor();await page.waitForTimeout(500);

 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await visible();assert.equal(await pixels(),resting);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(350);assert.equal(await page.locator('.is-spinning').count(),0);assert.equal(await pixels(),resting);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.is-globe-ready.is-highlighted').waitFor();const reduced=await pixels();await page.waitForTimeout(250);assert.equal(await page.locator('.is-spinning,.is-highlighted').count(),0);await page.getByRole('button').click();await page.waitForTimeout(300);await visible();assert.equal(await pixels(),reduced);assert.equal(await page.locator('button').getAttribute('aria-busy'),'false');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button').click();await page.waitForTimeout(500);await page.emulateMedia({reducedMotion:'reduce'});await visible();assert.equal(await pixels(),reduced);
 const failure=await browser.newPage();await failure.routeWebSocket('**',()=>{});await failure.route('**/home-globe-land*.svg',route=>route.abort());await failure.goto(url,{waitUntil:'domcontentloaded'});await failure.waitForTimeout(500);assert.equal(await failure.locator('.is-globe-ready').count(),0);assert.match(await failure.locator('.home-logo-frame').evaluate(c=>getComputedStyle(c).maskImage),/intersos-symbol-transparent\.png/);assert.equal(await failure.locator('canvas').evaluate(c=>getComputedStyle(c).opacity),'0');await failure.getByRole('button').click();await failure.waitForTimeout(300);assert.equal(await failure.locator('button').getAttribute('aria-busy'),'false');await failure.close();
 const noCanvas=await browser.newPage();await noCanvas.routeWebSocket('**',()=>{});await noCanvas.addInitScript(()=>HTMLCanvasElement.prototype.getContext=function(){return null});await noCanvas.goto(url,{waitUntil:'domcontentloaded'});await noCanvas.waitForTimeout(500);assert.equal(await noCanvas.locator('.is-globe-ready').count(),0);assert.match(await noCanvas.locator('.home-logo-frame').evaluate(c=>getComputedStyle(c).maskImage),/intersos-symbol-transparent\.png/);assert.equal(await noCanvas.locator('canvas').evaluate(c=>getComputedStyle(c).opacity),'0');await noCanvas.close();
 const delayed=await browser.newPage();await delayed.routeWebSocket('**',()=>{});await delayed.route('**/home-globe-land*.svg',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue()});await delayed.goto(url,{waitUntil:'domcontentloaded'});await delayed.evaluate(()=>window.unmount());await delayed.waitForTimeout(700);assert.equal(await delayed.locator('canvas').count(),0);await delayed.close();
 assert.deepEqual(errors,[]);console.log('PASS: automatic single turn, Home revisit and mid-turn cleanup, click replay, overlap prevention, visibility cancellation without replay, reduced motion, map/canvas fallback, delayed unmount, desktop/mobile, light/dark.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(entry,{force:true});fs.rmSync(html,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
