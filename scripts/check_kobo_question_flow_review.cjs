const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.QUESTION_FLOW_BASE||'http://127.0.0.1:5797';
const {id}=JSON.parse(fs.readFileSync('output/question-flow/fixture.json','utf8'));
async function until(check){for(let i=0;i<120;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Review state did not settle')}
const pause=page=>page.waitForTimeout(350);
async function transform(page){return page.locator('.react-flow__viewport').evaluate(node=>{const m=new DOMMatrixReadOnly(getComputedStyle(node).transform);return {x:m.e,y:m.f,zoom:m.a}})}
function sameViewport(before,after){for(const key of ['x','y','zoom'])assert(Math.abs(before[key]-after[key])<.1,`${key} changed: ${before[key]} to ${after[key]}`)}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const [language,width,theme] of [['en',1600,'glass-light'],['ar',1440,'glass-dark'],['en',390,'glass-dark'],['ar',390,'glass-light']]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],mutations=[];
   const t=(en,ar)=>language==='ar'?ar:en;
   page.on('pageerror',error=>errors.push(String(error)));
   page.on('request',request=>{if(request.method()!=='GET'&&request.url().includes('/api/'))mutations.push(request.url())});
   await page.route('**/api/*/export-recovery',route=>route.fulfill({json:[]}));
   await page.route('**/api/kobo/projects/*/question-flow',async route=>{
    const response=await route.fetch({url:route.request().url()+`?language=${language}`}),data=await response.json();
    data.groups[0].label=t('Section A: Target population screening, household characteristics and protection support needs for vulnerable families','القسم أ: فحص الفئات المستهدفة وخصائص الأسرة واحتياجات الدعم والحماية للأسر الضعيفة');
    data.groups[1].label=t('Household members and their individual assistance requirements','أفراد الأسرة واحتياجات المساعدة الفردية الخاصة بهم');
    const original=data.questions[2];
    for(let i=0;i<25;i++)data.questions.push({...original,id:`extra-${i}`,name:`extra-${i}`,number:9+i,label:t(`Additional review question ${i+1}`,`سؤال مراجعة إضافي ${i+1}`),group:'',groupPath:[],relevant:'',connections:{parents:[],conditions:[],issues:[]}});
    await route.fulfill({json:data});
   });
   await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
   await page.goto(`${base}/#/kobo/${id}/question-flow`);
   await page.locator('.react-flow__node[data-id="main"]').waitFor();await pause(page);
   const changeView=async key=>{await page.locator('.qf-view-label .app-select-trigger').click();await page.getByRole('option',{name:{flowchart:t('Flowchart','مخطط التدفق'),mindmap:t('Mind map','خريطة ذهنية'),outline:t('Outline','قائمة هرمية')}[key],exact:true}).click();await pause(page)};
   if(width<1250)await page.locator('.qf-navigation-toggle').click();
   const nav=page.locator('.qf-navigation');await nav.waitFor();
   const viewTrigger=page.locator('.qf-view-label .app-select-trigger');await viewTrigger.focus();await page.keyboard.press('ArrowDown');await page.getByRole('listbox').waitFor();await page.keyboard.press('Escape');assert(await viewTrigger.evaluate(node=>node===document.activeElement));
   const firstMenu=nav.locator('[data-flow-item="main"] > .qf-tree-row .qf-item-actions>.app-select-trigger');await firstMenu.focus();await page.keyboard.press('ArrowDown');await page.locator('.kobo-action-popup:popover-open').waitFor();await page.keyboard.press('End');assert(await page.locator('.kobo-action-popup:popover-open button').last().evaluate(node=>node===document.activeElement));await page.keyboard.press('Escape');assert(await firstMenu.evaluate(node=>node===document.activeElement));
   const action=async(key,kind)=>{
    const row=nav.locator(`[data-flow-item="${key}"] > .qf-tree-row`);
    await row.locator('.qf-item-actions>.app-select-trigger').click();
    await page.locator('.kobo-action-popup:popover-open').getByRole('button',{name:{show:t('Show','إظهار'),hide:t('Hide','إخفاء'),only:t('Show only','إظهار فقط')}[kind],exact:true}).click();
    await pause(page);
   };
   if(width>900){
    const canvas=page.locator('.qf-canvas'),bounds=await canvas.boundingBox();await page.mouse.move(bounds.x+bounds.width-60,bounds.y+100);
    const initial=await transform(page),pageY=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,240);await pause(page);const vertical=await transform(page);
    assert(Math.abs(initial.y-vertical.y)>30);assert.equal(initial.zoom,vertical.zoom);assert.equal(await page.evaluate(()=>scrollY),pageY);
    await page.mouse.wheel(140,0);await pause(page);const horizontal=await transform(page);assert(Math.abs(horizontal.x-vertical.x)>30);assert.equal(horizontal.zoom,vertical.zoom);
    await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await page.waitForTimeout(500);assert((await transform(page)).zoom>horizontal.zoom,'pinch-style wheel must zoom');
    const beforeCollapse=await transform(page);await page.getByRole('button',{name:t('Collapse all','طي الكل'),exact:true}).click();await pause(page);sameViewport(beforeCollapse,await transform(page));
    await page.getByRole('button',{name:t('Expand all','توسيع الكل'),exact:true}).click();await pause(page);sameViewport(beforeCollapse,await transform(page));
    const beforeSidebar=await transform(page),r=await nav.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+120);await page.mouse.wheel(0,300);await pause(page);assert(await nav.evaluate(node=>node.scrollTop>0));sameViewport(beforeSidebar,await transform(page));
   }
   const beforeHide=await transform(page);await action('details','hide');sameViewport(beforeHide,await transform(page));
   assert(await nav.locator('[data-flow-item="details"] > .qf-tree-row .qf-hidden-badge').isVisible());
   await changeView('outline');assert.equal(await page.locator('.qf-canvas [data-flow-item="details"]').count(),0);
   await action('follow','show');assert.equal(await page.locator('.qf-canvas [data-flow-item="follow"]').count(),1);assert.equal(await page.locator('.qf-canvas [data-flow-item="age"]').count(),0);
   await action('details','show');assert.equal(await page.locator('.qf-canvas [data-flow-item="age"]').count(),1);
   await action('follow','only');assert.equal(await page.locator('.qf-canvas .qf-section-question-button').count(),2);assert.equal(await page.locator('.qf-canvas [data-flow-item="main"]').count(),1);
   await changeView('mindmap');assert((await page.locator('.qf-visibility-count').innerText()).startsWith('2 / 33'));
   await changeView('outline');assert.equal(await page.locator('.qf-canvas .qf-section-question-button').count(),2);
   await page.getByRole('button',{name:t('Show all','إظهار الكل'),exact:true}).click();await page.getByRole('button',{name:t('Expand all','توسيع الكل'),exact:true}).click();assert.equal(await page.locator('.qf-canvas .qf-section-question-button').count(),33);
   await action('details','only');await changeView('flowchart');await page.getByRole('button',{name:t('Collapse all','طي الكل'),exact:true}).click();await pause(page);
   await page.locator('.react-flow__controls-fitview').click();await pause(page);
   const group=page.locator('.react-flow__node[data-id="details"]');await group.waitFor();
   assert(await group.evaluate(node=>{const title=node.querySelector('.qf-node-main>strong'),count=node.querySelector('.qf-node-main>small'),details=node.querySelector('.qf-node-group-details');const titleRect=title.getBoundingClientRect(),countRect=count.getBoundingClientRect(),detailsRect=details.getBoundingClientRect(),rect=node.getBoundingClientRect();return title.scrollHeight<=title.clientHeight+1&&titleRect.bottom<=countRect.top+1&&countRect.bottom<=detailsRect.top+1&&detailsRect.bottom<=rect.bottom+1}),'collapsed group title/footer clipped');
   await page.screenshot({path:`output/question-flow/review-collapsed-${language}-${width}.png`});
   await group.locator('.qf-node-main').click();await pause(page);await page.locator('.react-flow__controls-fitview').click();await pause(page);
   const nested=page.locator('.react-flow__node[data-id="details/members"]');await nested.waitFor();const header=await group.locator('.qf-node-main').boundingBox(),child=await nested.boundingBox();assert(child.y>=header.y+header.height-1,'child overlaps expanded group header');
   await nested.locator('.qf-node-main').click();await pause(page);await page.locator('.react-flow__controls-fitview').click();await pause(page);
   await page.locator('.react-flow__node[data-id="follow"] .qf-node-main').click();await page.locator('.qf-details').waitFor();assert((await page.locator('.qf-details #qf-details-title').innerText()).includes(t('What type','ما نوع')));await page.locator('.qf-details header button').click();
   await action('main','hide');await page.reload();await page.locator('.qf-toolbar').waitFor();assert(await page.getByRole('button',{name:t('Show all','إظهار الكل'),exact:true}).isDisabled(),'visibility must reset after leaving/reloading');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal page overflow');
   assert.deepEqual(mutations,[],'review controls must remain read-only');assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS: independent two-axis pan, pinch zoom, preserved viewport, hide/show/show-only, inherited connections, all three views, reset, long titles and headers, Arabic, mobile, themes, read-only requests');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
