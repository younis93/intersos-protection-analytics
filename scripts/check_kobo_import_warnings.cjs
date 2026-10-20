const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const http=require('node:http'),path=require('node:path'),dist=path.resolve('frontend/dist');
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data)})});

(async()=>{await new Promise(resolve=>server.listen(5383,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
fs.mkdirSync('output/kobo-import-warnings',{recursive:true});
for(const withSettings of [false,true])for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});const confirmed=[],settingsCalls=[];let project=null;
 const settings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:false,hideEmpty:false,questionSort:'form',questions:{}};
 const questions=['gender','district'].map(id=>({id,name:id,type:'select_one',kind:'category',labels:{en:id==='gender'?'Gender':'District'},group:'',repeat:'',metadata:false,identifying:false,choices:[]}));
 const form={questions,groups:[],language:'en',warnings:[]};
 const mappings=[{sheet:0,column:0,header:'Gender',question:'gender',option:'',status:'matched'},{sheet:0,column:1,header:'Old location',question:'',option:'',status:'unmatched'},{sheet:0,column:2,header:'الموقع الآخر',question:'district',option:'',status:'ambiguous',candidates:[{question:'district',option:''}]},{sheet:0,column:3,header:'_uuid',question:'',option:'',status:'ignored'}];
 const pack={format:'kobo-settings',version:1,settings,questions:[],groups:[]};
 await page.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname,body=req.headers()['content-type']?.includes('json')&&req.postData()?req.postDataJSON():{};let result={};
 if(p.endsWith('/imports/preview'))result={token:'warn',form,sheets:[{name:'Responses',rows:10,columns:4}],mappings,issues:[],warnings:['Data includes historical form versions.']};
 else if(p.endsWith('/check'))result={issues:[]};
 else if(p.endsWith('/settings-preview')){settingsCalls.push(body);result={settings,matches:[],skipped:[],warnings:[]}}
 else if(p.endsWith('/imports/confirm')){confirmed.push(body);project={id:'created',name:body.name,form,settings,warnings:[],issues:[]};result=project}
 else if(p.endsWith('/analysis'))result={total:10,filtered:10,settings,groups:[],filterSummary:[],questions:[]};
 else if(p.endsWith('/projects'))result=project?[{id:project.id,name:project.name,updated:''}]:[];
 else if(p.endsWith('/projects/created'))result=project;
 await route.fulfill({json:result});});
 await page.goto('http://127.0.0.1:5383/#/kobo');await page.evaluate(()=>document.documentElement.dataset.theme='glass-dark');await page.getByRole('button',{name:'New project',exact:true}).click();
 const upload=page.getByRole('dialog',{name:'Create Kobo analysis project',exact:true});
 await upload.locator('input[aria-label="Kobo XLSForm"]').setInputFiles({name:'assessment.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('example')});await upload.locator('input[aria-label="Exported responses"]').setInputFiles({name:'responses.csv',mimeType:'text/csv',buffer:Buffer.from('Gender\nf')});
 if(withSettings)await upload.getByLabel('Import project settings file',{exact:true}).setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
 await upload.getByRole('button',{name:'Review import',exact:true}).click();const review=page.getByRole('dialog',{name:'Review column mapping',exact:true});await review.getByRole('heading',{name:'What needs review',exact:true}).waitFor();assert(await review.getByText('2 response data columns need linking.',{exact:true}).isVisible());assert(await review.getByText('1 form question has no linked response data.',{exact:true}).isVisible());
 const create=review.getByRole('button',{name:withSettings?'Review settings':'Create analysis project',exact:true});assert(await create.isEnabled());await create.click();const warning=page.getByRole('alertdialog',{name:'Continue with import warnings?',exact:true});await warning.waitFor();assert.equal(confirmed.length,0);assert.equal(settingsCalls.length,0);assert(await warning.getByText('Responses - Column 2: Old location',{exact:true}).isVisible());assert(await warning.getByText('Responses - Column 3: الموقع الآخر',{exact:true}).isVisible());assert(await warning.getByText('District',{exact:true}).isVisible());await warning.screenshot({path:`output/kobo-import-warnings/${withSettings}-${width}.png`});
 await warning.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(confirmed.length,0);assert(await review.getByRole('tab',{name:/^Needs linking/}).getByText('2',{exact:true}).isVisible());assert(await create.evaluate(el=>el===document.activeElement));
 await create.click();await warning.getByRole('button',{name:withSettings?'Ignore warnings and review settings':'Ignore warnings and create project',exact:true}).click();
 if(withSettings){const shared=page.getByRole('dialog',{name:'Review shared settings',exact:true});await shared.waitFor();assert.equal(settingsCalls.length,1);assert.equal(settingsCalls[0].mappings[1].status,'excluded');assert.equal(confirmed.length,0);await shared.getByRole('button',{name:'Create project with settings',exact:true}).click()}
 await page.getByRole('heading',{name:'assessment',level:1,exact:true}).waitFor();assert.equal(confirmed.length,1);assert.deepEqual(confirmed[0].mappings.map(m=>m.status),['matched','excluded','excluded','ignored']);assert.equal(confirmed[0].mappings[2].question,'');assert.equal(confirmed[0].acceptInvalid,false);assert.equal(Boolean(confirmed[0].settingsPackage),withSettings);assert.equal(mappings[2].status,'ambiguous');await page.close();
}
console.log('PASS: distinct data/form warnings, creation with unresolved fields, cancellation/focus, explicit exclusion payload, shared settings, source preservation, and desktop/mobile confirmation.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exit(1)});
