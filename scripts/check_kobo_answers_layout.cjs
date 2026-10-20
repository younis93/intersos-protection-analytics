const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));let fixture;
  await mock(page,2,f=>{fixture=f;f.results.forEach(q=>{q.rows=q.rows.slice(0,2);q.breakdowns=[];q.breakdownFields=[]})});
  await page.route('**/analysis/preview',route=>route.fulfill({json:fixture.results[0]}));
  await page.route('**/projects/scroll/responses',route=>{const body=route.request().postDataJSON();return route.fulfill({json:{total:143,rows:body.search?[]:Array.from({length:50},(_,i)=>({id:String(i),row:(body.page-1)*50+i+2,value:i%2?'Female':'Male'}))}})});
  await page.goto('http://127.0.0.1:5359/#/kobo/scroll');await page.getByRole('button',{name:'Manage questions',exact:true}).click();await page.getByRole('button',{name:'View answers for q0',exact:true}).click();const dialog=page.getByRole('dialog',{name:'View answers',exact:true});await dialog.locator('.kobo-pivot-table').waitFor();fs.mkdirSync('output/kobo-answers-layout',{recursive:true});
  const geometry=()=>dialog.evaluate(el=>{const box=n=>n.getBoundingClientRect(),root=box(el),footer=box(el.querySelector(':scope>.kobo-dialog-actions')),tabs=box(el.querySelector('[role=tablist]')),panel=el.querySelector('[role=tabpanel]:not([hidden])'),first=box(panel.firstElementChild),table=box(panel.querySelector('.kobo-table-wrap'));return{rootBottom:root.bottom,footerBottom:footer.bottom,footerTop:footer.top,gap:first.top-tabs.bottom,tableBottom:table.bottom,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}});
  for(const [width,height] of [[1440,1000],[390,844],[320,568]]){
   await page.setViewportSize({width,height});await dialog.getByRole('tab',{name:'Pivot table',exact:true}).click();let g=await geometry();assert(g.gap>=15,g);assert(Math.abs(g.rootBottom-g.footerBottom)<3,g);assert(g.tableBottom<=g.footerTop,g);assert(g.scrollWidth<=g.clientWidth+1,g);assert(g.scrollHeight<=g.clientHeight+1,g);await dialog.screenshot({path:`output/kobo-answers-layout/pivot-${width}.png`});
   await dialog.getByRole('tab',{name:'Records',exact:true}).click();await dialog.getByText('143 recorded responses',{exact:true}).waitFor();g=await geometry();assert(g.gap>=15,g);assert(Math.abs(g.rootBottom-g.footerBottom)<3,g);assert(g.tableBottom<=g.footerTop,g);assert(g.scrollHeight<=g.clientHeight+1,g);
   const before=g.footerTop,table=dialog.locator('.kobo-answers-records .kobo-table-wrap');await table.evaluate(el=>el.scrollTop=el.scrollHeight);g=await geometry();assert(Math.abs(g.footerTop-before)<1,g);const last=await table.locator('tbody tr').last().boundingBox();assert(last.y+last.height<=g.footerTop+1,{last,g});await dialog.screenshot({path:`output/kobo-answers-layout/records-${width}.png`});
  }
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await dialog.getByText('Page 2 of 3',{exact:true}).waitFor();await dialog.getByRole('textbox',{name:'Search answers',exact:true}).fill('nothing');await dialog.getByText('No answers match your search.',{exact:true}).waitFor();assert(Math.abs((await geometry()).rootBottom-(await geometry()).footerBottom)<3);await dialog.getByRole('button',{name:'Close',exact:true}).click();assert(await page.getByRole('dialog',{name:'Manage questions',exact:true}).isVisible());assert.deepEqual(errors,[]);
  console.log('PASS: spacing below tabs, bottom-anchored footer on both tabs, single table scrolling, last row unobscured, no dialog overflow, pagination/search/close, desktop and 390/320 mobile.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
