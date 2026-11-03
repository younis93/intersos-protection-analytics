const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.QUESTION_FLOW_BASE||'http://127.0.0.1:5797';
const {id}=JSON.parse(fs.readFileSync('output/question-flow/fixture.json','utf8'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const [language,width,theme] of [['en',1600,'glass-light'],['ar',1440,'glass-dark'],['en',390,'glass-dark'],['ar',390,'glass-light']]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],mutations=[],t=(en,ar)=>language==='ar'?ar:en;
   page.on('pageerror',error=>errors.push(String(error)));
   page.on('request',request=>{if(request.method()!=='GET'&&request.url().includes('/api/'))mutations.push(request.url())});
   await page.route('**/api/*/export-recovery',route=>route.fulfill({json:[]}));
   await page.route('**/api/kobo/projects/*/question-flow',async route=>{
    const response=await route.fetch({url:route.request().url()+`?language=${language}`}),data=await response.json();
    data.groups[0].label=t('Section B: Disability, household circumstances and individual protection assistance requirements','القسم ب: الإعاقة وظروف الأسرة واحتياجات المساعدة الفردية في مجال الحماية');
    data.groups[1].label=t('Household members and their individual assistance requirements','أفراد الأسرة واحتياجات المساعدة الفردية الخاصة بهم');
    const template=data.questions[4];
    for(let i=0;i<18;i++)data.questions.push({...template,id:`review-${i}`,name:`review-${i}`,number:9+i,label:t(`Review question ${i+1}: Please describe the household member's circumstances and the type of support they need.`,`سؤال المراجعة ${i+1}: يرجى وصف ظروف فرد الأسرة ونوع الدعم الذي يحتاج إليه.`),group:'details/members',groupPath:['details','details/members'],metadata:false,type:'text',kind:'text',choices:[],connections:{parents:[],conditions:[],issues:[]}});
    data.groups.push({id:'empty-section',name:'empty-section',label:t('Additional notes','ملاحظات إضافية'),labels:{},parent:'',repeat:false,groupPath:[],connections:{parents:[],conditions:[],issues:[]}});
    await route.fulfill({json:data});
   });
   await page.addInitScript(({theme,id})=>{localStorage.setItem('app-theme',theme);localStorage.setItem(`kobo-question-flow-view:${id}`,'outline')},{theme,id});
   await page.goto(`${base}/#/kobo/${id}/question-flow`);
   const canvas=page.locator('.qf-canvas'),outline=page.locator('.qf-section-outline');await outline.waitFor();
   assert.equal(await canvas.locator('[role=treeitem]').count(),0,'main outline must have its own accessible section layout');
   const general=canvas.locator('[data-flow-item="@general"]');assert(await general.isVisible());
   const generalToggle=general.locator('>.qf-section-header .qf-section-toggle');await generalToggle.focus();await page.keyboard.press('Space');assert.equal(await generalToggle.getAttribute('aria-expanded'),'false');await page.keyboard.press('Enter');assert.equal(await generalToggle.getAttribute('aria-expanded'),'true');
   const group=canvas.locator('[data-flow-item="details"]'),nested=canvas.locator('[data-flow-item="details/members"]');
   assert(await nested.locator('>.qf-section-header .is-repeat').isVisible());
   assert.equal(await group.locator('>.qf-section-header .qf-section-details').count(),1);assert.equal(await canvas.locator('.qf-group-details').count(),0,'detached Details links');
   const follow=canvas.locator('[data-flow-item="follow"]');assert(await follow.locator('.is-conditional').isVisible());
   assert.equal(await canvas.locator('[data-flow-item="calculated"]').count(),0);
   await generalToggle.click();
   await page.screenshot({path:`output/question-flow/outline-sections-${language}-${width}.png`});
   await group.locator('>.qf-section-header .qf-section-details').click();await page.locator('.qf-details').waitFor();assert((await page.locator('#qf-details-title').innerText()).includes(t('Section B','القسم ب')));await page.locator('.qf-details header button').click();
   await follow.locator('.qf-section-question-button').click();await page.locator('.qf-details').waitFor();assert.equal(await page.locator('.qf-details .qf-choices li').count(),15);assert.equal(await follow.locator('.qf-section-question-button').getAttribute('aria-pressed'),'true');
   if(width>900){
    const later=canvas.locator('[data-flow-item="review-8"] .qf-section-question-button');await later.click();const before=await canvas.evaluate(node=>node.scrollTop);
    await canvas.locator('[data-flow-item="review-9"] .qf-section-question-button').click();assert(Math.abs(before-await canvas.evaluate(node=>node.scrollTop))<3,'selection reset reading position');
   }
   await page.locator('.qf-details header button').click();
   const issues=await outline.evaluate(root=>[...root.querySelectorAll('.qf-section-question')].flatMap(row=>{
    const title=row.querySelector('.qf-section-question-label'),copy=row.querySelector('.qf-section-question-copy'),menu=row.querySelector('.qf-section-menu'),number=row.querySelector('.qf-section-number');
    const label=title.getBoundingClientRect(),c=copy.getBoundingClientRect(),m=menu.getBoundingClientRect(),n=number.getBoundingClientRect(),rtl=getComputedStyle(row).direction==='rtl';
    const overlap=rtl?m.right>c.left+1:m.left<c.right-1;
    return title.scrollWidth>title.clientWidth+1||title.scrollHeight>title.clientHeight+1||overlap||label.width<70?[{text:title.textContent,labelWidth:label.width,overlap}]:[];
   }));assert.deepEqual(issues,[],'question labels/actions overlap or clip');
   const alignment=await outline.evaluate(root=>{const rows=[...root.querySelectorAll('[data-flow-item="details/members"]>.qf-section-body>.qf-section-question .qf-section-question-label')];const rtl=getComputedStyle(root).direction==='rtl';return rows.map(row=>{const r=row.getBoundingClientRect();return rtl?r.right:r.left})});assert(Math.max(...alignment)-Math.min(...alignment)<1,'question labels are not aligned');
   const search=page.locator('.qf-search input');await search.fill('not-a-question-xyz');assert(await page.getByText(t('No matching questions','لا توجد أسئلة مطابقة'),{exact:true}).isVisible());await page.getByRole('button',{name:t('Clear search','مسح البحث'),exact:true}).click();assert.equal(await search.inputValue(),'');
   await search.fill('follow');assert.equal(await canvas.locator('.qf-section-question').count(),1);await search.fill('');
   await follow.locator('.qf-section-menu>.app-select-trigger').click();await page.locator('.kobo-action-popup:popover-open').getByRole('button',{name:t('Hide','إخفاء'),exact:true}).click();assert.equal(await canvas.locator('[data-flow-item="follow"]').count(),0);await page.getByRole('button',{name:t('Show all','إظهار الكل'),exact:true}).click();
   await page.getByRole('button',{name:t('Collapse all','طي الكل'),exact:true}).click();assert.equal(await canvas.locator('.qf-section-question').count(),0);await page.getByRole('button',{name:t('Expand all','توسيع الكل'),exact:true}).click();assert.equal(await canvas.locator('[data-flow-item="calculated"]').count(),1);assert(await canvas.locator('[data-flow-item="empty-section"] .qf-section-empty').isVisible());
   await canvas.locator('[data-flow-item="unsupported"] .qf-section-question-button').click();assert(await page.locator('.qf-details .qf-review').isVisible());await page.locator('.qf-details header button').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page overflow');assert(await canvas.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'outline overflow');
   assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: section headers, aligned question rows, nested/repeat/general/technical sections, full labels, keyboard disclosures, selection/scroll, details, search/empty state, visibility, Arabic, themes, mobile, read-only requests');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
