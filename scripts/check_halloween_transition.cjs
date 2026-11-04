const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const url=process.env.APP_URL||'http://127.0.0.1:5190/',output=path.resolve(__dirname,'../output/halloween-visuals');
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const create=async()=>{
   const p=await browser.newPage({viewport:{width:1440,height:900}});
   await p.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('export-recovery')?[]:{available:false}}));
   await p.route('https://fonts.googleapis.com/**',r=>r.abort());
   await p.addInitScript(()=>localStorage.setItem('halloween-audio-mix',JSON.stringify({muted:true,music:.38,effects:.65})));
   return p;
  };
  const load=async p=>{await p.goto(`${url}?startupEpoch=123#/`,{waitUntil:'networkidle'});await p.getByRole('button',{name:'Turn on Halloween mode'}).waitFor()};
  const settled=async p=>{await p.locator('.halloween-transition').waitFor({state:'detached'});assert.equal(await p.locator('.halloween-pumpkin-toggle').isDisabled(),false);assert.equal(await p.locator('.welcome-content').evaluate(el=>el.inert),false)};
  const p=await create(),errors=[];p.on('pageerror',e=>errors.push(e.message));await load(p);
  await p.getByRole('button',{name:'Turn on Halloween mode'}).click();assert.equal(await p.locator('.halloween-pumpkin-toggle').getAttribute('aria-busy'),'true');
  await p.evaluate(()=>{for(let i=0;i<5;i++)document.querySelector('.halloween-pumpkin-toggle').click()});
  await p.waitForTimeout(300);assert.equal(await p.locator('.is-halloween').count(),0);assert.equal(await p.locator('.halloween-transition').count(),1);
  await p.screenshot({path:path.join(output,'burn-inward.png')});
  await p.setViewportSize({width:1280,height:800});assert.equal((await p.locator('.halloween-transition').boundingBox()).width,1280);
  await p.locator('.is-halloween').waitFor();await p.screenshot({path:path.join(output,'burn-reveal.png')});await settled(p);
  assert.equal(await p.locator('.halloween-graveyard').count(),1);
  await p.getByRole('button',{name:'Play',exact:true}).click();
  const style=await p.locator('.halloween-mage-control').evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,outline:s.outlineStyle,background:s.backgroundColor}});
  assert.deepEqual(style,{radius:'0px',outline:'none',background:'rgba(0, 0, 0, 0)'});
  await p.getByRole('button',{name:'Turn off Halloween mode'}).click();await p.waitForTimeout(300);assert.equal(await p.locator('.is-halloween').count(),1);
  await settled(p);assert.equal(await p.locator('.halloween-graveyard,.halloween-input-shield').count(),0);assert.deepEqual(errors,[]);await p.close();
  const scrolled=await create();await scrolled.setViewportSize({width:390,height:600});await load(scrolled);
  await scrolled.getByRole('button',{name:'Turn on Halloween mode'}).click();
  await scrolled.evaluate(()=>{document.querySelector('#root').scrollTop=80});
  assert.equal((await scrolled.locator('.halloween-transition').boundingBox()).y,0,'Burn overlay moved with the scrolled desktop root');
  await settled(scrolled);await scrolled.close();
  // Motion preference uses a short crossfade instead of burning flames.
  const reduced=await create();await reduced.emulateMedia({reducedMotion:'reduce'});await load(reduced);
  await reduced.getByRole('button',{name:'Turn on Halloween mode'}).click();await reduced.locator('.halloween-transition.is-crossfade').waitFor();await settled(reduced);await reduced.locator('.halloween-graveyard').waitFor();await reduced.close();
  // Missing effect chunk and missing transition canvas both complete the toggle safely.
  for(const failure of ['module','canvas','slow']){
   const f=await create();
   if(failure==='module')await f.route('**/halloweenBurnRenderer-*.js',r=>r.abort());
   if(failure==='slow')await f.route('**/halloweenBurnRenderer-*.js',async r=>{await new Promise(resolve=>setTimeout(resolve,1800));try{await r.continue()}catch{/* Page may close after the fallback completes. */}});
   if(failure==='canvas')await f.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){return this.closest('.halloween-transition')?null:original.apply(this,args)}});
   await load(f);await f.getByRole('button',{name:'Turn on Halloween mode'}).click();await f.locator('.is-halloween').waitFor();await settled(f);await f.close();
  }
  const hidden=await create();await load(hidden);await hidden.getByRole('button',{name:'Turn on Halloween mode'}).click();
  await hidden.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
  await settled(hidden);assert.equal(await hidden.locator('.is-halloween').count(),1);await hidden.close();
  const leave=await create();await load(leave);await leave.getByRole('button',{name:'Turn on Halloween mode'}).click();
  await leave.evaluate(()=>{window.location.hash='/custom'});await leave.locator('.welcome-page').waitFor({state:'detached'});await leave.waitForTimeout(2200);
  assert.equal(await leave.locator('.halloween-transition,.halloween-input-shield,.halloween-graveyard').count(),0);await leave.close();
  const audible=await create();await audible.addInitScript(()=>{
   const Native=window.AudioContext;window.burnContexts=[];window.burnTones=0;window.fireSources=0;
   window.AudioContext=class extends Native{constructor(options){super(options);window.burnContexts.push(this)}createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=(...args)=>{window.burnTones++;return start(...args)};return osc}createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.fireSources++;return start(...args)};return source}};
  });
  await load(audible);await audible.evaluate(()=>localStorage.setItem('halloween-audio-mix',JSON.stringify({muted:false,music:.38,effects:.65})));
  await audible.getByRole('button',{name:'Turn on Halloween mode'}).click();await audible.waitForTimeout(350);
  assert.equal(await audible.evaluate(()=>window.burnContexts.length),1);assert((await audible.evaluate(()=>window.fireSources))>=6,'Fire sound was not scheduled');assert.equal(await audible.evaluate(()=>window.burnTones),0,'Burn sound contains pitched tones');
  await settled(audible);assert.equal(await audible.evaluate(()=>window.burnContexts[0].state),'closed');
  await audible.getByRole('button',{name:'Turn off Halloween mode'}).click();await settled(audible);
  await audible.waitForFunction(()=>window.burnContexts.every(c=>c.state==='closed'));await audible.close();
  console.log('PASS: burn on/off, covered theme swap, resize, rapid clicks, frameless character, reduced-motion crossfade, missing/slow module, canvas failure, hidden tab, navigation cleanup.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
