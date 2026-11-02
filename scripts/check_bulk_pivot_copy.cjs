const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8')),base='http://127.0.0.1:5397';
async function poll(check){for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw new Error('Did not settle')}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{for(const workspace of ['kobo','custom']){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),item=fixture[workspace];let requests=0;
 await page.request.put(`${base}/api/${workspace}/projects/${item.id}/settings`,{data:item.settings});
 await page.addInitScript(()=>{window.bulkCopied=[];window.ticks=0;setInterval(()=>window.ticks++,20);Object.defineProperty(navigator,'clipboard',{value:{write:async items=>window.bulkCopied.push({text:await(await items[0].getType('text/plain')).text(),html:await(await items[0].getType('text/html')).text()})}})});
 await page.route(`**/api/${workspace}/projects/${item.id}/analysis`,async route=>{requests++;const response=await route.fetch(),value=await response.json(),q=value.questions[0];value.questions=Array.from({length:8},(_,i)=>({...q,id:i?'bulk-'+i:q.id,name:i?'bulk_'+i:q.name,label:'Bulk field '+i,chartProjection:null,rows:Array.from({length:130},(_,r)=>({id:'r'+r,label:'Answer '+String(r).padStart(3,'0'),count:130-r,percent:50,series:Array.from({length:8},(_,c)=>({id:'c'+c,count:r+c,percent:50}))})),breakdowns:Array.from({length:8},(_,c)=>({id:'c'+c,label:'Category '+c,labels:['Group '+Math.floor(c/4),'Category '+c],values:['g'+Math.floor(c/4),'c'+c],denominator:100})),breakdownFields:[{id:'group',label:'Group'},{id:'category',label:'Category'}]}));await route.fulfill({json:value})});
 await page.goto(`${base}/#/${workspace}/${item.id}`);const card=page.locator('.kobo-question').first();await card.waitFor();
 await card.getByRole('button',{name:'Sort by Answer',exact:true}).click();
 const first=await card.locator('tbody [data-window-index]').first().innerText();assert(first.includes('Answer 129'));
 await page.getByRole('button',{name:'Display options',exact:true}).click();await page.getByRole('button',{name:'Collapse all groups',exact:true}).click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('.kobo-question').count(),0);
 await page.getByRole('button',{name:'Export',exact:true}).click();const copy=page.getByRole('button',{name:'Copy all pivot tables',exact:true});
 const before=requests;await copy.evaluate(el=>{el.click();el.click()});await poll(async()=>await page.evaluate(()=>window.bulkCopied.length===1));
 const copied=await page.evaluate(()=>window.bulkCopied[0]);assert.equal(requests,before+1);assert.equal((copied.html.match(/<table /g)||[]).length,8);assert.equal((copied.text.match(/Answer 129/g)||[]).length,8);
 assert(copied.text.indexOf('Answer 129')<copied.text.indexOf('Answer 000'));assert.equal(await page.locator('.kobo-question').count(),0);
 console.log('PASS',workspace,'8 complete formatted pivots, collapsed/unloaded cards, retained sort, duplicate prevention,',copied.html.length,'HTML characters');
 await page.evaluate(()=>{navigator.clipboard.write=async()=>{throw new Error('Unavailable')};document.execCommand=()=>false});await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Copy all pivot tables',exact:true}).click();await page.getByText('Copy failed',{exact:true}).waitFor();console.log('PASS',workspace,'explicit clipboard failure');await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
