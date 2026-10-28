const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{localStorage.setItem('app-theme','glass-light');window.__copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copies.push(text)},configurable:true})});
  let fixture;await mock(page,8,f=>{fixture=f;f.questions[1].kind='text';f.results[1].kind='text';f.results[1].rows[0].label='SECRET NARRATIVE';f.questions[2].identifying=true;
   for(const [id,label] of [['gender','Gender'],['district','District'],['population','Population group'],['extra','Age group']])f.questions.push({id,name:id,labels:{en:label},type:'select_one',kind:'category',group:'g',repeat:'',metadata:false,identifying:false,choices:[]});
  });
  let calls=[],fail=false,release=null;
  await page.route('**/analysis/preview',async route=>{
   const body=route.request().postDataJSON();calls.push(body);if(release)await release.promise;
   if(fail){await route.fulfill({status:500,json:{detail:'Disaggregation unavailable'}});return}
   const result=structuredClone(fixture.results.find(q=>q.id===body.question)),fields=body.settings.questions[body.question].breakdowns;
   result.breakdownFields=fields.map(id=>({id,label:fixture.questions.find(q=>q.id===id).labels.en}));
   assert.equal(fields.length,1);
   result.breakdowns=fields[0]==='gender'?[{id:'f',label:'Female',labels:['Female'],denominator:160},{id:'m',label:'Male',labels:['Male'],denominator:160}]:[{id:'north',label:'North',labels:['North'],denominator:120},{id:'south',label:'South',labels:['South'],denominator:200}];
   result.rows=result.rows.map(row=>({...row,series:result.breakdowns.map(column=>({id:column.id,count:row.count/2,percent:row.percent}))}));
   await route.fulfill({json:result});
  });
  await page.goto((process.argv[2]||'http://127.0.0.1:5359')+'/#/kobo/scroll',{waitUntil:'domcontentloaded'});const launch=page.getByRole('button',{name:'Prepare AI report prompt',exact:true});await launch.click();
  const dialog=page.getByRole('dialog',{name:'Prepare AI report prompt'}),list=dialog.getByRole('group',{name:'Select report questions'});
  fs.mkdirSync('output/kobo-report-prompt',{recursive:true});await dialog.screenshot({path:'output/kobo-report-prompt/desktop-overview.png'});
  assert.equal(await list.getByRole('checkbox').count(),11);assert(await dialog.getByRole('button',{name:'Preview prompt',exact:true}).isDisabled());
  const selectAll=dialog.getByRole('button',{name:'Select all matching',exact:true}),clearSelection=dialog.getByRole('button',{name:'Clear selection',exact:true});
  assert.equal(await selectAll.locator('svg').count(),1);assert.equal(await clearSelection.locator('svg').count(),1);assert(await clearSelection.isDisabled());
  await page.emulateMedia({reducedMotion:'no-preference'});await selectAll.hover();assert.equal(await selectAll.locator('svg').evaluate(el=>getComputedStyle(el).animationName),'kobo-report-check-pop');await selectAll.click();assert.equal(await list.getByRole('checkbox',{checked:true}).count(),11);
  await clearSelection.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');assert.equal(await clearSelection.locator('svg').evaluate(el=>getComputedStyle(el).animationName),'kobo-report-clear-sweep');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await clearSelection.locator('svg').evaluate(el=>getComputedStyle(el).animationName),'none');await clearSelection.click();assert.equal(await list.getByRole('checkbox',{checked:true}).count(),0);await page.emulateMedia({reducedMotion:'no-preference'});

  await list.getByRole('checkbox').nth(0).check();await list.getByRole('checkbox').nth(1).check();await list.getByRole('checkbox').nth(2).check();
  assert(await dialog.getByRole('heading',{name:'Main fields',exact:true}).isVisible());
  await dialog.getByRole('radio',{name:'Choose shared disaggregation fields',exact:false}).check();assert(await dialog.getByRole('button',{name:'Preview prompt',exact:true}).isDisabled());
  const fields=dialog.getByRole('group',{name:'Disaggregation fields',exact:true});
  await fields.getByRole('checkbox',{name:'Gender',exact:true}).check();await fields.getByRole('checkbox',{name:'District',exact:true}).check();await fields.getByRole('checkbox',{name:'Population group',exact:true}).check();
  assert(await fields.getByRole('checkbox',{name:'Age group',exact:true}).isDisabled());
  fs.mkdirSync('output/kobo-report-prompt',{recursive:true});await dialog.screenshot({path:'output/kobo-report-prompt/desktop-select.png'});
  for(const theme of ['glass-dark','unhcr','executive','multicolor']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await dialog.screenshot({path:`output/kobo-report-prompt/${theme}.png`})}
  await page.evaluate(()=>document.documentElement.dataset.theme='glass-light');
  await dialog.getByRole('button',{name:'Remove disaggregation Population group',exact:true}).click();
  let resume;release={promise:new Promise(resolve=>resume=resolve)};await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();
  await dialog.getByRole('status').filter({hasText:'Preparing disaggregated results'}).waitFor();assert(await dialog.getByRole('button',{name:'Copy prompt',exact:true}).isDisabled());resume();release=null;
  const preview=dialog.getByRole('textbox',{name:'Prompt preview',exact:true});await preview.waitFor();const text=await preview.inputValue();
  assert.equal(calls.length,4);assert.deepEqual(calls.map(call=>[call.question,call.settings.questions[call.question].breakdowns]),[['q0',['gender']],['q0',['district']],['q3',['gender']],['q3',['district']]]);
  assert.equal((text.match(/#### Overall results/g)||[]).length,2);assert.equal((text.match(/#### Separate comparison by Gender/g)||[]).length,2);assert.equal((text.match(/#### Separate comparison by District/g)||[]).length,2);assert(text.includes('| District: North | 120 |'));assert(!text.includes('Question: gender'));assert(!text.includes('Female /'));assert(text.includes('Selected main fields: 3'));
  assert(text.includes('Disaggregation fields: Gender'));assert(text.includes('| Gender: Female | 160 |'));assert(!text.includes('SECRET NARRATIVE'));assert(text.includes('Response totals only'));assert(text.includes('| Answer | Gender: Female - Count | Gender: Female - Percent |'));assert(text.includes('| :--- | ---: |'));assert(!text.includes('\t'));assert(text.includes('## Required report structure'));
  await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copies.at(-1)),text);await dialog.screenshot({path:'output/kobo-report-prompt/desktop-preview.png'});
  await dialog.getByRole('button',{name:'Edit selection',exact:true}).click();assert(await list.getByRole('checkbox').nth(0).isChecked());
  await dialog.getByRole('textbox',{name:'Search questions',exact:true}).fill('q3');assert.equal(await list.getByRole('checkbox').count(),1);assert(await dialog.getByText('3 selected',{exact:true}).isVisible());await dialog.getByRole('textbox',{name:'Search questions',exact:true}).fill('');
  await page.setViewportSize({width:390,height:844});assert((await selectAll.boundingBox()).height>=44);assert((await clearSelection.boundingBox()).height>=44);await dialog.screenshot({path:'output/kobo-report-prompt/mobile-top.png'});assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await dialog.getByRole('radio',{name:'Choose shared disaggregation fields',exact:false}).scrollIntoViewIfNeeded();await dialog.screenshot({path:'output/kobo-report-prompt/mobile-settings.png'});
  await page.setViewportSize({width:1440,height:1000});fail=true;await fields.getByRole('checkbox',{name:'Population group',exact:true}).check();await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Disaggregation unavailable'}).waitFor();assert(await dialog.getByRole('button',{name:'Copy prompt',exact:true}).isDisabled());fail=false;await dialog.getByRole('button',{name:'Try again',exact:true}).click();await preview.waitFor();
  await preview.fill((await preview.inputValue())+'\nMY REPORT EDIT');
  await dialog.getByRole('button',{name:'Edit selection',exact:true}).click();await fields.getByRole('checkbox',{name:'Population group',exact:true}).uncheck();await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();
  const confirmation=page.getByRole('alertdialog',{name:'Regenerate your prompt?',exact:true});await confirmation.waitFor();assert(await dialog.getByRole('button',{name:'Copy prompt',exact:true}).isDisabled());await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();
  await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();await confirmation.waitFor();await confirmation.getByRole('button',{name:'Regenerate prompt',exact:true}).click();assert(!(await preview.inputValue()).includes('MY REPORT EDIT'));
  await preview.fill('MY RESET EDIT');await dialog.getByRole('button',{name:'Reset prompt',exact:true}).click();const reset=page.getByRole('alertdialog',{name:'Reset your prompt?',exact:true});await reset.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await preview.inputValue(),'MY RESET EDIT');await dialog.getByRole('button',{name:'Reset prompt',exact:true}).click();await reset.getByRole('button',{name:'Reset prompt',exact:true}).click();
  const preparedCalls=calls.length;await dialog.getByRole('button',{name:'Edit selection',exact:true}).click();await dialog.getByRole('radio',{name:'Current question breakdowns',exact:false}).check();await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();assert((await preview.inputValue()).includes('Existing question breakdowns, where available'));assert.equal(calls.length,preparedCalls);
  await dialog.getByRole('button',{name:'Edit selection',exact:true}).click();await dialog.getByRole('radio',{name:'Overall results',exact:false}).check();await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();const overall=await preview.inputValue();assert(overall.includes('Overall results only'));assert(!overall.includes('Breakdown denominator -'));assert.equal(calls.length,preparedCalls);
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert(await launch.evaluate(el=>el===document.activeElement));assert.deepEqual(errors,[]);
  console.log('PASS: professional desktop/mobile layout and five themes; selections and search; three-field limit; two main fields with separate shared comparisons; report-only aggregate queries; edited prompt confirmation; privacy; loading/copy guard; preview and clipboard; request error/retry; overall-only mode; Escape and focus return.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
