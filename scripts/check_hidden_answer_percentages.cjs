const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const fixtures=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json'));const base=process.env.ANALYSIS_FIXTURE_URL||'http://127.0.0.1:5397';
 for(const workspace of ['kobo','custom']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const item=fixtures[workspace],qid=item.ids.answer;
  const settings=structuredClone(item.settings);settings.questions[qid].breakdowns=[];settings.questions[qid].percentageMode='grand-total';settings.questions[qid].hiddenAnswers=['B'];
  await page.request.put(`${base}/api/${workspace}/projects/${item.id}/settings`,{data:settings});await page.goto(`${base}/#/${workspace}/${item.id}`);
  const card=page.locator('.kobo-question').first(),group=card.getByRole('group',{name:'Hidden answer percentages'}),pivot=card.locator('.kobo-pivot-wrap');await group.waitFor();
  assert.equal(await group.getByRole('button').count(),2);assert.equal(await card.locator('.kobo-hidden-answers').count(),0);assert.equal(await group.locator('p,small').count(),0);
  assert(await group.evaluate(e=>!!e.closest('thead th.kobo-pivot-answer')));
  await card.locator('tbody').getByText('100%',{exact:true}).waitFor();
  await group.getByRole('button',{name:'Keep original percentages',exact:true}).click();await card.locator('tbody').getByText('67%',{exact:true}).waitFor();
  await page.reload();await group.waitFor();assert.equal(await group.getByRole('button',{name:'Keep original percentages',exact:true}).getAttribute('aria-pressed'),'true');
  await group.getByRole('button',{name:'Adjust percentages',exact:true}).focus();await page.keyboard.press('Enter');await card.locator('tbody').getByText('100%',{exact:true}).waitFor();
  await group.getByRole('button',{name:'Keep original percentages',exact:true}).focus();await page.keyboard.press('Space');await card.locator('tbody').getByText('67%',{exact:true}).waitFor();
  for(const [theme,width,rtl] of [['glass-light',1440,false],['glass-dark',390,false],['unhcr',320,true],['executive',390,false],['multicolor',390,false]]){
   await page.evaluate(({theme,rtl})=>{document.documentElement.dataset.theme=theme;document.documentElement.dir=rtl?'rtl':'ltr'},{theme,rtl});await page.setViewportSize({width,height:1000});
   assert(await group.evaluate(e=>{const b=e.getBoundingClientRect(),p=e.closest('th').getBoundingClientRect();return b.left>=p.left&&b.right<=p.right&&e.scrollWidth<=e.clientWidth+1}));
   await pivot.screenshot({path:`output/analysis-features/header-buttons-${workspace}-${theme}-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.dir='ltr');await page.reload();await group.waitFor();
  await card.locator('tbody .kobo-answer-menu-trigger').first().focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Hide answer',exact:true}).click();
  await card.getByText('All answers hidden',{exact:true}).waitFor();await card.locator('tbody .kobo-answer-menu-trigger').first().focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Unhide all answers',exact:true}).click();await group.waitFor({state:'detached'});await card.locator('tbody').getByText('B',{exact:true}).waitFor();
  const saved=await(await page.request.get(`${base}/api/${workspace}/projects/${item.id}`)).json();assert.equal(saved.settings.questions[qid].hiddenAnswerPercentageMode,'keep-original');
  await page.close();console.log('PASS',workspace,'two header buttons, percentages, reload, keyboard, mobile, RTL, themes, all hidden/restore');
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
