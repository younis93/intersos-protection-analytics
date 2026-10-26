// Run against scripts/serve_custom_analysis_fixture.py (isolated temporary stores).
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const {chromium} = require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = 'http://127.0.0.1:5399';
const form = execFileSync('.venv/Scripts/python.exe', ['-c', 'from backend.test_kobo_import_links import form_bytes; import sys; sys.stdout.buffer.write(form_bytes())']);
const upload = raw => ({name:'data.csv',mimeType:'text/csv',buffer:Buffer.from(raw)});

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 fs.mkdirSync('output/import-reuse',{recursive:true});
 try{
  for(const width of [1440,390])for(const workspace of ['custom','kobo']){
   console.log('Checking',workspace,width);
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
   page.setDefaultTimeout(10000);
   page.on('pageerror',error=>errors.push(String(error)));
   await page.route('**/api/app/**',route=>route.fulfill({json:{available:false}}));
   const raw=workspace==='custom'?'Code,Age\n001,20\n002,30\n':'gender,age\nf,20\nm,30\n';
   const changed=workspace==='custom'?'Age,Code\n45,003\n':'age,gender\n45,f\n';
   const schema=workspace==='custom'?'Code,Age,New\n004,60,x\n':'gender,age,New\nm,60,x\n';
   let p,saved;
   if(workspace==='custom'){
    p=await (await page.request.post(base+'/api/custom/columns/preview',{multipart:{data:upload(raw)}})).json();
    saved=await (await page.request.post(base+'/api/custom/columns/confirm',{data:{token:p.token,name:'Reuse browser',config:p.config}})).json();
   }else{
    p=await (await page.request.post(base+'/api/kobo/imports/preview',{multipart:{form:{name:'form.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:form},data:upload(raw)}})).json();
    saved=await (await page.request.post(base+'/api/kobo/imports/confirm',{data:{token:p.token,name:'Reuse browser',mappings:p.mappings,reviewConfig:{excludedQuestionIds:['needs','new_field']}}})).json();
   }
   assert(saved.id,JSON.stringify(saved));
   const projectUrl=`${base}/api/${workspace}/projects/${saved.id}`;
   const current=async()=> (await page.request.get(projectUrl)).json();
   const open=async()=>{
    if(workspace==='custom')await page.getByRole('button',{name:'Manage data',exact:true}).click();
    await page.getByRole('button',{name:workspace==='custom'?'Replace source file':'Re-upload data',exact:true}).click();
    const dialog=page.getByRole('dialog');
    assert(await dialog.getByRole('radio',{name:'Keep previous settings and update data',exact:false}).isChecked());
    return dialog;
   };
   const pick=async(dialog,content)=>dialog.getByLabel(workspace==='custom'?'Choose analysis data':'Replacement response data',{exact:true}).setInputFiles(upload(content));
   await page.goto(`${base}/#/${workspace}/${saved.id}`);
   let dialog=await open();await pick(dialog,changed);
   await dialog.getByRole('button',{name:'Update data',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await page.getByText('Data updated using previous settings.',{exact:true}).waitFor();
   const updated=await current();assert.deepEqual(updated.settings,saved.settings);
   // A changed schema stages the upload and opens review without a write.
   dialog=await open();await pick(dialog,schema);await dialog.getByRole('button',{name:'Update data',exact:true}).click();
   await dialog.getByText('Review needed before updating data',{exact:true}).waitFor();
   assert.deepEqual(await current(),updated);
   await page.screenshot({path:`output/import-reuse/${workspace}-${width}-review.png`});
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert.deepEqual(await current(),updated);
   // Explicit review still stops at setup for a compatible file.
   dialog=await open();await dialog.getByRole('radio',{name:'Review and adjust settings',exact:false}).check();await pick(dialog,changed);
   await dialog.getByRole('button',{name:workspace==='custom'?'Read file':'Review files',exact:true}).click();
   await dialog.getByText(workspace==='custom'?'Select your data table':'Replacement files ready for review',{exact:true}).waitFor();
   if(workspace==='custom'){
    await dialog.getByRole('button',{name:'Prepare data',exact:true}).click();
    await dialog.getByRole('heading',{name:'Prepare your data',exact:true}).waitFor();
    assert.equal(await dialog.locator('.custom-steps>span').count(),5);
    await dialog.getByRole('button',{name:'Choose filters',exact:true}).click();
    await dialog.getByRole('button',{name:'Review',exact:true}).click();
    assert(await dialog.getByRole('button',{name:'Apply changes',exact:true}).isEnabled());
   }
   assert.deepEqual(await current(),updated);
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
   // A settings-save failure must stop before any replacement data is staged.
   let staged=0;
   const stagePath=workspace==='custom'?'**/api/custom/columns/preview':`**/api/kobo/projects/${saved.id}/review`;
   await page.route(stagePath,route=>{staged++;return route.continue()});
   await page.route(`**/api/${workspace}/projects/${saved.id}/settings`,route=>route.fulfill({status:503,json:{detail:'Settings save failed for test'}}));
   await page.getByRole('button',{name:'Display options',exact:true}).click();
   await page.getByRole('button',{name:'1 decimal place',exact:true}).click();
   await page.keyboard.press('Escape');
   dialog=await open();await pick(dialog,changed);await dialog.getByRole('button',{name:'Update data',exact:true}).click();
   await dialog.getByText('Settings save failed for test',{exact:false}).first().waitFor();
   assert.equal(staged,0);assert.deepEqual(await current(),updated);
   assert.deepEqual(errors,[]);
   await page.close();
   console.log('PASS',workspace,width,'direct update, schema review, cancellation, manual review');
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
