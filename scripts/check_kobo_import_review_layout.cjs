const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const clone=value=>JSON.parse(JSON.stringify(value));
const out='output/kobo-import-review-layout';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const theme of ['glass-light','glass-dark'])for(const width of [1440,390,320]){
   const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);
   const errors=[];page.on('pageerror',error=>errors.push(String(error)));
   page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('400 (Bad Request)'))errors.push(m.text())});
   await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
   const q=(id,kind='text')=>({id,name:id,labels:{en:id==='district'?'District / Location - المنطقة والموقع':id},kind,type:kind==='category'?'select_one districts':kind,group:'',repeat:'',metadata:false,identifying:false,choices:kind==='category'?[{name:'a',labels:{en:'District A'}}]:[]});
   const form={questions:[q('district','category'),q('other'),q('combined'),q('missing')],groups:[],language:'en',warnings:[],settings:{version:'1'}};
   const config={addedQuestions:[{id:'added',sheet:0,column:4,label:'Added field',kind:'text',repeat:'',choices:[]}],choiceOverrides:{},excludedQuestionIds:['missing']};
   const mappings=['district','other','combined','combined','added'].map((id,column)=>({sheet:0,column,header:`Source ${column+1}`,question:id,option:'',status:'matched',...(id==='combined'?{mergeMode:'priority',priority:column}:{})}));
   const source={formFilename:'Assessment form - النسخة النهائية.xlsx',filename:'ECHO Household Assessment Data_2026_Used_For_Analysis_With_A_Long_File_Name.xlsx'};
   const issue={question:'district',message:'ambiguous choice label',count:1};
   const note={id:'dependency',fingerprint:'v1',kind:'warning',question:'district',message:'District: choice filter depends on an ignored question. Answers are checked against the full choice list.',reviewed:false};
   const linkReview={columns:Object.fromEntries(mappings.map(m=>[`0:${m.column}`,{samples:['Example'],distinct:1,values:[]}])),noSource:[],merged:['combined'],conflicts:{combined:{count:0,examples:[]}}};
   const settings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form',questions:{},viewMode:'table'};
   const preview={token:'layout-token',form,source,sheets:[{name:'Main responses',rows:344,columns:5}],mappings,reviewConfig:config,issues:[issue],warnings:[note.message],importNotes:[note],linkReview,policies:{},expectedVersion:'1',sourceVersions:{1:344}};
   let lastCheck=null,failNext=false,commits=0,hold=null,newFlow=false;
   const checked=body=>{
    const excluded=new Set(body.reviewConfig?.excludedQuestionIds||[]);
    const all=(newFlow?[...form.questions.filter(q=>q.id!=='missing'),q('added')]:[...form.questions,...config.addedQuestions.map(a=>q(a.id))]).filter(q=>!excluded.has(q.id));
    return {issues:excluded.has('district')?[]:[issue],warnings:excluded.has('district')?[]:[note.message],importNotes:excluded.has('district')?[]:[note],questionImpacts:[],examples:{},linkReview:{...linkReview,noSource:all.filter(q=>!body.mappings.some(m=>m.status==='matched'&&m.question===q.id)).map(q=>q.id)}};
   };
   await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;let result={};
    if(path.endsWith('/check')){
     lastCheck=req.postDataJSON();if(hold)await hold;
     if(failNext){failNext=false;await route.fulfill({status:400,json:{detail:'The exclusion could not be checked. Retry.'}});return}
     result=checked(lastCheck);
    }else if(path.endsWith('/imports/preview')){newFlow=true;result={...clone(preview),form:{...form,questions:[...form.questions.filter(q=>q.id!=='missing'),q('added')]},reviewConfig:undefined};}
    else if(path.endsWith('/projects/layout/review'))result=clone(preview);
    else if(path.endsWith('/worksheets'))result={worksheets:['Main responses']};
    else if(path.endsWith('/imports/confirm')){commits++;result={id:'layout',name:'Layout project',form,source,settings,warnings:[],issues:[],importNotes:[]};}
    else if(path.endsWith('/projects/layout'))result={id:'layout',name:'Layout project',form:{...form,questions:[...form.questions.filter(q=>q.id!=='missing'),q('added')]},source,settings,warnings:[],issues:[],importNotes:[]};
    else if(path.endsWith('/analysis'))result={total:344,filtered:344,settings,filterSummary:[],groups:[],questions:[]};
    else if(path.endsWith('/data'))result={rows:[],total:0,matched:0};
    else if(path.endsWith('/projects'))result=[{id:'layout',name:'Layout project',updated:'2026-11-02'}];
    else if(path.endsWith('/export-recovery'))result=[];
    else if(path.endsWith('/settings'))result=settings;
    await route.fulfill({json:result});
   });
   const checkDone=async dialog=>{await dialog.locator('.kobo-link-check-status').filter({hasText:'Field links checked'}).waitFor();};
   const undo=async dialog=>{await dialog.locator('.kobo-exclusion-feedback').getByRole('button',{name:'Undo',exact:true}).click();await checkDone(dialog);};
   await page.goto('http://127.0.0.1:5298/#/kobo/layout');
   await page.getByRole('button',{name:'Data source',exact:true}).click();await page.getByRole('button',{name:'Review import',exact:true}).click();
   let dialog=page.getByRole('dialog',{name:'Review and correct import',exact:true});
   await dialog.getByRole('heading',{name:'Using saved files',exact:true}).waitFor();
   await dialog.screenshot({path:`${out}/saved-${theme}-${width}.png`});
   assert.equal(await dialog.getByRole('heading',{name:'Review questions and answers',exact:true}).count(),1);
   assert.equal(await dialog.locator('.kobo-import-source').count(),0);
   await dialog.getByText('File details',{exact:true}).click();await dialog.getByText('Form version',{exact:true}).waitFor();
   await dialog.getByText('Replace form',{exact:true}).click();await dialog.getByRole('button',{name:'Choose form file',exact:true}).waitFor();
   await dialog.getByText('Replace form',{exact:true}).click();await dialog.getByText('File details',{exact:true}).click();
   assert(await dialog.getByRole('button',{name:'Apply corrections',exact:true}).isDisabled());
   assert.equal(await dialog.getByText('1 answer issue needs review',{exact:true}).count(),1);
   const reviewLink=dialog.getByRole('button',{name:'Review issues',exact:true});
   assert((await reviewLink.boundingBox()).width<170);
   await reviewLink.click();
   const card=dialog.locator('#kobo-answer-district');await card.waitFor();
   const accept=dialog.getByRole('checkbox',{name:'Accept unresolved or invalid answers as blank',exact:false});await accept.check();assert(await dialog.getByRole('button',{name:'Apply corrections',exact:true}).isEnabled());await accept.uncheck();assert(await dialog.getByRole('button',{name:'Apply corrections',exact:true}).isDisabled());
   await card.screenshot({path:`${out}/answer-${theme}-${width}.png`});
   // A failed preflight keeps both the question and its source mapping intact.
   if(width===1440){failNext=true;await card.getByRole('button',{name:'Ignore question',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'The exclusion could not be checked.'}).waitFor();assert(await card.isVisible());assert(await dialog.getByRole('button',{name:'Apply corrections',exact:true}).isDisabled());}
   await card.getByRole('button',{name:'Ignore question',exact:true}).click();await card.waitFor({state:'detached'});await checkDone(dialog);
   assert(lastCheck.reviewConfig.excludedQuestionIds.includes('district'));assert(lastCheck.mappings[0].status==='excluded');
   assert(await dialog.getByRole('button',{name:'Apply corrections',exact:true}).isEnabled());
   assert.equal(await page.locator(':focus').getAttribute('id'),'kobo-exclusion-feedback');
   await undo(dialog);await card.waitFor();assert(await dialog.getByRole('button',{name:'Apply corrections',exact:true}).isDisabled());
   await dialog.getByRole('tab',{name:/^Mapped to existing questions/}).click();
   const mapped=dialog.locator('#kobo-source-0\\:1');await mapped.getByRole('button',{name:'Ignore question',exact:true}).click();await mapped.waitFor({state:'detached'});await checkDone(dialog);assert(lastCheck.reviewConfig.excludedQuestionIds.includes('other'));await undo(dialog);
   await dialog.getByRole('tab',{name:/^Combined sources/}).click();
   const combined=dialog.locator('#kobo-merge-combined');await combined.locator('header').getByRole('button',{name:'Ignore question',exact:true}).click();await combined.waitFor({state:'detached'});await checkDone(dialog);assert(lastCheck.mappings.filter(m=>m.column===2||m.column===3).every(m=>m.status==='excluded'));await undo(dialog);
   await dialog.getByRole('tab',{name:/^Added questions/}).click();
   const added=dialog.locator('#kobo-source-0\\:4');await added.getByRole('button',{name:'Ignore question',exact:true}).click();await added.waitFor({state:'detached'});await checkDone(dialog);assert(lastCheck.reviewConfig.excludedQuestionIds.includes('added'));await undo(dialog);
   await dialog.getByRole('tab',{name:/^Ignored/}).click();await dialog.getByRole('button',{name:'Restore question',exact:true}).click();await checkDone(dialog);
   await dialog.getByRole('tab',{name:/^Needs a decision/}).click();
   const missing=dialog.locator('#kobo-unlinked-missing');await missing.getByRole('button',{name:'Ignore question',exact:true}).click();await missing.waitFor({state:'detached'});await checkDone(dialog);
   assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(commits,0);
   // Exercise the same source summary, footer, and exclusion actions during creation.
   await page.goto('http://127.0.0.1:5298/#/kobo');await page.getByRole('button',{name:'New project',exact:true}).click();
   dialog=page.getByRole('dialog');
   await dialog.getByPlaceholder('Household assessment').fill('New layout project');
   const fileInputs=dialog.locator('input[type=file]');
   await fileInputs.nth(0).setInputFiles({name:'Form.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture')});
   await fileInputs.nth(1).setInputFiles({name:'Responses.csv',mimeType:'text/csv',buffer:Buffer.from('district\nA\n')});
   await dialog.getByRole('button',{name:'Review import',exact:true}).click();
   await dialog.getByRole('heading',{name:'Uploaded files ready',exact:true}).waitFor();await checkDone(dialog);
   await dialog.screenshot({path:`${out}/create-${theme}-${width}.png`});
   assert(await dialog.getByRole('button',{name:'Create analysis project',exact:true}).isDisabled());
   await dialog.getByRole('button',{name:'Review issues',exact:true}).click();
   await dialog.locator('#kobo-answer-district').getByRole('button',{name:'Ignore question',exact:true}).click();await checkDone(dialog);
   assert(await dialog.getByRole('button',{name:'Create analysis project',exact:true}).isEnabled());
   await undo(dialog);assert(await dialog.getByRole('button',{name:'Create analysis project',exact:true}).isDisabled());
   assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   for(let index=0;index<4;index++){
    await page.keyboard.press('Tab');
    const focus=page.locator(':focus');
    if(await focus.count()){
     const geometry=await focus.evaluate(e=>{const d=e.closest('dialog'),footer=d?.querySelector('.kobo-import-footer'),header=d?.querySelector(':scope>header'),r=e.getBoundingClientRect();return{inside:!!d,footer:!!e.closest('footer'),top:r.top,bottom:r.bottom,headerBottom:header?.getBoundingClientRect().bottom,footerTop:footer?.getBoundingClientRect().top}});
     if(geometry.inside&&!geometry.footer){assert(geometry.top>=geometry.headerBottom-1,JSON.stringify(geometry));assert(geometry.bottom<=geometry.footerTop+1,JSON.stringify(geometry));}
    }
   }
   assert.deepEqual(errors,[]);
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(commits,0);
   await page.close();console.log('PASS',theme,width,'saved/create hierarchy, responsive footer, question exclusion in all contexts, Undo, failed preflight, restore, focus, cancellation');
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
