// Run with scripts/serve_project_transfer_fixture.py on port 5218.
// Only synthetic fixture projects are read or changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TRANSFER_TEST_URL||'http://127.0.0.1:5218';
const out=path.resolve('output/project-transfer');
const fixture=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'),'utf8'));
async function connectApi(page){
 if(!process.env.TRANSFER_API_URL)return;
 await page.route('http://127.0.0.1:8000/api/**',async route=>{
  const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'content-type'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  const response=await route.fetch({url:route.request().url().replace('http://127.0.0.1:8000',process.env.TRANSFER_API_URL)});
  await route.fulfill({response,headers:{...response.headers(),...headers}});
 });
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const workspace of ['kobo','custom'])for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
   await connectApi(page);
   page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(String(e)));
   await page.addInitScript(()=>localStorage.setItem('app-theme','glass-light'));
   await page.goto(`${base}/#/${workspace}/${fixture[workspace]}`,{waitUntil:'domcontentloaded'});
   await page.getByLabel('Analysis overview',{exact:true}).getByRole('button',{name:'Export',exact:true}).click();
   await page.getByRole('button',{name:'Back up project',exact:true}).click();
   let dialog=page.getByRole('dialog',{name:'Export project',exact:true});
   await dialog.waitFor();
   assert(await dialog.getByRole('radio',{name:/Data and settings/}).isChecked());
   await dialog.getByRole('radio',{name:/Data only/}).check();
   const download=page.waitForEvent('download');
   await dialog.getByRole('button',{name:'Export ZIP',exact:true}).click();
   const file=await download,bytes=fs.readFileSync(await file.path());
   assert.match(file.suggestedFilename(),/data-only\.zip$/);
   await page.goto(`${base}/#/${workspace}`,{waitUntil:'domcontentloaded'});
   await page.getByLabel('Import saved project',{exact:true}).setInputFiles({name:'data-only.zip',mimeType:'application/zip',buffer:bytes});
   dialog=page.getByRole('dialog',{name:'Import project',exact:true});await dialog.waitFor();
   assert(await dialog.getByRole('radio',{name:/Use default settings/}).isChecked());
   assert(await dialog.getByRole('radio',{name:/Use settings from file/}).isDisabled());
   assert(await dialog.getByText(/records · .* fields · Data only/).isVisible());
   assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.screenshot({path:path.join(out,`${workspace}-import-${width}.png`)});
   await dialog.getByRole('radio',{name:/Update existing project/}).check();
   assert(await dialog.getByRole('radio',{name:/Keep current settings/}).isChecked());
   assert(await dialog.getByRole('button',{name:'Apply update'}).isDisabled());
   await dialog.getByRole('combobox',{name:'Project to update'}).selectOption(fixture[workspace]);
   await dialog.getByRole('button',{name:'Apply update'}).waitFor({state:'visible'});
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Apply update')?.disabled);
   await page.screenshot({path:path.join(out,`${workspace}-update-${width}.png`)});
   await dialog.getByRole('button',{name:'Apply update'}).click();
   await page.waitForURL(`**/#/${workspace}/${fixture[workspace]}`);
   // A second import exercises new-project creation and keyboard confirmation.
   await page.goto(`${base}/#/${workspace}`,{waitUntil:'domcontentloaded'});
   await page.getByLabel('Import saved project',{exact:true}).setInputFiles({name:'data-only.zip',mimeType:'application/zip',buffer:bytes});
   dialog=page.getByRole('dialog',{name:'Import project',exact:true});await dialog.waitFor();
   await dialog.getByRole('button',{name:'Create project',exact:true}).focus();
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Create project')?.disabled);
   await dialog.getByRole('button',{name:'Create project',exact:true}).press('Enter');
   await page.waitForURL(url=>url.hash.startsWith(`#/${workspace}/`)&&!url.hash.includes(fixture[workspace]));
   assert.equal(errors.length,0,errors.join('\n'));
   await page.close();
  }
  // Verify password protection remains independent of export contents.
  const page=await browser.newPage();await connectApi(page);await page.goto(`${base}/#/kobo/${fixture.kobo}`);
  await page.getByLabel('Analysis overview',{exact:true}).getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Back up project',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Export project',exact:true});
  await dialog.getByRole('radio',{name:/Data only/}).check();await dialog.getByRole('switch',{name:/Protect with password/}).check();
  await dialog.getByLabel('Password',{exact:true}).fill('browser transfer password');await dialog.getByLabel('Confirm password',{exact:true}).fill('browser transfer password');
  const encrypted=page.waitForEvent('download');await dialog.getByRole('button',{name:'Export protected project'}).click();
  const protectedFile=await encrypted,protectedBytes=fs.readFileSync(await protectedFile.path());
  assert.equal(protectedBytes.subarray(0,8).toString(),'INTERSOS');
  await page.goto(`${base}/#/kobo`);await page.getByLabel('Import saved project',{exact:true}).setInputFiles({name:'protected.intersos',mimeType:'application/octet-stream',buffer:protectedBytes});
  dialog=page.getByRole('dialog',{name:'Unlock project',exact:true});await dialog.waitFor();
  await dialog.getByLabel('Password',{exact:true}).fill('wrong');await dialog.getByRole('button',{name:'Unlock and import'}).click();await dialog.getByRole('alert').waitFor();
  await dialog.getByLabel('Password',{exact:true}).fill('browser transfer password');await dialog.getByRole('button',{name:'Unlock and import'}).click();
  dialog=page.getByRole('dialog',{name:'Import project',exact:true});await dialog.waitFor();assert(await dialog.getByRole('radio',{name:/Use settings from file/}).isDisabled());
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.close();
  // Legal's transfer UI always displays the fixed data-only policy.
  const legal=await browser.newPage({viewport:{width:390,height:1000}});
  await legal.route('**/api/**',async route=>{
   const p=new URL(route.request().url()).pathname;
   const data=p==='/api/legal/metadata'?{ready:true,source:'Synthetic legal data',revision:'transfer-legal',availability:{beneficiaries:true},features:{},sheets:[],months:[],reviewCounts:{}}:p==='/api/legal/overview'?{overview:{},filterOptions:{projects:[],locations:[],months:[],groups:[]},unavailable:[]}:p==='/api/update/check'?{available:false,currentVersion:'test'}:{};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await legal.goto(`${base}/?startupEpoch=1#/legal/overview`);
  await legal.locator('.data-source-control').getByRole('button',{name:'Choose source'}).click();
  await legal.getByRole('menuitem',{name:/Export project/}).click();
  dialog=legal.getByRole('dialog',{name:'Export project',exact:true});await dialog.waitFor();
  assert(await dialog.getByText('Data only - default settings',{exact:true}).isVisible());assert.equal(await dialog.getByRole('radio').count(),0);
  await legal.screenshot({path:path.join(out,'legal-export-390.png')});await dialog.getByRole('button',{name:'Cancel',exact:true}).press('Enter');
  await legal.close();
  console.log('Kobo/custom desktop/mobile, data-only export, new imports, reviewed updates, password retry, keyboard actions and fixed Legal policy passed.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
