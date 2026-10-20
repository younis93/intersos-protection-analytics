const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock,fixture}=require('./benchmark_kobo_scroll.cjs');
const base=process.argv[2]||'http://127.0.0.1:5358';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('request',request=>{if(request.url().includes('/api/')&&['POST','PUT','DELETE'].includes(request.method()))writes.push(request.url())});
 const calls=await mock(page,6,f=>{
  f.groups.push({id:'second',name:'second',label:'Section B / احتياجات المجتمع',labels:{en:'Section B'},parent:'',repeat:false});
  f.questions.forEach((q,i)=>{if(i){q.group='second';f.results[i].group='second'}});
  f.results[0].rows=Array.from({length:125},(_,i)=>({...f.results[0].rows[i%32],id:`a${i}`,label:`Answer ${i+1}`}));
  f.results[1].breakdowns=[];f.results[1].breakdownFields=[];
  f.results[2].breakdowns=f.results[2].breakdowns.slice(0,2).map(c=>({...c,labels:[c.labels[0]],values:[c.values[0]]}));f.results[2].breakdownFields=f.results[2].breakdownFields.slice(0,1);
  f.results[3].breakdowns=f.results[3].breakdowns.slice(0,2).map(c=>({...c,labels:c.labels.slice(0,2),values:c.values.slice(0,2)}));f.results[3].breakdownFields=f.results[3].breakdownFields.slice(0,2);
  f.settings.questions.q0={breakdownDisplay:'count'};f.settings.questions.q3={breakdownDisplay:'percent'};
  f.results[4].denominator=0;f.results[4].missing=320;f.results[4].rows=[];
  f.results[5].label=f.results[2].label='احتياجات المجتمع - '+('Long question title '.repeat(8));
 });
 await page.goto(base+'/#/kobo/scroll');const compare=page.getByRole('button',{name:'Compare q0',exact:true});await compare.waitFor();await page.waitForTimeout(750);
 const baseline=writes.length;assert.equal(calls(),1);
 await page.getByRole('textbox',{name:'Search questions',exact:true}).fill('q0');
 await compare.click();const dialog=page.getByRole('dialog',{name:'Compare questions',exact:true}),left=dialog.getByRole('region',{name:'Current question',exact:true}),right=dialog.getByRole('region',{name:'Comparison question',exact:true});
 // Sections have accessible names and native dialog modal focus containment.
 await dialog.waitFor();assert(await right.getByText('Choose a question to compare',{exact:true}).isVisible());
 assert.equal(await left.locator('tbody tr').count(),100);await left.getByRole('button',{name:/Show more answers/}).click();assert.equal(await left.locator('tbody tr').count(),125);
 assert.equal(await left.getByRole('button',{name:'# only',exact:true}).getAttribute('aria-pressed'),'true');
 const selector=right.getByRole('button',{name:'Select a question to compare',exact:true});
 async function select(id){await selector.click();const search=page.getByRole('textbox',{name:'Search comparison question',exact:true});await search.fill(id);const option=page.getByRole('option').filter({hasText:new RegExp(` · ${id}(?: · |$)`) });assert.equal(await option.count(),1);await option.click()}
 await selector.click();await page.getByRole('textbox',{name:'Search comparison question',exact:true}).fill('nothing-matches');assert(await page.getByText('No matching options',{exact:true}).isVisible());await page.keyboard.press('Escape');assert(await dialog.isVisible());
 await select('q3');assert.equal(await right.locator('.kobo-pivot-table').count(),1);assert.equal(await right.getByRole('button',{name:'% only',exact:true}).getAttribute('aria-pressed'),'true');assert(await right.getByText('Section B / احتياجات المجتمع',{exact:true}).isVisible());
 await right.getByRole('button',{name:'# and %',exact:true}).click();assert.equal(await left.getByRole('button',{name:'# only',exact:true}).getAttribute('aria-pressed'),'true');
 await right.getByRole('button',{name:'Sort by Answer',exact:true}).click();assert.equal(await right.locator('thead th[aria-sort=ascending]').count(),1);assert.equal(await left.locator('thead th[aria-sort=ascending]').count(),0);
 fs.mkdirSync('output/kobo-compare',{recursive:true});await dialog.locator('.kobo-compare-body').evaluate(el=>el.scrollTop=0);await dialog.screenshot({path:'output/kobo-compare/desktop.png'});
 await select('q1');assert.equal(await right.locator('thead tr').count(),1);assert.equal(await right.getByRole('group',{name:'Breakdown values'}).count(),0);
 await select('q2');assert.equal(await right.locator('thead tr').count(),2);
 await select('q4');assert(await right.getByText('No answered responses under the current filters.',{exact:true}).isVisible());assert.equal(await right.locator('tfoot tr').count(),1);
 await select('q5');assert.equal(await right.locator('thead tr').count(),4);
 await selector.click();await page.getByRole('textbox',{name:'Search comparison question',exact:true}).fill('Long question title');assert.equal(await page.getByRole('option').count(),2);await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await dialog.locator('.kobo-compare-body').evaluate(el=>el.scrollTop=0);await dialog.screenshot({path:'output/kobo-compare/mobile.png'});
 assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));const a=await left.boundingBox(),b=await right.boundingBox();assert(b.y>a.y+a.height-1);
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.documentElement.dataset.theme='glass-dark';document.querySelector('.kobo-compare').dir='rtl'});await dialog.screenshot({path:'output/kobo-compare/dark-rtl.png'});
 await dialog.getByRole('button',{name:'Close comparison'}).focus();await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert(await compare.evaluate(el=>el===document.activeElement));
 await compare.click();assert.equal(await left.locator('tbody tr').count(),100);assert.equal(await left.getByRole('button',{name:'# only',exact:true}).getAttribute('aria-pressed'),'true');assert(await right.getByText('Choose a question to compare',{exact:true}).isVisible());
 assert.equal(writes.length,baseline,'Comparison must not save or request analysis');assert.equal(calls(),1);
 await page.evaluate(()=>location.hash='#/home');await dialog.waitFor({state:'detached'});assert.deepEqual(errors,[]);
 // A one-question project has a useful, disabled selection state.
 const single=await browser.newPage();await mock(single,1);await single.goto(base+'/#/kobo/scroll');await single.getByRole('button',{name:'Compare q0',exact:true}).click();assert(await single.getByText('No other questions to compare',{exact:true}).isVisible());assert(await single.getByRole('button',{name:'Select a question to compare'}).isDisabled());
 // A pending analysis replaces both panels with one completed snapshot, including removal and Arabic UI.
 const updated=await browser.newPage();await mock(updated,2);await updated.goto(base+'/#/kobo/scroll');await updated.getByRole('button',{name:'Compare q0',exact:true}).waitFor();
 let release;await updated.route('**/projects/scroll/analysis',async route=>{await new Promise(resolve=>release=resolve);const f=fixture(2);f.settings.language='ar';f.results[1].label='نتائج التحليل المحدّثة';f.results[1].denominator=111;await route.fulfill({json:{total:320,filtered:320,questions:[f.results[1]],groups:f.groups,filterSummary:[],settings:f.settings}})});
 await updated.getByRole('button',{name:'Display options',exact:true}).click();await updated.getByRole('checkbox',{name:/Hide zero-count choices/}).check();await updated.keyboard.press('Escape');
 await updated.getByRole('button',{name:'Compare q0',exact:true}).click();await updated.getByRole('button',{name:'Select a question to compare'}).click();await updated.getByRole('textbox',{name:'Search comparison question'}).fill('q1');await updated.getByRole('option').filter({hasText:' · q1 · '}).click();
 assert(release);release();const arabic=updated.getByRole('dialog',{name:'مقارنة الأسئلة',exact:true});await arabic.waitFor();assert.equal(await arabic.getAttribute('dir'),'rtl');assert(await arabic.getByText('لم يعد هذا السؤال متاحاً في التحليل الحالي.',{exact:true}).isVisible());assert(await arabic.getByRole('heading',{name:'نتائج التحليل المحدّثة',exact:true}).isVisible());assert(await arabic.getByText('111',{exact:true}).isVisible());await arabic.screenshot({path:'output/kobo-compare/arabic.png'});
 console.log('Kobo comparison passed: independent pivots, 0-3 breakdowns, search, progressive rows, local state, no requests, empty/single states, mobile, RTL, keyboard, navigation.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exit(1)});
