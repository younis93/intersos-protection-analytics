const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('console',message=>{if(message.type()==='error')console.error(message.text())});
  page.on('pageerror',error=>{errors.push(String(error));console.error(String(error))});
  const question={id:'district',name:'district',labels:{en:'District/Location'},kind:'category',type:'select_one districts',repeat:'',group:'',metadata:false,identifying:false,choices:[{name:'a',labels:{en:'District A'}}]};
  const settings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form',questions:{},viewMode:'table'};
  const form={questions:[question],groups:[],language:'en',warnings:[],settings:{version:'1'}};
  let notes=[{id:'dependency',fingerprint:'source1',kind:'warning',question:'district',message:'District/Location: choice filter depends on an ignored question. Answers are checked against the full choice list.',reviewed:false},
   {id:'ambiguous',fingerprint:'source1',kind:'issue',question:'district',message:'ambiguous choice label',count:1,reviewed:true}];
  const project=()=>({id:'notes-preview',name:'Import note review',form,settings,warnings:[notes[0].message],issues:[{question:'district',message:'ambiguous choice label',count:1}],importNotes:notes});
  const preview=()=>({token:'notes-token',form,reviewConfig:{addedQuestions:[],choiceOverrides:{},excludedQuestionIds:[]},mappings:[{sheet:0,column:0,header:'district',question:'district',option:'',status:'matched'}],sheets:[{name:'submissions',rows:1,columns:1}],policies:{},issues:[],warnings:[notes[0].message],importNotes:notes});
  let applied=false;
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;let body={};
   if(path.endsWith('/import-notes/review')){
    const keys=route.request().postDataJSON().reviewedImportNotes;
    notes=notes.map(note=>({...note,reviewed:note.reviewed||keys.includes(`${note.id}:${note.fingerprint}`)}));body=project();
   }else if(path.endsWith('/imports/confirm')){
    const keys=route.request().postDataJSON().reviewedImportNotes;
    assert(keys.includes('dependency:source1'));
    notes=notes.map(note=>({...note,reviewed:true}));applied=true;body=project();
   }else if(path.endsWith('/projects/notes-preview/review'))body=preview();
   else if(path.endsWith('/projects/notes-preview'))body=project();
   else if(path.endsWith('/data'))body={rows:[],total:0,matched:0};
   else if(path.endsWith('/analysis'))body={total:1,filtered:1,questions:[],groups:[],settings,filterSummary:[]};
   else if(path.endsWith('/projects'))body=[{id:'notes-preview',name:'Import note review',updated:'2026-11-02'}];
   else if(path.endsWith('/check'))body={...preview(),questionImpacts:[],linkReview:{noSource:[],merged:[],columns:[],conflicts:{}}};
   else if(path.endsWith('/settings'))body=settings;
   else if(path.endsWith('/export-recovery'))body=[];
   await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:5298/#/kobo/notes-preview');
  await page.getByRole('button',{name:'Important notes'}).click({timeout:10000}).catch(async error=>{console.error((await page.locator('body').innerText()).slice(0,4000));throw error});
  const dialog=page.getByRole('dialog',{name:'Important notes'});
  await dialog.getByText('Answers will be checked against all available choices because the related filter question is ignored.', {exact:true}).waitFor();
  assert.equal(await dialog.getByText('ambiguous choice label',{exact:true}).count(),0);
  await dialog.getByLabel('Show reviewed notes (1)').check();
  await dialog.getByText('Some answer labels match more than one choice. Review the answer choices to decide how to interpret them.',{exact:true}).waitFor();
  fs.mkdirSync('output/import-note-review',{recursive:true});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await dialog.screenshot({path:`output/import-note-review/notes-${width}.png`});
  }
  await dialog.getByRole('button',{name:'Mark all reviewed',exact:true}).click();
  await page.getByRole('button',{name:'Important notes'}).waitFor({state:'detached'});
  await page.reload();
  await page.getByRole('heading',{name:'Import note review',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Important notes'}).count(),0);
  await page.getByRole('button',{name:'Data source',exact:true}).click();
  await page.getByRole('button',{name:'Review import',exact:true}).click();
  const review=page.getByRole('dialog',{name:'Review and correct import'});
  await review.getByText('All import notes have been reviewed.').waitFor();
  await review.getByLabel('Show reviewed notes (2)').check();
  assert.equal(await review.getByText(notes[0].message,{exact:true}).count(),1);
  await review.getByText('Some answer labels match more than one choice. Review the answer choices to decide how to interpret them.',{exact:true}).waitFor();
  await review.screenshot({path:'output/import-note-review/review-390.png'});
  await review.getByRole('button',{name:'Cancel',exact:true}).click();
  // Explicit warning acceptance is sent with the successful import, rather than
  // being persisted just because the warning dialog was opened.
  notes=notes.map(note=>({...note,reviewed:note.kind==='issue'}));
  await page.reload();
  await page.getByRole('button',{name:'Data source',exact:true}).click();
  await page.getByRole('button',{name:'Review import',exact:true}).click();
  await review.getByRole('button',{name:'Apply corrections',exact:true}).click();
  const confirmation=page.getByRole('alertdialog',{name:'Continue with import warnings?'});
  await confirmation.getByRole('button',{name:'Accept warnings and continue',exact:true}).click();
  await review.waitFor({state:'detached'});
  assert(applied);
  assert.equal(await page.getByRole('button',{name:'Important notes'}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: note counts, reviewed toggle, mark all, reload persistence, saved-file review, desktop/mobile overflow, no browser errors.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
