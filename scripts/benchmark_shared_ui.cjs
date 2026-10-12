// Production navigation benchmark with deterministic, synthetic partial-import data.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const metadata={ready:true,revision:'shared-ui-fixture',loading:false,source:'Synthetic awareness',warnings:[],availability:{awareness:true},features:{awareness:true,detention:false,deportation:false},sheets:[{id:'awareness',name:'Awareness',rows:0,columns:['Project','Participant Name']}],months:[],reviewCounts:{awareness:0}};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const runs=[];
  for(let i=0;i<5;i++){
   const context=await browser.newContext(),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.route('**/api/**',async route=>{
    const url=route.request().url();let body={};
    if(url.includes('/legal/metadata'))body=metadata;
    else if(url.includes('/legal/review'))body={dataset:'awareness',total:0,page:1,pageSize:100,rules:[],ruleCounts:{},filterOptions:{severity:[],lawyer:[],project:[],location:[],date:[]},availableMonths:[],activeComparisonMonth:'',rows:[]};
    else if(url.includes('/legal/send-issues'))body={revision:'shared-ui-fixture',lawyers:[],rows:[],total:0,contacts:{}};
    else if(url.includes('duplicate-exclusions'))body={rows:[]};
    else if(url.includes('import-progress'))body={state:'idle',completedWork:0,totalWork:0};
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
   });
   const start=performance.now();
   await page.goto('http://127.0.0.1:5180/?startupEpoch=123456#/legal/awareness');
   await page.locator('.review-finding-selector').waitFor({timeout:15000});
   await page.locator('.legal-content .skeleton').waitFor({state:'detached'});
   const ready=performance.now()-start;
   const navigate=async(hash,selector)=>{const at=performance.now();await page.evaluate(hash=>{location.hash=hash},hash);await page.locator(selector).waitFor();return performance.now()-at};
   const first=await navigate('#/legal/send-issues','.send-issues');
   await navigate('#/legal/awareness','.review-finding-selector');
   const repeat=await navigate('#/legal/send-issues','.send-issues');
   runs.push({ready,first,repeat,errors});await context.close();
  }
  const assets=fs.readdirSync(path.join(root,'frontend/dist/assets')).filter(name=>name.endsWith('.js')).map(name=>({name,bytes:fs.statSync(path.join(root,'frontend/dist/assets',name)).size}));
  const median=key=>runs.map(run=>run[key]).sort((a,b)=>a-b)[2];
  const result={fixture:'synthetic awareness-only import, empty findings, local production preview',runs,medianMs:{ready:median('ready'),first:median('first'),repeat:median('repeat')},assets};
  fs.mkdirSync(path.join(root,'output/performance'),{recursive:true});
  fs.writeFileSync(path.join(root,'output/performance',process.argv[2]||'shared-ui-before.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result.medianMs));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
