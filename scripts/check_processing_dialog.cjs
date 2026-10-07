// Run with a Vite server on port 5174 and synthetic metadata in output/processing-dialog-fixture.json.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const metadata=JSON.parse(fs.readFileSync('output/processing-dialog-fixture.json','utf8'));
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  let ready=false,finished=false;
  await page.route('http://127.0.0.1:8000/api/**',async route=>{
   const url=new URL(route.request().url());let result={};
   if(url.pathname==='/api/legal/metadata')result=ready?metadata:{...metadata,ready:false,loading:true};
   else if(url.pathname==='/api/legal/import/status'){
    const id=url.searchParams.get('operationId');
    result={operationId:id||'startup',source:id?'folder':'startup',state:finished?'complete':'processing',stage:finished?'Publishing':'Checking relationships',dataset:'assessments',completedWork:finished?20:12.4,totalWork:20,percent:finished?100:62,error:''};
   }else if(url.pathname==='/api/update/check')result={available:false,enabled:false};
   else if(url.pathname==='/api/update/status')result={phase:'idle',progress:0};
   await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},body:JSON.stringify(result)});
  });
  await page.goto('http://127.0.0.1:5174/performance-harness.html');
  await page.evaluate(async()=>{
   const React=(await import('/node_modules/.vite/deps/react.js')).default;
   const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
   const {default:LegalPlatform}=await import('/src/LegalPlatform.tsx');
   document.body.innerHTML='<div id="processing-test-root"></div>';
   const process=async(path,id)=>{window.importOperation=id;return new Promise(resolve=>{window.finishImport=resolve;});};
   window.pywebview={api:{choose_legal_folder:async()=> 'C:/Synthetic',process_legal_folder:process,refresh_legal_folder:async id=>process('C:/Synthetic',id)}};
   createRoot(document.getElementById('processing-test-root')).render(React.createElement(LegalPlatform,{}));
  });
  const progress=page.getByRole('progressbar',{name:'Processing Legal Platform records',exact:true});
  await progress.waitFor();assert.equal(await progress.getAttribute('aria-valuenow'),'62');
  assert(await page.getByText('LOADING LEGAL DATA',{exact:true}).isVisible());
  await page.screenshot({path:'output/processing-startup.png'});
  ready=true;finished=true;await page.locator('.legal-upload-overlay').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Choose source',exact:true}).click();
  finished=false;await page.getByRole('menuitem',{name:'Select folder Load all supported CSV files'}).click();
  await progress.waitFor();assert.equal(await progress.getAttribute('aria-valuenow'),'62');
  assert(await page.getByText('REPLACING LEGAL DATA',{exact:true}).isVisible());
  const operation=await page.evaluate(()=>window.importOperation);assert.match(operation,/^[0-9a-f-]{36}$/);
  await page.screenshot({path:'output/processing-replacement.png'});
  finished=true;await page.evaluate(value=>window.finishImport(value),metadata);
  await page.locator('.legal-upload-overlay').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Choose source',exact:true}).click();
  finished=false;await page.getByRole('button',{name:'Refresh selected folder',exact:true}).click();
  await progress.waitFor();assert.equal(await progress.getAttribute('aria-valuenow'),'62');
  assert.notEqual(await page.evaluate(()=>window.importOperation),operation);
  finished=true;await page.evaluate(value=>window.finishImport(value),metadata);
  await page.locator('.legal-upload-overlay').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({startup_progress:true,replacement_progress:true,refresh_progress:true,real_percentage:62,operation_isolation:true,page_errors:errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
