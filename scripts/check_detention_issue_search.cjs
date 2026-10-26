const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
 const {createServer}=await import('../frontend/node_modules/vite/dist/node/index.js');
 const server=await createServer({root:require('node:path').resolve('frontend'),configFile:false,server:{host:'127.0.0.1',port:5417,strictPort:true},optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime']}});
 await server.listen();
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const output='output/detention-issue-search';fs.mkdirSync(output,{recursive:true});
 const note='Same name found with a different Case ID - verify identity';
 const rows=[
  {beneficiaryId:'89645',caseAvailable:false,name:'تامر احمد الراعي',lawyer:'Lawyer One',note,relatedCases:[{caseId:'86945',caseAvailable:true}],differences:[{field:'Case ID',assessment:'86945',excel:'89645'}]},
  {beneficiaryId:'89646',caseAvailable:false,name:'علي محمد عباس',lawyer:'Lawyer Two',note,relatedCases:[{caseId:'86946',caseAvailable:true},{caseId:'86948',caseAvailable:false}],differences:[{field:'Case ID',assessment:'86946',excel:'89646'},{field:'Case ID',assessment:'86948',excel:'89646'}]},
  {beneficiaryId:'B1',caseAvailable:true,name:'Person Three',lawyer:'',note:'Different: Gender',differences:[{field:'Gender',assessment:'Female',excel:'Male'}]},
  {beneficiaryId:'B2',caseAvailable:true,name:'Person Four',lawyer:'',note:'Different: Release type, Release/deportation date',differences:[{field:'Release type',assessment:'Final released',excel:'Released on bail'},{field:'Release/deportation date',assessment:'2026-10-11',excel:'2026-08-10'}]},
 ];
 const result={month:'2026-10',months:['2026-10'],project:'P1',projects:['P1'],filename:'test.xlsx',sheet:'Sheet1',sheets:['Sheet1'],platformRecords:4,comparisonRecords:4,missingCaseIds:{assessments:0,excel:0},matched:0,unmatched:4,comparedFields:['Gender'],rows,warnings:[]};
 try{
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor'])for(const width of [1440,390]){
   console.log(`Checking ${theme} ${width}`);
   const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(15000);const errors=[];let comparisons=0;
   page.on('pageerror',error=>{errors.push(String(error));console.error(String(error));});
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let data={};
    if(url.pathname.endsWith('/detention'))data={total:0,rows:[],columns:[],filterOptions:{Project:['P1']},kpis:[],trend:[{month:'2026-10',detainedAssessments:0,released:0}],charts:[],map:{items:[]}};
    if(url.pathname.endsWith('/reconcile-sheets'))data={sheets:['Sheet1'],selected:'Sheet1'};
    if(url.pathname.endsWith('/reconcile')){comparisons++;data=result;}
    await route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}});
   });
   await page.route('**/issue-search-check',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import {DetentionCases} from '/src/LegalDetentionPage.tsx';
    import '/src/styles.css';
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{className:'legal-shell',style:{display:'block',padding:16}},React.createElement(DetentionCases,{theme:{},onOpenCase:caseId=>{window.openedCase=caseId}})));
   </script></body></html>`}));
   await page.goto('http://127.0.0.1:5417/issue-search-check',{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'Platform and Excel Comparison',exact:true}).click();
   await page.locator('.reconciliation-project-select .app-select-trigger').click();
   await page.getByRole('checkbox',{name:'P1',exact:true}).check();
   await page.keyboard.press('Escape');
   await page.locator('input[type=file]').setInputFiles({name:'test.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture')});
   await page.getByRole('button',{name:'Compare selected month',exact:true}).click();
   const search=page.getByRole('textbox',{name:'Search comparison issues',exact:true});await search.waitFor();
   const table=page.locator('.reconciliation-table');
   await search.fill('86946');
   await page.getByText('1 of 4 issues',{exact:true}).waitFor();
   assert.equal(await table.locator('tbody tr').count(),2,'Keep both candidate ID differences for a matching issue');
   assert.equal(await table.locator('.reconciliation-note-group').getAttribute('rowspan'),'2');
   assert.equal(await table.locator('.reconciliation-note-group small').innerText(),'1 case');
   assert.equal(await table.getByText('86948',{exact:true}).count(),1);
   await table.getByRole('button',{name:'Open case 86946',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.openedCase),'86946');
   assert.equal(await table.getByRole('button',{name:'Open case 86948',exact:true}).count(),0);
   assert.equal(await table.getByRole('button',{name:'Open case 89646',exact:true}).count(),0);
   await search.fill('تامر');await page.getByText('1 of 4 issues',{exact:true}).waitFor();
   assert.equal(await table.locator('tbody tr').count(),1);
   await search.fill('  FEMALE  ');await page.getByText('1 of 4 issues',{exact:true}).waitFor();
   assert.equal(await table.getByText('Person Three',{exact:true}).count(),1);
   await search.fill('no-result');await page.getByText('No issues match your search.',{exact:true}).waitFor();
   assert.equal(await page.getByText('All records match for 2026-10',{exact:true}).count(),0);
   await page.getByRole('button',{name:'Clear search comparison issues',exact:true}).click();
   await page.getByText('4 of 4 issues',{exact:true}).waitFor();assert(await search.evaluate(el=>el===document.activeElement));
   assert.equal(await table.locator('.reconciliation-note-group').count(),2,'Group by issue type, then by Case ID');
   const fieldGroup=table.locator('.reconciliation-note-group').filter({hasText:'Different field data'});
   assert.equal(await fieldGroup.getAttribute('rowspan'),'3');
   assert.equal(await fieldGroup.locator('small').innerText(),'2 cases');
   assert.equal(await table.locator('.reconciliation-case-id').count(),4);
   assert.equal(await table.locator('.reconciliation-case-id').last().getAttribute('rowspan'),'2');
   await search.fill('different field data');await page.getByText('2 of 4 issues',{exact:true}).waitFor();
   assert.equal(await table.locator('tbody tr').count(),3);
   await search.fill('different case id');await page.getByText('2 of 4 issues',{exact:true}).waitFor();
   assert.equal(await table.locator('.reconciliation-note-group').count(),1,'Same issue type shares one outer group');
   assert.equal(await table.locator('.reconciliation-case-id').count(),2);
   assert.equal(await table.locator('.reconciliation-case-id').nth(1).getAttribute('rowspan'),'2');
   assert.equal(await table.locator('thead th').first().innerText(),'ISSUE');
   assert.equal(comparisons,1,'Search should not recompute the comparison');
   const border=await search.evaluate(el=>{const input=getComputedStyle(el),parent=getComputedStyle(el.parentElement),box=el.parentElement.getBoundingClientRect();return {inner:input.borderTopWidth,shadow:input.boxShadow,outer:parent.borderTopWidth,right:box.right,viewport:innerWidth}});
   assert.equal(border.inner,'0px');assert.equal(border.shadow,'none');assert.equal(border.outer,'1px');assert(border.right<=border.viewport);
   const cells=await table.locator('tbody tr').nth(2).locator('td').first().evaluate(el=>({width:el.getBoundingClientRect().width,minWidth:getComputedStyle(el).minWidth}));
   assert.notEqual(cells.minWidth,'210px','Continuation cells must not inherit note-column sizing');
   await table.scrollIntoViewIfNeeded();
   await page.screenshot({path:`${output}/${theme}-${width}.png`,fullPage:true});
   const missingIdNote='Name found in Assessments but Case ID missing in Excel - verify identity';
   const missingIdRows=[
    {beneficiaryId:'',caseAvailable:false,name:'عبد الله سعدات',lawyer:'',note:missingIdNote,relatedCases:[{caseId:'86945',caseAvailable:true}],differences:[{field:'Case ID',assessment:'86945',excel:'Missing'}]},
    {beneficiaryId:'',caseAvailable:false,name:'Another Name',lawyer:'',note:'Case ID missing in Excel',differences:[{field:'Case ID',assessment:'Not comparable',excel:'Missing'}]},
   ];
   await page.route('**/api/legal/detention/reconcile?**',route=>route.fulfill({json:{...result,rows:missingIdRows,unmatched:2,missingCaseIds:{assessments:0,excel:2}},headers:{'Access-Control-Allow-Origin':'*'}}));
   await page.getByRole('button',{name:'Compare selected month',exact:true}).click();
   await page.getByText('2 of 2 issues',{exact:true}).waitFor();
   await search.fill('سعدات');await page.getByText('1 of 2 issues',{exact:true}).waitFor();
   assert.equal(await table.locator('.reconciliation-note-group strong').innerText(),missingIdNote);
   assert.equal(await table.locator('.reconciliation-case-id').innerText(),'—');
   assert.equal(await table.locator('.reconciliation-assessment-value').innerText(),'86945');
   assert.equal(await table.locator('.reconciliation-excel-value').innerText(),'Missing');
   await table.getByRole('button',{name:'Open case 86945',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.openedCase),'86945');
   await page.getByRole('button',{name:'Clear search comparison issues',exact:true}).click();
   await page.getByText('2 of 2 issues',{exact:true}).waitFor();
   assert.equal(await table.locator('tbody tr').count(),2,'Keep separate records with blank Case IDs');
   assert.deepEqual(errors,[]);console.log(`Passed ${theme} ${width}`);await page.close();
  }
 }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
