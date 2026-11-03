const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.QUESTION_FLOW_BASE||'http://127.0.0.1:5797',fixture=JSON.parse(fs.readFileSync('output/question-flow/fixture.json','utf8'));
const wait=page=>page.waitForTimeout(450);
async function until(check){for(let i=0;i<160;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Large form state did not settle')}
async function viewport(page){return page.locator('.react-flow__viewport').evaluate(node=>{const m=new DOMMatrixReadOnly(getComputedStyle(node).transform);return {x:m.e,y:m.f,zoom:m.a}})}
function same(a,b){for(const k of ['x','y','zoom'])assert(Math.abs(a[k]-b[k])<.15,`${k}: ${a[k]} -> ${b[k]}`)}
function large(data,count,language){
 const t=(en,ar)=>language==='ar'?ar:en,empty={parents:[],conditions:[],issues:[]},template=data.questions[0];
 data.name=t('Household protection assessment','تقييم حماية الأسرة');
 data.groups=[{id:'form',name:'form',label:data.name,labels:{},parent:'',repeat:false,groupPath:[],connections:empty},...Array.from({length:5},(_,i)=>({id:`form/s${i}`,name:`s${i}`,label:t(`Section ${i+1}: Household circumstances and protection assistance requirements`,`القسم ${i+1}: ظروف الأسرة واحتياجات المساعدة والحماية`),labels:{},parent:'form',repeat:i===2,groupPath:['form'],connections:empty}))];
 const size=Math.ceil((count-1)/5);
 data.questions=Array.from({length:count},(_,i)=>{const section=`form/s${Math.min(4,Math.floor((i-1)/size))}`;return {...template,id:`q${i}`,name:`q${i}`,number:i+1,label:t(`Question ${i+1}: What support does this household member need?`,`السؤال ${i+1}: ما نوع الدعم الذي يحتاجه فرد الأسرة؟`),group:i?section:'',groupPath:i?['form',section]:[],metadata:i===count-1,connections:empty}});
 const edge=(source,target,id,compound=false)=>({id,source:`q${source}`,target:typeof target==='number'?`q${target}`:target,label:t(`Question ${source+1} = Yes`,`السؤال ${source+1} = نعم`),expression:`\${q${source}} = 'yes'`,review:false,compound});
 data.edges=[edge(1,2,'cycle1'),edge(2,1,'cycle2'),edge(1,size+1,'cross1'),edge(2,size+2,'cross2'),edge(3,size+3,'cross3')];
 for(let i=0;i<5;i++)data.edges.push(edge(0,`form/s${i}`,`group-${i}`));
 for(let i=4;i<count;i+=4)if(data.questions[i-1].group===data.questions[i].group)data.edges.push(edge(i-1,i,`edge-${i}`,i%8===0));
 for(const q of data.questions){const incoming=data.edges.filter(e=>e.target===q.id);q.connections={parents:incoming.map(e=>({id:e.source,name:e.source,label:e.source,hidden:false,compatible:true,triggers:['Yes']})),conditions:incoming.map(e=>({source:q.id,expression:e.expression,readable:e.label,supported:true})),issues:q.id==='q1'||q.id==='q2'?['cyclic-dependency']:[]}}
 return {...data,language};
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const [count,language,width,theme,reject] of [[99,'en',1600,'glass-light',false],[250,'ar',1440,'glass-dark',false],[99,'en',390,'glass-dark',true],[99,'ar',390,'glass-light',true]]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],mutations=[],t=(en,ar)=>language==='ar'?ar:en;
   page.on('pageerror',error=>errors.push(String(error)));page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/'))mutations.push(r.url())});
   await page.route('**/api/*/export-recovery',route=>route.fulfill({json:[]}));
   await page.route('**/api/kobo/projects/*/question-flow',async route=>{const response=await route.fetch();await route.fulfill({json:large(await response.json(),count,language)})});
   await page.addInitScript(({theme,reject})=>{localStorage.setItem('app-theme',theme);if(reject)HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new Error('Fullscreen unavailable'))},{theme,reject});
   await page.goto(`${base}/#/kobo/${fixture.id}/question-flow`);
   await page.locator('.react-flow__node').first().waitFor();await until(async()=>!(await page.locator('.qf-canvas').innerText()).includes(t('Arranging questions','جار ترتيب الأسئلة')));await wait(page);
   assert.equal(await page.locator('.qf-flow-mode button').first().getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.react-flow__node[data-id="q1"]').count(),0);
   assert.equal(await page.getByText('Multiple conditions',{exact:true}).count(),0);
   assert((await viewport(page)).zoom>=.85,'initial cards should stay readable');
   await page.locator('.react-flow__controls-fitview').click();await wait(page);
   const badge=page.getByRole('button',{name:t('3 connections','3 روابط'),exact:true});await badge.click();const connections=page.locator('.qf-connection-details');await connections.waitFor();assert.equal(await connections.locator('section').count(),3);assert((await connections.innerText()).includes('${q1}'));await connections.locator('header button').click();
   await page.locator('.qf-flow-mode button').nth(1).click();await wait(page);await until(async()=>!(await page.locator('.qf-canvas').innerText()).includes(t('Arranging questions','جار ترتيب الأسئلة')));await page.locator('.react-flow__controls-fitview').click();await wait(page);assert.equal(await page.locator('.qf-navigation [data-flow-item="form/s0"]>.qf-tree-row [role=treeitem]').getAttribute('aria-expanded'),'true');assert(await page.locator('.react-flow__node[data-id^="q"]').count()>8,'All questions should expand the sections');await page.locator('.qf-flow-mode button').first().click();await wait(page);await page.locator('.react-flow__controls-fitview').click();await wait(page);assert.equal(await page.locator('.react-flow__node[data-id="q1"]').count(),0);
   const overviewViewport=await viewport(page);
   await page.locator('.react-flow__node[data-id="form/s0"] .qf-node-open-section').click();await page.locator('.qf-focus-breadcrumb').waitFor();await until(async()=>await page.locator('.react-flow__node[data-id="q1"]').count()>0);await wait(page);
   assert((await viewport(page)).zoom>=.85);assert.equal(await page.locator('.react-flow__node[data-id="q90"]').count(),0);
   await page.locator('.qf-focus-breadcrumb button').click();await wait(page);same(overviewViewport,await viewport(page));
   if(width<=900)await page.locator('.qf-navigation-toggle').click();
   const hiddenGroup=page.locator('.qf-navigation [data-flow-item="form/s4"]>.qf-tree-row');await hiddenGroup.locator('.qf-item-actions>.app-select-trigger').click();await page.locator('.kobo-action-popup:popover-open').getByRole('button',{name:t('Hide','إخفاء'),exact:true}).click();await wait(page);
   const sectionMenu=page.locator('.qf-navigation [data-flow-item="form/s0"]>.qf-tree-row .qf-item-actions>.app-select-trigger');await sectionMenu.click();await page.locator('.kobo-action-popup:popover-open').getByRole('button',{name:t('Open section','فتح القسم'),exact:true}).click();await page.locator('.qf-focus-breadcrumb').waitFor();await wait(page);await page.locator('.qf-focus-breadcrumb button').click();await wait(page);
   if(width<=900)await page.locator('.qf-navigation-toggle').click();assert(await hiddenGroup.locator('.qf-hidden-badge').isVisible(),'section focus must preserve hidden items');if(width<=900)await page.locator('.qf-navigation-toggle').click();await page.getByRole('button',{name:t('Show all','إظهار الكل'),exact:true}).click();await wait(page);

   const pane=await page.locator('.react-flow__viewport').elementHandle(),before=await viewport(page);
   await page.locator('.qf-fullscreen-toggle').click();await page.locator('.qf-page.qf-fullscreen').waitFor();await wait(page);same(before,await viewport(page));assert(await page.locator('.qf-toolbar').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'fullscreen toolbar overflow');
   assert(await page.evaluate(node=>node===document.querySelector('.react-flow__viewport'),pane),'fullscreen remounted diagram');
   assert.equal(await page.locator('.qf-navigation').isVisible(),false);assert(await page.locator('.qf-canvas').evaluate(node=>{const r=node.getBoundingClientRect();return r.width>innerWidth-35&&r.height>innerHeight*.55}));
   assert.equal(await page.evaluate(()=>!!document.fullscreenElement),!reject);
   await page.locator('.qf-view-label .app-select-trigger').focus();await page.keyboard.press('ArrowDown');await page.getByRole('listbox').waitFor();assert(await page.getByRole('listbox').evaluate(node=>!!node.closest('.qf-fullscreen-host')));if(reject){await page.keyboard.press('Escape');assert(await page.locator('.qf-page.qf-fullscreen').isVisible());await page.locator('.qf-view-label .app-select-trigger').click();await page.getByRole('listbox').waitFor()}await page.getByRole('option',{name:t('Flowchart','مخطط التدفق'),exact:true}).click();
   await page.locator('.react-flow__controls-fitview').click();await wait(page);await badge.click();await connections.waitFor();await page.evaluate(()=>document.querySelector('.qf-connection-details').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await connections.waitFor({state:'detached'});assert(await page.locator('.qf-page.qf-fullscreen').isVisible());
   await page.screenshot({path:`output/question-flow/fullscreen-overview-${language}-${width}-${count}.png`});
   await page.locator('.react-flow__node[data-id="form/s0"] .qf-node-open-section').click();await until(async()=>await page.locator('.react-flow__node[data-id="q1"]').count()>0);await wait(page);
   await page.locator('.react-flow__node[data-id="q1"] .qf-node-main').click();const details=page.locator('.qf-details');await details.waitFor();assert(await details.evaluate(node=>!!node.closest('.qf-fullscreen-host')));assert.equal(await details.getAttribute('role'),'dialog');
   if(!reject){await page.evaluate(()=>document.exitFullscreen());await until(async()=>await page.locator('.qf-page.qf-fullscreen').count()===0);assert(await details.isVisible());await details.locator('header button').click();}
   else{await page.keyboard.press('Escape');await details.waitFor({state:'detached'});assert(await page.locator('.qf-page.qf-fullscreen').isVisible());await page.keyboard.press('Escape');await until(async()=>await page.locator('.qf-page.qf-fullscreen').count()===0)}
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.equal(await page.evaluate(()=>document.getElementById('root')?.inert||false),false);
   await page.locator('.qf-focus-breadcrumb button').click();await wait(page);
   await page.locator('.qf-view-label .app-select-trigger').click();await page.getByRole('option',{name:t('Mind map','خريطة ذهنية'),exact:true}).click();await wait(page);const mindBefore=await viewport(page);await page.locator('.qf-fullscreen-toggle').click();await page.locator('.qf-page.qf-fullscreen').waitFor();await wait(page);same(mindBefore,await viewport(page));await page.locator('.qf-fullscreen-toggle').click();await until(async()=>await page.locator('.qf-page.qf-fullscreen').count()===0);
   assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.close();
  }
  console.log('PASS: 99/250 questions, overview/focus/return, routed aggregate rules, readable scale, fullscreen native/fallback, stable canvas/viewport, host-contained menus/details, Escape, browser exit, Mind map, Arabic, mobile, read-only');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
