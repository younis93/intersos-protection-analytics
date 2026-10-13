// Run Vite and the memory-only synthetic LegalStore API on 8018. Never uses user imports.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/fullDrawerCheck.tsx'),html=path.join(root,'frontend/full-drawer-check.html');
const kinds=process.env.DRAWER_CHECK_KINDS?.split(',')||['overview','beneficiaries','assessments','legalservices','awareness','legalhotlines','detention','deportation','hotline','explorer','cases','indicators','lawyers','studio','sampling','builder','legacy'];
(async()=>{assert(!fs.existsSync(entry)&&!fs.existsSync(html));let browser;try{
 fs.writeFileSync(entry,`import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {Overview} from './LegalOverviewPage';import {ReviewPageBody} from './LegalReviewPage';import {DetentionCases} from './LegalDetentionPage';import {LegalDeportationDashboard} from './LegalDeportationPage';import {HotlineDashboard} from './LegalHotlinePage';import {Explorer} from './LegalExplorerPage';import {Cases} from './LegalCasesPage';import {IndicatorReporting} from './LegalIndicatorsPage';import {LawyerOverview} from './LegalLawyersPage';import {LegalAnalyticsSection} from './LegalStudioPage';import LegalSampling from './LegalSampling';import Studio from './Studio';import {FilterDrawer} from './FilterControls';import {getLegalStudio} from './api';import {setLegalRevision} from './legalQueryCache';import {initialSamplingState} from './samplingTypes';import './styles.css';import './workspace.css';import './indicators.css';import './detention.css';import './studio.css';
 const kind=new URLSearchParams(location.search).get('kind')||'overview';const noop=()=>{};
 function Fixture(){const [metadata,setMetadata]=useState<any>(null),[state,setState]=useState<any>({filters:{},search:'',page:1,sortColumn:'',sortDirection:'asc'}),[sampling,setSampling]=useState(initialSamplingState()),[legacy,setLegacy]=useState<any>({}),[open,setOpen]=useState(false);
 useEffect(()=>{fetch('http://127.0.0.1:8000/api/legal/metadata').then(response=>response.json()).then(data=>{setLegalRevision(data.revision);setMetadata(data)})},[]);if(!metadata)return <p>Loading fixture</p>;
 const builderMetadata:any={ready:true,pages:Object.fromEntries(metadata.sheets.map((sheet:any)=>[sheet.id,{rows:sheet.rows,filters:Object.fromEntries(sheet.columns.map((column:string)=>[column,[]])),dimensions:sheet.columns}]))};
 const content=kind==='overview'?<Overview metadata={metadata} theme="glass-light"/>:kind==='detention'?<DetentionCases theme="glass-light" onOpenCase={noop}/>:kind==='deportation'?<LegalDeportationDashboard metadata={metadata} theme="glass-light"/>:kind==='hotline'?<HotlineDashboard metadata={metadata} theme="glass-light"/>:kind==='explorer'?<Explorer metadata={metadata} initialDataset="assessments"/>:kind==='cases'?<Cases metadata={metadata} initialQuery="" onQueryUsed={noop} onOpenCase={noop}/>:kind==='indicators'?<IndicatorReporting revision={1}/>:kind==='lawyers'?<LawyerOverview metadata={metadata}/>:kind==='studio'?<LegalAnalyticsSection dataset="assessments" theme="glass-light" state={state} update={patch=>setState((current:any)=>({...current,...patch}))} onOpenCase={noop}/>:kind==='sampling'?<LegalSampling state={sampling} update={patch=>setSampling(current=>({...current,...patch}))}/>:kind==='builder'?<Studio metadata={builderMetadata} theme="glass-light" sourceOptions={[['assessments','Assessments']]} studioLoader={getLegalStudio}/>:kind==='legacy'?<><button onClick={()=>setOpen(true)}>Filters</button><FilterDrawer open={open} available={{Project:['A','B'],month:['2026-01','2026-02']}} filters={legacy} onChange={setLegacy} onReset={()=>setLegacy({})} onClose={()=>setOpen(false)}/><output>{JSON.stringify(legacy)}</output></>:<ReviewPageBody dataset={kind} comparisonMonth="" onOpenCase={noop}/>;
 return <main className="app-shell legal-shell" style={{display:'block'}}><header id="legal-header-scroll-controls"/><section className="content legal-content">{content}</section></main>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
 fs.writeFileSync(html,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/src/fullDrawerCheck.tsx"></script>');
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage(),errors=[],calls=[],results=[],styles=new Map();page.on('pageerror',error=>errors.push(String(error)));
 await page.route('http://127.0.0.1:8000/**',async route=>{const request=route.request(),url=request.url();if(request.method()==='POST')calls.push({path:new URL(url).pathname,body:request.postDataJSON()});try{const response=await route.fetch({url:url.replace(':8000',':8018')});if(new URL(url).pathname==='/api/legal/case'&&request.postDataJSON()?.query==='Person One')await new Promise(resolve=>setTimeout(resolve,1000));await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}})}catch{await route.abort().catch(()=>{})}});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 for(const width of [390,1440])for(const kind of kinds){
  console.log('Checking '+kind+' '+width);await page.setViewportSize({width,height:900});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5186')+'/full-drawer-check.html?kind='+kind);
  await page.getByRole('button',{name:/^(?:All filters|Filters)(?:\s|$)/}).first().waitFor({timeout:20000});
  await page.getByRole('button',{name:/^(?:All filters|Filters)(?:\s|$)/}).first().click();const drawer=page.locator('.shared-filter-drawer');await drawer.waitFor();
  await page.mouse.move(0,0);
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  assert.equal(await drawer.locator('footer button').last().textContent(),'Done');assert.equal(await drawer.locator('footer button').first().textContent(),'Reset');
  assert.equal(await drawer.locator('footer button:last-child').evaluate(node=>getComputedStyle(node).justifyContent),'center','Done text is not centered');
  assert.equal(await drawer.locator('footer svg').count(),1);assert.equal(await drawer.locator('.app-select-trigger').count(),0);
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await settle();
   const snapshot=await drawer.evaluate(node=>{const properties=['background-color','color','padding','border-radius','font-size'];const read=element=>Object.fromEntries(properties.map(key=>[key,getComputedStyle(element).getPropertyValue(key)]));return {drawer:read(node),header:read(node.querySelector('header')),search:read(node.querySelector('.filter-search')),footer:read(node.querySelector('footer')),reset:read(node.querySelector('footer button')),done:read(node.querySelector('footer button:last-child'))}});
   const key=width+'-'+theme;if(!styles.has(key))styles.set(key,snapshot);else assert.deepEqual(snapshot,styles.get(key),'Drawer style differs from Overview: '+kind+' '+key);
   const box=await drawer.boundingBox();assert(box.x>=-1&&box.x+box.width<=width+1,'Drawer overflows viewport');
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='glass-light');
  // Options may arrive shortly after opening, particularly Cases and Explorer.
  await page.waitForFunction(()=>document.querySelector('.shared-filter-drawer summary'),null,{timeout:10000});
  const labels=await drawer.locator('summary span').allTextContents();const projectIndex=labels.findIndex(label=>/(?:^|·\s*)projects?$/i.test(label));const group=drawer.locator('details').nth(projectIndex<0?0:projectIndex);
  if(await group.getAttribute('open')===null)await group.locator('summary').click();
  await group.locator(':scope > div').waitFor();
  const values=await group.getByRole('checkbox').count();let live=false;
  if(values){
   const before=calls.length;await group.getByRole('checkbox').first().check();
   if(kind!=='legacy')await page.waitForFunction(()=>Boolean(document.querySelector('.shared-filter-drawer summary b')));
   await page.waitForTimeout(450);
   live=kind==='legacy'||calls.slice(before).some(call=>Object.values(call.body.filters||{}).some(value=>Array.isArray(value)&&value.length)||Array.isArray(call.body.projects)&&call.body.projects.length);
   assert(live,'No live request for '+kind);assert.equal(await drawer.count(),1,'Selection closed the drawer');
   if(kind==='cases'){assert.equal(calls.slice(before).filter(call=>call.path==='/api/legal/case').length,1,'Cases selection duplicated its results request');assert.equal(await page.locator('.case-header-total strong').textContent(),'1')}
   await drawer.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:/^(?:All filters|Filters)(?:\s|$)/}).first().click();
   const reopened=drawer.locator('details').nth(projectIndex<0?0:projectIndex);assert.equal(await reopened.getByRole('checkbox').first().isChecked(),true,'Closing lost selection');
   const beforeReset=calls.length;await drawer.locator('footer').getByRole('button',{name:'Reset',exact:true}).click();await page.waitForTimeout(450);
   assert.equal(await drawer.count(),1,'Reset closed the drawer');assert.equal(await drawer.locator('summary b').count(),0,'Reset kept field selections');
   if(kind==='cases')assert(calls.slice(beforeReset).filter(call=>call.path==='/api/legal/case').length<=1,'Cases reset duplicated its results request');
  }
  const count=await drawer.locator('details').count();await drawer.getByPlaceholder('Search filters').fill('zz_no_matching_field');assert.equal(await drawer.locator('details').count(),0);await drawer.getByPlaceholder('Search filters').fill('');assert.equal(await drawer.locator('details').count(),count);
  fs.mkdirSync(path.join(root,'output/shared-drawers'),{recursive:true});await drawer.screenshot({path:path.join(root,`output/shared-drawers/${kind}-${width}.png`)});
  await drawer.getByRole('button',{name:'Close filters',exact:true}).click();assert.equal(await drawer.count(),0);
  if(kind==='cases'){
   const search=page.getByPlaceholder('Search cases', {exact:true}).first();const before=calls.length;
   const oldRequest=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/legal/case'&&request.postDataJSON()?.query==='Person One');
   await search.fill('Person One');await oldRequest;
   await search.fill('Person Two');await search.press('Enter');
   await page.waitForFunction(()=>document.querySelector('.case-card h3')?.textContent==='Person Two');
   await page.waitForTimeout(1100);
   assert.deepEqual(await page.locator('.case-card h3').allTextContents(),['Person Two'],'Obsolete Cases result replaced latest search');
   assert.equal(calls.slice(before).filter(call=>call.path==='/api/legal/case'&&call.body.query==='Person Two').length,1,'Enter duplicated the debounced search');
   const rapidStart=calls.length;await search.fill('Person Thr');await search.fill('Person Three');
   await page.waitForFunction(()=>document.querySelector('.case-card h3')?.textContent==='Person Three');
   assert.equal(calls.slice(rapidStart).filter(call=>call.path==='/api/legal/case').length,1,'Rapid search issued duplicate requests');
  }
  results.push({kind,width,live,emptyOptions:values===0});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,process.env.DRAWER_CHECK_KINDS?'output/shared-drawers/focused-results.json':'output/shared-drawers/results.json'),JSON.stringify({results,themes:5,matchingStyles:true,errors},null,2));console.log(JSON.stringify({pages:kinds.length,widths:2,themes:5,results,errors}));
}finally{await browser?.close();fs.rmSync(entry,{force:true});fs.rmSync(html,{force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
