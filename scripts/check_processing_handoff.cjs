// Verify initial processing styles before either workspace CSS or JS is available.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const base=process.env.APP_PRODUCTION_URL||'http://127.0.0.1:5180';
// Production CSS folds constant color-mix values into equivalent rgba colors.
const canonicalColors=value=>value.replace(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)/g,(_,r,g,b,a)=>`rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})`).replace(/\s+/g,'');
async function layout(page){return page.evaluate(()=>{
 const overlay=document.querySelector('.legal-upload-overlay'),card=document.querySelector('.legal-upload-progress');
 const box=card.getBoundingClientRect(),style=getComputedStyle(card),background=getComputedStyle(overlay);
 return {x:box.x,y:box.y,width:box.width,height:box.height,position:background.position,display:background.display,background:background.backgroundColor,padding:style.padding,borderRadius:style.borderRadius};
})}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[];
 const nativeScreens=JSON.parse(execFileSync(process.env.PYTHON_PATH||'.venv/Scripts/python.exe',['-c',"import json; from desktop_launcher import startup_html, THEME_NAMES; print(json.dumps({theme:startup_html(theme) for theme in THEME_NAMES}))"],{encoding:'utf8'}));
 fs.mkdirSync('output/processing-handoff',{recursive:true});
 try{
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor'])for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:width===390?'reduce':'no-preference'});
   const native=await browser.newPage({viewport:{width,height:900},reducedMotion:width===390?'reduce':'no-preference'});
   await native.setContent(nativeScreens[theme]);
   const nativeBackground=await native.locator('.startup').evaluate(element=>getComputedStyle(element).backgroundColor);
   const nativeFieldBackground=await native.locator('.processing-ring-field').evaluate(element=>getComputedStyle(element).backgroundImage);
   const nativeBounds=await native.locator('.card').evaluate(element=>{const rect=element.getBoundingClientRect();return {width:rect.width,height:rect.height}});
   await native.close();
   const errors=[];page.on('pageerror',error=>errors.push(String(error)));
   let release;
   const gate=new Promise(resolve=>{release=resolve});
   await page.route(/\/assets\/LegalPlatform-[^/]+\.(js|css)$/,async route=>{await gate;await route.continue()});
   await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(route.request().url().includes('/legal/metadata')?{ready:false,loading:true,revision:'handoff',availability:{},features:{},sheets:[],months:[],reviewCounts:{}}:{})}));
   await page.goto(base+'/?startupEpoch='+Date.now()+'&startupCardWidth='+nativeBounds.width+'&startupCardHeight='+nativeBounds.height+'&appTheme='+theme+'#/legal/overview',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Processing records'}).waitFor();
   await page.waitForFunction(()=>document.querySelector('.processing-ring-field'));
   const before=await layout(page);
   assert.equal(before.position,'fixed','Processing appeared before its layout styles');
   assert.equal(before.display,'grid');
   assert(Math.abs(before.x+(before.width/2)-(width/2))<1,'Processing card not centered');
   assert(Math.abs(before.y+(before.height/2)-450)<1,'Processing card not vertically centered');
   assert.notEqual(before.background,'rgb(18, 34, 52)','Legacy dark backdrop overrode shared preparation background');
   assert.equal(before.background,nativeBackground,'Processing background differs from native preparation');
   assert.equal(canonicalColors(await page.locator('.processing-ring-field').evaluate(element=>getComputedStyle(element).backgroundImage)),canonicalColors(nativeFieldBackground),'Fluid CSS fallback differs from native preparation');
   await page.evaluate(()=>{window.__handoffCanvas=document.querySelector('.processing-ring-field')});
   const initialSurfaceWidth=await page.locator('.legal-processing-card-surface').evaluate(surface=>surface.getBoundingClientRect().width);
   if(theme==='glass-light')await page.screenshot({path:`output/processing-handoff/before-${width}.png`});
   release();
   await page.locator('.legal-shell').waitFor();
   await page.waitForTimeout(100);
   const after=await layout(page);
   if(width===1440)assert(await page.locator('.legal-processing-card-surface').evaluate((surface,previous)=>surface.getBoundingClientRect().width>=previous-.5,initialSurfaceWidth),'Card resize restarted instead of continuing forward');
   assert.deepEqual(after,before,'Deferred styles changed the processing layout/background');
   assert(await page.evaluate(()=>window.__handoffCanvas===document.querySelector('.processing-ring-field')),'Fluid canvas restarted during module handoff');
   assert.equal(await page.locator('.legal-upload-progress').evaluate(card=>card.getAnimations().length),0);
   if(width===390)assert.equal(await page.locator('.legal-processing-card-surface').evaluate(surface=>surface.getAnimations().length),0,'Reduced motion animated the card');
   await page.waitForTimeout(1000);
   const settled=await page.locator('.legal-processing-card-surface').evaluate(surface=>{const box=surface.getBoundingClientRect();return {width:box.width,height:box.height,animations:surface.getAnimations().length}});
   const finalSize=await page.locator('.legal-upload-progress').evaluate(card=>({width:card.clientWidth,height:card.clientHeight}));
   assert(Math.abs(settled.width-finalSize.width)<1&&Math.abs(settled.height-finalSize.height)<1,'Resize did not settle at the final card dimensions');
   assert.equal(settled.animations,0);
   if(theme==='glass-light')await page.screenshot({path:`output/processing-handoff/after-${width}.png`});
   assert.deepEqual(errors,[]);
   results.push({theme,width,identicalLayout:true,sameCanvas:true,nativeBackgroundMatches:true});
   await page.close();
  }
  fs.writeFileSync('output/performance/processing-handoff.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
