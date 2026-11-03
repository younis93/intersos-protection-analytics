const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.QUESTION_FLOW_BASE||'http://127.0.0.1:5797';
const {id}=JSON.parse(fs.readFileSync('output/question-flow/fixture.json','utf8'));
async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Question flow did not settle')}
function viewSelector(page,language){const button=page.locator('.qf-view-label .app-select-trigger'),names=language==='ar'?{flowchart:'مخطط التدفق',mindmap:'خريطة ذهنية',outline:'قائمة هرمية'}:{flowchart:'Flowchart',mindmap:'Mind map',outline:'Outline'};return {waitFor:()=>button.waitFor(),inputValue:async()=>{const text=(await button.innerText()).trim();return Object.keys(names).find(key=>names[key]===text)},selectOption:async key=>{await button.click();await page.getByRole('option',{name:names[key],exact:true}).click()}}}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const [language,width,theme] of [['en',1600,'glass-light'],['en',390,'glass-dark'],['ar',1440,'glass-dark'],['ar',390,'glass-light']]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],mutations=[];
   page.on('pageerror',error=>errors.push(String(error)));
   await page.route('**/api/*/export-recovery',route=>route.fulfill({json:[]}));
   const project=await(await page.request.get(`${base}/api/kobo/projects/${id}`)).json();
   const save=await page.request.put(`${base}/api/kobo/projects/${id}/settings`,{data:{...project.settings,language}});assert(save.ok());
   await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
   page.on('request',request=>{if(request.method()!=='GET'&&request.url().includes('/api/kobo/'))mutations.push(request.url())});
   await page.goto(`${base}/#/kobo/${id}/question-flow`);
   const selector=viewSelector(page,language);await selector.waitFor();
   await page.locator('.react-flow__node[data-id="main"]').waitFor();
   await until(async()=>!(await page.locator('.qf-canvas').innerText()).includes(language==='ar'?'جار ترتيب':'Arranging'));
   assert.equal(await selector.inputValue(),'flowchart');
   assert(await page.locator('.react-flow__edge').count()>0);
   assert.equal(await page.locator('.react-flow__node[data-id="calculated"]').count(),0);
   
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page overflow');
   if(width>900){
    const first=page.locator('.qf-navigation [role=treeitem]').first();await first.focus();await page.getByRole('tooltip').waitFor();await page.keyboard.press('ArrowDown');assert(await page.locator('.qf-navigation [role=treeitem]').nth(1).evaluate(node=>node===document.activeElement));
    await page.keyboard.press('Escape');
   }
   await page.locator('.qf-expand-actions button').nth(2).click();
   await until(async()=>await page.locator('.react-flow__node[data-id="follow"]').count()===0);
   const search=page.locator('.qf-search input');await search.fill('follow');
   await selector.selectOption('outline');
   const result=page.locator('.qf-canvas .qf-section-question-button').filter({hasText:language==='ar'?'ما نوع المساعدة':'What type of assistance'});
   await result.click();const details=page.locator('.qf-details');await details.waitFor();
   assert.equal(await details.locator('.qf-choices li').count(),15);
   assert.equal(await details.locator('.qf-condition').count(),2);
   await details.locator('input').fill('15');assert.equal(await details.locator('.qf-choices li').count(),1);
   assert((await details.innerText()).includes('choice-15'));
   if(width<=900){
    assert.equal(await details.getAttribute('role'),'dialog');assert(await details.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.left+20,r.bottom-40))}),'mobile details must cover bottom navigation');
    await page.keyboard.press('Escape');await details.waitFor({state:'detached'});
    await search.fill('');await selector.selectOption('mindmap');
    await until(async()=>await page.locator('.react-flow__node[data-id="@form"]').count()===1);
    await selector.selectOption('outline');await page.locator('.qf-canvas .qf-section-question-button').filter({hasText:language==='ar'?'ما نوع المساعدة':'What type of assistance'}).click();
   }else{
    await selector.selectOption('mindmap');await until(async()=>await page.locator('.react-flow__node[data-id="@form"]').count()===1);
    assert(await details.isVisible());assert.equal(await search.inputValue(),'follow');
    await selector.selectOption('flowchart');await until(async()=>await page.locator('.react-flow__node[data-id="follow"]').count()===1);
    assert(await details.isVisible());
   }
   await page.waitForTimeout(500);await page.screenshot({path:`output/question-flow/details-${language}-${width}.png`});
   await details.locator('header button').click();
   await search.fill('');await selector.selectOption('outline');
   await page.reload();await selector.waitFor();assert.equal(await selector.inputValue(),'outline','saved view');
   await page.locator('.qf-expand-actions button').nth(1).click();
   const technical=page.locator('.qf-canvas .qf-section-question-button').filter({hasText:language==='ar'?'حقل محسوب':'Calculated field'});assert(await technical.isVisible());
   await page.locator('.qf-canvas .qf-section-question-button').filter({hasText:language==='ar'?'شرط يحتاج':'Condition requiring review'}).click();
   assert(await details.locator('.qf-review').isVisible());assert((await details.locator('.qf-condition code').innerText()).includes('${missing}'));
   await details.locator('header button').click();await selector.selectOption('flowchart');
   await page.locator('.react-flow__node').first().waitFor();await page.waitForTimeout(400);
   await page.screenshot({path:`output/question-flow/flowchart-${language}-${width}.png`});
   assert.deepEqual(mutations,[],'explorer must not mutate project or run analysis');
   assert.deepEqual(errors,[]);
   await page.close();
  }
  const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.route('**/api/*/export-recovery',route=>route.fulfill({json:[]}));
  await page.goto(`${base}/#/kobo`);const card=page.locator('.kobo-project-card').first();await card.waitFor();assert.equal(await card.locator('a[href$="/question-flow"]').count(),0,'project cards must not show Question flow');
  await card.locator('footer>a').first().click();
  const flowLink=page.locator('.kobo-question-flow-nav');await flowLink.waitFor();assert.equal(await page.locator('.kobo-header-flow-link').count(),0);
  const sections=page.locator('.sidebar nav .kobo-project-section');assert((await sections.nth(0).innerText()).includes('Analysis'));assert.equal(await sections.nth(1).getAttribute('class'),'kobo-project-section kobo-question-flow-nav');
  await flowLink.click();await page.locator('.qf-page').waitFor();assert.equal(await flowLink.getAttribute('aria-current'),'page');assert.equal(await sections.first().getAttribute('aria-current'),null);
  await page.goBack();await flowLink.waitFor();assert.equal(await sections.first().getAttribute('aria-current'),'page');
  await page.setViewportSize({width:390,height:1000});await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('option',{name:'Question flow',exact:true}).click();await page.locator('.qf-page').waitFor();
  await page.locator('.qf-back').click();await page.locator('.kobo-mobile-workspace').waitFor();
  await page.close();
  console.log('PASS: three views, selection/search, choices, inherited conditions, metadata, warnings, keyboard, read-only requests, saved view, navigation, Arabic, light/dark, desktop/mobile');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
