// Synthetic browser check. All API traffic is mocked; no saved user data is read or changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const base=process.env.LEGAL_CHECK_URL||'http://127.0.0.1:5193';
const out=path.resolve('output/legal-project-backup');
const availability={beneficiaries:false,assessments:false,legalservices:false,followupslogbooks:false,legalfees:false,awareness:false,deportationrecords:false,legalhotlines:false};
const empty={ready:false,loading:false,source:'',availability,features:{detention:false,deportation:false,awareness:false},sheets:[],months:[],reviewCounts:{}};
const loaded={...empty,ready:true,source:'Imported Legal Platform project',revision:'fixture-restored',availability:{...availability,beneficiaries:true,assessments:true,legalservices:true},overview:{},sheets:[{id:'beneficiaries',name:'Beneficiaries',rows:2,columns:['Case ID']}]};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const executablePath=process.env.BROWSER_EXECUTABLE||path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe');
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
   page.setDefaultTimeout(15000);
   let ready=false,fail=true,restores=0,exportMonth='';
   page.on('pageerror',error=>errors.push(String(error)));
   await page.addInitScript(theme=>{localStorage.setItem('app-theme',theme);localStorage.setItem('legal-platform-theme',theme)},width===390?'glass-dark':'glass-light');
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),p=url.pathname;
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
    if(p==='/api/legal/metadata')return json(ready?loaded:empty);
    if(p==='/api/update/check')return json({available:false,currentVersion:'test'});
    if(p==='/api/legal/backups/restore'){
     restores++;assert.match(route.request().postDataBuffer().toString(),/name="file"; filename="project.zip"/);
     assert.match(url.searchParams.get('operationId'),/^[0-9a-f-]{36}$/);
     if(fail)return json({detail:'Synthetic invalid project ZIP'},400);
     ready=true;return json(loaded);
    }
    if(p==='/api/legal/import/status')return json({state:'idle',operationId:url.searchParams.get('operationId'),percent:null});
    if(p==='/api/legal/backup'){
     exportMonth=url.searchParams.get('exportMonth');
     return route.fulfill({status:200,contentType:'application/zip',headers:{'Access-Control-Allow-Origin':'*'},body:Buffer.from('synthetic ZIP download')});
    }
    if(p==='/api/legal/overview')return json({overview:{},filterOptions:{projects:[],locations:[],months:[],groups:[]},unavailable:[]});
    return json({detail:'Synthetic unused page'},400);
   });
   await page.goto(`${base}/?startupEpoch=1#/legal/overview`,{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Import Legal Platform data'}).waitFor();
   assert(await page.getByRole('button',{name:/Import project Restore a saved/}).isVisible());
   const source=page.locator('.data-source-control');
   await source.getByRole('button',{name:'Choose source'}).click();
   assert(await source.getByRole('menuitem',{name:/Import project/}).isVisible());
   assert(await source.getByRole('menuitem',{name:/Export project/}).isDisabled());
   await page.screenshot({path:path.join(out,`empty-menu-${width}.png`)});
   const fixture={name:'project.zip',mimeType:'application/zip',buffer:Buffer.from('fixture')};
   const upload=()=>page.getByLabel('Import Legal Platform project ZIP').setInputFiles(fixture);
   const chooser=page.waitForEvent('filechooser');
   await source.getByRole('menuitem',{name:/Import project/}).click();
   await (await chooser).setFiles(fixture);
   await page.getByText('Synthetic invalid project ZIP',{exact:true}).waitFor();
   await page.getByLabel('File processing',{exact:true}).getByRole('button',{name:'Dismiss',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('.data-source-control .app-select-trigger').disabled);
   fail=false;
   const restored=page.waitForResponse(response=>response.url().includes('/api/legal/backups/restore')&&response.status()===200);
   await upload();await restored;
   await page.waitForFunction(()=>document.querySelector('.data-source-menu')===null&&!document.querySelector('.legal-upload-overlay'));
   await source.getByRole('button',{name:'Choose source'}).click();
   const exportButton=source.getByRole('menuitem',{name:/Export project/});
   assert(await exportButton.isEnabled());
   await page.screenshot({path:path.join(out,`loaded-menu-${width}.png`)});
   const download=page.waitForEvent('download');await exportButton.click();
   const file=await download;
   assert.match(file.suggestedFilename(),/^Legal Platform export \d{4}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.zip$/);
   assert.equal(file.suggestedFilename(),`Legal Platform export ${exportMonth}.zip`);
   assert.equal(restores,2);assert.match(page.url(),/#\/legal\/overview$/);assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('Legal project menus, import failure/retry, restore navigation, and ZIP downloads passed at 1440px and 390px.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
