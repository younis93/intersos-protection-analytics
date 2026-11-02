const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='output/kobo-answer-actions';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const theme of process.env.ANSWER_ACTION_SMOKE?['glass-light']:['glass-light','glass-dark'])for(const width of process.env.ANSWER_ACTION_SMOKE?[390]:[1440,390])for(const language of process.env.ANSWER_ACTION_SMOKE?['en']:['en','ar']){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(theme=>{localStorage.setItem('app-theme',theme);window.__copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.__copies.push(value),write:async value=>window.__copies.push(value)}})},theme);
  let settings={version:1,language,filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:false,hideZero:false,hideEmpty:false,questionSort:'form',questions:{q:{hiddenAnswers:[],answerSort:'form'}},viewMode:'charts'},readonly=false,large=false;
  const labels=['Children under 18','Older person (60+)','شخص ذو إعاقة','Person with a serious or long-term health condition requiring ongoing care','Pregnant or breastfeeding woman','None of these'];
  const rows=()=>[...labels.map((label,index)=>({id:`a${index}`,label,count:10+index,percent:10+index})),{id:'__blank__',label:'No response',count:0,percent:0},...(large?Array.from({length:150},(_,index)=>({id:`extra${index}`,label:`Answer ${index}`,count:1,percent:1})):[])];
  const q=()=>({id:'q',name:'q',labels:{en:'Household members',ar:'أفراد الأسرة'},kind:'category',type:'select_one answers',group:'',repeat:'',metadata:false,identifying:false,editable:!readonly,choices:rows().filter(r=>r.id!=='__blank__').map(row=>({name:row.id,labels:{en:row.label,ar:row.label}}))});
  await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let response={};
   if(path.endsWith('/projects/actions'))response={id:'actions',name:'Answer actions',form:{questions:[q()],groups:[],language,warnings:[]},settings,warnings:[],issues:[],importNotes:[]};
   else if(path.endsWith('/analysis')){const current=req.postDataJSON().settings;response={total:100,filtered:100,settings:current,groups:[],filterSummary:[],questions:[{...q(),label:'Household members',answerSort:'form',denominator:100,missing:0,total:100,rows:rows().filter(r=>!current.questions.q?.hiddenAnswers?.includes(r.id)),statistics:{},bins:[],breakdowns:[],percentageBasis:'Respondents',chart:'bar',colors:{}}]};}
   else if(path.endsWith('/answers/q'))response=rows().filter(row=>row.id!=='__blank__').map(row=>({id:row.id,label:row.label,count:row.count}));
   else if(path.endsWith('/settings')){settings=req.postDataJSON();response=settings;}
   else if(path.endsWith('/projects'))response=[{id:'actions',name:'Answer actions',updated:'2026-11-02'}];
   else if(path.endsWith('/export-recovery'))response=[];
   await route.fulfill({json:response});
  });
  await page.goto('http://127.0.0.1:5298/#/kobo/actions');
  const pivot=page.locator('.kobo-pivot-table').first(),buttons=pivot.locator('.kobo-answer-menu-trigger');await buttons.first().waitFor();
  assert.equal(await buttons.count(),7);assert.equal(await pivot.locator('tfoot .kobo-answer-menu-trigger').count(),0);
  assert.equal(await pivot.locator('.kobo-answer-edit-shortcut').count(),0);
  const boxes=await buttons.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),cell=node.closest('th').getBoundingClientRect();return{x:r.x,right:r.right,width:r.width,cellLeft:cell.left,cellRight:cell.right,opacity:getComputedStyle(node).opacity}}));
  assert(boxes.every(box=>Math.abs(box.x-boxes[0].x)<1));assert(boxes.every(box=>box.width===30&&box.opacity==='1'));
  assert(boxes.every(box=>language==='ar'?box.x-box.cellLeft<30:box.cellRight-box.right<30),JSON.stringify(boxes));
  await pivot.screenshot({path:`${out}/table-${theme}-${width}-${language}.png`});
  const first=buttons.first();await first.click();let menu=page.getByRole('menu',{name:`Answer options: ${labels[0]}`,exact:true});
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Rename answer','Manage answers','Hide answer','Unhide all answers']);
  assert(await menu.getByRole('menuitem',{name:'Unhide all answers',exact:true}).isDisabled());assert.equal(await menu.getByRole('separator').count(),1);
  assert.equal(await page.evaluate(()=>window.__copies.length),0);assert.equal(await page.getByRole('dialog').count(),0);
  await page.keyboard.press('End');assert(await menu.getByRole('menuitem',{name:'Hide answer',exact:true}).evaluate(e=>e===document.activeElement));
  await page.keyboard.press('Home');assert(await menu.getByRole('menuitem',{name:'Rename answer',exact:true}).evaluate(e=>e===document.activeElement));
  await menu.screenshot({path:`${out}/menu-${theme}-${width}-${language}.png`});
  await page.keyboard.press('Escape');assert(await first.evaluate(e=>e===document.activeElement));assert.equal(await page.getByRole('menu').count(),0);
  await first.press('ArrowDown');await page.keyboard.press('Tab');await page.getByRole('menu').waitFor({state:'detached'});await first.press('ArrowDown');await page.getByRole('menuitem',{name:'Rename answer',exact:true}).click();
  const manager=page.getByRole('dialog',{name:'Manage answers',exact:true});const input=manager.getByRole('textbox',{name:'New answer label',exact:true});await input.waitFor();assert.equal(await input.inputValue(),labels[0]);assert(await input.evaluate(e=>e===document.activeElement));
  await manager.getByRole('button',{name:'Cancel',exact:true}).click();assert(await first.evaluate(e=>e===document.activeElement));
  await first.scrollIntoViewIfNeeded();await first.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await first.click();await page.getByRole('menuitem',{name:'Manage answers',exact:true}).click();await manager.waitFor();assert.equal(await input.count(),0);assert.equal(await manager.getByRole('checkbox').count(),0);await manager.getByRole('button',{name:'Cancel',exact:true}).click();
  // Right-click uses the same menu. Menu placement stays inside the viewport.
  await pivot.locator('.kobo-answer-label').first().click({button:'right'});await menu.waitFor();const rect=await menu.boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=1000);
  await page.keyboard.press('Escape');await first.press('Shift+F10');await menu.waitFor();await page.keyboard.press('Escape');
  // Blank answers offer general management, without a misleading rename action.
  await pivot.getByRole('button',{name:'Answer options: No response',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'Rename answer',exact:true}).count(),0);assert.equal(await page.getByRole('menuitem',{name:'Manage answers',exact:true}).count(),1);await page.keyboard.press('Escape');
  await first.click();await menu.getByRole('menuitem',{name:'Hide answer',exact:true}).click();await pivot.getByRole('button',{name:`Answer options: ${labels[0]}`,exact:true}).waitFor({state:'detached'});
  await buttons.first().click();await page.getByRole('menuitem',{name:'Unhide all answers',exact:true}).click();await pivot.getByRole('button',{name:`Answer options: ${labels[0]}`,exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__copies.length),0);assert.equal(await pivot.locator('.kobo-selection-summary').count(),0);
  // Clicking outside, scrolling, and resizing dismiss the menu.
  await buttons.first().click();await page.getByRole('heading',{name:'Answer actions',exact:true}).click();assert.equal(await page.getByRole('menu').count(),0);
  await buttons.first().click();await buttons.first().evaluate(e=>{let scroller=e.parentElement;while(scroller&&scroller.scrollHeight<=scroller.clientHeight)scroller=scroller.parentElement;if(scroller)scroller.scrollTop+=20});await page.getByRole('menu').waitFor({state:'detached'});
  await buttons.first().click();await page.setViewportSize({width,height:990});await page.getByRole('menu').waitFor({state:'detached'});
  readonly=true;await page.reload();await buttons.first().click();assert.deepEqual(await page.getByRole('menu').getByRole('menuitem').allTextContents(),['Hide answer','Unhide all answers']);await page.keyboard.press('Escape');
  readonly=false;large=true;await page.reload();await buttons.first().waitFor();await page.getByRole('button',{name:/Show more answers/}).click();
  assert(await buttons.count()<157);await buttons.first().click();await page.getByRole('menuitem',{name:'Manage answers',exact:true}).click();await manager.waitFor();await manager.getByRole('button',{name:'Cancel',exact:true}).click();
  await buttons.nth(1).focus();await page.keyboard.press('Shift+Tab');await page.waitForFunction(()=>document.activeElement?.closest('[data-window-index]')?.getAttribute('data-window-index')==='0');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',theme,width,language,'fixed alignment, menu actions, Rename/Manage routing, blank/read-only/virtual rows, keyboard/focus, visibility, bounds, no copy or drilldown');
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
