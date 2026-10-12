// Run against Vite. All imported records and API responses are synthetic.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const fixture={
  metadata:{ready:true,source:'Data',warnings:[],availability:{deportationrecords:true},features:{deportation:true,detention:false,awareness:false},sheets:[{id:'deportationrecords',name:'Deportation Records',rows:1,columns:['PN ID']}],months:[],reviewCounts:{},overview:null},
  dashboard:{page:'deportation',measure:'records',total:1,filteredRows:1,kpis:[],trend:[],charts:[],filterOptions:{}},
  explorer:{dataset:'deportationrecords',total:1,page:1,pageSize:100,columns:['PN ID'],rows:[{__rowKey:'0','PN ID':'OLD'}]},
 };
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(String(error)));
  let version=0,ready=false;
  const metadata=()=>({...fixture.metadata,revision:`source-${version}`,source:'Data'});
  await page.exposeFunction('replaceSource',()=>{version++;return metadata()});
  await page.route('http://127.0.0.1:8000/api/**',async route=>{
   const url=new URL(route.request().url());let result={};
   if(url.pathname==='/api/legal/metadata')result=ready?metadata():{...metadata(),ready:false,loading:true};
   else if(url.pathname==='/api/legal/import/status')result={operationId:url.searchParams.get('operationId')||'startup',state:ready?'complete':'processing',percent:ready?100:50,stage:'Reading',dataset:'deportationrecords',completedWork:ready?2:1,totalWork:2,error:''};
   else if(url.pathname==='/api/legal/deportation-dashboard')result={...fixture.dashboard,kpis:[{label:'Imported source version',value:version+1,format:'integer'}]};
   else if(url.pathname==='/api/legal/explorer')result={...fixture.explorer,rows:fixture.explorer.rows.map(row=>({...row,'PN ID':`ROW-${version}`}))};
   else if(url.pathname.startsWith('/api/legal/explorer-filters'))result={};
   else if(url.pathname==='/api/legal/upload'){version++;result=metadata()}
   else if(url.pathname==='/api/update/check')result={available:false,enabled:false};
   else if(url.pathname==='/api/update/status')result={phase:'idle',progress:0};
   await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},body:JSON.stringify(result)});
  });
  const base=process.env.APP_TEST_URL||'http://127.0.0.1:5189';
  await page.goto(base+'/performance-harness.html');
  await page.evaluate(async()=>{
   const React=(await import('/node_modules/.vite/deps/react.js')).default;
   const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
   const {default:LegalPlatform}=await import('/src/LegalPlatform.tsx');
   window.location.hash='/legal/deportation';
   document.body.innerHTML='<div id="import-test-root"></div>';
   window.pywebview={api:{choose_legal_files:async()=>['C:/Data/deportationrecords.csv'],choose_legal_folder:async()=>'C:/Data',process_legal_files:()=>window.replaceSource(),process_legal_folder:()=>window.replaceSource(),refresh_legal_files:()=>window.replaceSource(),refresh_legal_folder:()=>window.replaceSource()}};
   createRoot(document.getElementById('import-test-root')).render(React.createElement(LegalPlatform,{}));
  });
  await page.getByText('LOADING LEGAL DATA',{exact:true}).waitFor();
  ready=true;
  const check=async()=>{
   await page.getByText(`ROW-${version}`,{exact:true}).waitFor();
   await page.waitForFunction(expected=>document.querySelector('.kpi-card')?.textContent.includes(String(expected)),version+1);
   await page.locator('.legal-upload-overlay').waitFor({state:'hidden'});
  };
  await check();
  for(const action of ['files','refresh-files','folder','refresh-folder']){
   await page.getByRole('button',{name:'Choose source',exact:true}).click();
   if(action==='files')await page.getByRole('menuitem',{name:'Select multiple CSV files Choose individual source files'}).click();
   if(action==='folder')await page.getByRole('menuitem',{name:'Select folder Load all supported CSV files'}).click();
   if(action==='refresh-files')await page.getByRole('button',{name:'Refresh selected CSV files',exact:true}).click();
   if(action==='refresh-folder')await page.getByRole('button',{name:'Refresh selected folder',exact:true}).click();
   await check();
   assert.equal(await page.getByText(`ROW-${version-1}`,{exact:true}).count(),0);
  }
  await page.evaluate(()=>{window.pywebview=null});
  for(let repeat=0;repeat<2;repeat++){
   await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({name:'deportationrecords.csv',mimeType:'text/csv',buffer:Buffer.from('PN ID\nBROWSER')});
   await check();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({startup:true,select_csv:true,refresh_csv:true,select_folder:true,refresh_folder:true,repeated_browser_upload:true,page_errors:errors}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
