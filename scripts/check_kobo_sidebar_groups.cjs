const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
const base=process.argv[2]||'http://127.0.0.1:5358';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let saves=0;
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/settings')&&r.method()!=='GET')saves++});
  const calls=await mock(page,150,f=>{
   f.groups.push({id:'services',label:'Services and community participation',parent:''},{id:'services/one',label:'التفاصيل - Nested questions',parent:'services'},{id:'services/two',label:'A second nested group with a very long descriptive label for reporting',parent:'services'},{id:'empty',label:'Empty group',parent:''});
   for(let i=0;i<35;i++)f.groups.push({id:`extra${i}`,label:`Additional group ${i+1}`,parent:''});
   f.results.forEach((q,i)=>{q.group=i<100?'g':i<103?'services/two':i<106?'services/one':i<110?'services':i<145?`extra${i-110}`:''});
   f.questions.forEach((q,i)=>q.group=f.results[i].group);
  });
  await page.goto(`${base}/#/kobo/scroll`);const nav=page.getByRole('navigation',{name:'Form groups',exact:true});await nav.waitFor();
  const jump=label=>nav.getByRole('button',{name:`Go to group: ${label}`,exact:true});
  assert.equal(await nav.locator('.kobo-sidebar-group-link').count(),40);
  assert.equal(await nav.getByText('Empty group',{exact:true}).count(),0);
  const labels=await nav.locator('.kobo-sidebar-group-link>span').allTextContents();
  assert.deepEqual(labels.slice(0,4),['Survey questions','Services and community participation','التفاصيل - Nested questions','A second nested group with a very long descriptive label for reporting']);assert.equal(labels.at(-1),'General');
  assert.equal(await page.getByRole('button',{name:'Services and community participation',exact:true}).getAttribute('aria-expanded'),'false');
  await page.getByRole('button',{name:'Collapse navigation for Services and community participation',exact:true}).click();assert.equal(await jump('التفاصيل - Nested questions').count(),0);
  await page.getByRole('button',{name:'Expand navigation for Services and community participation',exact:true}).click();
  const search=page.getByRole('textbox',{name:'Search questions',exact:true});await search.fill('q0');
  await jump('التفاصيل - Nested questions').click();await page.locator('#question-q103').waitFor();assert.equal(await search.inputValue(),'');
  await page.waitForFunction(()=>document.activeElement?.id==='kobo-group-services%2Fone');
  await page.waitForFunction(()=>document.querySelector('.kobo-sidebar-group-link[aria-current=location]')?.textContent.includes('التفاصيل'));
  assert.equal(await page.getByRole('button',{name:'Services and community participation',exact:true}).getAttribute('aria-expanded'),'true');
  assert.equal(await page.getByRole('button',{name:'التفاصيل - Nested questions',exact:true}).getAttribute('aria-expanded'),'true');
  const bounds=await page.evaluate(()=>({bar:document.querySelector('.kobo-analysis-toolbar').getBoundingClientRect().bottom,heading:document.activeElement.getBoundingClientRect().top}));assert(bounds.heading>=bounds.bar-1,JSON.stringify(bounds));
  assert((await page.getByRole('button',{name:'Navigate questions',exact:true}).innerText()).includes('التفاصيل'));
  await jump('General').focus();await page.keyboard.press('Enter');await page.locator('#question-q145').waitFor();
  await page.waitForFunction(()=>document.querySelector('.kobo-sidebar-group-link[aria-current=location]')?.textContent.includes('General'));
  await page.getByRole('button',{name:'Navigate questions',exact:true}).click();await page.locator('.kobo-nav-group').filter({hasText:'Survey questions'}).click();
  await page.waitForFunction(()=>document.querySelector('.kobo-sidebar-group-link[aria-current=location]')?.textContent.includes('Survey questions'));
  // Scrolling to a closed group heading updates both navigation controls without opening it.
  await page.locator('#kobo-group-services').evaluate(node=>node.scrollIntoView({block:'start'}));
  await page.waitForFunction(()=>document.querySelector('.kobo-sidebar-group-link[aria-current=location]')?.textContent.includes('Services and community'));
  const fixed=await page.locator('.sidebar>.legal-sidebar-utilities').boundingBox();await nav.evaluate(node=>node.scrollTop=node.scrollHeight);
  assert.deepEqual(await page.locator('.sidebar>.legal-sidebar-utilities').boundingBox(),fixed);
  assert(await nav.evaluate(node=>node.scrollHeight>node.clientHeight));
  assert.equal(calls(),1);assert.equal(saves,0);
  fs.mkdirSync('output/kobo-sidebar-groups',{recursive:true});await nav.evaluate(node=>node.scrollTop=0);
  await page.screenshot({path:'output/kobo-sidebar-groups/desktop.png'});
  for(const theme of ['glass-dark','unhcr','executive']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert(await nav.isVisible());await page.screenshot({path:`output/kobo-sidebar-groups/${theme}.png`});}
  await page.evaluate(()=>{document.documentElement.dataset.theme='glass-light';document.querySelector('.kobo-shell').dir='rtl';document.querySelector('.kobo-sidebar-groups').dir='rtl'});await page.screenshot({path:'output/kobo-sidebar-groups/rtl.png'});
  await page.getByRole('button',{name:'Slide menu left',exact:true}).click();assert(await nav.isHidden());assert(await page.getByRole('button',{name:'Navigate questions',exact:true}).isVisible());
  await page.getByRole('button',{name:'Expand menu',exact:true}).click();assert(await nav.isVisible());
  await page.setViewportSize({width:390,height:844});assert(await nav.isHidden());assert(await page.getByRole('button',{name:'Navigate questions',exact:true}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'output/kobo-sidebar-groups/mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>location.hash='#/kobo');await page.getByRole('heading',{name:'Your Kobo projects'}).waitFor();assert.equal(await page.locator('.kobo-sidebar-group-link').count(),0);
  await page.evaluate(()=>location.hash='#/kobo/scroll');await nav.waitFor();assert.equal(await page.getByRole('button',{name:'Services and community participation',exact:true}).getAttribute('aria-expanded'),'false');
  assert.deepEqual(errors,[]);console.log('PASS: sidebar ordering, counts, empty groups, nested branches, search clearing, jumps/focus/offset, shared active state, independent scrolling, keyboard, themes, RTL, responsive modes, no navigation saves/analysis, and project reset.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
