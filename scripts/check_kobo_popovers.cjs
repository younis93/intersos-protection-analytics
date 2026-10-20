const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const baseline=process.argv.includes('--baseline'),base=process.env.KOBO_TEST_URL||'http://127.0.0.1:5197';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(String(e)));await mock(page,5);await page.goto(`${base}/#/kobo/scroll`);await page.locator('#question-q0').waitFor();
 fs.mkdirSync('output/kobo-popovers',{recursive:true});
 for(const width of [1440,1100,800,390]){
  await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Display options',exact:true}).click();
  const popup=page.locator('.kobo-analysis-tools .kobo-action-popup');await popup.waitFor();const rect=await popup.boundingBox();checks.push({width,...rect});
  if(baseline){await page.keyboard.press('Escape');continue;}
  assert(rect.x>=11&&rect.x+rect.width<=width-11,JSON.stringify({width,...rect}));
  await page.getByRole('button',{name:'Question order',exact:true}).click();const options=page.getByRole('listbox',{name:'Question order options',exact:true});await options.waitFor();const nested=await options.boundingBox();assert(nested.x>=11&&nested.x+nested.width<=width-11,JSON.stringify(nested));
  await page.screenshot({path:`output/kobo-popovers/options-${width}.png`});
  await page.keyboard.press('Escape');assert(await options.isHidden());assert(await popup.isVisible(),'Escape should close only the inner selector');
  await page.getByRole('button',{name:'Question order',exact:true}).click();await page.getByRole('option',{name:'Question name A-Z',exact:true}).click();assert(await popup.isVisible());
  await page.keyboard.press('Escape');assert(await popup.isHidden());
 }
 if(!baseline){
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>document.querySelector('.kobo-shell').dir='rtl');await page.getByRole('button',{name:'Display options',exact:true}).click();const rect=await page.locator('.kobo-analysis-tools .kobo-action-popup').boundingBox();assert(rect.x>=11&&rect.x+rect.width<=1429);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Navigate questions',exact:true}).click();await page.setViewportSize({width:600,height:550});const nav=await page.locator('.kobo-navigator .kobo-action-popup').boundingBox();assert(nav.x>=11&&nav.x+nav.width<=589);await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
 }
 fs.writeFileSync(`output/kobo-popovers/${baseline?'before':'after'}.json`,JSON.stringify({checks,errors},null,2));console.log(baseline?checks:'PASS: Display options and nested question ordering stay inside desktop/mobile/RTL viewport; resize and nested Escape work.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
