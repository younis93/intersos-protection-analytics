const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const mode of ['startup','native','browser']){
   console.log('Checking '+mode);
   const page=await browser.newPage({viewport:{width:1280,height:900}});
   const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
   let status={operationId:mode==='startup'?'b160cf24-aace-4eb1-89b1-aa58438f4611':null,state:mode==='startup'?'processing':'idle',source:mode==='startup'?'startup':mode,stage:'Validating',dataset:'beneficiaries',percent:47,completedWork:4,totalWork:9,error:'',canCancel:true};
   let loading=mode==='startup',cancelAttempts=0;
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let payload={available:false,enabled:false,currentVersion:'test'};
    if(url.pathname.endsWith('/metadata'))payload={ready:false,loading,source:null,warnings:[],availability:{},features:{detention:false,deportation:false},sheets:[],months:[],reviewCounts:{}};
    if(url.pathname.endsWith('/import/status')){
     if(mode==='native'){
      const id=await page.evaluate(()=>window.nativeOperationId);
      if(id&&status.state==='idle')status={...status,operationId:id,state:'processing'};
     }
     payload={...status,operationId:status.operationId||url.searchParams.get('operationId')};
    }
    if(url.pathname.endsWith('/import/cancel')){
     cancelAttempts++;
     if(mode==='native'&&cancelAttempts===1){await route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});return;}
     status={...status,operationId:url.searchParams.get('operationId'),state:mode==='browser'?'cancelled':'cancelling',canCancel:false};payload=status;
     if(mode!=='browser')setTimeout(async()=>{
      status={...status,state:'cancelled'};loading=false;
      if(mode==='native')await page.evaluate(()=>window.rejectNative(new Error('Import cancelled')));
     },500);
    }
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(payload)});
   });
   await page.goto('http://127.0.0.1:5188/performance-harness.html');
   await page.evaluate(async({mode})=>{
    await import('/src/styles.css');const {default:React}=await import('/node_modules/.vite/deps/react.js');const client=await import('/node_modules/.vite/deps/react-dom_client.js');const {default:LegalPlatform}=await import('/src/LegalPlatform.tsx');
    if(mode==='native')window.pywebview={api:{choose_legal_folder:async()=>'/fixture',process_legal_folder:(_path,id)=>{window.nativeOperationId=id;return new Promise((_resolve,reject)=>window.rejectNative=reject)}}};
    if(mode==='browser')window.XMLHttpRequest=class{
     upload={};open(_method,url){window.uploadUrl=url}send(){setTimeout(()=>this.upload.onprogress?.({lengthComputable:true,loaded:32,total:100}),10)}abort(){window.xhrAborted=true;this.onabort?.();this.onloadend?.()}
    };
    document.body.innerHTML='<div id="platform-root"></div>';
    (client.createRoot||client.default.createRoot)(document.getElementById('platform-root')).render(React.createElement(LegalPlatform));
   },{mode});
   if(mode==='native')await page.getByRole('button',{name:'Select data folder'}).click();
   if(mode==='browser'){
    await page.getByRole('button',{name:'Select CSV files',exact:false}).waitFor();
    await page.locator('input[type=file]:not([webkitdirectory])').setInputFiles({name:'awareness.csv',mimeType:'text/csv',buffer:Buffer.from('ID,Name\n1,Example')});
   }
   await page.getByRole('button',{name:'Minimize',exact:true}).click();
   assert(await page.getByRole('button',{name:'Select data folder'}).isDisabled());
   if(mode==='browser')await page.getByText('32%',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   if(mode==='native'){
    await page.getByRole('alert').filter({hasText:'Unable to cancel'}).waitFor();
    assert(await page.getByRole('button',{name:'Cancel',exact:true}).isEnabled());
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
   }
   await page.getByRole('heading',{name:'Import cancelled'}).waitFor();
   if(mode==='browser')assert(await page.evaluate(()=>window.xhrAborted));
   await page.waitForFunction(()=>!document.querySelector('.legal-import-source-option')?.disabled);
   await page.getByRole('button',{name:'Dismiss',exact:true}).click();
   await page.locator('.legal-upload-overlay').waitFor({state:'detached'});
   assert.equal(pageErrors.length,0,JSON.stringify(pageErrors));
   await page.close();
  }
  console.log(JSON.stringify({startupCancellation:true,nativeCancellation:true,cancelRetry:true,browserUploadAbort:true,newImportEnabledAfterCancellation:true,pageErrors:[]}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
