const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),component=path.join(root,'frontend/src/pageLoadingComponent.tsx'),fixture=path.join(root,'frontend/src/pageLoadingCheck.tsx'),html=path.join(root,'frontend/page-loading-check.html');
(async()=>{let browser;try{
  fs.writeFileSync(component,fs.readFileSync(path.join(root,'frontend/src/LegalPlatform.tsx'),'utf8')+'\nexport {FindingTable,HotlineRecordsTable,DeportationRecordsTable,IndicatorReporting};\n');
  fs.writeFileSync(fixture,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {FindingTable,HotlineRecordsTable,DeportationRecordsTable,IndicatorReporting} from './pageLoadingComponent';import DataExplorer from './DataExplorer';import './styles.css';
  const noop=()=>{};const metadata:any={dataExplorer:{sheets:[{id:'test',name:'Test',rows:250,columns:[{name:'Value',type:'string',values:['A','B']}]}]}};
  function Fixture(){const [filters,setFilters]=useState<any>({}),[search,setSearch]=useState('');const kind=new URLSearchParams(location.search).get('page');return <main style={{padding:20}}><button onClick={()=>setFilters({Project:['P1']})}>Change filter</button><button onClick={()=>setSearch('changed')}>Change search</button>{kind==='deportation'?<DeportationRecordsTable filters={filters} onSearchChange={noop}/>:kind==='hotline'?<HotlineRecordsTable filters={filters} onSearchChange={noop}/>:kind==='review'?<FindingTable dataset="beneficiaries" rule="Invalid age" search={search} filters={filters} nameCompareChars={15} nameCompareCharsInput={15} allowNameVariations={false} exactMatchesOnly={true} onExactMatchesOnlyChange={noop} onNameCompareCharsChange={noop} onAllowNameVariationsChange={noop} nameRecordCount={undefined} eligibleNameRecordCount={undefined} ignoreCourtVerdict={false} onIgnoreCourtVerdictChange={noop} comparisonMonth="" onOpenCase={noop} findingRevision={0} onFindingContextMenu={noop} onBulkExclude={noop}/>:kind==='indicators'?<IndicatorReporting revision={0}/>:<DataExplorer metadata={metadata}/>}</main>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
  fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/pageLoadingCheck.tsx"></script>');
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage(),errors=[],calls=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',message=>{if(message.type()==='error'&&/Maximum update depth|Too many re-renders/.test(message.text()))errors.push(message.text());});
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=request.url(),query=request.postDataJSON()||{};calls.push({url,query});let response;
    if(url.includes('/legal/indicators')){await new Promise(resolve=>setTimeout(resolve,700));const activeFilters={projects:[],locations:[],years:[],quarters:[],months:[],communityTypes:[]};response={fromDate:'2026-01-01',toDate:'2026-10-06',ageGroups:[],filterOptions:{...activeFilters,locationsByProject:{}},activeFilters,groups:[]};}
    else if(url.includes('/data-explorer/query'))response={rows:[{Value:'A'}],matchedRows:250,totalRows:250,page:query.page,pageSize:100};
    else if(url.includes('/legal/review'))response={rows:[],total:250,ruleCounts:{},filterOptions:{},page:query.page,pageSize:100};
    else response={dataset:'legalhotlines',total:250,rows:[{__rowKey:'1',Value:'A'}],columns:['Value'],page:query.page,pageSize:100};
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)});
  });
  const results=[];
  for(const kind of ['explorer','hotline','deportation','review','indicators']){
    calls.length=0;await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5174')+'/page-loading-check.html?page='+kind);
    await page.waitForTimeout(kind==='indicators'?1200:600);
    assert.equal(calls.length,1,kind+' initial load duplicated');
    if(kind==='indicators'){assert.equal(await page.locator('.skeleton').count(),0);results.push({page:kind,initialRequests:1,noRenderLoop:true});continue;}
    if(kind==='review'){await page.getByRole('button',{name:'Change search',exact:true}).click();await page.waitForTimeout(300);assert.equal(calls.length,2,'Review search duplicated');results.push({page:kind,initialRequests:1,searchRequests:1});continue;}
    await page.getByRole('button',{name:kind==='explorer'?'Next':'Next page',exact:true}).click();await page.waitForTimeout(300);
    assert.equal(calls.length,2,kind+' paging duplicated');assert.equal(calls[1].query.page,2);
    if(kind==='explorer')await page.getByPlaceholder('Search all columns').fill('changed');
    else await page.getByRole('button',{name:'Change filter',exact:true}).click();
    await page.waitForTimeout(650);assert.equal(calls.length,3,kind+' query reset duplicated');assert.equal(calls[2].query.page,1);
    results.push({page:kind,initialRequests:1,pagingRequests:1,queryResetRequests:1});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,pageErrors:errors}));
}finally{await browser?.close();for(const file of [component,fixture,html])fs.rmSync(file,{force:true});}})().catch(error=>{console.error(error);process.exit(1)});
