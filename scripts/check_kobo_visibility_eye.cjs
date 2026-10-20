const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));let saves=0;page.on('request',r=>{if(r.method()==='PUT')saves++});
  await page.emulateMedia({reducedMotion:'no-preference'});await mock(page,250,f=>{f.settings.hidden=['q3'];f.questions.forEach(q=>q.identifying=false)});
  await page.goto('http://127.0.0.1:5359/#/kobo/scroll');await page.getByRole('button',{name:'Manage questions',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Manage questions',exact:true});
  const button=id=>dialog.getByRole('switch',{name:`Enable ${id} (${id})`,exact:true});
  const state=id=>button(id).locator('.kobo-visibility-state-icon').evaluate(el=>({offset:parseFloat(getComputedStyle(el.querySelector(':scope>path')).strokeDashoffset),mask:parseFloat(getComputedStyle(el.querySelector('mask>path')).strokeDashoffset),animations:el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,transform:getComputedStyle(el).transform,animation:getComputedStyle(el).animationName,hidden:el.dataset.hidden}));
  assert.deepEqual(await state('q3'),{offset:0,mask:0,animations:0,transform:'none',animation:'none',hidden:'true'});assert.equal((await state('q0')).offset,1);
  const size=await button('q0').boundingBox();await button('q0').click();await page.waitForTimeout(70);let sample=await state('q0');assert(sample.offset>0&&sample.offset<1,sample);assert(Math.abs(sample.mask-sample.offset)<.001);assert.equal(sample.transform,'none');
  fs.mkdirSync('output/kobo-visibility-eye',{recursive:true});await button('q0').screenshot({path:'output/kobo-visibility-eye/drawing.png'});await page.waitForTimeout(400);assert.equal((await state('q0')).offset,0);
  await page.mouse.move(0,0);await button('q0').hover();await page.waitForTimeout(60);sample=await state('q0');assert(sample.offset>0&&sample.offset<1,sample);await page.waitForTimeout(400);assert.equal((await state('q0')).offset,0);assert.equal((await state('q0')).animations,0);
  await button('q0').click();await page.waitForTimeout(65);sample=await state('q0');assert(sample.offset>0&&sample.offset<1,sample);await page.waitForTimeout(400);assert.equal((await state('q0')).offset,1);
  // Reverse an in-progress slash repeatedly; each new transition begins at the visible position.
  await button('q0').click();await page.waitForTimeout(60);const before=(await state('q0')).offset;await button('q0').evaluate(el=>el.click());const after=(await state('q0')).offset;assert(Math.abs(after-before)<.25,{before,after});await button('q0').evaluate(el=>el.click());await page.waitForTimeout(420);assert.equal((await state('q0')).offset,0);
  await page.mouse.move(0,0);await button('q0').evaluate(el=>el.blur());await button('q0').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await page.waitForTimeout(50);assert.equal(await button('q0').evaluate(el=>el.matches(':focus-visible')),true);assert((await state('q0')).animations>0);await page.waitForTimeout(400);
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await button('q0').screenshot({path:`output/kobo-visibility-eye/${theme}.png`});assert.equal((await state('q0')).offset,0)}
  const hideAll=dialog.getByRole('button',{name:'Hide all matching',exact:true});await hideAll.click();await page.waitForTimeout(420);assert.equal((await state('q1')).offset,0);await dialog.getByRole('button',{name:'Show all matching',exact:true}).click();await page.waitForTimeout(420);assert.equal((await state('q1')).offset,1);
  // A newly mounted virtualized row must start in its final state without replaying.
  const list=dialog.locator('[data-virtual-rows]');await list.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(100);const icons=list.locator('.kobo-visibility-state-icon');assert(await icons.count()>0);assert(await icons.evaluateAll(nodes=>nodes.every(node=>node.getAnimations({subtree:true}).every(a=>a.playState!=='running'))));await list.evaluate(el=>el.scrollTop=0);await button('q0').waitFor();assert.equal((await state('q0')).animations,0);
  await page.emulateMedia({reducedMotion:'reduce'});await button('q0').click();sample=await state('q0');assert.equal(sample.offset,0);assert.equal(sample.animations,0);await page.mouse.move(0,0);await button('q0').hover();assert.equal((await state('q0')).animations,0);await button('q0').click();assert.equal((await state('q0')).offset,1);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert((await button('q0').boundingBox()).height>=40);await button('q0').screenshot({path:`output/kobo-visibility-eye/mobile-${width}.png`})}
  assert.equal((await button('q0').boundingBox()).width<=size.width,true);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(saves,0);assert.deepEqual(errors,[]);
  console.log('PASS: no mount/recycle animation, drawing and erasing, matching clearance, one-shot hover/focus, rapid reversal, bulk changes, five themes, mobile, reduced motion and Cancel without saves.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
