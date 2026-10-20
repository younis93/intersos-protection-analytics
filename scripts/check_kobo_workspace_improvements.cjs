const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const base=process.argv[2]||'http://127.0.0.1:5369';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(()=>{
   window.__copies=[];window.__copyMode='normal';
   Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.__copyMode!=='normal')throw Error('Denied');window.__copies.push(text)}},configurable:true});
   document.execCommand=()=>{if(window.__copyMode==='fail')return false;window.__copies.push(document.activeElement.value);return true};
  });
  await mock(page,4,f=>{
   f.settings.language='ar';
   f.questions[0].labels.ar='الاحتياجات';f.results[0].label='الاحتياجات';
   f.questions[1].kind='text';f.results[1].kind='text';f.results[1].rows[0].label='SECRET NARRATIVE';
   f.questions[2].identifying=true;f.results[2].label='SECRET IDENTIFIER';
  });
  const initialResponse=page.waitForResponse(response=>response.url().endsWith('/projects/scroll/analysis'));
  await page.goto(base+'/#/kobo/scroll');
  const analysisSnapshot=await (await initialResponse).json();
  const card=page.locator('#question-q0');await card.getByRole('button',{name:'Copy table for q0'}).waitFor();
  const copyButton=card.getByRole('button',{name:'Copy table for q0'}),compareButton=card.getByRole('button',{name:'Compare q0',exact:true});
  assert.equal(await copyButton.innerText(),'Copy');
  const copyBounds=await copyButton.boundingBox(),compareBounds=await compareButton.boundingBox();
  assert(copyBounds.x+copyBounds.width<=compareBounds.x);
  assert.equal(await card.locator('.kobo-pivot-toolbar .kobo-copy-table').count(),0);
  assert.equal(await page.locator('.kobo-shell').getAttribute('dir'),'ltr');
  assert(await page.getByRole('button',{name:'Charts view',exact:true}).isVisible());
  await card.getByRole('button',{name:'Sort by Answer',exact:true}).click();
  await card.getByRole('button',{name:'Sort by Answer',exact:true}).click();
  await card.getByRole('button',{name:'Copy table for q0'}).click();
  const copied=await page.evaluate(()=>window.__copies.at(-1));
  assert.equal(copied.split('\r\n').length,35);assert(copied.includes('Total\t40\t100%'));assert(copied.includes('Priority 32'));
  assert(copied.split('\r\n')[2].startsWith('Priority 32\t'));
  await page.getByRole('status').filter({hasText:'Table copied for Excel'}).waitFor();
  const title=card.locator('.kobo-question-title h3');await title.click();
  assert.equal(await page.evaluate(()=>window.__copies.at(-1)),'الاحتياجات');
  await title.focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__copies.at(-1)),'الاحتياجات');
  await page.getByRole('status').filter({hasText:'الاحتياجات'}).waitFor();
  assert.equal(await card.locator('tbody tr').count(),30);
  const launch=page.getByRole('button',{name:'Prepare AI report prompt',exact:true});await launch.click();
  const dialog=page.getByRole('dialog',{name:'Prepare AI report prompt'});
  assert.equal(await dialog.getByRole('checkbox').count(),3);assert(await dialog.getByRole('button',{name:'Preview prompt',exact:true}).isDisabled());
  await dialog.getByRole('button',{name:'Select all matching'}).click();await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();
  const preview=await dialog.getByRole('textbox',{name:'Prompt preview',exact:true}).inputValue();
  assert(preview.includes('general survey report in English'));assert(!preview.includes('SECRET NARRATIVE'));assert(!preview.includes('SECRET IDENTIFIER'));
  await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copies.at(-1)),preview);
  await page.evaluate(()=>window.__copyMode='fallback');await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copies.at(-1)),preview);
  await page.evaluate(()=>window.__copyMode='fail');await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();await dialog.getByRole('alert').waitFor();
  await dialog.getByRole('textbox',{name:'Search questions',exact:true}).fill('q3');assert.equal(await dialog.getByRole('checkbox').count(),1);assert(await dialog.getByText('3 selected',{exact:true}).isVisible());
  fs.mkdirSync('output/kobo-workspace-improvements',{recursive:true});
  await dialog.screenshot({path:'output/kobo-workspace-improvements/prompt-desktop.png'});
  await page.setViewportSize({width:390,height:844});await dialog.screenshot({path:'output/kobo-workspace-improvements/prompt-mobile.png'});
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert(await launch.evaluate(el=>el===document.activeElement));
  await page.setViewportSize({width:1440,height:1000});
  const lum=rgb=>{const v=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const styles=await card.locator('thead th,tfoot th,tfoot td').evaluateAll(cells=>cells.map(cell=>{const s=getComputedStyle(cell);return {fg:s.color,bg:s.backgroundColor}}));
   for(const s of styles){const a=lum(s.fg),b=lum(s.bg);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${theme}: ${JSON.stringify(s)}`)}
   await card.locator('.kobo-pivot-wrap').screenshot({path:`output/kobo-workspace-improvements/pivot-${theme}.png`});
  }
  let release;const gate=new Promise(resolve=>{release=resolve});
  await page.route('**/projects/scroll/analysis',async route=>{
   const settings=route.request().postDataJSON().settings;
   await gate;
   // Server normalization may insert defaults absent from the original request.
   await route.fulfill({json:{...analysisSnapshot,settings:{...settings,questions:{q0:{colors:{},breakdownDisplay:'both'}}}}});
  });
  await page.getByRole('button',{name:'Display options',exact:true}).click();
  await page.getByRole('button',{name:'Survey label language',exact:true}).click();
  await page.getByRole('option',{name:'English',exact:true}).click();
  assert(await launch.isDisabled());
  release();
  await page.getByRole('button',{name:'Display options',exact:true}).click();
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Prepare AI report prompt')?.disabled);
  assert.equal(await page.locator('.kobo-shell').getAttribute('dir'),'ltr');
  assert(await launch.isEnabled());
  assert.deepEqual(errors,[]);console.log('PASS: English layout with Arabic labels; all-row sorted copy; question selection; prompt privacy; preview/copy; clipboard fallback/failure; keyboard focus; mobile fit; header/total contrast across five themes; stale results blocked and normalized results accepted.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
