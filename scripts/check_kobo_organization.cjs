const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const base=process.argv[2]||'http://127.0.0.1:5197';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],exports=[];
  page.on('pageerror',error=>errors.push(String(error)));
  const calls=await mock(page,50,f=>{
   f.settings.filterFields=['q0'];f.settings.filters=[{field:'q0',kind:'category',values:['Safety']}];
   f.groups.push({id:'other',name:'other',label:'Services and community participation',parent:'',repeat:false},{id:'other/nested',name:'nested',label:'التفاصيل - Nested questions',parent:'other',repeat:false});
   f.results.forEach((q,i)=>{if(i>=40)q.group=i>=49?'':i>=45?'other/nested':'other';if(i===47)q.label='احتياجات المجتمع - Community priorities'});
   f.questions.forEach((q,i)=>q.group=f.results[i].group);
  });
  await page.route('**/projects/scroll/exports',async route=>{exports.push(route.request().postDataJSON());await route.fulfill({json:{id:'layout-export',state:'complete',progress:100,message:'Ready'}})});
  await page.goto(`${base}/#/kobo/scroll`);await page.locator('#question-q0').waitFor();
  assert.equal(await page.getByRole('button',{name:'Survey questions',exact:true}).getAttribute('aria-expanded'),'true');
  assert.equal(await page.getByRole('button',{name:'Services and community participation',exact:true}).getAttribute('aria-expanded'),'false');
  const filterToggle=page.getByRole('button',{name:/^Filter responses/});const filterFields=await filterToggle.getAttribute('aria-controls');await filterToggle.click();assert(await page.locator(`[id="${filterFields}"]`).isHidden());assert(await page.locator('.kobo-active-filters').isVisible());
  await page.getByRole('button',{name:'Navigate questions',exact:true}).click();await page.getByRole('textbox',{name:'Find a question or group'}).fill('q47');
  await page.locator('.kobo-nav-question').click();await page.locator('#question-q47').waitFor();
  assert.equal(await page.getByRole('button',{name:'Services and community participation',exact:true}).getAttribute('aria-expanded'),'true');
  assert.equal(await page.getByRole('button',{name:'التفاصيل - Nested questions',exact:true}).getAttribute('aria-expanded'),'true');
  const bounds=await page.evaluate(()=>({bar:document.querySelector('.kobo-analysis-toolbar').getBoundingClientRect().bottom,card:document.querySelector('#kobo-question-q47').getBoundingClientRect().top}));assert(bounds.card>=bounds.bar-1,JSON.stringify(bounds));
  await page.getByRole('button',{name:'Navigate questions',exact:true}).click();await page.getByRole('textbox',{name:'Find a question or group'}).fill('unmatched-xyz');assert(await page.getByText('No matching questions or groups.').isVisible());
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Navigate questions',exact:true}).getAttribute('aria-expanded'),'false');
  await page.getByRole('button',{name:'Navigate questions',exact:true}).click();await page.getByRole('textbox',{name:'Find a question or group'}).fill('q49');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.locator('#question-q49').waitFor();
  const questionSearch=page.getByRole('textbox',{name:'Search questions',exact:true});await questionSearch.fill('احتياجات');await page.locator('#question-q47').waitFor();assert.equal(await page.locator('.kobo-question').count(),1);await page.getByRole('button',{name:'Clear question search',exact:true}).click();
  assert.equal(calls(),1,'Navigation and search must not request analysis');
  await page.getByRole('button',{name:'Display options',exact:true}).click();await page.getByRole('button',{name:'1 decimal place',exact:true}).click();
  await page.getByRole('button',{name:'Question order'}).click();await page.getByRole('option',{name:'Answered high to low',exact:true}).click();await page.keyboard.press('Escape');
  await page.waitForTimeout(800);assert.equal(calls.settings().filters[0].values[0],'Safety');assert.equal(calls.settings().percentageDecimals,1);assert.equal(calls.settings().questionSort,'answered-desc');
  const general=page.locator('#question-q49');await page.locator('[data-question-id="q49"]').scrollIntoViewIfNeeded();await general.waitFor();await general.getByRole('button',{name:'Export question',exact:true}).click();await general.getByRole('button',{name:'Download Excel',exact:true}).click();await page.getByRole('button',{name:'Start Excel export',exact:true}).click();await page.getByRole('complementary',{name:'Export files'}).waitFor();assert.equal(exports[0].question,'q49');assert.equal(exports[0].settings.filters[0].values[0],'Safety');await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Report PDF',exact:true}).waitFor();await page.keyboard.press('Escape');
  fs.mkdirSync('output/kobo-organization',{recursive:true});
  await page.getByRole('button',{name:'Navigate questions',exact:true}).click();await page.getByRole('textbox',{name:'Find a question or group'}).fill('Survey');await page.locator('.kobo-nav-group').click();
  await page.locator('.kobo-page-heading').scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.screenshot({path:`output/kobo-organization/${theme}.png`});}
  await page.evaluate(()=>{document.documentElement.dataset.theme='glass-light';document.querySelector('.kobo-shell').dir='rtl'});await page.screenshot({path:'output/kobo-organization/rtl.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/kobo-organization/mobile-rtl.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>document.querySelector('.kobo-shell').dir='ltr');await page.getByRole('button',{name:'Navigate questions',exact:true}).click();await page.screenshot({path:'output/kobo-organization/mobile-navigator.png'});await page.keyboard.press('Escape');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>window.location.hash='#/kobo');await page.getByRole('heading',{name:'Your Kobo projects'}).waitFor();assert.equal(await page.locator('.js-plotly-plot').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS: group defaults, nested/General navigation, search, keyboard, sticky jump offset, filters, display settings, export scope, themes, RTL, mobile, cleanup.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
