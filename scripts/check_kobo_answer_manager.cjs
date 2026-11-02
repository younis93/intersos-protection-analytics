const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const clone=value=>JSON.parse(JSON.stringify(value));
const out='output/kobo-answer-manager';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{for(const theme of ['glass-light','glass-dark'])for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
  const original=[{id:'yes',label:'Yes',count:67},{id:'no',label:'No',count:277},{id:'refuse',label:'Prefer not to answer',count:0},{id:'shared1',label:'Shared',count:0},{id:'shared2',label:'Shared',count:0}];
  let options=clone(original),revision=0,history=[],lastPreview=null,previewCount=0,applyCount=0,failPreview=false,failApply=false,large=false;
  const caption='16. Is any household member currently separated, detained, missing or living in another location because of displacement?';
  const settings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:false,hideEmpty:false,questionSort:'form',questions:{},viewMode:'charts'};
  const question=()=>({id:'answer',name:'answer',labels:{en:caption},kind:'category',type:'select_one answers',repeat:'',group:'',metadata:false,identifying:false,choices:options.map(option=>({name:option.id,labels:{en:option.label}}))});
  const project=()=>({id:'answer-project',name:'Answer manager',form:{questions:[question()],groups:[],language:'en',warnings:[]},settings,warnings:[],issues:[],importNotes:[],dataRevision:revision,canUndoEdit:history.length>0});
  const preview=operation=>{
   const existing=options.find(option=>option.id===operation.target)||options.find(option=>option.label===operation.label),target=existing?.id||operation.sources[0];
   let after=options.filter(option=>!operation.sources.includes(option.id)||option.id===target).map(option=>option.id===target?{...option,label:operation.label,count:options.filter(o=>operation.sources.includes(o.id)||o.id===target).reduce((n,o)=>n+o.count,0)}:option);
   if(!after.some(o=>o.id===target))after.push({id:target,label:operation.label,count:options.filter(o=>operation.sources.includes(o.id)).reduce((n,o)=>n+o.count,0)});
   return {revision,signature:JSON.stringify(operation),affectedRecords:operation.destination==='new'?344:operation.sources.length>1?344:0,field:'answer',options:after,beforeOptions:options,impacts:[]};
  };
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let body={};
   if(path.endsWith('/answers/answer'))body=large?[...clone(original),...Array.from({length:240},(_,index)=>({id:`option${index}`,label:`Option ${index}`,count:index}))]:options;
   else if(path.endsWith('/edits/preview')){lastPreview=req.postDataJSON();previewCount++;if(failPreview){failPreview=false;await route.fulfill({status:400,json:{detail:'Preview failed. Please retry.'}});return}body=preview(lastPreview.operation);}
   else if(path.endsWith('/edits/apply')){const request=req.postDataJSON();assert.equal(request.signature,JSON.stringify(request.operation));applyCount++;if(failApply){failApply=false;await route.fulfill({status:409,json:{detail:'Save failed. Your draft is still available.'}});return}history.push(clone(options));options=preview(request.operation).options;revision++;body=project();}
   else if(path.endsWith('/edits/undo')){options=history.pop();revision++;body=project();}
   else if(path.endsWith('/projects/answer-project'))body=project();
   else if(path.endsWith('/analysis'))body={total:344,filtered:344,settings,groups:[],filterSummary:[],questions:[{...question(),label:caption,denominator:344,missing:0,total:344,rows:options.map(o=>({id:o.id,label:o.label,count:o.count,percent:o.count/344*100})),statistics:{},bins:[],breakdowns:[],percentageBasis:'Respondents',chart:'bar',colors:{}}]};
   else if(path.endsWith('/data'))body={rows:[],total:0,matched:0};
   else if(path.endsWith('/projects'))body=[{id:'answer-project',name:'Answer manager',updated:'2026-11-02'}];
   else if(path.endsWith('/export-recovery'))body=[];
   else if(path.endsWith('/settings'))body=settings;
   await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:5298/#/kobo/answer-project');
  const manager=page.getByRole('dialog',{name:'Manage answers',exact:true});
  const open=async()=>{await page.getByRole('button',{name:'Manage answers answer',exact:true}).click().catch(async e=>{console.error(errors,(await page.locator('body').innerText()).slice(0,1200));throw e});await manager.locator('[data-answer-id="yes"]').waitFor();};
  const input=()=>manager.getByRole('textbox',{name:'New answer label',exact:true});
  const finish=async value=>{await input().fill(value);await input().press('Enter');};
  const row=id=>manager.locator(`[data-answer-id="${id}"]`);
  await open();
  assert.equal(await manager.getByRole('checkbox').count(),0);
  assert.equal(await manager.getByText('Destination answer',{exact:true}).count(),0);
  const search=manager.getByRole('textbox',{name:'Search answer options',exact:true});await search.focus();
  const focus=await search.evaluate(e=>({inner:getComputedStyle(e).outlineStyle,border:getComputedStyle(e).borderWidth,outer:getComputedStyle(e.parentElement).boxShadow}));assert.equal(focus.inner,'none');assert.equal(focus.border,'0px');assert.notEqual(focus.outer,'none');
  await manager.screenshot({path:`${out}/list-${theme}-${width}.png`});
  await row('yes').getByRole('button',{name:'Rename Yes',exact:true}).click();await finish('');await manager.getByRole('alert').filter({hasText:'Enter an answer label.'}).waitFor();
  await finish('No');await manager.getByRole('alert').filter({hasText:'Use Merge'}).waitFor();
  await finish('Yes');await manager.getByRole('alert').filter({hasText:'Enter a different label.'}).waitFor();
  await finish('نعم - Yes');assert(await manager.getByRole('radio',{name:'Update this field',exact:true}).isChecked());
  assert(await manager.getByRole('button',{name:'Preview rename',exact:true}).isEnabled());
  failPreview=width===1440;
  await manager.getByRole('button',{name:'Preview rename',exact:true}).click();
  if(width===1440){await manager.getByRole('alert').filter({hasText:'Preview failed.'}).waitFor();assert(await row('yes').getByText('نعم - Yes',{exact:true}).isVisible());await manager.getByRole('button',{name:'Preview rename',exact:true}).click();}
  await manager.getByRole('region',{name:'Answer change preview',exact:true}).waitFor();
  assert.equal(lastPreview.operation.target,'yes');assert.deepEqual(lastPreview.operation.sources,['yes']);assert.equal(lastPreview.operation.destination,'same');
  assert((await manager.getByRole('region',{name:'Answer change preview'}).innerText()).includes('67'));
  await manager.getByText('Before and after answers',{exact:true}).click();
  await manager.screenshot({path:`${out}/rename-${theme}-${width}.png`});
  // Changing destination invalidates the signed preview and makes a copy optional.
  await manager.getByRole('radio',{name:'Create a new field',exact:true}).check();
  assert.equal(await manager.getByRole('button',{name:'Apply rename',exact:true}).count(),0);
  assert(await manager.getByRole('button',{name:'Preview rename',exact:true}).isDisabled());
  await manager.getByRole('textbox',{name:'New field name',exact:true}).fill('Renamed field copy');assert(await manager.getByRole('button',{name:'Preview rename',exact:true}).isEnabled());
  await manager.getByRole('radio',{name:'Update this field',exact:true}).check();
  await manager.getByRole('button',{name:'Preview rename',exact:true}).click();await manager.getByRole('button',{name:'Apply rename',exact:true}).waitFor();
  failApply=width===1440;await manager.getByRole('button',{name:'Apply rename',exact:true}).click();
  if(width===1440){await manager.getByRole('alert').filter({hasText:'Save failed.'}).waitFor();await manager.getByRole('button',{name:'Apply rename',exact:true}).click();}
  await manager.waitFor({state:'detached'});assert.equal(options.find(o=>o.id==='yes').label,'نعم - Yes');
  await page.locator('.kobo-edit-notice').getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByRole('button',{name:'Answer options: Yes',exact:true}).waitFor();
  // Opening from an answer goes straight into its inline rename, including zero counts.
  await page.getByRole('button',{name:'Answer options: Yes',exact:true}).click();await page.getByRole('menuitem',{name:'Rename answer',exact:true}).click();await input().waitFor();assert.equal(await input().inputValue(),'Yes');await input().press('Escape');assert(await manager.isVisible());assert.equal(await input().count(),0);
  await row('refuse').getByRole('button',{name:'Rename Prefer not to answer',exact:true}).click();await finish('أفضل عدم الإجابة');
  await manager.getByRole('button',{name:'Preview rename',exact:true}).click();await manager.getByRole('region',{name:'Answer change preview'}).waitFor();assert((await manager.getByRole('region',{name:'Answer change preview'}).innerText()).includes('0'));
  await manager.getByRole('button',{name:'Merge',exact:true}).click();assert.equal(await manager.getByRole('region',{name:'Answer change preview'}).count(),0);assert.equal(await manager.getByRole('textbox',{name:'New field name',exact:true}).count(),0);
  await manager.getByRole('checkbox',{name:'Select Yes (yes)',exact:true}).check();assert.equal(await manager.getByRole('textbox',{name:'Combined answer label',exact:true}).count(),0);
  await manager.getByRole('checkbox',{name:'Select No (no)',exact:true}).check();assert(await manager.getByRole('radio',{name:'Create a new field',exact:true}).isChecked());
  await manager.getByRole('textbox',{name:'Combined answer label',exact:true}).fill('Shared');await manager.getByRole('textbox',{name:'New field name',exact:true}).fill('Merged field');
  assert(await manager.getByRole('button',{name:'Preview merge',exact:true}).isDisabled());
  await manager.getByRole('combobox',{name:'Existing answer code',exact:true}).selectOption('shared1');
  await manager.getByRole('button',{name:'Preview merge',exact:true}).click();await manager.getByRole('region',{name:'Answer change preview'}).waitFor();assert.equal(lastPreview.operation.target,'shared1');assert.equal(lastPreview.operation.destination,'new');
  await manager.screenshot({path:`${out}/merge-${theme}-${width}.png`});
  await manager.getByRole('radio',{name:'Update this field',exact:true}).check();assert.equal(await manager.getByRole('button',{name:'Apply merge',exact:true}).count(),0);
  await manager.getByRole('button',{name:'Cancel',exact:true}).click();
  // Virtualized lists keep an edited answer pinned and its draft stable through search/scroll.
  large=true;await open();assert(await manager.locator('.kobo-managed-answer-list>.kobo-managed-answer').count()<100);
  await search.fill('Option 220');await row('option220').getByRole('button',{name:'Rename Option 220',exact:true}).click();await input().fill('Renamed option 220');await search.fill('Nothing matches');assert.equal(await input().inputValue(),'Renamed option 220');
  await search.fill('');await manager.locator('.kobo-managed-answer-list').evaluate(e=>e.scrollTop=e.scrollHeight);assert.equal(await input().inputValue(),'Renamed option 220');
  await manager.getByRole('button',{name:'Done',exact:true}).click();assert(await row('option220').isVisible());
  await manager.getByRole('button',{name:'Discard rename',exact:true}).click();await search.fill('Nothing matches');await manager.getByText('No answers match your search.',{exact:true}).waitFor();
  assert(await manager.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await manager.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(errors,[]);
  assert(previewCount>=4);assert(applyCount>=1);
  await page.close();console.log('PASS',theme,width,'inline rename, validation, Enter/Escape, code preservation, zero counts, merge/copy, preview invalidation, errors, Undo, initial focus, virtualization and search border');
 }}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
