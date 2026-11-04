const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/homeGlobeCheck.tsx'),html=path.join(root,'frontend/home-globe-check.html');
(async()=>{let browser,server;assert(!fs.existsSync(entry)&&!fs.existsSync(html));try{
 fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {HomeLogo} from './HomeLogo';import './styles.css';import './forestTheme.css';import './halloween.css';const root=createRoot(document.getElementById('root')!);let visit=0,halloween=false;const renderHome=()=>root.render(<React.StrictMode><div className={'welcome-page'+(halloween?' is-halloween':'')}><HomeLogo key={visit} halloween={halloween}/></div></React.StrictMode>);const home=()=>{visit++;halloween=false;renderHome()};(window as any).setHalloween=(next:boolean)=>{halloween=next;flushSync(renderHome)};(window as any).unmount=()=>root.unmount();(window as any).leaveHome=()=>root.render(<div>Workspace</div>);(window as any).enterHome=home;home();`);
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
 const halloweenColors=async(target)=>{
  const result=await target.evaluate(()=>{
   const canvas=document.querySelector('canvas'),button=document.querySelector('button');
   const read=()=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const before=read(),busy=button.getAttribute('aria-busy');
   window.setHalloween(true);const orange=read();
   let opaque=-1;for(let i=3;i<orange.length;i+=4)if(orange[i]>200){opaque=i-3;break}
   const color=Array.from(orange.slice(opaque,opaque+3));
   const sameAlpha=before.every((value,i)=>i%4!==3||value===orange[i]);
   const sameNode=document.querySelector('canvas')===canvas,sameBusy=button.getAttribute('aria-busy')===busy;
   window.setHalloween(false);const restored=read();
   return {color,sameAlpha,sameNode,sameBusy,restored:before.every((value,i)=>value===restored[i]),busy};
  });
  assert.deepEqual(result.color,[255,181,101]);assert(result.sameAlpha,'Palette change reset the globe rotation');
  assert(result.sameNode,'Palette change remounted the globe');assert(result.sameBusy,'Palette change restarted/stopped animation');assert(result.restored,'Original globe pixels were not restored');
  return result;
 };
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
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button').click();await page.waitForTimeout(500);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('.is-spinning'));await visible();assert.equal(await pixels(),reduced);
 const failure=await browser.newPage();await failure.routeWebSocket('**',()=>{});await failure.route('**/home-globe-land*.svg',route=>route.abort());await failure.goto(url,{waitUntil:'domcontentloaded'});await failure.waitForTimeout(500);assert.equal(await failure.locator('.is-globe-ready').count(),0);assert.match(await failure.locator('.home-logo-frame').evaluate(c=>getComputedStyle(c).maskImage),/intersos-symbol-transparent\.png/);assert.equal(await failure.locator('canvas').evaluate(c=>getComputedStyle(c).opacity),'0');await failure.getByRole('button').click();await failure.waitForTimeout(300);assert.equal(await failure.locator('button').getAttribute('aria-busy'),'false');await failure.close();
 const noCanvas=await browser.newPage();await noCanvas.routeWebSocket('**',()=>{});await noCanvas.addInitScript(()=>HTMLCanvasElement.prototype.getContext=function(){return null});await noCanvas.goto(url,{waitUntil:'domcontentloaded'});await noCanvas.waitForTimeout(500);assert.equal(await noCanvas.locator('.is-globe-ready').count(),0);assert.match(await noCanvas.locator('.home-logo-frame').evaluate(c=>getComputedStyle(c).maskImage),/intersos-symbol-transparent\.png/);assert.equal(await noCanvas.locator('canvas').evaluate(c=>getComputedStyle(c).opacity),'0');await noCanvas.close();
 const delayed=await browser.newPage();await delayed.routeWebSocket('**',()=>{});await delayed.route('**/home-globe-land*.svg',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue()});await delayed.goto(url,{waitUntil:'domcontentloaded'});await delayed.evaluate(()=>window.unmount());await delayed.waitForTimeout(700);assert.equal(await delayed.locator('canvas').count(),0);await delayed.close();
 // Resting canvases must repaint immediately for every base palette, including reduced motion.
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [1440,390])for(const theme of ['glass-light','glass-dark','unhcr','multicolor','executive','forest']){
  await page.setViewportSize({width,height:900});await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.locator('.is-globe-ready').waitFor();
  await page.waitForFunction(()=>document.querySelector('button').getAttribute('aria-busy')==='false');
  for(let i=0;i<3;i++)await halloweenColors(page);
 }
 // A toggle during a turn changes only RGB. Alpha encodes the exact map orientation.
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('.is-globe-ready.is-spinning').waitFor();await page.waitForTimeout(400);
  assert.equal((await halloweenColors(page)).busy,'true');
  await page.waitForFunction(()=>document.querySelector('button').getAttribute('aria-busy')==='false');await halloweenColors(page);
 }
 // Toggling before the map arrives must use the active palette on its first draw.
 const pending=await browser.newPage();await pending.routeWebSocket('**',()=>{});
 let releaseMap;await pending.route('**/home-globe-land*.svg',async route=>{await new Promise(resolve=>{releaseMap=resolve});await route.continue()});
 await pending.goto(url,{waitUntil:'domcontentloaded'});await pending.getByRole('button').waitFor();await pending.evaluate(()=>window.setHalloween(true));
 assert.equal(await pending.locator('.is-globe-ready').count(),0);assert(releaseMap);releaseMap();await pending.locator('.is-globe-ready').waitFor();
 assert.deepEqual(await pending.locator('canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>200)return Array.from(d.slice(i-3,i))}),[255,181,101]);
 await pending.evaluate(()=>window.setHalloween(false));await halloweenColors(pending);await pending.close();
 assert.deepEqual(errors,[]);console.log('PASS: existing animation/fallback checks; immediate Halloween color and restoration across six themes, desktop/mobile, reduced motion, repeated toggles, mid-spin orientation preservation, delayed map loading.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(entry,{force:true});fs.rmSync(html,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
