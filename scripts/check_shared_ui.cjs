// Browser regression check for reusable controls and deferred module recovery.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/sharedUiCheck.tsx'),html=path.join(root,'frontend/shared-ui-check.html');
(async()=>{let browser;try{
 assert(!fs.existsSync(entry)&&!fs.existsSync(html),'Temporary fixtures already exist');
 fs.writeFileSync(entry,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {deferredComponent} from './DeferredComponent';import {Pager,RowSelectionCheckbox,SortableHeader} from './TableControls';import {ValueTable} from './ValueTable';import ReviewFiltersDrawer from './ReviewFiltersDrawer';import './styles.css';import './workspace.css';
 let attempts=0;const Deferred=deferredComponent(async()=>{(window as any).attempts=++attempts;if(attempts===1)throw Error('Synthetic module failure');return {default:()=> <p>Deferred content ready</p>}},<p>Loading deferred content</p>);
 function Harness(){const [page,setPage]=useState(1),[direction,setDirection]=useState<'asc'|'desc'>('asc'),[count,setCount]=useState(1),[shown,setShown]=useState(true),[drawer,setDrawer]=useState(false),[filters,setFilters]=useState({project:'',location:'',date:''}),[fieldFilters,setFieldFilters]=useState<Record<string,string[]>>({});return <main className="legal-shell" style={{padding:24,display:"block"}}><button onClick={()=>setShown(v=>!v)}>Toggle deferred</button>{shown&&<Deferred/>}<Pager page={page} total={201} onChange={setPage}/><ValueTable><thead><tr><SortableHeader direction={direction} onSort={()=>setDirection(d=>d==='asc'?'desc':'asc')}>Name</SortableHeader><th>Number</th></tr></thead><tbody><tr><td>مرحبا بالعالم</td><td>123</td></tr></tbody></ValueTable><RowSelectionCheckbox label="Select all sample rows" total={3} selectedCount={count} onChange={all=>setCount(all?3:0)}/><button onClick={()=>setDrawer(true)}>Open review filters</button><output>{fieldFilters.project?.join(',')||filters.project}</output>{drawer&&<ReviewFiltersDrawer dataset={new URLSearchParams(location.search).get('dataset')||'beneficiaries'} options={{project:['Project A','Project B'],location:['Location A'],date:['2026-01']}} filters={filters} onChange={next=>setFilters(next as any)} fieldFilters={fieldFilters} onFieldChange={setFieldFilters} onClose={()=>setDrawer(false)}/>}</main>};createRoot(document.getElementById('root')!).render(<Harness/>);`);
 fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/sharedUiCheck.tsx"></script>');
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5174')+'/shared-ui-check.html');
 await page.getByRole('button',{name:'Retry loading page'}).click();await page.getByText('Deferred content ready').waitFor();
 assert.equal(await page.evaluate(()=>window.attempts),2);
 await page.getByRole('button',{name:'Toggle deferred'}).click();await page.getByRole('button',{name:'Toggle deferred'}).click();await page.getByText('Deferred content ready').waitFor();
 assert.equal(await page.evaluate(()=>window.attempts),2,'Revisiting a loaded module must not request it again');
 assert.equal(await page.getByRole('button',{name:'Previous page',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByRole('button',{name:'Next page',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Next page',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Name',exact:true}).click();assert.equal(await page.locator('th').first().getAttribute('aria-sort'),'descending');
 const selection=page.getByRole('checkbox',{name:'Select all sample rows'});assert.equal(await selection.evaluate(n=>n.indeterminate),true);await selection.check();assert.equal(await selection.evaluate(n=>n.indeterminate),false);await selection.uncheck();assert.equal(await selection.isChecked(),false);
 assert.equal(await page.locator('tbody td').first().getAttribute('dir'),'rtl');assert.equal(await page.locator('tbody td').last().getAttribute('dir'),'ltr');
 await page.getByRole('button',{name:'Open review filters'}).click();
 assert.equal(await page.locator('.review-filters-drawer .app-select-trigger').count(),0,'Review filters must use Hotline Review checkbox groups');
 assert.equal(await page.locator('.review-filters-drawer summary').count(),3);
 const projectMenu=page.locator('.review-filters-drawer details').filter({has:page.locator('summary span').getByText('Project',{exact:true})});
 await projectMenu.locator('summary').click();
 await projectMenu.getByRole('checkbox',{name:'Project A',exact:true}).check();
 await projectMenu.getByRole('checkbox',{name:'Project B',exact:true}).check();assert.equal(await page.locator('output').textContent(),'Project A,Project B');
 await projectMenu.getByRole('checkbox',{name:'Project B',exact:true}).uncheck();assert.equal(await page.locator('output').textContent(),'Project A');
 await page.getByPlaceholder('Search filters').fill('Project location');assert.equal(await page.locator('.review-filters-drawer summary').count(),1);
 await page.getByPlaceholder('Search filters').fill('');
 await projectMenu.getByRole('button',{name:'Select all 2',exact:true}).click();assert.equal(await page.locator('output').textContent(),'Project A,Project B');
 await projectMenu.getByRole('checkbox',{name:'Project A',exact:true}).hover();await projectMenu.getByRole('button',{name:'Only Project A',exact:true}).click();
 assert.equal(await page.locator('output').textContent(),'Project A');await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await page.locator('.case-filter-drawer').count(),0);
 const screenshots=[];fs.mkdirSync(path.join(root,'output/shared-ui'),{recursive:true});
 for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);
  if(!await page.locator('.case-filter-drawer').count())await page.getByRole('button',{name:'Open review filters'}).click();
  await page.waitForFunction(()=>{const box=document.querySelector('.case-filter-drawer').getBoundingClientRect();return box.x>=-1&&box.right<=innerWidth+1}); const box=await page.locator('.case-filter-drawer').boundingBox();assert(box.x>=-1&&box.x+box.width<=width+1,'Drawer exceeds viewport '+JSON.stringify({theme,width,box}));
  const screenshot='output/shared-ui/filters-'+theme+'-'+width+'.png';await page.screenshot({path:path.join(root,screenshot)});screenshots.push(screenshot);
 }
 await page.locator('.case-filter-drawer>footer').getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await page.locator('output').textContent(),'');
 for(const dataset of ['assessments','legalservices','awareness']){
  await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5174')+'/shared-ui-check.html?dataset='+dataset);
  await page.getByRole('button',{name:'Open review filters'}).click();
  assert.equal(await page.locator('.review-filters-drawer summary').count(),3);
  assert.equal(await page.locator('.review-filters-drawer .app-select-trigger').count(),0);
  const group=page.locator('.review-filters-drawer details').first();await group.locator('summary').click();
  await group.getByRole('button',{name:'Select all 2',exact:true}).click();assert.equal(await page.locator('output').textContent(),'Project A,Project B');
  await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await page.locator('.case-filter-drawer').count(),0);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({retry:true,moduleReuse:true,pagination:true,sorting:true,mixedSelection:true,arabicAlignment:true,filterApplyReset:true,screenshots,pageErrors:errors}));
}finally{await browser?.close();for(const file of [entry,html])fs.rmSync(file,{force:true})}})().catch(e=>{console.error(e);process.exit(1)});
